# Physics in Theory

A small library of interactive physics simulations that run in the browser. It's built with [p5.js](https://p5js.org) and served by Node and Express.

| Simulation | What you can change | Plot |
| --- | --- | --- |
| Projectile Motion | speed, angle, height, gravity, air resistance | height, velocity |
| Simple Pendulum | length, release angle (or drag the bob), gravity, damping | angle (exact vs small-angle), energy |
| Mass on a Spring | mass, k, damping, start position (or drag), driving force | position, energy |
| 1D Collisions | masses, velocities, restitution, preset scenarios, walls | momentum, kinetic energy |
| Orbital Motion | distance, launch speed and direction, planet mass | distance, energy |
| Wave Interference | wavelength, separation, phase, frequency, wave or intensity view | displacement at a draggable probe |

## Running it

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # restarts when server files change
npm test         # smoke tests
```

You need Node 18 or newer. p5.js and KaTeX are served from `node_modules`, so the site works without internet access.

## Project layout

```
server.js                 Express app (routes: /, /sim/:slug)
src/simulations.js        The registry: one entry per simulation
src/theory.js             Loads content/theory/<slug>.md and renders it as Markdown
views/                    EJS templates (home, simulation page, 404)
public/js/hub.js          Shared runtime: controls, play/pause, fixed timestep, plot
public/sims/<slug>.js     One file per simulation
public/img/thumbs/        Card thumbnails (<slug>.svg, optional)
public/css/style.css      Gray theme. Colours are CSS variables, and the sims read them too.
content/theory/           Theory text shown under each simulation
```

## Adding the physics theory

Create `content/theory/<slug>.md`, for example `content/theory/pendulum.md`. It shows up in the "The physics" section under that simulation. Until the file exists, the page shows a placeholder.

You can use normal Markdown. Write maths with `$...$` for inline equations and `$$...$$` for display equations. KaTeX renders both. Start from `content/theory/_template.md`. Files whose names start with `_` are never shown on the site.

## Adding a simulation

1. Add an entry to `src/simulations.js`:

   ```js
   { slug: 'free-fall', title: 'Free Fall', summary: '…', category: 'Mechanics', level: 'Intro', tags: ['gravity'] },
   ```

2. Create `public/sims/free-fall.js`:

   ```js
   (function () {
     PhysicsHub.define({
       controls: [
         { id: 'g', label: 'Gravity', type: 'range', min: 1, max: 20, step: 0.1, value: 9.8, unit: 'm/s²' },
         { id: 'h0', label: 'Drop height', type: 'range', min: 1, max: 50, step: 1, value: 20, unit: 'm', reset: true },
       ],
       plot: {
         title: 'Height vs time',
         series: [{ label: 'y', color: 'accent' }],
         sample: (s) => [s.y],
       },

       init: (params) => ({ y: params.h0, v: 0 }),     // starting state
       update(s, params, dt) {                         // one physics step
         s.v -= params.g * dt;
         s.y += s.v * dt;
         if (s.y <= 0) { s.y = 0; s.done = true; }     // done stops the clock
       },
       draw(p, s, params, theme) {                     // p is the p5 instance
         p.background(theme.bg);
         const y = p.height - 20 - (s.y / params.h0) * (p.height - 60);
         p.noStroke();
         p.fill(theme.ink);
         p.circle(p.width / 2, y, 20);
       },
     });
   })();
   ```

3. (Optional) Add `public/img/thumbs/free-fall.svg` (320×180) and `content/theory/free-fall.md`.

That's all. The home page card, the controls panel, play/pause/step/reset, the speed selector and the plot are built for you.

### `PhysicsHub.define` options

| Option | Purpose |
| --- | --- |
| `controls` | List of controls (see below). Their current values are passed to every callback as `params`. |
| `init(params, prevState)` | Returns a fresh state object. Called on load, on Reset, and when a `reset: true` control changes. `state.t` (time in seconds) is managed for you. |
| `update(state, params, dt)` | Advances the physics by one fixed step `dt`. Set `state.done = true` to stop the clock. |
| `draw(p, state, params, theme)` | Draws one frame. `p` is the p5 instance (instance mode, so write `p.circle(...)`, not `circle(...)`). `theme` holds the CSS colours (`bg`, `ink`, `muted`, `faint`, `grid`, `border`, `accent`, `accent2`, `accent3`). |
| `dt` | Physics step in seconds. The default is `1/240`. Rendering runs at the display rate, and the physics runs as many fixed steps as are needed. |
| `aspect` | Canvas width / height. The default is `16/10`. The canvas resizes with the page, so draw relative to `p.width` and `p.height`. |
| `plot` | One plot config, or an array of them, which adds a dropdown to switch views. Each has `title`, `series: [{label, color, dashed?}]`, `sample(state, params) → [values]`, and optionally `window` (seconds of rolling history), `yRange` (`[min, max]` or a function), `includeZero`, `minDuration`, `yLabel`, and `visible: false` to start hidden. Return `NaN` to leave a gap. |
| `sampleEvery` | Plot sample spacing in seconds. The default is `1/30`. |
| `readouts` + `measure(state, params)` | `readouts: [{id, label}]` lists the live values shown under the controls. `measure` returns `{id: 'text'}`. |
| `onChange(id, state, params, api)` | Called when a control without `reset` changes. |
| `pointer: { hover, down, drag, up }` | Mouse and touch interaction in canvas pixels. If `down` returns true, a drag starts, and physics pauses until it ends. `hover` returning true shows a grab cursor. |

The handlers receive `api`. Use `api.set(id, value)` to change a parameter and move its control as if the user had moved it, and `api.reset()` to restart.

Control types:

```js
{ id, label, type: 'range', min, max, step, value, unit, reset?, hint?, format? }
{ id, label, type: 'select', options: [['value', 'Label'], …], value, reset? }
{ id, label, type: 'checkbox', value }
{ id, label, type: 'button', action(state, params, api), reset? }
```

`PhysicsHub.util` has small helpers: `rk4`, `arrow`, `dashed`, `clamp`, `lerp`, `toRad`, `toDeg`, `rgb`, `alpha`.

Keyboard shortcuts on simulation pages: <kbd>Space</kbd> plays or pauses, and <kbd>R</kbd> resets.
