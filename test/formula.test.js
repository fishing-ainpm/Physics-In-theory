const test = require('node:test');
const assert = require('node:assert');

global.window = global;
require('../public/js/formula.js');
const { Formula } = global;

test('rocket equation parses, lists symbols and evaluates', () => {
  const { target, expr } = Formula.parse('dv = ve * ln(m0 / mf)');
  assert.strictEqual(target, 'dv');
  assert.deepStrictEqual(Formula.symbols(expr), ['ve', 'm0', 'mf']);
  assert.ok(Math.abs(Formula.evaluate(expr, { ve: 3000, m0: 10, mf: 1 }) - 3000 * Math.log(10)) < 1e-9);
});

test('powers, superscripts, comma decimals and sqrt', () => {
  const { expr } = Formula.parse('E = 0,5 * m * v² + sqrt(4) ^ 2');
  assert.strictEqual(Formula.evaluate(expr, { m: 2, v: 3 }), 9 + 4);
});

test('helpful errors for common mistakes', () => {
  assert.throws(() => Formula.parse('x = 2 ve'), /Put a \*/);
  assert.throws(() => Formula.parse('x = ln m'), /brackets/);
  assert.throws(() => Formula.parse('a = (b + c'), /not closed/);
  assert.throws(() => Formula.evaluate(Formula.parse('F = m * a').expr, { m: 2 }), /"a" has no value/);
});
