/*
 * PhysicsHub runtime.
 *
 * A simulation file calls PhysicsHub.define({...}) once. The runtime builds the
 * control panel, runs the p5 sketch with a fixed physics timestep, and draws the
 * optional plot. See README.md for the full list of options.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ---------------------------------------------------------------- theme
  function readTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return {
      bg: v('--canvas'),
      surface: v('--surface'),
      ink: v('--ink'),
      text: v('--text'),
      muted: v('--text-muted'),
      faint: v('--text-faint'),
      border: v('--border'),
      grid: v('--grid'),
      accent: v('--accent'),
      accent2: v('--accent-2'),
      accent3: v('--accent-3'),
    };
  }
  const theme = readTheme();
  const colorOf = (c) => theme[c] || c;

  // ---------------------------------------------------------------- utilities for sims
  const util = {
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    toRad: (deg) => (deg * Math.PI) / 180,
    toDeg: (rad) => (rad * 180) / Math.PI,

    /** '#4a6f8a' -> [74, 111, 138] */
    rgb(hex) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    /** Same colour with an alpha channel, for p5 fill/stroke. */
    alpha(hex, a) {
      const [r, g, b] = util.rgb(hex);
      return `rgba(${r},${g},${b},${a})`;
    },

    /**
     * One classic Runge–Kutta step. `y` is an array of numbers, `f(y)` returns dy/dt
     * as an array of the same length. Returns the new array.
     */
    rk4(y, f, dt) {
      const add = (a, b, s) => a.map((v, i) => v + b[i] * s);
      const k1 = f(y);
      const k2 = f(add(y, k1, dt / 2));
      const k3 = f(add(y, k2, dt / 2));
      const k4 = f(add(y, k3, dt));
      return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    },

    /** Draw an arrow from (x, y) by (dx, dy) in pixels. */
    arrow(p, x, y, dx, dy, color, weight = 2) {
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const head = Math.min(9, len * 0.4);
      const a = Math.atan2(dy, dx);
      p.push();
      p.stroke(color);
      p.strokeWeight(weight);
      p.line(x, y, x + dx, y + dy);
      p.noStroke();
      p.fill(color);
      p.translate(x + dx, y + dy);
      p.rotate(a);
      p.triangle(0, 0, -head, head * 0.45, -head, -head * 0.45);
      p.pop();
    },

    /** Dashed line using the canvas API. */
    dashed(p, x1, y1, x2, y2, color, dash = [5, 5]) {
      p.push();
      p.stroke(color);
      p.strokeWeight(1);
      p.drawingContext.setLineDash(dash);
      p.line(x1, y1, x2, y2);
      p.drawingContext.setLineDash([]);
      p.pop();
    },
  };

  // ---------------------------------------------------------------- formatting
  function decimalsFor(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  function formatValue(ctrl, v) {
    if (ctrl.format) return ctrl.format(v);
    const d = ctrl.decimals ?? decimalsFor(ctrl.step ?? 1);
    const unit = !ctrl.unit ? '' : ctrl.unit === '°' ? '°' : ' ' + ctrl.unit;
    return Number(v).toFixed(d) + unit;
  }

  /** "Nice" tick spacing (1, 2, 5 × 10^n) for a range split into about `count` parts. */
  function niceStep(range, count) {
    const raw = range / Math.max(count, 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }

  function fmtTick(v, step) {
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return (Math.abs(v) < step / 1e6 ? 0 : v).toFixed(d);
  }

  // ---------------------------------------------------------------- controls
  function buildControls(def, params, onChange) {
    const form = $('#controls');
    const setters = {};

    for (const ctrl of def.controls || []) {
      const row = document.createElement('div');
      row.className = 'control';
      const id = 'ctrl-' + ctrl.id;

      if (ctrl.type === 'checkbox') {
        row.innerHTML = `<label class="toggle"><input type="checkbox" id="${id}"> ${ctrl.label}</label>`;
        const input = row.querySelector('input');
        input.checked = !!params[ctrl.id];
        input.addEventListener('change', () => onChange(ctrl, input.checked));
        setters[ctrl.id] = (v) => (input.checked = !!v);
      } else if (ctrl.type === 'select') {
        row.innerHTML = `<div class="control-head"><label for="${id}">${ctrl.label}</label></div><select id="${id}"></select>`;
        const select = row.querySelector('select');
        for (const opt of ctrl.options) {
          const [value, label] = Array.isArray(opt) ? opt : [opt, opt];
          select.add(new Option(label, value));
        }
        select.value = params[ctrl.id];
        select.addEventListener('change', () => onChange(ctrl, select.value));
        setters[ctrl.id] = (v) => (select.value = v);
      } else if (ctrl.type === 'button') {
        row.innerHTML = `<button type="button" class="btn" id="${id}">${ctrl.label}</button>`;
        row.querySelector('button').addEventListener('click', () => onChange(ctrl));
      } else {
        // range slider (default)
        row.innerHTML =
          `<div class="control-head"><label for="${id}">${ctrl.label}</label><output for="${id}"></output></div>` +
          `<input type="range" id="${id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step ?? 1}">`;
        const input = row.querySelector('input');
        const out = row.querySelector('output');
        const show = (v) => {
          input.value = v;
          out.textContent = formatValue(ctrl, v);
        };
        show(params[ctrl.id]);
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          out.textContent = formatValue(ctrl, v);
          onChange(ctrl, v);
        });
        setters[ctrl.id] = show;
      }

      if (ctrl.hint) {
        const hint = document.createElement('div');
        hint.className = 'control-hint';
        hint.textContent = ctrl.hint;
        row.appendChild(hint);
      }
      form.appendChild(row);
    }
    return setters;
  }

  function buildReadouts(def) {
    const box = $('#readouts');
    const cells = {};
    for (const r of def.readouts || []) {
      const row = document.createElement('div');
      row.innerHTML = `<span>${r.label}</span><b>–</b>`;
      box.appendChild(row);
      cells[r.id] = row.querySelector('b');
    }
    return cells;
  }

  // ---------------------------------------------------------------- plot
  /**
   * `views` is one or more plot definitions. Every view is sampled all the time,
   * so switching between them in the dropdown shows the full history.
   */
  function createPlot(views, getSim, clock) {
    const panel = $('#plot-panel');
    const toggle = $('#plot-toggle');
    const picker = $('#plot-view');
    const box = $('#plot-canvas');

    const store = views.map((v) => ({ t: [], ys: v.series.map(() => []), lo: Infinity, hi: -Infinity }));
    let current = 0;
    let instance = null;

    function showHeader() {
      const v = views[current];
      $('#plot-title').textContent = views.length > 1 ? '' : v.title || '';
      $('#plot-legend').innerHTML = v.series
        .map((s) => `<span><i style="background:${colorOf(s.color)}"></i>${s.label}</span>`)
        .join('');
    }

    if (views.length > 1) {
      picker.hidden = false;
      views.forEach((v, i) => picker.add(new Option(v.title, i)));
      picker.addEventListener('change', () => {
        current = +picker.value;
        showHeader();
        redraw();
      });
    }
    showHeader();

    function clear() {
      for (const d of store) {
        d.t.length = 0;
        d.ys.forEach((a) => (a.length = 0));
        d.lo = Infinity;
        d.hi = -Infinity;
      }
    }

    function trim(d, n) {
      d.t.splice(0, n);
      d.ys.forEach((a) => a.splice(0, n));
    }

    function push(state, params) {
      views.forEach((v, i) => {
        const d = store[i];
        const values = v.sample(state, params);
        const now = clock(state);
        d.t.push(now);
        values.forEach((y, k) => {
          d.ys[k].push(y);
          if (Number.isFinite(y)) {
            if (y < d.lo) d.lo = y;
            if (y > d.hi) d.hi = y;
          }
        });
        if (v.window) {
          let drop = 0;
          while (drop < d.t.length && d.t[drop] < now - v.window) drop++;
          if (drop) trim(d, drop);
        }
        if (d.t.length > 4000) trim(d, d.t.length - 4000); // keep long runs cheap
      });
    }

    function sketch(p) {
      const H = 170;
      const pad = { l: 50, r: 12, t: 20, b: 24 };

      p.setup = () => {
        p.createCanvas(Math.max(box.clientWidth, 100), H);
        p.noLoop(); // redrawn by the main sketch each frame
        new ResizeObserver(() => {
          if (box.clientWidth && box.clientWidth !== p.width) {
            p.resizeCanvas(box.clientWidth, H);
            p.redraw();
          }
        }).observe(box);
      };

      p.draw = () => {
        const sim = getSim();
        const v = views[current];
        const d = store[current];
        p.background(theme.bg);
        const w = p.width - pad.l - pad.r;
        const h = p.height - pad.t - pad.b;

        // x range: rolling window, or from 0 to now
        const tNow = d.t.length ? d.t[d.t.length - 1] : 0;
        let x0, x1;
        if (v.window) {
          x1 = Math.max(v.window, tNow);
          x0 = x1 - v.window;
        } else {
          x0 = 0;
          const minT = typeof v.minDuration === 'function' ? v.minDuration(sim.params, sim.state) : v.minDuration;
          x1 = Math.max(minT || 1, tNow);
        }

        // y range: fixed, a function of params, or auto (only ever grows until reset)
        let y0, y1;
        const fixed = typeof v.yRange === 'function' ? v.yRange(sim.params, sim.state) : v.yRange;
        if (fixed) {
          [y0, y1] = fixed;
        } else {
          y0 = Number.isFinite(d.lo) ? d.lo : 0;
          y1 = Number.isFinite(d.hi) ? d.hi : 1;
          if (v.includeZero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
          if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
          const m = (y1 - y0) * 0.08;
          y0 -= m;
          y1 += m;
        }

        const X = (t) => pad.l + ((t - x0) / (x1 - x0)) * w;
        const Y = (val) => pad.t + h - ((val - y0) / (y1 - y0)) * h;

        // grid and tick labels
        p.textSize(11);
        p.strokeWeight(1);
        const ys = niceStep(y1 - y0, 4);
        p.textAlign(p.RIGHT, p.CENTER);
        for (let val = Math.ceil(y0 / ys) * ys; val <= y1 + 1e-9; val += ys) {
          p.stroke(Math.abs(val) < ys / 1e6 ? theme.border : theme.grid);
          p.line(pad.l, Y(val), pad.l + w, Y(val));
          p.noStroke();
          p.fill(theme.faint);
          p.text(fmtTick(val, ys), pad.l - 6, Y(val));
        }
        const xs = niceStep(x1 - x0, Math.max(2, Math.floor(w / 80)));
        p.textAlign(p.CENTER, p.TOP);
        for (let t = Math.ceil(x0 / xs) * xs; t <= x1 + 1e-9; t += xs) {
          p.stroke(theme.grid);
          p.line(X(t), pad.t, X(t), pad.t + h);
          p.noStroke();
          p.fill(theme.faint);
          p.text(fmtTick(t, xs) + (t + xs > x1 + 1e-9 ? ' s' : ''), X(t), pad.t + h + 6);
        }
        if (v.yLabel) {
          p.noStroke();
          p.fill(theme.faint);
          p.textAlign(p.LEFT, p.TOP);
          p.text(v.yLabel, 6, 3);
        }
        p.noFill();
        p.stroke(theme.border);
        p.rect(pad.l, pad.t, w, h);

        // series, clipped to the plot box; non-finite values leave a gap
        const ctx = p.drawingContext;
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.l, pad.t, w, h);
        ctx.clip();
        p.noFill();
        p.strokeWeight(1.8);
        v.series.forEach((s, i) => {
          const a = d.ys[i];
          p.stroke(colorOf(s.color));
          if (s.dashed) ctx.setLineDash([5, 4]);
          let open = false;
          for (let k = 0; k < a.length; k++) {
            if (Number.isFinite(a[k])) {
              if (!open) { p.beginShape(); open = true; }
              p.vertex(X(d.t[k]), Y(a[k]));
            } else if (open) {
              p.endShape();
              open = false;
            }
          }
          if (open) p.endShape();
          ctx.setLineDash([]);
        });
        ctx.restore();
      };
    }

    function redraw() {
      if (instance && !panel.hidden) instance.redraw();
    }

    $('#plot-toggle-row').hidden = false;
    toggle.checked = views[0].visible !== false;
    panel.hidden = !toggle.checked;
    toggle.addEventListener('change', () => {
      panel.hidden = !toggle.checked;
      redraw();
    });
    instance = new p5(sketch, box);

    return { clear, push, redraw };
  }

  // ---------------------------------------------------------------- calculations panel
  /**
   * def.calculations(params, state) returns rows of
   *   { label, tex, value }  - a worked step: description, formula (TeX) and result
   *   { heading }            - a sub-heading
   *   { note, tone }         - a sentence; tone 'good' | 'bad' highlights it
   * The panel refreshes on every parameter change and a few times a second while running.
   */
  function createCalcPanel(def, getSim) {
    const panel = $('#calc-panel');
    const body = $('#calc-body');
    panel.hidden = false;
    let last = 0;
    let lastHtml = '';

    const tex = (src) => {
      if (!window.katex) return `<code>${src}</code>`;
      try {
        return katex.renderToString(src, { throwOnError: false });
      } catch {
        return `<code>${src}</code>`;
      }
    };

    function refresh() {
      const sim = getSim();
      const rows = def.calculations(sim.params, sim.state) || [];
      const html = rows.map((r) => {
        if (r.heading) return `<h3>${r.heading}</h3>`;
        if (r.note) return `<p class="calc-note ${r.tone ? 'calc-' + r.tone : ''}">${r.note}</p>`;
        return `<div class="calc-row"><span class="calc-label">${r.label}</span>` +
          `<span class="calc-tex">${r.tex ? tex(r.tex) : ''}</span>` +
          `<b class="calc-value">${r.value ?? ''}</b></div>`;
      }).join('');
      if (html !== lastHtml) {
        body.innerHTML = html;
        lastHtml = html;
      }
    }

    return {
      refresh,
      tick() {
        const now = performance.now();
        if (now - last > 250) {
          last = now;
          refresh();
        }
      },
    };
  }

  // ---------------------------------------------------------------- main
  function define(def) {
    const params = {};
    for (const c of def.controls || []) if ('value' in c) params[c.id] = c.value;

    const DT = def.dt || 1 / 240; // physics step in seconds of simulated time
    const MAX_STEPS = 4000; // per frame, protects against long stalls
    const plotViews = def.plot ? [].concat(def.plot) : [];
    const SAMPLE_EVERY = def.sampleEvery || 1 / 30; // plot sample spacing (s)

    const sim = { ready: false, playing: def.autoplay !== false, dragging: false, speed: 1, acc: 0, lastSample: -Infinity, params, state: null };
    let plot = null;
    let p5ref = null;
    // Lets page add-ons (like the calculator) read the live parameters and state.
    window.PhysicsHub.sim = sim;

    const redrawIfPaused = () => {
      if (sim.ready && !sim.playing) p5ref.redraw();
    };

    function reset() {
      sim.state = def.init(params, sim.state);
      if (sim.state.t === undefined) sim.state.t = 0;
      sim.acc = 0;
      if (plot) {
        plot.clear();
        sample();
      }
      calc?.refresh();
      redrawIfPaused();
    }

    function sample() {
      plot.push(sim.state, params);
      sim.lastSample = sim.state.t;
    }

    function stepOnce() {
      if (sim.state.done) return;
      def.update(sim.state, params, DT);
      sim.state.t += DT;
      if (plot && sim.state.t - sim.lastSample >= SAMPLE_EVERY - 1e-9) sample();
    }

    function advance(seconds) {
      sim.acc += seconds;
      let n = 0;
      while (sim.acc >= DT && n < MAX_STEPS) {
        stepOnce();
        sim.acc -= DT;
        n++;
      }
      if (n === MAX_STEPS) sim.acc = 0;
    }

    // Handed to sims in callbacks so they can drive the UI.
    const api = {
      /** Set a parameter as if the user moved its control. */
      set(id, value) {
        const ctrl = (def.controls || []).find((c) => c.id === id);
        params[id] = value;
        setters[id]?.(value);
        if (ctrl?.reset) reset();
        else def.onChange?.(id, sim.state, params, api);
        calc?.refresh();
        redrawIfPaused();
      },
      reset,
    };

    const setters = buildControls(def, params, (ctrl, value) => {
      if (ctrl.type === 'button') {
        ctrl.action?.(sim.state, params, api);
        if (ctrl.reset) reset();
        redrawIfPaused();
      } else {
        api.set(ctrl.id, value);
      }
    });
    const readoutCells = buildReadouts(def);

    // transport
    const playBtn = $('#btn-play');
    function setPlaying(on) {
      sim.playing = on;
      playBtn.textContent = on ? 'Pause' : 'Play';
      playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
      playBtn.classList.toggle('primary', !on);
      if (sim.ready) on ? p5ref.loop() : p5ref.noLoop();
    }
    playBtn.addEventListener('click', () => setPlaying(!sim.playing));
    $('#btn-step').addEventListener('click', () => {
      setPlaying(false);
      const n = Math.max(1, Math.round(1 / 60 / DT) * sim.speed);
      for (let i = 0; i < n; i++) stepOnce();
      redrawIfPaused();
    });
    $('#btn-reset').addEventListener('click', reset);
    $('#speed').addEventListener('change', (e) => (sim.speed = parseFloat(e.target.value)));
    document.addEventListener('keydown', (e) => {
      if (e.target !== document.body || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!sim.playing); }
      if (e.key === 'r' || e.key === 'R') reset();
    });

    const timeReadout = $('#time-readout');
    // Simulations can show their own clock (e.g. mission time with time warp).
    const clock = def.clock || ((state) => state.t);
    const calc = def.calculations ? createCalcPanel(def, () => sim) : null;
    const box = $('#sim-canvas');
    const aspect = def.aspect || 16 / 10;

    new p5((p) => {
      p5ref = p;
      const size = () => {
        const w = box.clientWidth;
        // On short (landscape phone) screens, keep the canvas and the play buttons above the fold.
        const vh = window.innerHeight;
        const maxH = vh < 600 ? vh - 175 : vh * 0.68;
        const h = Math.max(vh < 600 ? 180 : 260, Math.min(w / aspect, maxH));
        return [w, Math.round(h)];
      };

      p.setup = () => {
        p.createCanvas(...size());
        if (plotViews.length) plot = createPlot(plotViews, () => sim, clock);
        reset();
        new ResizeObserver(() => {
          const [w, h] = size();
          if (w && (w !== p.width || h !== p.height)) {
            p.resizeCanvas(w, h);
            def.onResize?.(sim.state, params, p);
            redrawIfPaused();
          }
        }).observe(box);
        sim.ready = true;
        setPlaying(sim.playing);
      };

      p.draw = () => {
        if (sim.playing && !sim.dragging) advance(Math.min(p.deltaTime / 1000, 0.1) * sim.speed);
        def.draw(p, sim.state, params, theme);

        timeReadout.textContent = `t = ${clock(sim.state).toFixed(2)} s`;
        calc?.tick();
        if (def.measure) {
          const vals = def.measure(sim.state, params);
          for (const id in readoutCells) readoutCells[id].textContent = vals[id] ?? '–';
        }
        plot?.redraw();
      };

      // Optional pointer interaction: def.pointer = { down, drag, up }, positions in canvas pixels.
      // Return true from down() to start a drag; physics is paused while dragging.
      const inside = () => p.mouseX >= 0 && p.mouseX <= p.width && p.mouseY >= 0 && p.mouseY <= p.height;
      p.mousePressed = () => {
        if (!def.pointer || !inside()) return;
        sim.dragging = !!def.pointer.down?.(sim.state, params, p.mouseX, p.mouseY, api);
        redrawIfPaused();
      };
      p.mouseDragged = () => {
        if (!sim.dragging) return;
        def.pointer.drag?.(sim.state, params, p.mouseX, p.mouseY, api);
        redrawIfPaused();
        return false;
      };
      p.mouseReleased = () => {
        if (!sim.dragging) return;
        sim.dragging = false;
        def.pointer.up?.(sim.state, params, p.mouseX, p.mouseY, api);
        redrawIfPaused();
      };
      p.mouseMoved = () => {
        if (!def.pointer?.hover) return;
        box.style.cursor = inside() && def.pointer.hover(sim.state, params, p.mouseX, p.mouseY) ? 'grab' : '';
      };
    }, box);
  }

  window.PhysicsHub = { define, theme, util };
})();
