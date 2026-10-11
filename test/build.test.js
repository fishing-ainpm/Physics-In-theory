const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const simulations = require('../src/simulations');
const { protectMath } = require('../src/theory');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const read = (p) => fs.readFileSync(path.join(WWW, p), 'utf8');

test.before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js')], { stdio: 'ignore' });
});

test('home page links to every simulation', () => {
  const html = read('index.html');
  for (const sim of simulations.list()) assert.ok(html.includes(`href="sim/${sim.slug}.html"`), sim.slug);
});

test('every simulation has a page and a sketch file', () => {
  for (const sim of simulations.list()) {
    assert.ok(fs.existsSync(path.join(WWW, 'sim', `${sim.slug}.html`)), `missing page for ${sim.slug}`);
    assert.ok(fs.existsSync(path.join(WWW, 'sims', `${sim.slug}.js`)), `missing public/sims/${sim.slug}.js`);
  }
});

test('every local link and script in the output resolves', () => {
  const pages = ['index.html', ...simulations.list().map((s) => `sim/${s.slug}.html`)];
  for (const page of pages) {
    const html = read(page);
    for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      if (/^[a-z]+:/.test(url)) continue;
      const target = path.join(WWW, path.dirname(page), url);
      assert.ok(fs.existsSync(target), `${page} -> ${url}`);
    }
  }
});

test('no absolute paths (they break inside the app)', () => {
  for (const page of ['index.html', 'sim/projectile.html']) {
    assert.doesNotMatch(read(page), /(?:href|src)="\/(?!\/)/, page);
  }
});

test('maths survives markdown parsing', () => {
  const { text, restore } = protectMath('Speed $v_0 t_1$ and $$a_b * c_d$$');
  assert.ok(!text.includes('_'));
  assert.strictEqual(restore(text), 'Speed $v_0 t_1$ and $$a_b * c_d$$');
});
