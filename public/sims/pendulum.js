// Simple pendulum, solved exactly (sin θ) with an optional small-angle (θ) comparison.
(function () {
  const { util } = PhysicsHub;

  const GRAVITY = [
    ['9.81', 'Earth (9.81 m/s²)'],
    ['1.62', 'Moon (1.62 m/s²)'],
    ['3.71', 'Mars (3.71 m/s²)'],
    ['24.79', 'Jupiter (24.79 m/s²)'],
  ];
  const L_MAX = 3; // longest string, sets the drawing scale

  function deriv(params, small) {
    const g = +params.gravity;
    const L = params.length;
    const b = params.damping;
    return ([th, w]) => [w, -(g / L) * (small ? th : Math.sin(th)) - b * w];
  }

  // Layout shared by draw() and the pointer handlers.
  function layout(p) {
    const scale = Math.min(p.height * 0.6, p.width * 0.45) / L_MAX;
    return { px: p.width / 2, py: p.height * 0.32, scale };
  }
  let lastLayout = null;

  PhysicsHub.define({
    aspect: 16 / 10,
    controls: [
      { id: 'length', label: 'String length', type: 'range', min: 0.3, max: L_MAX, step: 0.05, value: 1.5, unit: 'm' },
      { id: 'angle0', label: 'Release angle', type: 'range', min: -170, max: 170, step: 1, value: 30, unit: '°', reset: true,
        hint: 'Or drag the bob.' },
      { id: 'gravity', label: 'Gravity', type: 'select', options: GRAVITY, value: '9.81' },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 1, step: 0.01, value: 0, unit: '1/s' },
      { id: 'compare', label: 'Compare with small-angle model', type: 'checkbox', value: true },
    ],
    readouts: [
      { id: 'T0', label: 'Small-angle period 2π√(L/g)' },
      { id: 'T', label: 'Measured period' },
      { id: 'theta', label: 'Angle now' },
      { id: 'E', label: 'Energy (per kg)' },
    ],
    plot: [
      {
        title: 'Angle vs time',
        yLabel: 'degrees',
        window: 12,
        series: [
          { label: 'exact', color: 'accent' },
          { label: 'small-angle', color: 'accent2', dashed: true },
        ],
        sample: (s, params) => [util.toDeg(s.th), params.compare ? util.toDeg(s.ths) : NaN],
        yRange: (params) => {
          const a = Math.max(10, Math.abs(params.angle0)) * 1.15;
          return [-a, a];
        },
      },
      {
        title: 'Energy vs time',
        yLabel: 'J/kg',
        window: 12,
        series: [
          { label: 'kinetic', color: 'accent' },
          { label: 'potential', color: 'accent2' },
          { label: 'total', color: 'ink' },
        ],
        sample: (s, params) => energies(s, params),
        includeZero: true,
      },
    ],

    init(params) {
      const th = util.toRad(params.angle0);
      return { th, w: 0, ths: th, ws: 0, crossings: [] };
    },

    update(s, params, dt) {
      const prev = s.th;
      [s.th, s.w] = util.rk4([s.th, s.w], deriv(params, false), dt);
      [s.ths, s.ws] = util.rk4([s.ths, s.ws], deriv(params, true), dt);
      // Upward zero crossings give the period.
      if (prev < 0 && s.th >= 0) {
        const f = -prev / (s.th - prev);
        s.crossings.push(s.t + f * dt);
        if (s.crossings.length > 3) s.crossings.shift();
      }
    },

    draw(p, s, params, theme) {
      const { px, py, scale } = (lastLayout = layout(p));
      const len = params.length * scale;
      p.background(theme.bg);

      // vertical reference and swing envelope
      util.dashed(p, px, py, px, py + L_MAX * scale + 20, theme.border);
      p.noFill();
      p.stroke(theme.grid);
      p.strokeWeight(1);
      const a0 = Math.abs(util.toRad(params.angle0));
      p.arc(px, py, len * 2, len * 2, Math.PI / 2 - a0, Math.PI / 2 + a0);

      // ceiling mount
      p.noStroke();
      p.fill(theme.border);
      p.rect(px - 50, py - 8, 100, 8, 2);

      if (params.compare) drawBob(p, px, py, len, s.ths, util.alpha(theme.accent2, 0.55), 14, true);
      drawBob(p, px, py, len, s.th, theme.ink, 22, false);

      // angle arc
      p.noFill();
      p.stroke(theme.accent);
      p.strokeWeight(1.5);
      const r = Math.min(46, len * 0.5);
      const a = Math.PI / 2;
      p.arc(px, py, r * 2, r * 2, Math.min(a, a - s.th), Math.max(a, a - s.th));
      p.noStroke();
      p.fill(theme.accent);
      p.textSize(12);
      p.textAlign(p.CENTER, p.CENTER);
      p.text('θ', px + Math.sin(s.th / 2) * (r + 12), py + Math.cos(s.th / 2) * (r + 12));

      p.circle(px, py, 6);
    },

    pointer: {
      hover: (s, params, x, y) => nearBob(s, params, x, y),
      down: (s, params, x, y) => nearBob(s, params, x, y),
      drag(s, params, x, y, api) {
        const { px, py } = lastLayout;
        const deg = Math.round(util.toDeg(Math.atan2(x - px, y - py)));
        api.set('angle0', util.clamp(deg, -170, 170));
      },
    },

    measure(s, params) {
      const T0 = 2 * Math.PI * Math.sqrt(params.length / +params.gravity);
      const c = s.crossings;
      const [ke, pe] = energies(s, params);
      return {
        T0: `${T0.toFixed(3)} s`,
        T: c.length >= 2 ? `${(c[c.length - 1] - c[c.length - 2]).toFixed(3)} s` : '…',
        theta: `${util.toDeg(s.th).toFixed(1)}°`,
        E: `${(ke + pe).toFixed(2)} J`,
      };
    },
  });

  function energies(s, params) {
    const g = +params.gravity;
    const L = params.length;
    const ke = 0.5 * L * L * s.w * s.w;
    const pe = g * L * (1 - Math.cos(s.th));
    return [ke, pe, ke + pe];
  }

  function nearBob(s, params, x, y) {
    if (!lastLayout) return false;
    const { px, py, scale } = lastLayout;
    const len = params.length * scale;
    return Math.hypot(x - (px + Math.sin(s.th) * len), y - (py + Math.cos(s.th) * len)) < 24;
  }

  function drawBob(p, px, py, len, th, color, size, ghost) {
    const bx = px + Math.sin(th) * len;
    const by = py + Math.cos(th) * len;
    p.stroke(color);
    p.strokeWeight(ghost ? 1 : 1.5);
    if (ghost) p.drawingContext.setLineDash([4, 4]);
    p.line(px, py, bx, by);
    p.drawingContext.setLineDash([]);
    p.noStroke();
    p.fill(color);
    p.circle(bx, by, size);
  }
})();
