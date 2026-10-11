// Two carts on a frictionless track, colliding with a chosen coefficient of restitution.
(function () {
  const { util } = PhysicsHub;
  const HALF = 3; // track runs from -3 m to +3 m

  const PRESETS = {
    custom: null,
    equal: { m1: 1, m2: 1, v1: 2, v2: 0, e: 1 },
    heavy: { m1: 4, m2: 1, v1: 2, v2: 0, e: 1 },
    light: { m1: 1, m2: 4, v1: 2, v2: 0, e: 1 },
    headon: { m1: 2, m2: 2, v1: 1.5, v2: -1.5, e: 1 },
    stick: { m1: 1, m2: 2, v1: 3, v2: 0, e: 0 },
  };
  let applyingPreset = false;

  const width = (m) => 0.3 + 0.14 * Math.sqrt(m);
  const totals = (s, params) => ({
    p: params.m1 * s.v1 + params.m2 * s.v2,
    ke: 0.5 * params.m1 * s.v1 * s.v1 + 0.5 * params.m2 * s.v2 * s.v2,
  });

  PhysicsHub.define({
    aspect: 2.2,
    controls: [
      { id: 'preset', label: 'Scenario', type: 'select', value: 'custom', options: [
        ['custom', 'Custom'],
        ['equal', 'Elastic, equal masses'],
        ['heavy', 'Heavy cart hits light cart'],
        ['light', 'Light cart hits heavy cart'],
        ['headon', 'Head-on, equal masses'],
        ['stick', 'Carts stick together'],
      ] },
      { id: 'm1', label: 'Mass of cart A', type: 'range', min: 0.5, max: 5, step: 0.1, value: 1, unit: 'kg', reset: true },
      { id: 'm2', label: 'Mass of cart B', type: 'range', min: 0.5, max: 5, step: 0.1, value: 2, unit: 'kg', reset: true },
      { id: 'v1', label: 'Velocity of A', type: 'range', min: -4, max: 4, step: 0.1, value: 2, unit: 'm/s', reset: true },
      { id: 'v2', label: 'Velocity of B', type: 'range', min: -4, max: 4, step: 0.1, value: -0.5, unit: 'm/s', reset: true },
      { id: 'e', label: 'Elasticity (restitution e)', type: 'range', min: 0, max: 1, step: 0.05, value: 1, reset: true,
        hint: '1 = perfectly elastic, 0 = carts stick together.' },
      { id: 'ends', label: 'Track ends', type: 'select', options: [['open', 'Open'], ['walls', 'Bouncy walls']], value: 'open', reset: true },
      { id: 'cm', label: 'Show centre of mass', type: 'checkbox', value: true },
    ],
    readouts: [
      { id: 'pBefore', label: 'Momentum before' },
      { id: 'pAfter', label: 'Momentum after' },
      { id: 'keBefore', label: 'Kinetic energy before' },
      { id: 'keAfter', label: 'Kinetic energy after' },
    ],
    plot: [
      {
        title: 'Momentum vs time',
        yLabel: 'kg·m/s',
        minDuration: 6,
        includeZero: true,
        series: [
          { label: 'A', color: 'accent' },
          { label: 'B', color: 'accent2' },
          { label: 'total', color: 'ink' },
        ],
        sample: (s, params) => [params.m1 * s.v1, params.m2 * s.v2, params.m1 * s.v1 + params.m2 * s.v2],
      },
      {
        title: 'Kinetic energy vs time',
        yLabel: 'J',
        minDuration: 6,
        includeZero: true,
        series: [
          { label: 'A', color: 'accent' },
          { label: 'B', color: 'accent2' },
          { label: 'total', color: 'ink' },
        ],
        sample: (s, params) => {
          const a = 0.5 * params.m1 * s.v1 * s.v1;
          const b = 0.5 * params.m2 * s.v2 * s.v2;
          return [a, b, a + b];
        },
      },
    ],

    onChange(id, s, params, api) {
      if (id === 'preset' && PRESETS[params.preset]) {
        applyingPreset = true;
        for (const [k, v] of Object.entries(PRESETS[params.preset])) api.set(k, v);
        applyingPreset = false;
        api.reset();
      }
    },

    init(params, prev) {
      // Moving a slider by hand switches the scenario back to "Custom".
      if (prev && !applyingPreset && params.preset !== 'custom') {
        const p = PRESETS[params.preset];
        if (Object.keys(p).some((k) => p[k] !== params[k])) {
          params.preset = 'custom';
          document.getElementById('ctrl-preset').value = 'custom';
        }
      }
      const s = { x1: -1.6, v1: params.v1, x2: 0.6, v2: params.v2, hits: 0, after: null, flash: 0 };
      s.before = totals(s, params);
      return s;
    },

    update(s, params, dt) {
      s.x1 += s.v1 * dt;
      s.x2 += s.v2 * dt;
      s.flash = Math.max(0, s.flash - dt);

      const gap = s.x2 - s.x1 - (width(params.m1) + width(params.m2)) / 2;
      if (gap <= 0 && s.v1 > s.v2) {
        const { m1, m2, e } = params;
        const P = m1 * s.v1 + m2 * s.v2;
        const v1 = (P + m2 * e * (s.v2 - s.v1)) / (m1 + m2);
        const v2 = (P + m1 * e * (s.v1 - s.v2)) / (m1 + m2);
        s.v1 = v1;
        s.v2 = v2;
        s.hits++;
        s.flash = 0.25;
        if (!s.after) s.after = totals(s, params);
      }

      if (params.ends === 'walls') {
        if (s.x1 - width(params.m1) / 2 < -HALF && s.v1 < 0) s.v1 = -s.v1;
        if (s.x2 + width(params.m2) / 2 > HALF && s.v2 > 0) s.v2 = -s.v2;
      } else if (Math.abs(s.x1) > HALF + 1 && Math.abs(s.x2) > HALF + 1) {
        s.done = true;
      }
      if (s.t > 60) s.done = true;
    },

    draw(p, s, params, theme) {
      const scale = (p.width * 0.92) / (2 * HALF);
      const X = (x) => p.width / 2 + x * scale;
      const rail = p.height * 0.66;
      p.background(theme.bg);

      // track with metre marks
      p.stroke(theme.muted);
      p.strokeWeight(2);
      p.line(X(-HALF), rail, X(HALF), rail);
      p.textSize(11);
      p.textAlign(p.CENTER, p.TOP);
      for (let x = -HALF; x <= HALF; x++) {
        p.stroke(theme.border);
        p.strokeWeight(1);
        p.line(X(x), rail + 2, X(x), rail + 8);
        p.noStroke();
        p.fill(theme.faint);
        p.text(x === 0 ? '0 m' : x, X(x), rail + 12);
      }
      if (params.ends === 'walls') {
        p.noStroke();
        p.fill(theme.border);
        p.rect(X(-HALF) - 10, rail - 70, 10, 70);
        p.rect(X(HALF), rail - 70, 10, 70);
      }

      drawCart(p, X(s.x1), rail, width(params.m1) * scale, params.m1, 'A', theme.accent, theme);
      drawCart(p, X(s.x2), rail, width(params.m2) * scale, params.m2, 'B', theme.accent2, theme);

      // velocity arrows
      const k = 22; // px per m/s
      const ay = rail - 82;
      util.arrow(p, X(s.x1), ay, s.v1 * k, 0, theme.accent);
      util.arrow(p, X(s.x2), ay - 14, s.v2 * k, 0, theme.accent2);

      // centre of mass
      if (params.cm) {
        const xc = (params.m1 * s.x1 + params.m2 * s.x2) / (params.m1 + params.m2);
        p.noStroke();
        p.fill(theme.ink);
        p.triangle(X(xc), rail + 26, X(xc) - 6, rail + 36, X(xc) + 6, rail + 36);
        p.fill(theme.faint);
        p.textAlign(p.CENTER, p.TOP);
        p.text('centre of mass', X(xc), rail + 39);
      }

      // collision flash
      if (s.flash > 0) {
        const mid = (X(s.x1) + width(params.m1) * scale / 2 + X(s.x2) - width(params.m2) * scale / 2) / 2;
        p.noFill();
        p.stroke(util.alpha(theme.ink, s.flash * 2));
        p.strokeWeight(2);
        p.circle(mid, rail - 26, 40 + (0.25 - s.flash) * 160);
      }

      // legend
      p.noStroke();
      p.textAlign(p.LEFT, p.CENTER);
      p.textSize(12);
      p.fill(theme.muted);
      p.text(s.hits ? `collisions: ${s.hits}` : s.v1 > s.v2 ? 'approaching…' : 'these carts will never meet', 16, 20);
    },

    measure(s, params) {
      const fmt = (v, u) => `${v.toFixed(2)} ${u}`;
      const after = s.after;
      return {
        pBefore: fmt(s.before.p, 'kg·m/s'),
        pAfter: after ? fmt(after.p, 'kg·m/s') : '–',
        keBefore: fmt(s.before.ke, 'J'),
        keAfter: after ? `${fmt(after.ke, 'J')} (${s.before.ke ? Math.round((100 * after.ke) / s.before.ke) : 100}%)` : '–',
      };
    },
  });

  function drawCart(p, cx, rail, w, m, label, color, theme) {
    const h = 26 + 10 * Math.sqrt(m);
    const wheel = 10;
    const top = rail - wheel - h;
    p.noStroke();
    p.fill(color);
    p.rect(cx - w / 2, top, w, h, 5);
    p.fill(theme.ink);
    p.circle(cx - w / 3, rail - wheel / 2, wheel);
    p.circle(cx + w / 3, rail - wheel / 2, wheel);
    p.fill(theme.surface);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(12);
    p.text(label, cx, top + h / 2 - 7);
    p.textSize(10);
    p.text(`${m.toFixed(1)} kg`, cx, top + h / 2 + 7);
  }
})();
