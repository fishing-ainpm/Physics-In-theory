// Projectile motion with optional quadratic air resistance.
(function () {
  const { util } = PhysicsHub;

  const GRAVITY = [
    ['9.81', 'Earth (9.81 m/s²)'],
    ['1.62', 'Moon (1.62 m/s²)'],
    ['3.71', 'Mars (3.71 m/s²)'],
    ['24.79', 'Jupiter (24.79 m/s²)'],
  ];
  // Drag acceleration = k·|v|·v, with k = ρ·Cd·A / (2m) in 1/m.
  const DRAG = [
    ['0', 'None (vacuum)'],
    ['0.005', 'Light (soccer ball)'],
    ['0.02', 'Strong (shuttlecock-ish)'],
  ];
  const MAX_GHOSTS = 6;

  // Ideal (no drag) flight, used to frame the view and size the plot.
  function ideal(params) {
    const g = +params.gravity;
    const th = util.toRad(params.angle);
    const vx = params.speed * Math.cos(th);
    const vy = params.speed * Math.sin(th);
    const h0 = params.height;
    const T = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
    return { T, range: vx * T, top: h0 + (vy * vy) / (2 * g) };
  }

  function accel(vx, vy, params) {
    const k = +params.drag;
    const v = Math.hypot(vx, vy);
    return [-k * v * vx, -+params.gravity - k * v * vy];
  }

  PhysicsHub.define({
    aspect: 16 / 9,
    controls: [
      { id: 'speed', label: 'Launch speed', type: 'range', min: 1, max: 40, step: 0.5, value: 18, unit: 'm/s', reset: true },
      { id: 'angle', label: 'Launch angle', type: 'range', min: 0, max: 90, step: 1, value: 50, unit: '°', reset: true },
      { id: 'height', label: 'Launch height', type: 'range', min: 0, max: 20, step: 0.5, value: 0, unit: 'm', reset: true },
      { id: 'gravity', label: 'Gravity', type: 'select', options: GRAVITY, value: '9.81', reset: true },
      { id: 'drag', label: 'Air resistance', type: 'select', options: DRAG, value: '0', reset: true },
      { id: 'vectors', label: 'Show velocity components', type: 'checkbox', value: true },
      { id: 'keep', label: 'Keep previous paths', type: 'checkbox', value: true },
      { id: 'clear', label: 'Clear paths', type: 'button', action: (state) => (state.ghosts = []) },
    ],
    readouts: [
      { id: 'tof', label: 'Time of flight' },
      { id: 'range', label: 'Range' },
      { id: 'top', label: 'Max height' },
      { id: 'v', label: 'Speed now' },
    ],
    plot: [
      {
        title: 'Height vs time',
        yLabel: 'm',
        series: [{ label: 'height y', color: 'accent' }],
        sample: (s) => [s.y],
        minDuration: (params) => ideal(params).T,
        includeZero: true,
      },
      {
        title: 'Velocity vs time',
        yLabel: 'm/s',
        series: [
          { label: 'vₓ', color: 'accent' },
          { label: 'vᵧ', color: 'accent2' },
        ],
        sample: (s) => [s.vx, s.vy],
        minDuration: (params) => ideal(params).T,
        includeZero: true,
      },
    ],

    onChange(id, s, params) {
      if (id === 'keep' && !params.keep) s.ghosts = [];
    },

    init(params, prev) {
      let ghosts = prev ? prev.ghosts : [];
      // Only finished flights are kept, so dragging a slider doesn't pile up stubs.
      if (prev && prev.done && params.keep) ghosts = [...ghosts, prev.path].slice(-MAX_GHOSTS);
      if (!params.keep) ghosts = [];

      const th = util.toRad(params.angle);
      const ref = ideal(params);
      // Frame the ideal flight plus any kept paths.
      let xMax = ref.range;
      let yMax = ref.top;
      for (const g of ghosts) for (const [x, y] of g) {
        xMax = Math.max(xMax, x);
        yMax = Math.max(yMax, y);
      }
      return {
        x: 0,
        y: params.height,
        vx: params.speed * Math.cos(th),
        vy: params.speed * Math.sin(th),
        path: [[0, params.height]],
        top: params.height,
        done: false,
        ghosts,
        view: { xMax: Math.max(xMax, 5), yMax: Math.max(yMax, 3) },
      };
    },

    update(s, params, dt) {
      // Velocity Verlet: exact for constant gravity, accurate with drag.
      const [ax, ay] = accel(s.vx, s.vy, params);
      const nx = s.x + s.vx * dt + 0.5 * ax * dt * dt;
      const ny = s.y + s.vy * dt + 0.5 * ay * dt * dt;
      const [ax2, ay2] = accel(s.vx + ax * dt, s.vy + ay * dt, params);
      const nvx = s.vx + 0.5 * (ax + ax2) * dt;
      const nvy = s.vy + 0.5 * (ay + ay2) * dt;

      if (ny <= 0 && s.t > 0) {
        // Landed: interpolate to the exact ground crossing.
        const f = s.y / (s.y - ny);
        s.x += (nx - s.x) * f;
        s.y = 0;
        s.vx += (nvx - s.vx) * f;
        s.vy += (nvy - s.vy) * f;
        s.t += dt * f - dt; // runtime adds dt afterwards
        s.done = true;
      } else {
        s.x = nx;
        s.y = Math.max(ny, 0);
        s.vx = nvx;
        s.vy = nvy;
      }
      s.top = Math.max(s.top, s.y);
      const last = s.path[s.path.length - 1];
      if (s.done || Math.hypot(s.x - last[0], s.y - last[1]) > 0.05) s.path.push([s.x, s.y]);
    },

    draw(p, s, params, theme) {
      const W = p.width;
      const H = p.height;
      const margin = { l: 56, r: 28, t: 28, b: 44 };
      const scale = Math.min((W - margin.l - margin.r) / (s.view.xMax * 1.08), (H - margin.t - margin.b) / (s.view.yMax * 1.12));
      const X = (x) => margin.l + x * scale;
      const Y = (y) => H - margin.b - y * scale;

      p.background(theme.bg);

      // metre grid
      const step = niceMetres((W - margin.l) / scale / 8);
      p.textSize(11);
      p.strokeWeight(1);
      for (let x = 0; X(x) < W; x += step) {
        p.stroke(theme.grid);
        p.line(X(x), margin.t * 0.5, X(x), Y(0));
        p.noStroke();
        p.fill(theme.faint);
        p.textAlign(p.CENTER, p.TOP);
        p.text(+x.toFixed(6) + (x === 0 ? ' m' : ''), X(x), Y(0) + 8);
      }
      for (let y = step; Y(y) > margin.t * 0.5; y += step) {
        p.stroke(theme.grid);
        p.line(X(0), Y(y), W, Y(y));
        p.noStroke();
        p.fill(theme.faint);
        p.textAlign(p.RIGHT, p.CENTER);
        p.text(+y.toFixed(6), X(0) - 8, Y(y));
      }

      // ground
      p.stroke(theme.muted);
      p.strokeWeight(1.5);
      p.line(0, Y(0), W, Y(0));

      // launch platform
      if (params.height > 0) {
        p.noStroke();
        p.fill(theme.border);
        p.rect(X(0) - 14, Y(params.height), 14, Y(0) - Y(params.height));
      }

      // earlier paths
      p.noFill();
      p.strokeWeight(1.5);
      p.stroke(util.alpha(theme.muted, 0.35));
      for (const g of s.ghosts) drawPath(p, g, X, Y);

      // aim line before launch
      if (s.t === 0) {
        const th = util.toRad(params.angle);
        util.dashed(p, X(0), Y(params.height), X(0) + Math.cos(th) * 80, Y(params.height) - Math.sin(th) * 80, theme.faint);
      }

      // current path
      p.stroke(theme.accent);
      p.strokeWeight(2);
      drawPath(p, s.path, X, Y);

      // max-height marker
      if (s.top > params.height + 0.05) {
        util.dashed(p, X(0), Y(s.top), X(s.path.find((q) => q[1] >= s.top - 1e-9)?.[0] ?? s.x), Y(s.top), util.alpha(theme.accent, 0.5), [3, 4]);
      }

      // ball
      const bx = X(s.x);
      const by = Y(s.y);
      if (params.vectors && !s.done) {
        const k = 3.2; // px per m/s
        util.arrow(p, bx, by, s.vx * k, 0, theme.accent);
        util.arrow(p, bx, by, 0, -s.vy * k, theme.accent2);
        util.arrow(p, bx, by, s.vx * k, -s.vy * k, theme.ink, 1.5);
      }
      p.noStroke();
      p.fill(theme.ink);
      p.circle(bx, by, 12);

      if (s.done) {
        p.fill(theme.muted);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(12);
        p.text(`${s.x.toFixed(1)} m`, bx, by - 10);
      }
    },

    measure(s) {
      return {
        tof: s.done ? `${s.t.toFixed(2)} s` : '…',
        range: s.done ? `${s.x.toFixed(2)} m` : `${s.x.toFixed(2)} m …`,
        top: `${s.top.toFixed(2)} m`,
        v: `${Math.hypot(s.vx, s.vy).toFixed(2)} m/s`,
      };
    },
  });

  function drawPath(p, pts, X, Y) {
    p.beginShape();
    for (const [x, y] of pts) p.vertex(X(x), Y(y));
    p.endShape();
  }

  function niceMetres(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }
})();
