// Physics sandbox: place objects, draw walls and ramps, and throw things around.
// Rigid-body physics by Matter.js; drawing by p5. World units: 50 units = 1 m.
(function () {
  const { util } = PhysicsHub;
  const { Engine, Bodies, Body, Composite, Query, Vector } = Matter;

  const W = 1000; // world width in units (20 m)
  const H = 562.5; // world height in units (11.25 m)
  const PX_PER_M = 50;
  const DENSITY = 100 / (PX_PER_M * PX_PER_M); // 100 kg per m² of shape
  const MAX_BODIES = 150;
  const SLING = 0.12; // launch speed per unit of slingshot pull

  const GRAVITY = [
    ['9.81', 'Earth (9.81 m/s²)'],
    ['1.62', 'Moon (1.62 m/s²)'],
    ['3.71', 'Mars (3.71 m/s²)'],
    ['24.79', 'Jupiter (24.79 m/s²)'],
    ['0', 'Zero gravity'],
  ];
  const TOOLS = [
    ['ball', 'Place ball'],
    ['box', 'Place box'],
    ['triangle', 'Place triangle'],
    ['plank', 'Place plank'],
    ['draw', 'Draw wall / ramp'],
    ['drag', 'Grab and throw'],
    ['erase', 'Erase'],
  ];

  // Matter's gravity is in units/ms².
  const gravityScale = (g) => (g * PX_PER_M) / 1e6;
  // Matter velocities are units per 1/60 s.
  const toMs = (v) => (v * 60) / PX_PER_M;

  let view = { s: 1, ox: 0, oy: 0 }; // world -> canvas transform from the last frame
  const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });

  function material(params) {
    return {
      restitution: params.bounce,
      friction: params.friction,
      frictionAir: params.air ? 0.012 : 0,
      density: DENSITY,
    };
  }

  function makeBody(kind, x, y, params) {
    const size = params.size * PX_PER_M;
    const opts = { ...material(params), plugin: { kind } };
    switch (kind) {
      case 'ball': return Bodies.circle(x, y, size / 2, opts);
      case 'box': return Bodies.rectangle(x, y, size, size, { ...opts, chamfer: { radius: 2 } });
      case 'triangle': return Bodies.polygon(x, y, 3, size * 0.6, opts);
      case 'plank': return Bodies.rectangle(x, y, size * 4, size * 0.25, opts);
    }
    return null;
  }

  /** A static wall segment between two points. */
  function wall(a, b, params, kind = 'wall') {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 8, 8, {
      isStatic: true,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      friction: params.friction,
      restitution: params.bounce,
      chamfer: { radius: 4 },
      plugin: { kind },
    });
  }

  function demoScene(params) {
    const add = (kind, x, y, extra = {}) => {
      const b = makeBody(kind, x, y, { ...params, ...extra });
      return b;
    };
    return [
      // ramp on the left with a ball waiting at the top
      wall({ x: 40, y: 180 }, { x: 330, y: 330 }, params),
      add('ball', 80, 140),
      // stack of boxes
      add('box', 640, H - 18, { size: 0.7 }),
      add('box', 640, H - 55, { size: 0.7 }),
      add('box', 640, H - 92, { size: 0.7 }),
      // seesaw
      Bodies.polygon(850, H - 22, 3, 30, { isStatic: true, angle: -Math.PI / 2, friction: 1, plugin: { kind: 'wall' } }),
      add('plank', 850, H - 60, { size: 0.9 }),
      add('ball', 905, 120, { size: 0.5 }),
    ];
  }

  function bodiesOf(s) {
    return Composite.allBodies(s.engine.world).filter((b) => b.plugin.kind !== 'bound');
  }

  function energies(s, params) {
    let ke = 0;
    let pe = 0;
    const g = +params.gravity;
    for (const b of bodiesOf(s)) {
      if (b.isStatic) continue;
      const v = toMs(Body.getSpeed(b));
      ke += 0.5 * b.mass * v * v;
      pe += b.mass * g * ((H - b.position.y) / PX_PER_M);
    }
    return [ke, pe, ke + pe];
  }

  PhysicsHub.define({
    aspect: 16 / 9,
    dt: 1 / 120,
    controls: [
      { id: 'tool', label: 'Tool', type: 'select', options: TOOLS, value: 'ball',
        hint: 'Tap to place. Drag before letting go to launch it like a slingshot.' },
      { id: 'size', label: 'Object size', type: 'range', min: 0.2, max: 2, step: 0.05, value: 0.6, unit: 'm' },
      { id: 'gravity', label: 'Gravity', type: 'select', options: GRAVITY, value: '9.81' },
      { id: 'bounce', label: 'Bounciness', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0.4 },
      { id: 'friction', label: 'Friction', type: 'range', min: 0, max: 1, step: 0.05, value: 0.3 },
      { id: 'air', label: 'Air resistance', type: 'checkbox', value: false },
      { id: 'vectors', label: 'Show velocity arrows', type: 'checkbox', value: false },
      { id: 'clearObjects', label: 'Clear objects', type: 'button',
        action: (s) => bodiesOf(s).filter((b) => !b.isStatic).forEach((b) => Composite.remove(s.engine.world, b)) },
      { id: 'clearWalls', label: 'Clear drawings', type: 'button',
        action: (s) => bodiesOf(s).filter((b) => b.isStatic).forEach((b) => Composite.remove(s.engine.world, b)) },
    ],
    readouts: [
      { id: 'count', label: 'Objects' },
      { id: 'ke', label: 'Kinetic energy' },
      { id: 'fast', label: 'Fastest object' },
    ],
    plot: {
      title: 'Energy vs time',
      yLabel: 'J',
      window: 15,
      includeZero: true,
      series: [
        { label: 'kinetic', color: 'accent' },
        { label: 'potential', color: 'accent2' },
        { label: 'total', color: 'ink' },
      ],
      sample: (s, params) => energies(s, params),
      visible: false,
    },

    init(params) {
      const engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
      engine.gravity.y = 1;
      engine.gravity.scale = gravityScale(+params.gravity);
      const bound = { isStatic: true, friction: 0.6, restitution: 0.2, plugin: { kind: 'bound' } };
      Composite.add(engine.world, [
        Bodies.rectangle(W / 2, H + 50, W * 3, 100, bound), // floor
        Bodies.rectangle(-50, H / 2, 100, H * 4, bound), // left
        Bodies.rectangle(W + 50, H / 2, 100, H * 4, bound), // right
        Bodies.rectangle(W / 2, -H * 1.5, W * 3, 100, bound), // ceiling, far above the view
      ]);
      Composite.add(engine.world, demoScene(params));
      return { engine, stroke: null, aim: null, held: null };
    },

    update(s) {
      Engine.update(s.engine, 1000 / 120);
    },

    onChange(id, s, params) {
      if (id === 'gravity') s.engine.gravity.scale = gravityScale(+params.gravity);
      if (id === 'bounce' || id === 'friction' || id === 'air') {
        for (const b of bodiesOf(s)) {
          b.restitution = params.bounce;
          b.friction = params.friction;
          if (!b.isStatic) b.frictionAir = params.air ? 0.012 : 0;
        }
      }
    },

    draw(p, s, params, theme) {
      view.s = Math.min(p.width / W, p.height / H);
      view.ox = (p.width - W * view.s) / 2;
      view.oy = p.height - H * view.s;
      const { s: k, ox, oy } = view;
      const X = (x) => ox + x * k;
      const Y = (y) => oy + y * k;

      p.background(theme.bg);

      // metre grid
      p.strokeWeight(1);
      p.stroke(theme.grid);
      for (let m = 1; m * PX_PER_M < W; m++) p.line(X(m * PX_PER_M), Y(0), X(m * PX_PER_M), Y(H));
      for (let m = 1; m * PX_PER_M < H; m++) p.line(X(0), Y(H - m * PX_PER_M), X(W), Y(H - m * PX_PER_M));
      p.noStroke();
      p.fill(theme.faint);
      p.textSize(10);
      p.textAlign(p.LEFT, p.BOTTOM);
      p.text('1 m grid', X(4), Y(H) - 4);

      // floor
      p.stroke(theme.muted);
      p.strokeWeight(2);
      p.line(X(0), Y(H), X(W), Y(H));

      const colors = {
        ball: theme.accent, box: theme.accent2, triangle: theme.accent3, plank: theme.ink, wall: theme.muted,
      };

      for (const b of bodiesOf(s)) {
        const c = colors[b.plugin.kind] || theme.ink;
        p.noStroke();
        p.fill(b === s.held ? util.alpha(c, 0.7) : c);
        if (b.circleRadius) {
          p.circle(X(b.position.x), Y(b.position.y), 2 * b.circleRadius * k);
          // a spoke shows the rotation
          p.stroke(theme.surface);
          p.strokeWeight(Math.max(1, 2 * k));
          p.line(X(b.position.x), Y(b.position.y),
            X(b.position.x + Math.cos(b.angle) * b.circleRadius * 0.8), Y(b.position.y + Math.sin(b.angle) * b.circleRadius * 0.8));
        } else {
          p.beginShape();
          for (const v of b.vertices) p.vertex(X(v.x), Y(v.y));
          p.endShape(p.CLOSE);
        }
        if (params.vectors && !b.isStatic) {
          const v = Body.getVelocity(b);
          util.arrow(p, X(b.position.x), Y(b.position.y), v.x * k * 6, v.y * k * 6, theme.ink, 1.5);
        }
      }

      // stroke being drawn
      if (s.stroke && s.stroke.length > 1) {
        p.noFill();
        p.stroke(theme.muted);
        p.strokeWeight(8 * k);
        p.drawingContext.setLineDash([6, 6]);
        p.beginShape();
        for (const q of s.stroke) p.vertex(X(q.x), Y(q.y));
        p.endShape();
        p.drawingContext.setLineDash([]);
      }

      // slingshot aim
      if (s.aim) {
        const { from, to } = s.aim;
        const preview = makeBody(params.tool, from.x, from.y, params);
        p.noStroke();
        p.fill(util.alpha(theme.ink, 0.25));
        if (preview.circleRadius) p.circle(X(from.x), Y(from.y), 2 * preview.circleRadius * k);
        else {
          p.beginShape();
          for (const v of preview.vertices) p.vertex(X(v.x), Y(v.y));
          p.endShape(p.CLOSE);
        }
        util.dashed(p, X(from.x), Y(from.y), X(to.x), Y(to.y), theme.faint);
        util.arrow(p, X(from.x), Y(from.y), (from.x - to.x) * k, (from.y - to.y) * k, theme.ink, 2);
        const speed = toMs(Math.hypot(from.x - to.x, from.y - to.y) * SLING);
        p.noStroke();
        p.fill(theme.ink);
        p.textSize(12);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text(`${speed.toFixed(1)} m/s`, X(from.x) + 10, Y(from.y) - 10);
      }

      // tool hint
      p.noStroke();
      p.fill(theme.muted);
      p.textSize(12);
      p.textAlign(p.RIGHT, p.TOP);
      p.text(TOOLS.find(([id]) => id === params.tool)[1], p.width - 10, 8);
    },

    pointer: {
      hover: () => true,

      down(s, params, x, y) {
        const pt = toWorld(x, y);
        const tool = params.tool;
        if (['ball', 'box', 'triangle', 'plank'].includes(tool)) {
          if (pt.y > H || pt.y < 0) return false;
          s.aim = { from: pt, to: pt };
          return true;
        }
        if (tool === 'draw') {
          s.stroke = [pt];
          return true;
        }
        if (tool === 'drag') {
          const hit = Query.point(bodiesOf(s).filter((b) => !b.isStatic), pt)[0];
          if (!hit) return false;
          s.held = hit;
          s.trail = [{ ...pt, time: performance.now() }];
          return true;
        }
        if (tool === 'erase') {
          eraseAt(s, pt);
          return true;
        }
        return false;
      },

      drag(s, params, x, y) {
        const pt = toWorld(x, y);
        if (s.aim) s.aim.to = pt;
        if (s.stroke) {
          const last = s.stroke[s.stroke.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) > 14) s.stroke.push(pt);
        }
        if (s.held) {
          const clamped = { x: util.clamp(pt.x, 0, W), y: util.clamp(pt.y, -H, H) };
          Body.setPosition(s.held, clamped);
          Body.setVelocity(s.held, { x: 0, y: 0 });
          Body.setAngularVelocity(s.held, 0);
          s.trail.push({ ...clamped, time: performance.now() });
          if (s.trail.length > 6) s.trail.shift();
        }
        if (params.tool === 'erase') eraseAt(s, pt);
      },

      up(s, params, x, y) {
        const world = s.engine.world;
        if (s.aim) {
          if (bodiesOf(s).length < MAX_BODIES) {
            const { from, to } = s.aim;
            const b = makeBody(params.tool, from.x, from.y, params);
            Body.setVelocity(b, Vector.mult(Vector.sub(from, to), SLING));
            Composite.add(world, b);
          }
          s.aim = null;
        }
        if (s.stroke) {
          const pts = s.stroke;
          pts.push(toWorld(x, y));
          for (let i = 1; i < pts.length; i++) {
            if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > 3) Composite.add(world, wall(pts[i - 1], pts[i], params));
          }
          s.stroke = null;
        }
        if (s.held) {
          // Throw with the speed of the last bit of the drag.
          const a = s.trail[0];
          const b = s.trail[s.trail.length - 1];
          const dt = Math.max(16, b.time - a.time);
          const perStep = 1000 / 60 / dt; // convert to units per 1/60 s
          Body.setVelocity(s.held, { x: (b.x - a.x) * perStep, y: (b.y - a.y) * perStep });
          s.held = null;
          s.trail = null;
        }
      },
    },

    measure(s, params) {
      const dynamic = bodiesOf(s).filter((b) => !b.isStatic);
      const [ke] = energies(s, params);
      const fast = dynamic.reduce((m, b) => Math.max(m, toMs(Body.getSpeed(b))), 0);
      return {
        count: `${dynamic.length} (+${bodiesOf(s).length - dynamic.length} walls)`,
        ke: `${ke.toFixed(0)} J`,
        fast: `${fast.toFixed(2)} m/s`,
      };
    },
  });

  function eraseAt(s, pt) {
    // Points inside an object, plus anything thin (drawn walls) within a few units.
    const r = 10;
    const near = Query.region(bodiesOf(s), { min: { x: pt.x - r, y: pt.y - r }, max: { x: pt.x + r, y: pt.y + r } })
      .filter((b) => b.isStatic && Query.ray([b], { x: pt.x - r, y: pt.y }, { x: pt.x + r, y: pt.y }, r).length);
    for (const b of new Set([...Query.point(bodiesOf(s), pt), ...near])) Composite.remove(s.engine.world, b);
  }
})();
