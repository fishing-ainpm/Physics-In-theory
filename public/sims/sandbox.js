// Physics sandbox: draw shapes, build scenarios, place objects and throw things around.
// Rigid-body physics by Matter.js (with poly-decomp for concave drawn shapes); drawing by p5.
// World units: 50 units = 1 m.
(function () {
  const { util } = PhysicsHub;
  const { Engine, Bodies, Body, Composite, Query, Vector, Vertices, Common } = Matter;
  if (window.decomp) Common.setDecomp(window.decomp);

  const W = 1000; // world width in units (20 m)
  const H = 562.5; // world height in units (11.25 m)
  const PX_PER_M = 50;
  const DENSITY = 100 / (PX_PER_M * PX_PER_M); // 100 kg per m² of shape
  const MAX_BODIES = 200;
  const SLING = 0.12; // launch speed per unit of slingshot pull
  const SAVE_KEY = 'physics.sandbox.scene';

  const GRAVITY = [
    ['9.81', 'Earth (9.81 m/s²)'],
    ['1.62', 'Moon (1.62 m/s²)'],
    ['3.71', 'Mars (3.71 m/s²)'],
    ['24.79', 'Jupiter (24.79 m/s²)'],
    ['0', 'Zero gravity'],
  ];
  const TOOLS = [
    ['shape', 'Draw a shape (freehand)'],
    ['rect', 'Draw a rectangle'],
    ['circle', 'Draw a circle'],
    ['draw', 'Draw a wall / ramp (line)'],
    ['ball', 'Place ball'],
    ['box', 'Place box'],
    ['triangle', 'Place triangle'],
    ['plank', 'Place plank'],
    ['drag', 'Grab and throw'],
    ['pin', 'Pin / unpin (fix in place)'],
    ['erase', 'Erase'],
  ];
  const HINTS = {
    shape: 'Draw any outline with your finger. It becomes a solid object when you let go.',
    rect: 'Drag from one corner to the other.',
    circle: 'Drag from the centre outwards.',
    draw: 'Draw a line: it becomes a fixed wall or ramp.',
    ball: 'Tap to place. Pull back before letting go to launch it like a slingshot.',
    box: 'Tap to place. Pull back before letting go to launch it like a slingshot.',
    triangle: 'Tap to place. Pull back before letting go to launch it like a slingshot.',
    plank: 'Tap to place. Pull back before letting go to launch it like a slingshot.',
    drag: 'Grab an object, move it, and let go while moving to throw it.',
    pin: 'Tap an object to fix it in place (scenery). Tap again to free it.',
    erase: 'Tap or rub over objects and walls to remove them.',
  };
  const SCENES = [
    ['demo', 'Playground'],
    ['empty', 'Empty'],
    ['dominoes', 'Dominoes'],
    ['pyramid', 'Box pyramid'],
    ['catapult', 'Catapult'],
    ['marble', 'Marble run'],
    ['plinko', 'Plinko'],
    ['mine', 'My saved scenario'],
  ];
  const SCENE_NOTES = {
    demo: 'Playground: a ramp, a stack of boxes and a seesaw.',
    empty: 'Empty: draw your own scenario.',
    dominoes: 'Dominoes: let the ball roll, or flick the first domino with Grab and throw.',
    pyramid: 'Box pyramid: knock it down with a slingshot ball.',
    catapult: 'Catapult: the heavy box lands on the plank and launches the ball. Try other weights!',
    marble: 'Marble run: watch the balls roll down, then draw your own ramps.',
    plinko: 'Plinko: place balls at the top and see where they land.',
    mine: 'Your saved scenario.',
  };

  // Matter's gravity is in units/ms².
  const gravityScale = (g) => (g * PX_PER_M) / 1e6;
  // Matter velocities are units per 1/60 s.
  const toMs = (v) => (v * 60) / PX_PER_M;

  let view = { s: 1, ox: 0, oy: 0 }; // world -> canvas transform from the last frame
  const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });

  const store = {
    get() { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(SAVE_KEY, v); return true; } catch { return false; } },
  };

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
  function wall(a, b, params, thickness = 8) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + thickness, thickness, {
      isStatic: true,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      friction: params.friction,
      restitution: params.bounce,
      chamfer: { radius: thickness / 2 },
      plugin: { kind: 'wall' },
    });
  }

  /** Turn a freehand outline into a solid body (concave outlines are split into convex parts). */
  function shapeFromOutline(points, params) {
    // Thin out the points and drop the closing point if the finger came back to the start.
    const pts = [];
    for (const q of points) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 8) pts.push({ x: q.x, y: q.y });
    }
    if (pts.length < 3) return null;
    if (Math.abs(Vertices.area(pts, true)) < 150) return null; // too thin to be a shape
    const centre = Vertices.centre(pts);
    const body = Bodies.fromVertices(centre.x, centre.y, [pts], { ...material(params), plugin: { kind: 'shape' } }, true);
    if (!body || !Number.isFinite(body.area) || body.area < 100) return null;
    return body;
  }

  // ---------------------------------------------------------- scenarios
  function buildScene(name, params) {
    const p = { ...params, size: 0.6 };
    const add = (kind, x, y, extra = {}) => makeBody(kind, x, y, { ...p, ...extra });
    const rect = (x, y, w, h, kind = 'box', extra = {}) =>
      Bodies.rectangle(x, y, w, h, { ...material(p), chamfer: { radius: 1.5 }, plugin: { kind }, ...extra });
    const peg = (x, y, r = 6) => Bodies.circle(x, y, r, { isStatic: true, restitution: 0.5, friction: 0.05, plugin: { kind: 'wall' } });
    const pivot = (x, y) => Bodies.polygon(x, y, 3, 30, { isStatic: true, angle: -Math.PI / 2, friction: 1, plugin: { kind: 'wall' } });

    switch (name) {
      case 'empty':
        return [];
      case 'dominoes': {
        const list = [wall({ x: 30, y: 250 }, { x: 260, y: H - 50 }, p), add('ball', 60, 210, { size: 0.7 })];
        for (let i = 0; i < 14; i++) list.push(rect(330 + i * 44, H - 32, 10, 64, 'box', { friction: 0.6 }));
        return list;
      }
      case 'pyramid': {
        const list = [];
        const s = 34;
        for (let row = 0; row < 7; row++) {
          for (let i = 0; i < 7 - row; i++) list.push(rect(560 + (i - (6 - row) / 2) * (s + 1), H - s / 2 - row * s, s, s));
        }
        list.push(rect(110, H - 60, 16, 120, 'wall', { isStatic: true }));
        return list;
      }
      case 'catapult':
        return [
          pivot(450, H - 22),
          rect(450, H - 52, 420, 12, 'plank'),
          add('ball', 270, H - 75, { size: 0.5 }),
          rect(632, H - 230, 60, 60, 'box', { density: DENSITY * 6 }),
        ];
      case 'marble': {
        const list = [
          wall({ x: 20, y: 120 }, { x: 600, y: 200 }, p),
          wall({ x: 980, y: 260 }, { x: 380, y: 330 }, p),
          wall({ x: 20, y: 400 }, { x: 640, y: 470 }, p),
          wall({ x: 640, y: 470 }, { x: 700, y: 455 }, p),
        ];
        for (let i = 0; i < 4; i++) list.push(add('ball', 60 + i * 34, 80 - i * 6, { size: 0.55 }));
        return list;
      }
      case 'plinko': {
        const list = [];
        for (let row = 0; row < 7; row++) {
          const offset = row % 2 ? 35 : 0;
          for (let x = 180 + offset; x <= 820; x += 70) list.push(peg(x, 120 + row * 50));
        }
        for (let x = 150; x <= 850; x += 70) list.push(rect(x, H - 40, 6, 80, 'wall', { isStatic: true }));
        list.push(wall({ x: 60, y: 60 }, { x: 160, y: 400 }, p), wall({ x: 940, y: 60 }, { x: 840, y: 400 }, p));
        for (let i = 0; i < 3; i++) list.push(add('ball', 470 + i * 30, 40, { size: 0.45 }));
        return list;
      }
      case 'mine':
        return loadSaved(p);
      default: // demo
        return [
          wall({ x: 40, y: 180 }, { x: 330, y: 330 }, p),
          add('ball', 80, 140),
          add('box', 640, H - 18, { size: 0.7 }),
          add('box', 640, H - 55, { size: 0.7 }),
          add('box', 640, H - 92, { size: 0.7 }),
          pivot(850, H - 22),
          add('plank', 850, H - 60, { size: 0.9 }),
          add('ball', 905, 120, { size: 0.5 }),
        ];
    }
  }

  // Save as plain outlines so any body (including concave drawn shapes) can be rebuilt.
  function serialize(s) {
    return JSON.stringify(bodiesOf(s).map((b) => ({
      kind: b.plugin.kind,
      fixed: b.isStatic,
      circle: b.circleRadius ? { x: b.position.x, y: b.position.y, r: b.circleRadius, angle: b.angle } : null,
      parts: b.circleRadius ? null : (b.parts.length > 1 ? b.parts.slice(1) : [b]).map((part) => part.vertices.map((v) => ({ x: v.x, y: v.y }))),
    })));
  }

  function loadSaved(params) {
    let data;
    try {
      data = JSON.parse(store.get() || 'null');
    } catch {
      data = null;
    }
    if (!Array.isArray(data)) return null;
    const bodies = [];
    for (const d of data) {
      const opts = { ...material(params), plugin: { kind: d.kind } };
      let body;
      if (d.circle) {
        body = Bodies.circle(d.circle.x, d.circle.y, d.circle.r, opts);
        Body.setAngle(body, d.circle.angle || 0);
      } else if (d.parts?.length === 1) {
        const c = Vertices.centre(d.parts[0]);
        body = Bodies.fromVertices(c.x, c.y, [d.parts[0]], opts);
      } else if (d.parts?.length > 1) {
        const parts = d.parts.map((vs) => {
          const c = Vertices.centre(vs);
          return Bodies.fromVertices(c.x, c.y, [vs], opts);
        });
        body = Body.create({ ...opts, parts });
      }
      if (!body) continue;
      if (d.fixed) Body.setStatic(body, true);
      bodies.push(body);
    }
    return bodies;
  }

  // Everything the user can see and touch (compound shapes are listed once, not per part).
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

  function toast(s, text) {
    s.toast = { text, until: performance.now() + 2600 };
  }

  PhysicsHub.define({
    aspect: 16 / 9,
    dt: 1 / 120,
    controls: [
      { id: 'scene', label: 'Scenario', type: 'select', options: SCENES, value: 'demo', reset: true },
      { id: 'tool', label: 'Tool', type: 'select', options: TOOLS, value: 'shape' },
      { id: 'fixed', label: 'New objects are fixed (scenery)', type: 'checkbox', value: false },
      { id: 'size', label: 'Size of placed objects', type: 'range', min: 0.2, max: 2, step: 0.05, value: 0.6, unit: 'm' },
      { id: 'gravity', label: 'Gravity', type: 'select', options: GRAVITY, value: '9.81' },
      { id: 'bounce', label: 'Bounciness', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0.4 },
      { id: 'friction', label: 'Friction', type: 'range', min: 0, max: 1, step: 0.05, value: 0.3 },
      { id: 'air', label: 'Air resistance', type: 'checkbox', value: false },
      { id: 'vectors', label: 'Show velocity arrows', type: 'checkbox', value: false },
      { id: 'save', label: 'Save my scenario', type: 'button',
        action: (s) => toast(s, store.set(serialize(s)) ? 'Scenario saved on this device.' : 'Could not save on this device.') },
      { id: 'load', label: 'Load my scenario', type: 'button', action: (s, params, api) => api.set('scene', 'mine') },
      { id: 'clearObjects', label: 'Clear moving objects', type: 'button',
        action: (s) => bodiesOf(s).filter((b) => !b.isStatic).forEach((b) => Composite.remove(s.engine.world, b)) },
      { id: 'clearWalls', label: 'Clear fixed objects', type: 'button',
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
      const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
      engine.gravity.y = 1;
      engine.gravity.scale = gravityScale(+params.gravity);
      const bound = { isStatic: true, friction: 0.6, restitution: 0.2, plugin: { kind: 'bound' } };
      Composite.add(engine.world, [
        Bodies.rectangle(W / 2, H + 50, W * 3, 100, bound), // floor
        Bodies.rectangle(-50, H / 2, 100, H * 4, bound), // left
        Bodies.rectangle(W + 50, H / 2, 100, H * 4, bound), // right
        Bodies.rectangle(W / 2, -H * 1.5, W * 3, 100, bound), // ceiling, far above the view
      ]);
      const s = { engine, stroke: null, aim: null, held: null, drag: null };
      const scene = buildScene(params.scene, params);
      if (scene) {
        Composite.add(engine.world, scene);
        toast(s, SCENE_NOTES[params.scene]);
      } else {
        toast(s, 'No saved scenario yet. Build one and tap “Save my scenario”.');
      }
      return s;
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
      if (id === 'tool') toast(s, HINTS[params.tool]);
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
        ball: theme.accent, circle: theme.accent, box: theme.accent2, rect: theme.accent2,
        triangle: theme.accent3, shape: theme.accent3, plank: theme.ink,
      };

      const outline = (verts) => {
        p.beginShape();
        for (const v of verts) p.vertex(X(v.x), Y(v.y));
        p.endShape(p.CLOSE);
      };

      for (const b of bodiesOf(s)) {
        const c = b.isStatic ? theme.muted : colors[b.plugin.kind] || theme.ink;
        p.noStroke();
        p.fill(b === s.held ? util.alpha(c, 0.7) : c);
        if (b.circleRadius) {
          p.circle(X(b.position.x), Y(b.position.y), 2 * b.circleRadius * k);
          if (b.isStatic) continue;
          // a spoke shows the rotation
          p.stroke(theme.surface);
          p.strokeWeight(Math.max(1, 2 * k));
          p.line(X(b.position.x), Y(b.position.y),
            X(b.position.x + Math.cos(b.angle) * b.circleRadius * 0.8), Y(b.position.y + Math.sin(b.angle) * b.circleRadius * 0.8));
        } else if (b.parts.length > 1) {
          // concave shape: fill each convex part, with matching strokes to hide the seams
          p.stroke(c);
          p.strokeWeight(1);
          for (const part of b.parts.slice(1)) outline(part.vertices);
        } else {
          outline(b.vertices);
        }
        if (b.isStatic && b.plugin.pinned) {
          p.noStroke();
          p.fill(theme.surface);
          p.circle(X(b.position.x), Y(b.position.y), 6);
        }
        if (params.vectors && !b.isStatic) {
          const v = Body.getVelocity(b);
          util.arrow(p, X(b.position.x), Y(b.position.y), v.x * k * 6, v.y * k * 6, theme.ink, 1.5);
        }
      }

      // in-progress drawing
      if (s.stroke && s.stroke.length > 1) {
        const closed = params.tool === 'shape';
        p.stroke(closed ? theme.accent3 : theme.muted);
        p.strokeWeight(closed ? 2 : 8 * k);
        p.fill(closed ? util.alpha(theme.accent3, 0.18) : 'rgba(0,0,0,0)');
        if (!closed) p.noFill();
        p.drawingContext.setLineDash([6, 6]);
        p.beginShape();
        for (const q of s.stroke) p.vertex(X(q.x), Y(q.y));
        closed ? p.endShape(p.CLOSE) : p.endShape();
        p.drawingContext.setLineDash([]);
      }
      if (s.drag) {
        const { from, to, tool } = s.drag;
        p.stroke(theme.ink);
        p.strokeWeight(1.5);
        p.fill(util.alpha(tool === 'circle' ? theme.accent : theme.accent2, 0.25));
        p.drawingContext.setLineDash([5, 4]);
        if (tool === 'circle') {
          const r = Math.hypot(to.x - from.x, to.y - from.y);
          p.circle(X(from.x), Y(from.y), 2 * r * k);
          p.noStroke();
          p.fill(theme.ink);
          p.textSize(12);
          p.text(`r = ${(r / PX_PER_M).toFixed(2)} m`, X(from.x) + 8, Y(from.y) - 8);
        } else {
          p.rect(X(Math.min(from.x, to.x)), Y(Math.min(from.y, to.y)), Math.abs(to.x - from.x) * k, Math.abs(to.y - from.y) * k);
          p.noStroke();
          p.fill(theme.ink);
          p.textSize(12);
          p.text(`${(Math.abs(to.x - from.x) / PX_PER_M).toFixed(2)} × ${(Math.abs(to.y - from.y) / PX_PER_M).toFixed(2)} m`,
            X(Math.max(from.x, to.x)) + 6, Y(Math.min(from.y, to.y)));
        }
        p.drawingContext.setLineDash([]);
      }

      // slingshot aim
      if (s.aim) {
        const { from, to } = s.aim;
        const preview = makeBody(params.tool, from.x, from.y, params);
        p.noStroke();
        p.fill(util.alpha(theme.ink, 0.25));
        if (preview.circleRadius) p.circle(X(from.x), Y(from.y), 2 * preview.circleRadius * k);
        else outline(preview.vertices);
        util.dashed(p, X(from.x), Y(from.y), X(to.x), Y(to.y), theme.faint);
        util.arrow(p, X(from.x), Y(from.y), (from.x - to.x) * k, (from.y - to.y) * k, theme.ink, 2);
        const speed = toMs(Math.hypot(from.x - to.x, from.y - to.y) * SLING);
        p.noStroke();
        p.fill(theme.ink);
        p.textSize(12);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text(`${speed.toFixed(1)} m/s`, X(from.x) + 10, Y(from.y) - 10);
      }

      // tool name and a short-lived hint
      p.noStroke();
      p.fill(theme.muted);
      p.textSize(12);
      p.textAlign(p.RIGHT, p.TOP);
      p.text(TOOLS.find(([id]) => id === params.tool)[1] + (params.fixed ? ' · fixed' : ''), p.width - 10, 8);
      if (s.toast && performance.now() < s.toast.until) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(12);
        const tw = Math.min(p.textWidth(s.toast.text) + 16, p.width - 24);
        p.fill(util.alpha(theme.ink, 0.82));
        p.rect(10, 8, tw, 24, 6);
        p.fill(theme.surface);
        p.text(s.toast.text, 18, 14, tw - 12);
      }
    },

    pointer: {
      hover: () => true,

      down(s, params, x, y) {
        const pt = toWorld(x, y);
        const tool = params.tool;
        if (pt.y > H || pt.y < 0) return false;
        if (['ball', 'box', 'triangle', 'plank'].includes(tool)) {
          s.aim = { from: pt, to: pt };
          return true;
        }
        if (tool === 'draw' || tool === 'shape') {
          s.stroke = [pt];
          return true;
        }
        if (tool === 'rect' || tool === 'circle') {
          s.drag = { tool, from: pt, to: pt };
          return true;
        }
        if (tool === 'drag') {
          const hit = Query.point(bodiesOf(s).filter((b) => !b.isStatic), pt)[0];
          if (!hit) return false;
          s.held = hit;
          s.trail = [{ ...pt, time: performance.now() }];
          return true;
        }
        if (tool === 'pin') {
          const hit = Query.point(bodiesOf(s), pt)[0];
          if (hit) {
            Body.setStatic(hit, !hit.isStatic);
            hit.plugin.pinned = hit.isStatic;
            toast(s, hit.isStatic ? 'Fixed in place.' : 'Free to move.');
          }
          return false;
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
        if (s.drag) s.drag.to = pt;
        if (s.stroke) {
          const last = s.stroke[s.stroke.length - 1];
          if (Math.hypot(pt.x - last.x, pt.y - last.y) > (params.tool === 'shape' ? 6 : 14)) s.stroke.push(pt);
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
        const full = bodiesOf(s).length >= MAX_BODIES;
        const addBody = (b) => {
          if (!b) return;
          if (full) {
            toast(s, `That's a lot of objects! Erase some first (limit ${MAX_BODIES}).`);
            return;
          }
          if (params.fixed) {
            Body.setStatic(b, true);
            b.plugin.pinned = true;
          }
          Composite.add(world, b);
        };

        if (s.aim) {
          const { from, to } = s.aim;
          const b = makeBody(params.tool, from.x, from.y, params);
          if (!params.fixed) Body.setVelocity(b, Vector.mult(Vector.sub(from, to), SLING));
          addBody(b);
          s.aim = null;
        }
        if (s.drag) {
          const { from, to, tool } = s.drag;
          const opts = { ...material(params), plugin: { kind: tool } };
          if (tool === 'circle') {
            const r = Math.hypot(to.x - from.x, to.y - from.y);
            if (r >= 5) addBody(Bodies.circle(from.x, from.y, r, opts));
          } else {
            const w = Math.abs(to.x - from.x);
            const h = Math.abs(to.y - from.y);
            if (w >= 5 && h >= 5) addBody(Bodies.rectangle((from.x + to.x) / 2, (from.y + to.y) / 2, w, h, opts));
          }
          s.drag = null;
        }
        if (s.stroke) {
          const pts = s.stroke;
          pts.push(toWorld(x, y));
          if (params.tool === 'shape') {
            const body = shapeFromOutline(pts, params);
            if (body) addBody(body);
            else toast(s, 'Draw a bigger outline to make a shape.');
          } else {
            for (let i = 1; i < pts.length; i++) {
              if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > 3) Composite.add(world, wall(pts[i - 1], pts[i], params));
            }
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
      const all = bodiesOf(s);
      const moving = all.filter((b) => !b.isStatic);
      const [ke] = energies(s, params);
      const fast = moving.reduce((m, b) => Math.max(m, toMs(Body.getSpeed(b))), 0);
      return {
        count: `${moving.length} moving · ${all.length - moving.length} fixed`,
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
