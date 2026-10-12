/**
 * Renders the EJS templates into a static site in www/, which Capacitor
 * packages into the Android app. All links are relative, so the output also
 * works from any static file server (npm run preview).
 */
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const esbuild = require('esbuild');
const simulations = require('../src/simulations');
const { loadTheory } = require('../src/theory');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const VIEWS = path.join(ROOT, 'views');

async function render(view, data, outFile) {
  const html = await ejs.renderFile(path.join(VIEWS, `${view}.ejs`), data, { async: false });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
}

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

  // Front-end libraries, bundled so the app works offline.
  fs.cpSync(path.join(ROOT, 'node_modules/p5/lib/p5.min.js'), path.join(OUT, 'vendor/p5/p5.min.js'));
  fs.cpSync(path.join(ROOT, 'node_modules/matter-js/build/matter.min.js'), path.join(OUT, 'vendor/matter/matter.min.js'));
  fs.cpSync(path.join(ROOT, 'node_modules/poly-decomp/build/decomp.min.js'), path.join(OUT, 'vendor/matter/decomp.min.js'));
  fs.cpSync(path.join(ROOT, 'node_modules/marked/lib/marked.umd.js'), path.join(OUT, 'vendor/marked/marked.umd.js'));

  // The AI helper uses the Anthropic SDK, bundled into one browser script.
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/ai/interpret.js')],
    outfile: path.join(OUT, 'js/ai.js'),
    bundle: true,
    format: 'iife',
    globalName: 'PhysicsAI',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    logLevel: 'warning',
  });
  const katex = path.join(ROOT, 'node_modules/katex/dist');
  fs.cpSync(path.join(katex, 'katex.min.css'), path.join(OUT, 'vendor/katex/katex.min.css'));
  fs.cpSync(path.join(katex, 'katex.min.js'), path.join(OUT, 'vendor/katex/katex.min.js'));
  fs.cpSync(path.join(katex, 'contrib/auto-render.min.js'), path.join(OUT, 'vendor/katex/contrib/auto-render.min.js'));
  fs.cpSync(path.join(katex, 'fonts'), path.join(OUT, 'vendor/katex/fonts'), {
    recursive: true,
    filter: (f) => !/\.(ttf|woff)$/.test(f), // woff2 is enough for Android WebView
  });

  await render('index', {
    title: 'Simulation Library',
    root: '',
    simulations: simulations.list(),
    categories: simulations.categories(),
  }, path.join(OUT, 'index.html'));

  for (const sim of simulations.list()) {
    const { prev, next } = simulations.neighbours(sim.slug);
    await render('simulation', {
      title: sim.title,
      root: '../',
      sim,
      prev,
      nextSim: next,
      theory: await loadTheory(sim.slug),
    }, path.join(OUT, 'sim', `${sim.slug}.html`));
  }

  console.log(`Built ${simulations.list().length} simulations into ${path.relative(ROOT, OUT)}/`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
