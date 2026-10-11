/**
 * The simulation registry.
 *
 * To add a simulation:
 *   1. Create the sketch in public/sims/<slug>.js (copy an existing one as a template).
 *   2. Add an entry below.
 *   3. Optionally write the theory in content/theory/<slug>.md.
 *
 * Fields:
 *   slug      URL id, also the file name of the sketch and theory.
 *   title     Display name.
 *   summary   One or two sentences shown on the library card.
 *   category  Used to group and filter on the home page.
 *   level     'Intro' | 'Intermediate' | 'Advanced'.
 *   tags      Short keywords, searchable on the home page.
 */
const SIMULATIONS = [
  {
    slug: 'projectile',
    title: 'Projectile Motion',
    summary: 'Launch a ball at any angle and speed. Compare flight with and without air resistance.',
    category: 'Mechanics',
    level: 'Intro',
    tags: ['kinematics', 'gravity', 'drag', 'trajectory'],
  },
  {
    slug: 'pendulum',
    title: 'Simple Pendulum',
    summary: 'Swing a pendulum and see how length, gravity and damping change the period.',
    category: 'Oscillations',
    level: 'Intro',
    tags: ['period', 'small-angle', 'damping', 'energy'],
  },
  {
    slug: 'spring',
    title: 'Mass on a Spring',
    summary: 'A damped harmonic oscillator. Watch kinetic and potential energy trade places.',
    category: 'Oscillations',
    level: 'Intro',
    tags: ['hooke', 'harmonic', 'damping', 'energy'],
  },
  {
    slug: 'collisions',
    title: '1D Collisions',
    summary: 'Two carts on a track. Tune masses, velocities and elasticity, then check momentum conservation.',
    category: 'Mechanics',
    level: 'Intro',
    tags: ['momentum', 'elastic', 'inelastic', 'restitution'],
  },
  {
    slug: 'orbit',
    title: 'Orbital Motion',
    summary: 'Put a satellite into orbit around a planet. Circular, elliptical or escape: it depends on the launch speed.',
    category: 'Gravitation',
    level: 'Intermediate',
    tags: ['kepler', 'gravity', 'ellipse', 'escape velocity'],
  },
  {
    slug: 'waves',
    title: 'Wave Interference',
    summary: 'Two point sources create ripples that add up. Find the bright and dark fringes.',
    category: 'Waves',
    level: 'Intermediate',
    tags: ['superposition', 'wavelength', 'phase', 'fringes'],
  },
];

const bySlug = new Map(SIMULATIONS.map((s) => [s.slug, s]));

module.exports = {
  list: () => SIMULATIONS,
  get: (slug) => bySlug.get(slug),
  categories: () => [...new Set(SIMULATIONS.map((s) => s.category))],
  neighbours(slug) {
    const i = SIMULATIONS.findIndex((s) => s.slug === slug);
    return { prev: SIMULATIONS[i - 1] || null, next: SIMULATIONS[i + 1] || null };
  },
};
