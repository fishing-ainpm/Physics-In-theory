// Damped (and optionally driven) mass on a horizontal spring.
(function () {
  const { util } = PhysicsHub;
  const X_RANGE = 0.6; // metres either side of equilibrium shown on screen
  const F0 = 2; // driving force amplitude (N)

  function deriv(params, t) {
    const { mass: m, k, damping: b } = params;
    const drive = params.drive === 'on' ? F0 * Math.cos(2 * Math.PI * params.driveFreq * t) : 0;
    return ([x, v]) => [v, (-k * x - b * v + drive) / m];
  }

  function layout(p) {
    const scale = (p.width * 0.36) / X_RANGE;
    return { cx: p.width * 0.55, floor: p.height * 0.7, scale, wall: p.width * 0.06 };
  }
  let lastLayout = null;

  PhysicsHub.define({
    aspect: 2.4,
    controls: [
      { id: 'mass', label: 'Mass', type: 'range', min: 0.2, max: 5, step: 0.1, value: 1, unit: 'kg' },
      { id: 'k', label: 'Spring constant k', type: 'range', min: 2, max: 100, step: 1, value: 20, unit: 'N/m' },
      { id: 'damping', label: 'Damping b', type: 'range', min: 0, max: 10, step: 0.05, value: 0.3, unit: 'kg/s' },
      { id: 'x0', label: 'Starting displacement', type: 'range', min: -0.5, max: 0.5, step: 0.01, value: 0.3, unit: 'm', reset: true,
        hint: 'Or drag the block.' },
      { id: 'drive', label: 'Driving force', type: 'select', options: [['off', 'Off'], ['on', `On (F₀ = ${F0} N)`]], value: 'off' },
      { id: 'driveFreq', label: 'Driving frequency', type: 'range', min: 0.1, max: 3, step: 0.01, value: 0.7, unit: 'Hz',
        hint: 'Only used when driving is on. Try matching the natural frequency.' },
      { id: 'forces', label: 'Show force arrows', type: 'checkbox', value: true },
    ],
    readouts: [
      { id: 'f0', label: 'Natural frequency' },
      { id: 'T', label: 'Period 2π√(m/k)' },
      { id: 'zeta', label: 'Damping ratio ζ' },
      { id: 'regime', label: 'Regime' },
    ],
    plot: [
      {
        title: 'Position vs time',
        yLabel: 'm',
        window: 10,
        series: [{ label: 'x', color: 'accent' }],
        sample: (s) => [s.x],
        includeZero: true,
      },
      {
        title: 'Energy vs time',
        yLabel: 'J',
        window: 10,
        series: [
          { label: 'kinetic', color: 'accent' },
          { label: 'spring', color: 'accent2' },
          { label: 'total', color: 'ink' },
        ],
        sample: (s, params) => {
          const ke = 0.5 * params.mass * s.v * s.v;
          const pe = 0.5 * params.k * s.x * s.x;
          return [ke, pe, ke + pe];
        },
        includeZero: true,
      },
    ],

    init: (params) => ({ x: params.x0, v: 0 }),

    update(s, params, dt) {
      [s.x, s.v] = util.rk4([s.x, s.v], deriv(params, s.t), dt);
    },

    draw(p, s, params, theme) {
      const L = (lastLayout = layout(p));
      const { cx, floor, scale, wall } = L;
      const size = 34 + 14 * Math.sqrt(params.mass);
      const bx = cx + s.x * scale; // block centre
      const midY = floor - size / 2;

      p.background(theme.bg);

      // floor and wall
      p.stroke(theme.muted);
      p.strokeWeight(1.5);
      p.line(wall, floor, p.width, floor);
      p.noStroke();
      p.fill(theme.border);
      p.rect(wall - 14, floor - 120, 14, 120 + 10);

      // scale along the floor
      p.textSize(11);
      p.textAlign(p.CENTER, p.TOP);
      for (let x = -0.5; x <= 0.5001; x += 0.1) {
        const sx = cx + x * scale;
        p.stroke(theme.border);
        p.strokeWeight(1);
        p.line(sx, floor, sx, floor + (Math.abs(x) < 1e-6 ? 10 : 5));
        if (Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 && Math.round(x * 10) % 2 === 0) {
          p.noStroke();
          p.fill(theme.faint);
          p.text(Math.abs(x) < 1e-6 ? '0 m' : x.toFixed(1), sx, floor + 13);
        }
      }
      util.dashed(p, cx, floor - 150, cx, floor, theme.border);

      // spring as a zigzag from wall to block
      const left = wall;
      const right = bx - size / 2;
      const coils = 14;
      const amp = 11;
      p.noFill();
      p.stroke(theme.ink);
      p.strokeWeight(1.6);
      p.beginShape();
      p.vertex(left, midY);
      const lead = 12;
      p.vertex(left + lead, midY);
      for (let i = 0; i < coils * 2; i++) {
        const x = left + lead + ((right - left - 2 * lead) * (i + 0.5)) / (coils * 2);
        p.vertex(x, midY + (i % 2 ? amp : -amp));
      }
      p.vertex(right - lead, midY);
      p.vertex(right, midY);
      p.endShape();

      // block
      p.noStroke();
      p.fill(theme.ink);
      p.rect(bx - size / 2, floor - size, size, size, 4);
      p.fill(theme.surface);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(12);
      p.text(`${params.mass.toFixed(1)} kg`, bx, midY);

      // forces
      if (params.forces) {
        const k = 110 / Math.max(params.k * 0.5, F0); // px per newton: the largest spring force fits
        const y = floor - size - 18;
        util.arrow(p, bx, y, -params.k * s.x * k, 0, theme.accent2);
        util.arrow(p, bx, y - 16, -params.damping * s.v * k, 0, theme.accent3);
        if (params.drive === 'on') util.arrow(p, bx, y - 32, F0 * Math.cos(2 * Math.PI * params.driveFreq * s.t) * k, 0, theme.accent);

        p.noStroke();
        p.textAlign(p.LEFT, p.CENTER);
        p.textSize(12);
        const key = [['spring force', theme.accent2], ['damping force', theme.accent3]];
        if (params.drive === 'on') key.push(['driving force', theme.accent]);
        key.forEach(([label, c], i) => {
          p.fill(c);
          p.rect(16, 18 + i * 18, 12, 3);
          p.fill(theme.muted);
          p.text(label, 34, 19 + i * 18);
        });
      }
    },

    pointer: {
      hover: (s, params, x, y) => onBlock(s, params, x, y),
      down: (s, params, x, y) => onBlock(s, params, x, y),
      drag(s, params, x, y, api) {
        const { cx, scale } = lastLayout;
        api.set('x0', Math.round(util.clamp((x - cx) / scale, -0.5, 0.5) * 100) / 100);
      },
    },

    measure(s, params) {
      const { mass: m, k, damping: b } = params;
      const zeta = b / (2 * Math.sqrt(m * k));
      return {
        f0: `${(Math.sqrt(k / m) / (2 * Math.PI)).toFixed(3)} Hz`,
        T: `${(2 * Math.PI * Math.sqrt(m / k)).toFixed(3)} s`,
        zeta: zeta.toFixed(3),
        regime: zeta === 0 ? 'undamped' : zeta < 0.999 ? 'underdamped' : zeta <= 1.001 ? 'critical' : 'overdamped',
      };
    },
  });

  function onBlock(s, params, x, y) {
    if (!lastLayout) return false;
    const { cx, floor, scale } = lastLayout;
    const size = 34 + 14 * Math.sqrt(params.mass);
    const bx = cx + s.x * scale;
    return Math.abs(x - bx) < size / 2 + 6 && y > floor - size - 6 && y < floor + 6;
  }
})();
