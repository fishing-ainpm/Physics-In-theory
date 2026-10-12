/*
 * A small formula language for student calculations.
 *
 *   Formula.parse('dv = ve * ln(m0 / mf)')
 *     -> { target: 'dv', expr: <ast> }
 *   Formula.symbols(ast)            -> ['ve', 'm0', 'mf']
 *   Formula.evaluate(ast, values)   -> number
 *   Formula.toTeX(ast, values?)     -> LaTeX (with numbers substituted when values are given)
 *
 * Supports + - * / ^ (also × · ÷ ² ³), parentheses, decimals with "." or ",",
 * 1.5e3 notation, the constant pi/π, and one-argument functions:
 * ln log sqrt √ exp sin cos tan asin acos atan abs. Angles are in radians.
 */
(function () {
  'use strict';

  const FUNCS = {
    ln: Math.log, log: Math.log10, log10: Math.log10, sqrt: Math.sqrt, exp: Math.exp,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, abs: Math.abs,
  };
  const CONSTS = { pi: Math.PI, 'π': Math.PI };
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'rho', 'sigma', 'tau', 'phi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Omega'];

  class FormulaError extends Error {}

  // ------------------------------------------------------------ tokenizer
  function tokenize(src) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?|[.,]\d+)|([\p{L}_][\p{L}\p{Nd}_]*)|(\*\*|[-+*/^()=×·÷²³√]))/uy;
    let i = 0;
    const s = src.trim();
    while (i < s.length) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (!m) throw new FormulaError(`I don't understand "${s.slice(i).trim()[0]}" (position ${i + 1}).`);
      i = re.lastIndex;
      if (m[1]) tokens.push({ t: 'num', v: parseFloat(m[1].replace(',', '.')), raw: m[1] });
      else if (m[2]) tokens.push({ t: 'id', v: m[2] });
      else tokens.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] });
    }
    return tokens;
  }

  // ------------------------------------------------------------ parser
  function parse(src) {
    if (!src || !src.trim()) throw new FormulaError('Write a formula first.');
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const take = () => tokens[pos++];

    let target = null;
    if (tokens.length > 2 && tokens[0].t === 'id' && tokens[1].t === 'op' && tokens[1].v === '=') {
      target = tokens[0].v;
      pos = 2;
    }

    function expr() {
      let node = term();
      while (isOp('+') || isOp('-')) {
        const op = take().v;
        node = { k: 'bin', op, a: node, b: term() };
      }
      return node;
    }
    function term() {
      let node = unary();
      for (;;) {
        if (isOp('*') || isOp('×') || isOp('·')) {
          take();
          node = { k: 'bin', op: '*', a: node, b: unary() };
        } else if (isOp('/') || isOp('÷')) {
          take();
          node = { k: 'bin', op: '/', a: node, b: unary() };
        } else if (peek() && (peek().t === 'id' || peek().t === 'num' || isOp('(') || isOp('√'))) {
          const prev = tokens[pos - 1];
          throw new FormulaError(`Put a * between "${prev.raw ?? prev.v}" and "${peek().raw ?? peek().v}" to multiply.`);
        } else {
          return node;
        }
      }
    }
    function unary() {
      if (isOp('-')) { take(); return { k: 'neg', a: unary() }; }
      if (isOp('+')) { take(); return unary(); }
      return power();
    }
    function power() {
      let node = primary();
      for (;;) {
        if (isOp('²')) { take(); node = { k: 'bin', op: '^', a: node, b: { k: 'num', v: 2 } }; }
        else if (isOp('³')) { take(); node = { k: 'bin', op: '^', a: node, b: { k: 'num', v: 3 } }; }
        else break;
      }
      if (isOp('^')) {
        take();
        return { k: 'bin', op: '^', a: node, b: unary() };
      }
      return node;
    }
    function primary() {
      const tok = take();
      if (!tok) throw new FormulaError('The formula ends too early.');
      if (tok.t === 'num') return { k: 'num', v: tok.v };
      if (tok.t === 'op' && tok.v === '(') {
        const node = expr();
        if (!isOp(')')) throw new FormulaError('A bracket "(" is not closed.');
        take();
        return { k: 'group', a: node };
      }
      if (tok.t === 'op' && tok.v === '√') return { k: 'fn', name: 'sqrt', a: power() };
      if (tok.t === 'id') {
        if (FUNCS[tok.v] && isOp('(')) {
          take();
          const arg = expr();
          if (!isOp(')')) throw new FormulaError(`"${tok.v}(" is not closed.`);
          take();
          return { k: 'fn', name: tok.v, a: arg };
        }
        if (FUNCS[tok.v]) throw new FormulaError(`Write ${tok.v}( … ) with brackets.`);
        if (tok.v in CONSTS) return { k: 'const', name: tok.v };
        return { k: 'id', name: tok.v };
      }
      throw new FormulaError(`Unexpected "${tok.v}".`);
    }

    const node = expr();
    if (pos < tokens.length) {
      const tok = tokens[pos];
      throw new FormulaError(tok.v === '=' ? 'Only one "=" is allowed, with a single name on the left (like dv = …).' : `Unexpected "${tok.raw ?? tok.v}".`);
    }
    return { target, expr: node };
  }

  // ------------------------------------------------------------ helpers
  function symbols(node, out = []) {
    if (!node) return out;
    if (node.k === 'id' && !out.includes(node.name)) out.push(node.name);
    symbols(node.a, out);
    symbols(node.b, out);
    return out;
  }

  function evaluate(node, values) {
    switch (node.k) {
      case 'num': return node.v;
      case 'const': return CONSTS[node.name];
      case 'id': {
        const v = values[node.name];
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormulaError(`"${node.name}" has no value.`);
        return v;
      }
      case 'group': return evaluate(node.a, values);
      case 'neg': return -evaluate(node.a, values);
      case 'fn': return FUNCS[node.name](evaluate(node.a, values));
      case 'bin': {
        const a = evaluate(node.a, values);
        const b = evaluate(node.b, values);
        if (node.op === '+') return a + b;
        if (node.op === '-') return a - b;
        if (node.op === '*') return a * b;
        if (node.op === '/') return a / b;
        return Math.pow(a, b);
      }
    }
    throw new FormulaError('Unknown expression.');
  }

  /** Nicely formatted number for display and TeX. */
  function fmt(v, tex = false) {
    if (!Number.isFinite(v)) return String(v);
    const abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e7 || abs < 1e-3)) {
      const [m, e] = v.toExponential(3).split('e');
      const mant = String(parseFloat(m));
      return tex ? `${mant} \\times 10^{${parseInt(e, 10)}}` : `${mant} × 10^${parseInt(e, 10)}`;
    }
    const s = parseFloat(v.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 6 });
    return tex ? s.replace(/,/g, '{,}') : s;
  }

  function idTeX(name) {
    // m0 -> m_{0}, v_e -> v_{e}, rho -> \rho, Delta_v -> \Delta_{v}
    let base = name;
    let sub = '';
    const us = name.indexOf('_');
    if (us > 0) {
      base = name.slice(0, us);
      sub = name.slice(us + 1);
    } else {
      const m = name.match(/^(\p{L}+?)(\d+)$/u);
      if (m) [, base, sub] = m;
    }
    const greek = (w) => (GREEK.includes(w) ? `\\${w}` : w.length > 1 ? `\\mathit{${w}}` : w);
    const b = greek(base);
    return sub ? `${b}_{${GREEK.includes(sub) ? '\\' + sub : sub}}` : b;
  }

  const FN_TEX = { ln: '\\ln', log: '\\log_{10}', log10: '\\log_{10}', exp: '\\exp', sin: '\\sin', cos: '\\cos', tan: '\\tan',
    asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan' };

  function toTeX(node, values) {
    const r = (n) => toTeX(n, values);
    switch (node.k) {
      case 'num': return fmt(node.v, true);
      case 'const': return '\\pi';
      case 'id':
        if (values && Number.isFinite(values[node.name])) {
          const s = fmt(values[node.name], true);
          return values[node.name] < 0 || s.includes('\\times') ? `\\left(${s}\\right)` : s;
        }
        return idTeX(node.name);
      case 'group': return `\\left(${r(node.a)}\\right)`;
      case 'neg': return `-${r(node.a)}`;
      case 'fn':
        if (node.name === 'sqrt') return `\\sqrt{${r(node.a)}}`;
        if (node.name === 'abs') return `\\left|${r(node.a)}\\right|`;
        return `${FN_TEX[node.name]}\\left(${r(node.a.k === 'group' ? node.a.a : node.a)}\\right)`;
      case 'bin':
        if (node.op === '/') return `\\frac{${r(node.a.k === 'group' ? node.a.a : node.a)}}{${r(node.b.k === 'group' ? node.b.a : node.b)}}`;
        if (node.op === '*') return `${r(node.a)} \\cdot ${r(node.b)}`;
        if (node.op === '^') return `{${r(node.a)}}^{${r(node.b.k === 'group' ? node.b.a : node.b)}}`;
        return `${r(node.a)} ${node.op} ${r(node.b)}`;
    }
    return '';
  }

  window.Formula = { parse, symbols, evaluate, toTeX, idTeX, fmt, FormulaError };
})();
