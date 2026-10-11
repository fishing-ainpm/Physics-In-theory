const path = require('node:path');
const express = require('express');
const simulations = require('./src/simulations');
const { loadTheory } = require('./src/theory');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Front-end libraries are served straight from node_modules so the site works offline.
const vendor = (pkg, dir) => express.static(path.join(__dirname, 'node_modules', pkg, dir));
app.use('/vendor/p5', vendor('p5', 'lib'));
app.use('/vendor/katex', vendor('katex', 'dist'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Simulation Library',
    simulations: simulations.list(),
    categories: simulations.categories(),
  });
});

app.get('/sim/:slug', async (req, res, next) => {
  const sim = simulations.get(req.params.slug);
  if (!sim) return next();
  const { prev, next: nextSim } = simulations.neighbours(sim.slug);
  res.render('simulation', {
    title: sim.title,
    sim,
    prev,
    nextSim,
    theory: await loadTheory(sim.slug),
  });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Physics hub running at http://localhost:${PORT}`);
  });
}

module.exports = app;
