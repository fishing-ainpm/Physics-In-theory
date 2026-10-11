// Interference of circular waves from two point sources.
// Distances in cm. The field is computed on a coarse grid and scaled up.
(function () {
  const { util } = PhysicsHub;
  const WIDTH_CM = 40;
  const CELL = 3; // px per grid cell
  const SRC_X = 6;

  // Amplitude falls off roughly like 1/√r for a circular wave.
  const amp = (r) => 1 / Math.sqrt(1 + r / 3);

  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  let image = null;
  let geom = null; // last layout, for the pointer handlers

  function sources(params, heightCm) {
    const mid = heightCm / 2;
    return params.two
      ? [[SRC_X, mid - params.sep / 2], [SRC_X, mid + params.sep / 2]]
      : [[SRC_X, mid]];
  }

  /** Displacement of each source's wave at (x, y). */
  function waveAt(x, y, t, params, srcs) {
    const k = (2 * Math.PI) / params.lambda;
    const w = 2 * Math.PI * params.freq;
    return srcs.map(([sx, sy], i) => {
      const r = Math.hypot(x - sx, y - sy);
      const phase = i === 1 ? util.toRad(params.phase) : 0;
      return amp(r) * Math.sin(k * r - w * t + phase);
    });
  }

  PhysicsHub.define({
    aspect: 16 / 10,
    dt: 1 / 120,
    controls: [
      { id: 'lambda', label: 'Wavelength λ', type: 'range', min: 1.5, max: 10, step: 0.1, value: 4, unit: 'cm' },
      { id: 'sep', label: 'Source separation d', type: 'range', min: 0, max: 20, step: 0.5, value: 8, unit: 'cm' },
      { id: 'phase', label: 'Phase of source 2', type: 'range', min: 0, max: 360, step: 5, value: 0, unit: '°' },
      { id: 'freq', label: 'Frequency', type: 'range', min: 0.2, max: 2, step: 0.05, value: 0.8, unit: 'Hz' },
      { id: 'view', label: 'Show', type: 'select', value: 'wave', options: [
        ['wave', 'Instantaneous wave'],
        ['intensity', 'Average intensity (fringes)'],
      ] },
      { id: 'two', label: 'Second source on', type: 'checkbox', value: true },
    ],
    readouts: [
      { id: 'speed', label: 'Wave speed v = fλ' },
      { id: 'pd', label: 'Path difference at probe' },
      { id: 'result', label: 'At the probe' },
    ],
    plot: {
      title: 'Displacement at the probe',
      window: 5,
      series: [
        { label: 'source 1', color: 'accent', dashed: true },
        { label: 'source 2', color: 'accent2', dashed: true },
        { label: 'sum', color: 'ink' },
      ],
      sample(s, params) {
        if (!geom) return [NaN, NaN, NaN];
        const w = waveAt(s.probe[0], s.probe[1], s.t, params, sources(params, geom.hCm));
        return [w[0], w[1] ?? NaN, w[0] + (w[1] ?? 0)];
      },
      yRange: () => [-2.2, 2.2],
    },
    sampleEvery: 1 / 60,

    init(params, prev) {
      return { probe: prev ? prev.probe : [32, null] };
    },

    update() {}, // the field is an analytic function of time; nothing to integrate

    draw(p, s, params, theme) {
      const pxPerCm = p.width / WIDTH_CM;
      const hCm = p.height / pxPerCm;
      geom = { pxPerCm, hCm };
      if (s.probe[1] === null) s.probe[1] = hCm / 2;
      const srcs = sources(params, hCm);

      // build the field image
      const gw = Math.ceil(p.width / CELL);
      const gh = Math.ceil(p.height / CELL);
      if (!image || image.width !== gw || image.height !== gh) {
        off.width = gw;
        off.height = gh;
        image = offCtx.createImageData(gw, gh);
      }
      const bg = util.rgb(theme.bg);
      const pos = util.rgb(theme.accent);
      const neg = util.rgb(theme.ink);
      const data = image.data;
      const k = (2 * Math.PI) / params.lambda;
      const wt = 2 * Math.PI * params.freq * s.t;
      const ph = util.toRad(params.phase);
      const cmPerCell = CELL / pxPerCm;
      const two = srcs.length === 2;
      const [x1, y1] = srcs[0];
      const [x2, y2] = srcs[two ? 1 : 0];

      let i = 0;
      for (let gy = 0; gy < gh; gy++) {
        const y = (gy + 0.5) * cmPerCell;
        for (let gx = 0; gx < gw; gx++) {
          const x = (gx + 0.5) * cmPerCell;
          const r1 = Math.hypot(x - x1, y - y1);
          const a1 = amp(r1);
          let c;
          if (params.view === 'intensity') {
            let I = (a1 * a1) / 2;
            if (two) {
              const r2 = Math.hypot(x - x2, y - y2);
              const a2 = amp(r2);
              I = (a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(k * (r2 - r1) + ph)) / 2;
            }
            c = Math.min(1, I * 1.6);
          } else {
            let v = a1 * Math.sin(k * r1 - wt);
            if (two) {
              const r2 = Math.hypot(x - x2, y - y2);
              v += amp(r2) * Math.sin(k * r2 - wt + ph);
            }
            c = Math.max(-1, Math.min(1, v * 0.9));
          }
          const target = c >= 0 ? pos : neg;
          const f = Math.abs(c) * (c >= 0 ? 1 : 0.55);
          data[i++] = bg[0] + (target[0] - bg[0]) * f;
          data[i++] = bg[1] + (target[1] - bg[1]) * f;
          data[i++] = bg[2] + (target[2] - bg[2]) * f;
          data[i++] = 255;
        }
      }
      offCtx.putImageData(image, 0, 0);
      p.drawingContext.imageSmoothingEnabled = true;
      p.drawingContext.drawImage(off, 0, 0, gw * CELL, gh * CELL);

      // sources
      for (const [sx, sy] of srcs) {
        p.stroke(theme.surface);
        p.strokeWeight(2);
        p.fill(theme.ink);
        p.circle(sx * pxPerCm, sy * pxPerCm, 12);
      }

      // probe with lines back to the sources
      const [qx, qy] = s.probe;
      for (const [sx, sy] of srcs) util.dashed(p, sx * pxPerCm, sy * pxPerCm, qx * pxPerCm, qy * pxPerCm, util.alpha(theme.ink, 0.35), [3, 5]);
      p.noFill();
      p.stroke(theme.ink);
      p.strokeWeight(2);
      p.circle(qx * pxPerCm, qy * pxPerCm, 16);
      p.line(qx * pxPerCm - 12, qy * pxPerCm, qx * pxPerCm - 5, qy * pxPerCm);
      p.line(qx * pxPerCm + 5, qy * pxPerCm, qx * pxPerCm + 12, qy * pxPerCm);

      // scale bar
      const bar = 5 * pxPerCm;
      const by = p.height - 18;
      p.stroke(theme.ink);
      p.strokeWeight(2);
      p.line(16, by, 16 + bar, by);
      p.noStroke();
      p.fill(theme.ink);
      p.textSize(11);
      p.textAlign(p.LEFT, p.BOTTOM);
      p.text('5 cm', 16, by - 4);
      p.textAlign(p.RIGHT, p.BOTTOM);
      p.fill(theme.muted);
      p.text('drag the probe ⊕ to explore', p.width - 12, p.height - 10);
    },

    pointer: {
      hover: () => true,
      down(s, params, x, y) {
        if (!geom) return false;
        s.probe = [x / geom.pxPerCm, y / geom.pxPerCm];
        return true;
      },
      drag(s, params, x, y) {
        s.probe = [util.clamp(x / geom.pxPerCm, 0, WIDTH_CM), util.clamp(y / geom.pxPerCm, 0, geom.hCm)];
      },
    },

    measure(s, params) {
      const out = { speed: `${(params.lambda * params.freq).toFixed(2)} cm/s` };
      if (!geom || !params.two) return { ...out, pd: '–', result: 'single source' };
      const [[x1, y1], [x2, y2]] = sources(params, geom.hCm);
      const [qx, qy] = s.probe;
      const d = Math.hypot(qx - x2, qy - y2) - Math.hypot(qx - x1, qy - y1);
      // total phase difference, in cycles, including the source offset
      const cycles = d / params.lambda + params.phase / 360;
      const frac = Math.abs(cycles - Math.round(cycles)); // 0 = in step, 0.5 = opposite
      return {
        ...out,
        pd: `${(Math.abs(d) / params.lambda).toFixed(2)} λ`,
        result: frac < 0.1 ? 'constructive' : frac > 0.4 ? 'destructive' : 'partial',
      };
    },
  });
})();
