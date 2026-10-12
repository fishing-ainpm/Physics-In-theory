/*
 * "Your calculation" panel: the student writes a formula, explains every symbol,
 * calculates it, and can ask the AI to interpret the result.
 *
 *   PhysicsCalculator.mount({
 *     container: '#sim-extra',
 *     links: () => [{ id, label, value, unit }],   // simulator values a symbol can be filled from
 *     context: () => ({ 'Launch mass': '200 t', ... }), // sent to the AI for reference
 *     examples: [{ label, formula }],
 *   })
 *
 * Needs formula.js, KaTeX, marked and js/ai.js (PhysicsAI) on the page.
 */
(function () {
  'use strict';

  const KEY_STORE = 'physics.anthropicKey';
  const STATE_STORE = 'physics.calculator';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tex = (src, display = false) => {
    if (!window.katex) return `<code>${esc(src)}</code>`;
    return katex.renderToString(src, { throwOnError: false, displayMode: display });
  };

  /** Markdown + $maths$ -> HTML, keeping maths away from the Markdown parser. */
  function renderAnswer(text) {
    const stash = [];
    const safe = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => {
      stash.push(m);
      return `@@M${stash.length - 1}@@`;
    });
    let html = window.marked ? marked.parse(safe, { async: false }) : `<p>${esc(safe)}</p>`;
    html = html.replace(/@@M(\d+)@@/g, (_, i) => {
      const m = stash[i];
      return m.startsWith('$$') ? tex(m.slice(2, -2), true) : tex(m.slice(1, -1));
    });
    return html;
  }

  function mount(opts) {
    const root = document.querySelector(opts.container);
    root.hidden = false;
    root.innerHTML = `
      <div class="mycalc">
        <h2>Your calculation</h2>
        <p class="mycalc-intro">Write a formula, then say what <b>every</b> letter or symbol means. Calculate it, and ask the AI to interpret what you did.</p>
        <div class="mycalc-examples">Try: ${opts.examples.map((e, i) => `<button type="button" class="chip" data-ex="${i}">${esc(e.label)}</button>`).join('')}</div>
        <label class="mycalc-formula">
          <span>Formula</span>
          <input type="text" id="mc-formula" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. dv = ve * ln(m0 / mf)">
        </label>
        <div class="mycalc-preview" id="mc-preview"></div>
        <div class="mycalc-symbols" id="mc-symbols"></div>
        <div class="mycalc-actions">
          <button type="button" class="btn primary" id="mc-calc">Calculate</button>
          <button type="button" class="btn" id="mc-ai" disabled>Ask the AI to interpret</button>
        </div>
        <div class="mycalc-message" id="mc-message" hidden></div>
        <div class="mycalc-result" id="mc-result" hidden></div>
        <div class="mycalc-ai" id="mc-ai-out" hidden></div>
        <details class="mycalc-settings" id="mc-settings">
          <summary>AI settings</summary>
          <p>The AI interpretation uses Claude through your own Anthropic API key (from console.anthropic.com).
             The key is saved only on this device and sent only to Anthropic. It needs an internet connection;
             everything else in the app works offline.</p>
          <div class="mycalc-key">
            <input type="password" id="mc-key" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
            <button type="button" class="btn" id="mc-key-save">Save key</button>
            <button type="button" class="btn" id="mc-key-forget">Forget</button>
          </div>
          <div class="control-hint" id="mc-key-status"></div>
        </details>
      </div>`;

    const $ = (id) => root.querySelector('#' + id);
    const input = $('mc-formula');
    const symbolBox = $('mc-symbols');
    const message = $('mc-message');
    const resultBox = $('mc-result');
    const aiBtn = $('mc-ai');
    const aiOut = $('mc-ai-out');

    // Symbol details survive edits to the formula, so retyping doesn't lose work.
    const saved = JSON.parse(store.get(STATE_STORE) || '{}');
    const info = saved.info || {}; // symbol -> { meaning, value, unit }
    input.value = saved.formula || '';
    let parsed = null;
    let lastCalc = null;

    function persist() {
      store.set(STATE_STORE, JSON.stringify({ formula: input.value, info }));
    }

    function say(text, tone) {
      message.hidden = !text;
      message.className = 'mycalc-message' + (tone ? ' calc-' + tone : '');
      message.innerHTML = text || '';
    }

    function invalidate() {
      lastCalc = null;
      aiBtn.disabled = true;
      resultBox.hidden = true;
    }

    // ---------------------------------------------------------- symbol table
    function rowHTML(sym, isResult) {
      const d = info[sym] || (info[sym] = { meaning: '', value: '', unit: '' });
      const links = opts.links();
      return `
        <div class="mc-row${isResult ? ' mc-result-row' : ''}" data-sym="${esc(sym)}">
          <span class="mc-sym">${tex(Formula.idTeX(sym))}${isResult ? '<small>result</small>' : ''}</span>
          <input class="mc-meaning" type="text" placeholder="What does ${esc(sym)} mean?" value="${esc(d.meaning)}" aria-label="Meaning of ${esc(sym)}">
          ${isResult
            ? '<span class="mc-value mc-computed">calculated</span>'
            : `<input class="mc-value" type="text" inputmode="decimal" placeholder="value" value="${esc(d.value)}" aria-label="Value of ${esc(sym)}">`}
          <input class="mc-unit" type="text" placeholder="unit" value="${esc(d.unit)}" aria-label="Unit of ${esc(sym)}">
          ${isResult ? '<span></span>' : `<select class="mc-link" aria-label="Fill ${esc(sym)} from the simulator" title="Fill from the simulator">
              <option value="">↺</option>
              ${links.map((l) => `<option value="${esc(l.id)}">${esc(l.label)}</option>`).join('')}
            </select>`}
        </div>`;
    }

    function renderSymbols() {
      if (!parsed) {
        symbolBox.innerHTML = '';
        return;
      }
      const syms = Formula.symbols(parsed.expr);
      const head = '<div class="mc-row mc-head"><span>Symbol</span><span>What it means</span><span>Value</span><span>Unit</span><span></span></div>';
      symbolBox.innerHTML = head +
        (parsed.target ? rowHTML(parsed.target, true) : '') +
        syms.filter((s) => s !== parsed.target).map((s) => rowHTML(s, false)).join('');
    }

    symbolBox.addEventListener('input', (e) => {
      const row = e.target.closest('.mc-row');
      if (!row || !row.dataset.sym) return;
      const d = info[row.dataset.sym];
      if (e.target.classList.contains('mc-meaning')) d.meaning = e.target.value;
      if (e.target.classList.contains('mc-value')) d.value = e.target.value;
      if (e.target.classList.contains('mc-unit')) d.unit = e.target.value;
      e.target.classList.remove('mc-missing');
      persist();
      invalidate();
    });

    symbolBox.addEventListener('change', (e) => {
      if (!e.target.classList.contains('mc-link') || !e.target.value) return;
      const row = e.target.closest('.mc-row');
      const link = opts.links().find((l) => l.id === e.target.value);
      const d = info[row.dataset.sym];
      d.value = String(+link.value.toPrecision(6));
      d.unit = link.unit;
      row.querySelector('.mc-value').value = d.value;
      row.querySelector('.mc-unit').value = d.unit;
      row.querySelector('.mc-value').classList.remove('mc-missing');
      e.target.value = '';
      persist();
      invalidate();
    });

    // ---------------------------------------------------------- formula
    function onFormula() {
      invalidate();
      say('');
      aiOut.hidden = true;
      try {
        parsed = Formula.parse(input.value);
        $('mc-preview').innerHTML = tex((parsed.target ? Formula.idTeX(parsed.target) + ' = ' : '') + Formula.toTeX(parsed.expr), true);
        $('mc-preview').classList.remove('mc-error');
      } catch (err) {
        parsed = null;
        $('mc-preview').textContent = input.value.trim() ? err.message : '';
        $('mc-preview').classList.add('mc-error');
      }
      renderSymbols();
      persist();
    }
    input.addEventListener('input', onFormula);

    root.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
      input.value = opts.examples[+b.dataset.ex].formula;
      onFormula();
      input.focus();
    }));

    // ---------------------------------------------------------- calculate
    function collect() {
      const syms = Formula.symbols(parsed.expr).filter((s) => s !== parsed.target);
      const all = parsed.target ? [parsed.target, ...syms] : syms;
      let missingMeaning = 0;
      let missingValue = 0;
      const values = {};
      for (const sym of all) {
        const row = symbolBox.querySelector(`.mc-row[data-sym="${CSS.escape(sym)}"]`);
        const d = info[sym];
        if (!d.meaning.trim()) {
          missingMeaning++;
          row.querySelector('.mc-meaning').classList.add('mc-missing');
        }
        if (sym !== parsed.target) {
          const v = parseFloat(String(d.value).replace(',', '.'));
          if (!Number.isFinite(v)) {
            missingValue++;
            row.querySelector('.mc-value').classList.add('mc-missing');
          } else {
            values[sym] = v;
          }
        }
      }
      return { all, syms, values, missingMeaning, missingValue };
    }

    $('mc-calc').addEventListener('click', () => {
      aiOut.hidden = true;
      if (!parsed) {
        say(input.value.trim() ? 'Fix the formula first (see the message under it).' : 'Write a formula first, or tap one of the examples.', 'bad');
        return;
      }
      const c = collect();
      if (c.missingMeaning) {
        say(`Say what every symbol means before calculating: ${c.missingMeaning} ${c.missingMeaning === 1 ? 'is' : 'are'} still blank. Explaining the symbols is part of understanding the formula!`, 'bad');
        return;
      }
      if (c.missingValue) {
        say(`Give a number for every symbol (${c.missingValue} missing). You can fill one from the simulator with ↺.`, 'bad');
        return;
      }

      let result;
      let error = null;
      try {
        result = Formula.evaluate(parsed.expr, c.values);
        if (!Number.isFinite(result)) error = 'The result is not a real number (division by zero, or ln/sqrt of a negative number?).';
      } catch (err) {
        error = err.message;
      }

      const target = parsed.target ? { symbol: parsed.target, ...info[parsed.target] } : null;
      lastCalc = {
        formula: input.value.trim(),
        symbols: c.syms.map((s) => ({ symbol: s, ...info[s] })),
        resultSymbol: target,
        result: error ? null : Formula.fmt(result),
        error,
      };
      aiBtn.disabled = false;

      const lhs = parsed.target ? Formula.idTeX(parsed.target) + ' = ' : '';
      let html = `<div class="mc-steps">${tex(lhs + Formula.toTeX(parsed.expr), true)}${tex(lhs + Formula.toTeX(parsed.expr, c.values), true)}`;
      if (error) {
        html += '</div>';
        say(error, 'bad');
      } else {
        const unit = target?.unit ? `\\ \\text{${target.unit.replace(/[\\{}$&#^_%~]/g, '')}}` : '';
        html += `${tex(lhs + Formula.fmt(result, true) + unit, true)}</div>`;
        const match = opts.links().find((l) => l.compare && Math.abs(l.value) > 0 && Math.abs(result - l.value) / Math.abs(l.value) < 0.015);
        say(match
          ? `✓ This matches the simulator's <b>${esc(match.label)}</b> (${Formula.fmt(match.value)} ${esc(match.unit)}).`
          : 'Calculated. Ask the AI to interpret it, or compare it with the Calculations panel above.', match ? 'good' : '');
      }
      resultBox.innerHTML = html;
      resultBox.hidden = false;
    });

    // ---------------------------------------------------------- AI
    $('mc-ai').addEventListener('click', async () => {
      const key = store.get(KEY_STORE);
      if (!key) {
        $('mc-settings').open = true;
        $('mc-key').focus();
        say('Add your Anthropic API key in AI settings below to use the AI interpretation.', 'bad');
        return;
      }
      if (!lastCalc || !window.PhysicsAI) return;
      aiBtn.disabled = true;
      aiBtn.textContent = 'The AI is thinking…';
      aiOut.hidden = false;
      aiOut.classList.add('mc-streaming');
      aiOut.innerHTML = '<p class="mc-wait">Reading your calculation…</p>';
      try {
        const text = await PhysicsAI.interpret({
          apiKey: key,
          calculation: { ...lastCalc, simulator: opts.context() },
          onText: (t) => { aiOut.textContent = t; },
        });
        aiOut.innerHTML = '<h3>AI interpretation</h3>' + renderAnswer(text);
      } catch (err) {
        aiOut.innerHTML = `<p class="calc-note calc-bad">${esc(err.message)}</p>`;
      } finally {
        aiOut.classList.remove('mc-streaming');
        aiBtn.disabled = false;
        aiBtn.textContent = 'Ask the AI to interpret';
      }
    });

    // ---------------------------------------------------------- key settings
    function showKeyStatus() {
      const k = store.get(KEY_STORE);
      $('mc-key-status').textContent = k ? `Key saved on this device (…${k.slice(-4)}).` : 'No key saved.';
      $('mc-key').value = '';
    }
    $('mc-key-save').addEventListener('click', () => {
      const v = $('mc-key').value.trim();
      if (!v) return;
      store.set(KEY_STORE, v);
      showKeyStatus();
      say('');
    });
    $('mc-key-forget').addEventListener('click', () => {
      store.del(KEY_STORE);
      showKeyStatus();
    });
    showKeyStatus();

    onFormula();
    return { refreshLinks: renderSymbols };
  }

  window.PhysicsCalculator = { mount };
})();
