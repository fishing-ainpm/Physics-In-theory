// Vertical rocket launch with the rocket equation worked out live.
// Real units (m, kg, s); gravity weakens with altitude and the atmosphere thins exponentially.
(function () {
  const { util } = PhysicsHub;
  const G0 = 9.80665;
  const CDA = 6; // drag coefficient × frontal area (m²)

  const PLANETS = {
    earth: { name: 'Earth', GM: 3.986e14, R: 6.371e6, rho0: 1.225, H: 8500, sky: '#dbe6ee', ground: '#b9b8b4' },
    mars: { name: 'Mars', GM: 4.283e13, R: 3.3895e6, rho0: 0.02, H: 11100, sky: '#ecd9c6', ground: '#c9a68b' },
    moon: { name: 'the Moon', GM: 4.905e12, R: 1.7374e6, rho0: 0, H: 1, sky: '#16181c', ground: '#a9a9a6' },
  };

  const planetOf = (params) => PLANETS[params.planet];
  const gAt = (pl, h) => pl.GM / ((pl.R + h) * (pl.R + h));
  const rhoAt = (pl, h) => (pl.rho0 ? pl.rho0 * Math.exp(-Math.max(h, 0) / pl.H) : 0);

  /** Numbers that only depend on the design (used by the calculations panel). */
  function design(params) {
    const pl = planetOf(params);
    const dry = params.dry * 1000;
    const fuel = params.fuel * 1000;
    const m0 = dry + fuel;
    const ve = params.isp * G0;
    const F = params.thrust * 1000;
    const mdot = F / ve;
    const tb = fuel / mdot;
    const g = gAt(pl, 0);
    return {
      pl, dry, fuel, m0, ve, F, mdot, tb, g,
      dv: ve * Math.log(m0 / dry),
      twr: F / (m0 * g),
      vOrb: Math.sqrt(pl.GM / pl.R),
      vEsc: Math.sqrt((2 * pl.GM) / pl.R),
    };
  }

  // Fixed star field (positions in 0..1).
  const stars = Array.from({ length: 140 }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const q = Math.sin(i * 78.233) * 12345.6789;
    return { x: r - Math.floor(r), y: q - Math.floor(q), b: 0.4 + ((i * 7) % 10) / 16 };
  });

  const fmtDist = (m) => (Math.abs(m) >= 10000 ? `${n(m / 1000, Math.abs(m) >= 1e5 ? 0 : 1)} km` : `${m.toFixed(0)} m`);
  const n = (x, d = 0) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  PhysicsHub.define({
    aspect: 16 / 10,
    dt: 1 / 240,
    controls: [
      { id: 'planet', label: 'Launch from', type: 'select', reset: true, value: 'earth',
        options: [['earth', 'Earth'], ['mars', 'Mars'], ['moon', 'Moon']] },
      { id: 'dry', label: 'Dry mass', hint: 'Empty rocket plus payload.', type: 'range', min: 1, max: 100, step: 1, value: 20, unit: 't', reset: true },
      { id: 'fuel', label: 'Fuel mass', type: 'range', min: 5, max: 1500, step: 5, value: 180, unit: 't', reset: true },
      { id: 'isp', label: 'Engine Isp', type: 'range', min: 150, max: 460, step: 5, value: 320, unit: 's', reset: true,
        hint: 'Specific impulse, a measure of engine efficiency. Exhaust speed = Isp × 9.81 m/s².' },
      { id: 'thrust', label: 'Thrust', type: 'range', min: 100, max: 35000, step: 100, value: 3500, unit: 'kN', reset: true },
      { id: 'drag', label: 'Air resistance', type: 'checkbox', value: true },
      { id: 'warp', label: 'Time warp', type: 'select', value: '10',
        options: [['1', '1× (real time)'], ['10', '10×'], ['50', '50×'], ['200', '200×'], ['1000', '1000×']] },
    ],
    readouts: [
      { id: 'alt', label: 'Altitude' },
      { id: 'v', label: 'Speed' },
      { id: 'fuel', label: 'Fuel left' },
      { id: 'status', label: 'Status' },
    ],
    clock: (s) => s.T,
    plot: [
      {
        title: 'Altitude vs time',
        yLabel: 'km',
        includeZero: true,
        series: [{ label: 'altitude', color: 'accent' }],
        sample: (s) => [s.h / 1000],
        minDuration: (params) => design(params).tb * 1.2,
      },
      {
        title: 'Speed vs time',
        yLabel: 'm/s',
        includeZero: true,
        series: [
          { label: 'speed', color: 'accent' },
          { label: 'escape speed here', color: 'accent2', dashed: true },
        ],
        sample: (s, params) => {
          const pl = planetOf(params);
          return [s.v, Math.sqrt((2 * pl.GM) / (pl.R + s.h))];
        },
        minDuration: (params) => design(params).tb * 1.2,
      },
      {
        title: 'Acceleration felt (g) vs time',
        yLabel: 'g',
        includeZero: true,
        series: [{ label: 'g-force', color: 'ink' }],
        sample: (s) => [s.felt / G0],
        minDuration: (params) => design(params).tb * 1.2,
      },
    ],

    init(params) {
      const d = design(params);
      return { T: 0, h: 0, v: 0, m: d.m0, fuel: d.fuel, felt: 0, phase: 'pad', maxH: 0, burnout: null, lifted: false };
    },

    update(s, params, dt) {
      const pl = planetOf(params);
      const d = design(params);
      let left = dt * +params.warp;

      while (left > 1e-9 && !s.done) {
        // Small steps while burning or in the air, bigger ones when coasting in vacuum.
        const coasting = s.fuel <= 0 && rhoAt(pl, s.h) < 1e-9;
        let step = Math.min(left, coasting ? 0.5 : 0.02);
        const burning = s.fuel > 0;
        if (burning) step = Math.min(step, s.fuel / d.mdot);

        const F = burning ? d.F : 0;
        const D = params.drag ? 0.5 * rhoAt(pl, s.h) * CDA * s.v * Math.abs(s.v) : 0;
        let a = (F - D) / s.m - gAt(pl, s.h);

        if (!s.lifted && s.h <= 0 && a <= 0) {
          a = 0; // sitting on the pad: the ground pushes back
        } else {
          s.lifted = true;
        }
        s.felt = a + gAt(pl, s.h); // what an accelerometer on board reads

        s.v += a * step;
        s.h += s.v * step;
        if (burning) {
          s.fuel = Math.max(0, s.fuel - d.mdot * step);
          s.m = d.dry + s.fuel;
          if (s.fuel === 0) s.burnout = { T: s.T + step, h: s.h, v: s.v };
        }
        s.T += step;
        left -= step;
        s.maxH = Math.max(s.maxH, s.h);

        if (s.lifted && s.h < 0) {
          s.h = 0;
          s.phase = Math.abs(s.v) < 15 ? 'landed' : 'crashed';
          s.v = 0;
          s.felt = 0;
          s.done = true;
        } else if (s.lifted) {
          const E = (s.v * s.v) / 2 - pl.GM / (pl.R + s.h);
          s.phase = burning ? 'burn' : E >= 0 && s.v > 0 ? 'escape' : s.v >= 0 ? 'coast up' : 'falling';
          if (s.h > 30 * pl.R) s.done = true;
        } else if (s.fuel <= 0) {
          s.phase = 'stuck';
          s.done = true;
        }
      }
    },

    draw(p, s, params, theme) {
      const pl = planetOf(params);
      const W = p.width;
      const Hc = p.height;
      const groundY = Hc - 26;
      const viewH = Math.max(600, s.h * 1.3); // metres shown above the ground
      const scale = (groundY - 30) / viewH; // px per metre

      // sky darkens as the air thins; the Moon has none
      const air = pl.rho0 ? Math.pow(rhoAt(pl, s.h) / pl.rho0, 0.35) : 0;
      const sky = p.lerpColor(p.color('#121418'), p.color(pl.sky), air);
      p.background(sky);
      const dark = air < 0.5;

      // stars
      if (air < 0.9) {
        p.noStroke();
        const drift = (s.h * 0.00002) % 1;
        for (const st of stars) {
          p.fill(255, 255, 255, 255 * st.b * (1 - air));
          p.circle(st.x * W, ((st.y + drift) % 1) * Hc, st.b * 2.2);
        }
      }

      // planet surface: flat when close, curved when far
      const Rpx = pl.R * scale;
      p.noStroke();
      p.fill(pl.ground);
      if (Rpx > 20000) {
        p.rect(0, groundY, W, Hc - groundY);
      } else {
        p.circle(W / 2, groundY + Rpx, Rpx * 2);
        if (pl.rho0) {
          p.noFill();
          p.stroke(util.alpha(pl.sky, 0.6));
          p.strokeWeight(Math.max(2, pl.H * 3 * scale));
          p.circle(W / 2, groundY + Rpx, Rpx * 2 + pl.H * 3 * scale);
        }
      }
      // launch pad
      p.noStroke();
      p.fill(theme.ink);
      if (Rpx > 20000) p.rect(W / 2 - 22, groundY - 2, 44, 4);

      // altitude ticks
      const step = niceStep(viewH / 5);
      p.textSize(11);
      p.textAlign(p.LEFT, p.CENTER);
      for (let a = step; a < viewH; a += step) {
        const y = groundY - a * scale;
        if (y < 48) continue; // keep clear of the status text
        p.stroke(dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
        p.strokeWeight(1);
        p.line(48, y, W, y);
        p.noStroke();
        p.fill(dark ? 'rgba(255,255,255,0.6)' : theme.muted);
        p.text(fmtDist(a), 6, y);
      }
      if (pl.rho0) {
        const karman = pl === PLANETS.earth ? 100000 : 80000;
        if (karman < viewH) {
          util.dashed(p, 48, groundY - karman * scale, W, groundY - karman * scale, dark ? 'rgba(255,255,255,0.35)' : theme.faint, [3, 6]);
          p.noStroke();
          p.fill(dark ? 'rgba(255,255,255,0.6)' : theme.muted);
          p.textAlign(p.RIGHT, p.BOTTOM);
          p.text('edge of space', W - 8, groundY - karman * scale - 3);
        }
      }

      // rocket (not to scale)
      const rx = W / 2;
      const ry = groundY - s.h * scale;
      drawRocket(p, rx, ry, s.fuel > 0 && s.T > 0, theme);

      // status line
      p.noStroke();
      p.textSize(13);
      p.textAlign(p.LEFT, p.TOP);
      p.fill(dark ? '#f2f2f1' : theme.ink);
      p.text(statusText(s, params), 12, 10);
      p.textSize(11);
      p.fill(dark ? 'rgba(255,255,255,0.65)' : theme.muted);
      p.text(`time warp ${params.warp}×`, 12, 30);
    },

    measure(s, params) {
      const d = design(params);
      return {
        alt: fmtDist(s.h),
        v: `${n(s.v)} m/s`,
        fuel: `${n((100 * s.fuel) / d.fuel)}%`,
        status: s.phase,
      };
    },

    calculations(params, s) {
      const d = design(params);
      const pl = d.pl;
      const rows = [
        { heading: 'Before launch: the rocket equation' },
        { label: 'Launch mass', tex: `m_0 = m_{dry} + m_{fuel} = ${n(params.dry)} + ${n(params.fuel)}`, value: `${n(d.m0 / 1000)} t` },
        { label: 'Exhaust speed', tex: `v_e = I_{sp}\\,g_0 = ${params.isp} \\times 9.81`, value: `${n(d.ve)} m/s` },
        { label: 'Ideal Δv (Tsiolkovsky)', tex: `\\Delta v = v_e \\ln\\frac{m_0}{m_{dry}} = ${n(d.ve)} \\ln\\frac{${n(d.m0 / 1000)}}{${n(params.dry)}}`, value: `${n(d.dv)} m/s` },
        { label: 'Fuel burned per second', tex: `\\dot m = \\frac{F}{v_e} = \\frac{${n(d.F)}}{${n(d.ve)}}`, value: `${n(d.mdot)} kg/s` },
        { label: 'Burn time', tex: `t_b = \\frac{m_{fuel}}{\\dot m}`, value: `${n(d.tb, 1)} s` },
        { label: 'Thrust-to-weight', tex: `\\frac{F}{m_0 g} = \\frac{${n(d.F)}}{${n(d.m0)} \\times ${n(d.g, 2)}}`, value: n(d.twr, 2) },
        { label: 'Gravity loss (vertical)', tex: `\\approx g\\,t_b`, value: `≈ ${n(d.g * d.tb)} m/s` },
        { label: 'Orbital speed at the surface', tex: `v_{orb} = \\sqrt{GM/R}`, value: `${n(d.vOrb)} m/s` },
        { label: 'Escape speed', tex: `v_{esc} = \\sqrt{2GM/R}`, value: `${n(d.vEsc)} m/s` },
      ];

      const usable = d.dv - d.g * d.tb;
      if (d.F < d.dry * d.g) {
        rows.push({ note: `The thrust can't even lift the empty rocket, so it will never leave the pad. Add thrust or reduce mass.`, tone: 'bad' });
      } else if (d.twr < 1) {
        rows.push({ note: `Thrust-to-weight is below 1: the rocket sits on the pad burning fuel until it is light enough to rise. That fuel is wasted.`, tone: 'bad' });
      } else if (usable >= d.vEsc) {
        rows.push({ note: `Δv minus gravity loss is about ${n(usable)} m/s, more than the escape speed. It should leave ${pl.name} for good (drag aside).`, tone: 'good' });
      } else if (usable >= d.vOrb) {
        rows.push({ note: `About ${n(usable)} m/s left after gravity loss: enough for orbital speed, not escape. Going straight up, it will fall back.` });
      } else {
        rows.push({ note: `About ${n(usable)} m/s left after gravity loss: well short of orbital speed (${n(d.vOrb)} m/s). Expect a suborbital hop.` });
      }

      rows.push({ heading: 'In flight (live)' });
      const g = gAt(pl, s.h);
      const rho = rhoAt(pl, s.h);
      const drag = params.drag ? 0.5 * rho * CDA * s.v * s.v : 0;
      const E = (s.v * s.v) / 2 - pl.GM / (pl.R + s.h);
      rows.push(
        { label: 'Mission time', tex: '', value: `${n(s.T, 1)} s` },
        { label: 'Gravity here', tex: `g(h) = \\frac{GM}{(R+h)^2}`, value: `${n(g, 3)} m/s²` },
        { label: 'Air density', tex: `\\rho = \\rho_0\\, e^{-h/H}`, value: rho < 1e-9 ? '≈ 0 (vacuum)' : `${rho.toPrecision(3)} kg/m³` },
        { label: 'Drag force', tex: `D = \\tfrac12 \\rho\\, C_d A\\, v^2`, value: `${n(drag / 1000, 1)} kN` },
        { label: 'Current mass', tex: `m = m_{dry} + m_{fuel}`, value: `${n(s.m / 1000, 1)} t` },
        { label: 'Net acceleration', tex: `a = \\frac{F - D}{m} - g(h)`, value: `${n(s.felt - g, 1)} m/s²` },
        { label: 'Orbital energy (per kg)', tex: `E = \\tfrac12 v^2 - \\frac{GM}{R+h}`, value: `${n(E / 1e6, 2)} MJ/kg` },
      );
      if (s.burnout) {
        rows.push({ heading: 'After engine cut-off' });
        rows.push({ label: 'Burnout speed / altitude', tex: '', value: `${n(s.burnout.v)} m/s · ${fmtDist(s.burnout.h)}` });
        if (E < 0) {
          const rMax = pl.GM / (pl.GM / (pl.R + s.h) - (s.v * s.v) / 2);
          rows.push({ label: 'Predicted highest point', tex: `r_{max} = \\frac{GM}{GM/r - v^2/2}`, value: fmtDist(rMax - pl.R) });
        } else {
          rows.push({ note: 'Orbital energy is positive: the rocket is on an escape trajectory.', tone: 'good' });
        }
      }
      if (s.phase === 'crashed') rows.push({ note: `Hit the ground. Highest point reached: ${fmtDist(s.maxH)}.`, tone: 'bad' });
      return rows;
    },
  });

  // ---------------------------------------------------------- "Your calculation" panel
  // Values a student can pull into their own formula (all SI units).
  function links() {
    const { params } = PhysicsHub.sim;
    const d = design(params);
    const s = PhysicsHub.sim.state || { h: 0, v: 0, m: d.m0 }; // before the first frame
    return [
      { id: 'm0', label: 'Launch mass', value: d.m0, unit: 'kg', compare: true },
      { id: 'dry', label: 'Dry mass', value: d.dry, unit: 'kg', compare: true },
      { id: 'fuel', label: 'Fuel mass', value: d.fuel, unit: 'kg', compare: true },
      { id: 'isp', label: 'Isp', value: params.isp, unit: 's' },
      { id: 'g0', label: 'Standard gravity g₀', value: G0, unit: 'm/s²' },
      { id: 've', label: 'Exhaust speed', value: d.ve, unit: 'm/s', compare: true },
      { id: 'F', label: 'Thrust', value: d.F, unit: 'N', compare: true },
      { id: 'mdot', label: 'Fuel burned per second', value: d.mdot, unit: 'kg/s', compare: true },
      { id: 'tb', label: 'Burn time', value: d.tb, unit: 's', compare: true },
      { id: 'dv', label: 'Ideal Δv', value: d.dv, unit: 'm/s', compare: true },
      { id: 'twr', label: 'Thrust-to-weight', value: d.twr, unit: '', compare: true },
      { id: 'g', label: 'Surface gravity', value: d.g, unit: 'm/s²', compare: true },
      { id: 'GM', label: 'GM of the planet', value: d.pl.GM, unit: 'm³/s²' },
      { id: 'R', label: 'Planet radius', value: d.pl.R, unit: 'm' },
      { id: 'vorb', label: 'Orbital speed', value: d.vOrb, unit: 'm/s', compare: true },
      { id: 'vesc', label: 'Escape speed', value: d.vEsc, unit: 'm/s', compare: true },
      { id: 'h', label: 'Altitude now', value: s.h, unit: 'm' },
      { id: 'v', label: 'Speed now', value: s.v, unit: 'm/s' },
      { id: 'm', label: 'Mass now', value: s.m, unit: 'kg' },
    ];
  }

  PhysicsCalculator.mount({
    container: '#sim-extra',
    links,
    context: () => Object.fromEntries(links().map((l) => [l.label, `${Formula.fmt(l.value)}${l.unit ? ' ' + l.unit : ''}`])
      .concat([['Launched from', planetOf(PhysicsHub.sim.params).name], ['Flight status', PhysicsHub.sim.state.phase]])),
    examples: [
      { label: 'Rocket equation', formula: 'dv = ve * ln(m0 / mf)' },
      { label: 'Exhaust speed', formula: 've = Isp * g0' },
      { label: 'Burn time', formula: 'tb = mfuel / (F / ve)' },
      { label: 'Thrust-to-weight', formula: 'TWR = F / (m0 * g)' },
      { label: 'Escape speed', formula: 'vesc = sqrt(2 * GM / R)' },
    ],
  });

  function statusText(s, params) {
    switch (s.phase) {
      case 'pad': return 'On the pad';
      case 'stuck': return 'Out of fuel: thrust was too weak to lift off';
      case 'burn': return 'Engines burning';
      case 'coast up': return 'Engines off, coasting upward';
      case 'falling': return 'Falling back';
      case 'escape': return `Escaping the gravity of ${planetOf(params).name}!`;
      case 'landed': return 'Landed';
      case 'crashed': return `Crashed. Highest point: ${fmtDist(s.maxH)}`;
      default: return s.phase;
    }
  }

  function drawRocket(p, x, y, burning, theme) {
    const w = 14;
    const h = 46;
    p.push();
    p.translate(x, Math.min(y, p.height + 100));
    if (burning) {
      const flick = 0.8 + 0.4 * Math.random();
      p.noStroke();
      p.fill('#e9a23b');
      p.triangle(-w * 0.4, 0, w * 0.4, 0, 0, 26 * flick);
      p.fill('#f6e08a');
      p.triangle(-w * 0.22, 0, w * 0.22, 0, 0, 14 * flick);
    }
    p.noStroke();
    p.fill('#e8e8e6');
    p.rect(-w / 2, -h, w, h - 4, 2);
    p.fill(theme.accent2);
    p.triangle(-w / 2, -h, w / 2, -h, 0, -h - 16);
    p.fill(theme.ink);
    p.triangle(-w / 2, -14, -w / 2 - 8, 0, -w / 2, -2);
    p.triangle(w / 2, -14, w / 2 + 8, 0, w / 2, -2);
    p.fill(theme.accent);
    p.circle(0, -h + 12, 6);
    p.pop();
  }

  function niceStep(raw) {
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const k = raw / mag;
    return (k < 1.5 ? 1 : k < 3.5 ? 2 : k < 7.5 ? 5 : 10) * mag;
  }
})();
