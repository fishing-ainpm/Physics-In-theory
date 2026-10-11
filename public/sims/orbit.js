// A satellite around a planet under Newtonian gravity.
// Units: distances in planet radii (R), time in seconds; GM is chosen so a
// circular orbit at 3 R takes about 8 s.
(function () {
  const { util } = PhysicsHub;
  const GM0 = 16;
  const MASSES = [['0.5', 'Light (½ × M)'], ['1', 'Standard (M)'], ['2', 'Heavy (2 × M)']];

  const mu = (params) => GM0 * +params.mass;

  /** Orbital elements from position and velocity. */
  function elements(s, params) {
    const m = mu(params);
    const r = Math.hypot(s.x, s.y);
    const v2 = s.vx * s.vx + s.vy * s.vy;
    const E = v2 / 2 - m / r;
    const rv = s.x * s.vx + s.y * s.vy;
    const ex = ((v2 - m / r) * s.x - rv * s.vx) / m;
    const ey = ((v2 - m / r) * s.y - rv * s.vy) / m;
    const e = Math.hypot(ex, ey);
    const a = E < 0 ? -m / (2 * E) : Infinity;
    return { r, v: Math.sqrt(v2), E, e, a, T: E < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / m) : Infinity };
  }

  function accel(x, y, params) {
    const r2 = x * x + y * y;
    const f = -mu(params) / (r2 * Math.sqrt(r2));
    return [f * x, f * y];
  }

  PhysicsHub.define({
    aspect: 4 / 3,
    dt: 1 / 600,
    controls: [
      { id: 'r0', label: 'Starting distance', type: 'range', min: 1.5, max: 6, step: 0.1, value: 3, unit: 'R', reset: true },
      { id: 'speed', label: 'Launch speed (× circular speed)', type: 'range', min: 0.2, max: 1.6, step: 0.01, value: 1, reset: true,
        format: (v) => `${v.toFixed(2)}×`, hint: '1.00× gives a circle; above √2 ≈ 1.41× the satellite escapes.' },
      { id: 'angle', label: 'Launch direction', type: 'range', min: -60, max: 60, step: 1, value: 0, unit: '°', reset: true,
        hint: 'Angle away from the sideways (tangential) direction.' },
      { id: 'mass', label: 'Planet mass', type: 'select', options: MASSES, value: '1',
        hint: 'Change it mid-orbit to see the path shift.' },
      { id: 'vectors', label: 'Show velocity and force', type: 'checkbox', value: true },
      { id: 'trail', label: 'Show trail', type: 'checkbox', value: true },
    ],
    readouts: [
      { id: 'r', label: 'Distance' },
      { id: 'v', label: 'Speed' },
      { id: 'e', label: 'Eccentricity' },
      { id: 'T', label: 'Orbital period' },
      { id: 'status', label: 'Status' },
    ],
    plot: [
      {
        title: 'Distance vs time',
        yLabel: 'R',
        window: 20,
        includeZero: true,
        series: [{ label: 'r', color: 'accent' }],
        sample: (s) => [Math.hypot(s.x, s.y)],
      },
      {
        title: 'Energy vs time (per kg)',
        yLabel: 'J/kg',
        window: 20,
        includeZero: true,
        series: [
          { label: 'kinetic', color: 'accent' },
          { label: 'potential', color: 'accent2' },
          { label: 'total', color: 'ink' },
        ],
        sample: (s, params) => {
          const ke = 0.5 * (s.vx * s.vx + s.vy * s.vy);
          const pe = -mu(params) / Math.hypot(s.x, s.y);
          return [ke, pe, ke + pe];
        },
      },
    ],

    init(params) {
      const vc = Math.sqrt(mu(params) / params.r0);
      const v = vc * params.speed;
      const a = util.toRad(params.angle);
      // Start on the +x axis moving "up" the screen (counter-clockwise), tilted outward by `angle`.
      const s = { x: params.r0, y: 0, vx: v * Math.sin(a), vy: v * Math.cos(a), trail: [], crashed: false, sinceTrail: 0 };
      s.view = viewRadius(s, params);
      return s;
    },

    update(s, params, dt) {
      // Velocity Verlet keeps orbits closed over many laps.
      const [ax, ay] = accel(s.x, s.y, params);
      s.x += s.vx * dt + 0.5 * ax * dt * dt;
      s.y += s.vy * dt + 0.5 * ay * dt * dt;
      const [bx, by] = accel(s.x, s.y, params);
      s.vx += 0.5 * (ax + bx) * dt;
      s.vy += 0.5 * (ay + by) * dt;

      s.sinceTrail += dt;
      if (s.sinceTrail > 1 / 60) {
        s.sinceTrail = 0;
        s.trail.push([s.x, s.y]);
        if (s.trail.length > 1500) s.trail.shift();
      }
      const r = Math.hypot(s.x, s.y);
      if (r <= 1) {
        s.crashed = true;
        s.done = true;
      }
      if (r > s.view * 4) s.done = true;
    },

    draw(p, s, params, theme) {
      const cx = p.width / 2;
      const cy = p.height / 2;
      const scale = (Math.min(p.width, p.height) * 0.46) / s.view;
      const X = (x) => cx + x * scale;
      const Y = (y) => cy - y * scale;
      p.background(theme.bg);

      // distance rings
      p.noFill();
      p.strokeWeight(1);
      p.textSize(10);
      const step = s.view > 12 ? 5 : s.view > 5 ? 2 : 1;
      for (let r = step; r <= s.view * 1.5; r += step) {
        p.stroke(theme.grid);
        p.noFill();
        p.circle(cx, cy, 2 * r * scale);
        p.noStroke();
        p.fill(theme.faint);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text(`${r} R`, X(r * Math.SQRT1_2) + 3, Y(r * Math.SQRT1_2) - 1);
      }

      // trail
      if (params.trail && s.trail.length > 1) {
        p.noFill();
        p.strokeWeight(1.6);
        const n = s.trail.length;
        for (let i = 1; i < n; i++) {
          p.stroke(util.alpha(theme.accent, 0.15 + 0.85 * (i / n)));
          p.line(X(s.trail[i - 1][0]), Y(s.trail[i - 1][1]), X(s.trail[i][0]), Y(s.trail[i][1]));
        }
      }

      // planet (radius 1 R), size grows with mass
      p.noStroke();
      p.fill(theme.border);
      p.circle(cx, cy, 2 * scale * (1 + 0.15 * Math.log2(+params.mass)));
      p.fill(util.alpha(theme.ink, 0.1));
      p.circle(cx, cy, 2 * scale * 0.7);

      // satellite
      const sx = X(s.x);
      const sy = Y(s.y);
      if (params.vectors && !s.crashed) {
        util.arrow(p, sx, sy, s.vx * scale * 0.35, -s.vy * scale * 0.35, theme.accent);
        const [ax, ay] = accel(s.x, s.y, params);
        util.arrow(p, sx, sy, ax * scale * 0.4, -ay * scale * 0.4, theme.accent2);
        p.noStroke();
        p.textSize(12);
        p.textAlign(p.LEFT, p.CENTER);
        [['velocity', theme.accent], ['gravity', theme.accent2]].forEach(([label, c], i) => {
          p.fill(c);
          p.rect(16, 18 + i * 18, 12, 3);
          p.fill(theme.muted);
          p.text(label, 34, 19 + i * 18);
        });
      }
      p.noStroke();
      p.fill(s.crashed ? theme.accent2 : theme.ink);
      p.circle(sx, sy, 10);
    },

    measure(s, params) {
      const el = elements(s, params);
      return {
        r: `${el.r.toFixed(2)} R`,
        v: `${el.v.toFixed(2)} R/s`,
        e: el.e.toFixed(3),
        T: Number.isFinite(el.T) ? `${el.T.toFixed(2)} s` : '–',
        status: s.crashed ? 'crashed' : el.E >= 0 ? 'escaping' : el.e < 0.01 ? 'circular orbit' : 'elliptical orbit',
      };
    },
  });

  // Choose a zoom that fits the whole orbit (or a sensible region if it escapes).
  function viewRadius(s, params) {
    const el = elements(s, params);
    const apo = el.E < 0 ? el.a * (1 + el.e) : Infinity;
    return Math.max(params.r0 * 1.15, Math.min(Number.isFinite(apo) ? apo * 1.1 : params.r0 * 3, 40), 3);
  }
})();
