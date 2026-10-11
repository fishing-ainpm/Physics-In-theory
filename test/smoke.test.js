const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server');
const simulations = require('../src/simulations');
const { protectMath } = require('../src/theory');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

test('home page lists every simulation', async () => {
  const html = await (await fetch(base + '/')).text();
  for (const sim of simulations.list()) assert.ok(html.includes(`/sim/${sim.slug}`), sim.slug);
});

test('every registered simulation has a page and a sketch file', async () => {
  for (const sim of simulations.list()) {
    const res = await fetch(`${base}/sim/${sim.slug}`);
    assert.strictEqual(res.status, 200, sim.slug);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'sims', `${sim.slug}.js`)), `missing public/sims/${sim.slug}.js`);
  }
});

test('vendor libraries are served', async () => {
  for (const url of ['/vendor/p5/p5.min.js', '/vendor/katex/katex.min.js', '/js/hub.js']) {
    assert.strictEqual((await fetch(base + url)).status, 200, url);
  }
});

test('unknown simulation returns 404', async () => {
  assert.strictEqual((await fetch(base + '/sim/does-not-exist')).status, 404);
});

test('maths survives markdown parsing', () => {
  const { text, restore } = protectMath('Speed $v_0 t_1$ and $$a_b * c_d$$');
  assert.ok(!text.includes('_'));
  assert.strictEqual(restore(text), 'Speed $v_0 t_1$ and $$a_b * c_d$$');
});
