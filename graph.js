(function graphRuntime()               {
  // The reference's palette, from display-p3 to sRGB.
  const colors = {
    back: '#010419', star: 'rgba(110, 132, 255, 0.32)',
    hub: [100, 122, 254]       , leaf: [100, 122, 254]       , ink: [50, 77, 241]       ,
    // What is lit glows light blue (no green, per the project's palette).
    glow: [124, 196, 255]       , white: [255, 255, 255]       ,
    // Where a line starts at its hub, one of three tints, and how strong; it fades into the hub colour.
    tints: [[0, 127, 216, 1], [0, 255, 173, 0.7], [96, 147, 255, 0.85]]                                      ,
    text: '#ffffff', soft: 'rgba(255, 255, 255, 0.5)', plate: 'rgba(1, 4, 25, 0.82)',
  };
  const mono = '"JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace';
  const sans = '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  // How hard each kind pushes the others away; hubs (see load) also by how many items they hold.
  const charge = { center: 800, hub: 1800, item: 160, dot: 10 };
  const rank = { center: 3, hub: 2, item: 1, dot: 0 };
  // A number in [0, 1) from a string: FNV-1a, then mixed, so neighbouring strings (x1, x2, …) do not
  // land on a line.
  const unit = (s        ) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const clamp = (v        , lo        , hi        ) => Math.min(hi, Math.max(lo, v));
  const ease = (t        ) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const mix = (p     , q     , t        )      => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const rgba = (c     , a        ) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${clamp(a, 0, 1).toFixed(3)})`;

  function mount(host             , data           , options               = {})              {
    const canvas = document.createElement('canvas');
    canvas.className = 'graph-canvas';
    canvas.setAttribute('role', 'img');
    if (options.label) canvas.setAttribute('aria-label', options.label);
    const tip = document.createElement('div');
    tip.className = 'graph-tip';
    tip.hidden = true;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'graph-back';
    back.textContent = options.backLabel ?? '← 全部';
    back.hidden = true;
    host.append(canvas, tip, back);
    const ctx = canvas.getContext('2d') ;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let bodies         = [];
    let ids = new Map                ();
    let links         = [];
    let order           = [];
    let width = 1, height = 1, ratio = 1;
    const cam       = { x: 0, y: 0, k: 1 };
    let flight                                                     ;
    let moved = false; // panned or zoomed by hand: a resize no longer refits
    // hover: under the pointer; lit: lit from outside (the hub list); shown: what is lit now, which
    // stays a moment after the pointer leaves before it lets go.
    let hover = -1, lit = -1, focus = -1, shown = -1, release = 0, tipNode = -1;
    let dim = 0; // eased: how far the rest of the graph steps back while something is lit
    let near = new Uint8Array(0); // 2: what is shown, 1: what it touches
    let alpha = 1, frame = 0, visible = true, last = 0;
    let stars           = [];
    // The opening: when each body sets out, from what (its hub, its note, or the middle), and when
    // it all began; reveal and swell are each body's fade-in and size on the way.
    let intro                                                                                                           ;
    let reveal = new Float32Array(0), swell = new Float32Array(0);
    // Left alone, a hub lights up by itself: calm is when the pointer last moved.
    let calm = 0, ambient = -1, ambientUntil = 0, ambientNext = 0, ambientLast = -1;
    let nearAmbient = new Uint8Array(0);
    let px = new Float32Array(0), py = new Float32Array(0); // where each body was last drawn
    let drag                                                                                                           ;

    // Data: bodies keep their places across updates; new ones start beside what they link to.
    function load(next           ) {
      const before = new Map(bodies.map(b => [b.node.id, b]));
      const focusId = focus >= 0 ? bodies[focus].node.id : undefined;
      bodies = [];
      ids = new Map();
      for (const node of next.nodes) {
        if (ids.has(node.id)) continue;
        const old = before.get(node.id);
        const body       = old ? { ...old, node, links: [], lit: 0, self: 0, pull: 0, anchor: -1, glint: 0 }
          : { node, x: 0, y: 0, vx: 0, vy: 0, links: [], home: -1, pinned: false, phase: unit(node.id) * Math.PI * 2, fresh: true, ready: false, labelWidth: 0, charge: 0, lit: 0, self: 0, pull: 0, anchor: -1, glint: 0 };
        if (node.image && node.image !== old?.node.image) {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => { body.ready = img.naturalWidth > 0; wake(); };
          img.src = node.image;
          body.img = img;
          body.ready = false;
        } else if (!node.image) body.img = undefined;
        ids.set(node.id, bodies.length);
        bodies.push(body);
      }
      links = [];
      const seen = new Set        ();
      for (const [from, to] of next.links) {
        const a = ids.get(from), b = ids.get(to);
        if (a === undefined || b === undefined || a === b) continue;
        const key = a < b ? `${a} ${b}` : `${b} ${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bodies[a].links.push(b);
        bodies[b].links.push(a);
        links.push({ a, b, hi: a, lo: b, length: 0, strength: 0, tone: 0, tint: -1, phase: 0 });
      }
      // A big hub clears more room around itself, so starbursts do not run into each other.
      for (const b of bodies) b.charge = b.node.kind === 'hub' ? charge.hub + 320 * Math.min(40, b.links.length) : charge[b.node.kind];
      // An item's first hub is its home; lines to its other hubs run long and loose between clusters.
      const home = new Map                ();
      for (const l of links) {
        const [hub, item] = rank[bodies[l.a].node.kind] > rank[bodies[l.b].node.kind] ? [l.a, l.b] : [l.b, l.a];
        if (bodies[item].node.kind === 'item' && rank[bodies[hub].node.kind] >= 2 && !home.has(item)) home.set(item, hub);
      }
      for (const l of links) shape(l, home);
      bodies.forEach((b, i) => { b.home = home.get(i) ?? -1; });
      order = bodies.map((_, i) => i).sort((p, q) => rank[bodies[p].node.kind] - rank[bodies[q].node.kind]);
      place();
      hover = lit = shown = tipNode = ambient = ambientLast = -1;
      release = dim = 0;
      near = new Uint8Array(bodies.length);
      nearAmbient = new Uint8Array(bodies.length);
      px = new Float32Array(0);
      tip.hidden = true;
      focus = focusId === undefined ? -1 : ids.get(focusId) ?? -1;
      back.hidden = focus < 0;
      if (!before.size) {
        // Settled before the first frame, so the graph opens already laid out.
        for (let i = 0; i < 420; i++) { tick(0); alpha = Math.max(0.03, alpha * 0.986); }
        fit(false);
        if (!still) opening();
      } else alpha = Math.max(alpha, 0.35);
      wake();
    }

    // Line lengths make the starbursts: a hub's items sit at uneven distances all around it.
    function shape(l      , home                     ) {
      let hi = bodies[l.a], lo = bodies[l.b];
      if (rank[lo.node.kind] > rank[hi.node.kind]) [hi, lo] = [lo, hi];
      l.hi = hi === bodies[l.a] ? l.a : l.b;
      l.lo = l.hi === l.a ? l.b : l.a;
      const pair = `${hi.node.kind}-${lo.node.kind}`;
      const r = unit(hi.node.id + '|' + lo.node.id);
      l.phase = r;
      l.tint = hi.node.kind === 'hub' ? Math.floor(unit(hi.node.id + '#') * colors.tints.length) : -1;
      // The space links every hub only loosely: the hubs spread out by themselves, not around it.
      if (pair === 'center-hub') Object.assign(l, { length: 320, strength: 0.006, tone: 0.12 });
      else if ((pair === 'hub-item' || pair === 'center-item') && home.get(l.lo) !== l.hi) Object.assign(l, { length: 300 + 160 * r, strength: 0.01, tone: 0.24 });
      else if (pair === 'hub-item' || pair === 'center-item') Object.assign(l, { length: 84 + 120 * r, strength: 0.7, tone: 0.72 });
      else if (lo.node.kind === 'dot') Object.assign(l, { length: 18 + 14 * r, strength: 0.9, tone: 0.38 });
      else Object.assign(l, { length: 120, strength: 0.08, tone: 0.22 });
    }

    function place() {
      let spiral = bodies.filter(b => !b.fresh && b.node.kind === 'hub').length;
      const aspect = clamp(width / height, 0.6, 2.4);
      for (const i of [...order].reverse()) {
        const b = bodies[i];
        if (!b.fresh) continue;
        const angle = unit(b.node.id) * Math.PI * 2;
        if (b.node.kind === 'center') b.x = b.y = 0;
        else if (b.node.kind === 'hub') {
          spiral++;
          const t = spiral * 2.39996, r = 170 * Math.sqrt(spiral); // the golden angle spreads hubs evenly
          b.x = Math.cos(t) * r * Math.sqrt(aspect);
          b.y = Math.sin(t) * r / Math.sqrt(aspect);
        } else {
          const anchor = b.links.map(j => bodies[j]).filter(n => !n.fresh).sort((p, q) => rank[q.node.kind] - rank[p.node.kind])[0];
          const r = anchor ? (b.node.kind === 'dot' ? 18 : 40 + 100 * unit(b.node.id + '+')) : 320 * unit(b.node.id + '-');
          b.x = (anchor?.x ?? 0) + Math.cos(angle) * r;
          b.y = (anchor?.y ?? 0) + Math.sin(angle) * r;
        }
        b.fresh = false;
      }
    }

    // The opening, as on the reference: the hubs set out from the middle one after another, going
    // round from the top; each hub's items follow from it a moment later, one after another, and
    // headings from their note; everything swells on its way while the whole graph turns half a
    // turn into place and the view pulls back from close up (see draw).
    function opening() {
      const n = bodies.length, birth = new Float32Array(n), from = new Int32Array(n).fill(-1);
      const middle = bodies.findIndex(b => b.node.kind === 'center');
      const hubs = bodies.map((_, i) => i).filter(i => bodies[i].node.kind === 'hub');
      const mean = (axis           ) => hubs.reduce((sum, i) => sum + bodies[i][axis], 0) / Math.max(1, hubs.length);
      const cx = middle >= 0 ? bodies[middle].x : mean('x'), cy = middle >= 0 ? bodies[middle].y : mean('y');
      const round = (i        , ox        , oy        ) => (Math.atan2(bodies[i].y - oy, bodies[i].x - ox) + Math.PI * 2.5) % (Math.PI * 2);
      hubs.sort((p, q) => round(p, cx, cy) - round(q, cx, cy)).forEach((i, k) => { birth[i] = 0.2 + k * 0.07; });
      const kids = new Map                  ();
      bodies.forEach((b, i) => {
        if (b.node.kind !== 'item') return;
        const h = b.home >= 0 ? b.home : middle;
        from[i] = h;
        kids.set(h, [...(kids.get(h) ?? []), i]);
      });
      for (const [h, list] of kids) {
        const hx = h >= 0 ? bodies[h].x : cx, hy = h >= 0 ? bodies[h].y : cy;
        list.sort((p, q) => round(p, hx, hy) - round(q, hx, hy)).forEach((i, k) => { birth[i] = (h >= 0 ? birth[h] : 0.2) + 0.45 + k * 0.025; });
      }
      bodies.forEach((b, i) => {
        const note = b.node.kind === 'dot' ? b.links.find(j => bodies[j].node.kind === 'item') : undefined;
        if (note !== undefined) { from[i] = note; birth[i] = birth[note] + 0.3; }
      });
      intro = { start: 0, end: Math.max(0, ...birth) + 3, birth, from, cx, cy };
    }

    // Forces: Barnes–Hut repulsion, springs along links, a pull to the middle shaped like the
    // canvas (so the graph fills it rather than a circle in it) and, while the graph floats, a slow
    // drift of its own for every body.
    function tick(time        ) {
      const tree = quadtree();
      if (tree) for (let i = 0; i < bodies.length; i++) repel(tree, i);
      for (const l of links) {
        const a = bodies[l.a], b = bodies[l.b];
        let dx = b.x + b.vx - a.x - a.vx, dy = b.y + b.vy - a.y - a.vy;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - l.length) / d * alpha * l.strength;
        dx *= f;
        dy *= f;
        const bias = a.links.length / (a.links.length + b.links.length);
        b.vx -= dx * bias;
        b.vy -= dy * bias;
        a.vx += dx * (1 - bias);
        a.vy += dy * (1 - bias);
      }
      const aspect = clamp(width / height, 0.6, 2.4);
      for (const b of bodies) {
        if (b.node.kind === 'center' && !b.pinned) { b.x = b.y = b.vx = b.vy = 0; continue; }
        const pull = (b.node.kind === 'hub' ? 0.009 : 0.007) * alpha;
        b.vx -= b.x * pull / aspect;
        b.vy -= b.y * pull * aspect;
        if (time && !still) {
          const s = b.node.kind === 'hub' ? 0.004 : 0.012;
          b.vx += Math.cos(time * 0.00021 + b.phase) * s;
          b.vy += Math.sin(time * 0.00017 + b.phase * 1.3) * s;
        }
        if (b.pinned) { b.vx = b.vy = 0; continue; }
        b.vx *= 0.6;
        b.vy *= 0.6;
        b.x += b.vx;
        b.y += b.vy;
      }
    }

    function quadtree()                   {
      if (!bodies.length) return undefined;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const b of bodies) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x); y1 = Math.max(y1, b.y); }
      const root       = { x0, y0, s: Math.max(x1 - x0, y1 - y0) + 1, m: 0, cx: 0, cy: 0, body: -1 };
      for (let i = 0; i < bodies.length; i++) insert(root, i, 0);
      return root;
    }
    function insert(c      , i        , depth        ) {
      const b = bodies[i], q = b.charge;
      if (!c.kids && c.body < 0 && c.m === 0) { c.body = i; c.m = q; c.cx = b.x; c.cy = b.y; return; }
      const m = c.m + q;
      c.cx = (c.cx * c.m + b.x * q) / m;
      c.cy = (c.cy * c.m + b.y * q) / m;
      c.m = m;
      if (depth > 18) return; // bodies on the same spot stay one mass
      if (!c.kids) {
        c.kids = [undefined, undefined, undefined, undefined];
        const old = c.body;
        c.body = -1;
        if (old >= 0) put(c, old, depth);
      }
      put(c, i, depth);
    }
    function put(c      , i        , depth        ) {
      const b = bodies[i], h = c.s / 2, qx = b.x >= c.x0 + h ? 1 : 0, qy = b.y >= c.y0 + h ? 1 : 0;
      const k = qy * 2 + qx;
      const kid = c.kids [k] ?? (c.kids [k] = { x0: c.x0 + qx * h, y0: c.y0 + qy * h, s: h, m: 0, cx: 0, cy: 0, body: -1 });
      insert(kid, i, depth + 1);
    }
    function repel(c      , i        ) {
      if (c.m === 0 || (!c.kids && c.body === i)) return;
      const b = bodies[i], dx = c.cx - b.x, dy = c.cy - b.y;
      let l = dx * dx + dy * dy;
      if (!c.kids || c.s * c.s < 0.81 * l) {
        if (l > 1000000) return;
        if (l < 1) l = 1;
        const f = -c.m * alpha / l;
        b.vx += dx * f;
        b.vy += dy * f;
        return;
      }
      for (const kid of c.kids) if (kid) repel(kid, i);
    }

    // Camera.
    const sx = (b      ) => (b.x - cam.x) * cam.k + width / 2;
    const sy = (b      ) => (b.y - cam.y) * cam.k + height / 2;
    function frameOf(list          )       {
      // The bulk of the graph: headings left out, and a few stragglers on each side of a big one.
      const main = list.filter(i => bodies[i].node.kind !== 'dot');
      const xs = (main.length ? main : list).map(i => bodies[i].x).sort((p, q) => p - q);
      const ys = (main.length ? main : list).map(i => bodies[i].y).sort((p, q) => p - q);
      if (!xs.length) return { x: 0, y: 0, k: 1 };
      const cut = xs.length > 60 ? Math.floor(xs.length * 0.02) : 0;
      const x0 = xs[cut], x1 = xs[xs.length - 1 - cut], y0 = ys[cut], y1 = ys[ys.length - 1 - cut];
      const inset = options.inset?.() ?? {};
      const narrow = width < 560;
      const pad = narrow ? 14 : Math.min(width, height) * 0.06 + 20;
      const left = (inset.left ?? 0) + pad, right = (inset.right ?? 0) + pad + (narrow ? 40 : 70); // hub names run to the right
      const top = (inset.top ?? 0) + pad, bottom = (inset.bottom ?? 0) + pad;
      const k = clamp(Math.min((width - left - right) / Math.max(1, x1 - x0), (height - top - bottom) / Math.max(1, y1 - y0)), 0.15, 2.4);
      // The world point at the middle of the free area lands on the middle of the canvas.
      return { x: (x0 + x1) / 2 - ((left - right) / 2) / k, y: (y0 + y1) / 2 - ((top - bottom) / 2) / k, k };
    }
    const everything = () => bodies.map((_, i) => i);
    const cluster = (i        ) => [i, ...bodies[i].links.filter(j => bodies[j].node.kind !== 'center' && (bodies[j].node.kind !== 'item' || bodies[j].home === i))];
    const target = () => frameOf(focus >= 0 ? cluster(focus) : everything());
    function flyTo(to      , animate         ) {
      if (!animate || still) { Object.assign(cam, to); flight = undefined; }
      else flight = { from: { ...cam }, to, start: performance.now() };
      wake();
    }
    function fit(animate         ) { moved = false; flyTo(frameOf(everything()), animate); }
    function setFocus(i        ) {
      focus = i;
      back.hidden = i < 0;
      moved = false;
      flyTo(target(), true);
      options.onFocus?.(i >= 0 ? bodies[i].node.id : undefined);
      if (hover >= 0) showTip(hover);
    }
    function zoomAt(px        , py        , factor        ) {
      const k = clamp(cam.k * factor, 0.15, 5);
      const wx = cam.x + (px - width / 2) / cam.k, wy = cam.y + (py - height / 2) / cam.k;
      cam.k = k;
      cam.x = wx - (px - width / 2) / k;
      cam.y = wy - (py - height / 2) / k;
      flight = undefined;
      moved = true;
      wake();
    }

    // What is lit, eased: a node lights up in a blink, holds a moment after the pointer leaves,
    // then lets go over most of a second, and what it pulled in drifts back. Returns whether
    // anything is still on its way.
    function shine(dt        , time        ) {
      const want = hover >= 0 ? hover : lit >= 0 ? lit : focus;
      if (want >= 0) { shown = want; release = 0; }
      else if (shown >= 0) {
        if (!release) release = time + 160;
        else if (time >= release) { shown = -1; release = 0; }
      }
      near.fill(0);
      if (shown >= 0) { for (const j of bodies[shown].links) near[j] = 1; near[shown] = 2; }
      // Left alone, a hub and what it touches flash up by themselves, as on the reference: five
      // seconds after the pointer last moved, one at random for two and a half seconds, then
      // another every five. Its notes open into rings and its frames turn light blue; nothing dims.
      if (shown >= 0 || focus >= 0 || drag || intro || still) { ambient = -1; calm = time; }
      else {
        if (ambient >= 0 && time >= ambientUntil) ambient = -1;
        if (time - calm >= 5000 && time >= ambientNext) {
          const hubs = bodies.map((_, i) => i).filter(i => bodies[i].node.kind === 'hub' && i !== ambientLast);
          if (hubs.length) {
            ambient = ambientLast = hubs[Math.floor(Math.random() * hubs.length)];
            ambientUntil = time + 2500;
            ambientNext = time + 5000;
          }
        }
      }
      nearAmbient.fill(0);
      if (ambient >= 0) { for (const j of bodies[ambient].links) nearAmbient[j] = 1; nearAmbient[ambient] = 2; }
      const pulls = shown >= 0 && !still && rank[bodies[shown].node.kind] >= 2;
      const up = 1 - Math.exp(-dt / 0.07), down = 1 - Math.exp(-dt / 0.3), drift = 1 - Math.exp(-dt / 0.42);
      const rise = 1 - Math.exp(-dt / 0.25), fall = 1 - Math.exp(-dt / 0.6);
      let busy = release > 0;
      const step = (v        , to        , out = down, inn = up) => {
        const next = v + (to - v) * (to > v ? inn : out);
        if (Math.abs(to - next) < 0.003) return to;
        busy = true;
        return next;
      };
      dim = step(dim, shown >= 0 ? 1 : 0);
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i], state = near[i];
        b.lit = step(b.lit, state ? 1 : 0);
        b.self = step(b.self, state === 2 ? 1 : 0);
        if (state === 1 && pulls) b.anchor = shown;
        b.pull = step(b.pull, state === 1 && pulls ? 1 : 0, drift);
        if (!b.pull) b.anchor = -1;
        b.glint = step(b.glint, nearAmbient[i] ? 1 : 0, fall, rise);
      }
      return busy;
    }

    function wake() { if (!frame && visible) frame = requestAnimationFrame(loop); }
    function loop(time        ) {
      frame = 0;
      const dt = last ? clamp((time - last) / 1000, 0, 0.1) : 1 / 60;
      last = time;
      const heat = drag?.moved && drag.node >= 0 ? 0.25 : still ? 0 : 0.015;
      alpha += (heat - alpha) * 0.04;
      const settling = alpha > 0.004;
      if (settling || !still) tick(time);
      if (!moved && !flight && !drag && (settling || !still)) {
        const to = target(), follow = alpha > 0.03 ? 0.1 : 0.03;
        cam.x += (to.x - cam.x) * follow;
        cam.y += (to.y - cam.y) * follow;
        cam.k += (to.k - cam.k) * follow;
      }
      if (flight) {
        const t = Math.min(1, (time - flight.start) / 700), e = ease(Math.max(0, t));
        cam.x = flight.from.x + (flight.to.x - flight.from.x) * e;
        cam.y = flight.from.y + (flight.to.y - flight.from.y) * e;
        cam.k = flight.from.k * Math.pow(flight.to.k / flight.from.k, e);
        if (t >= 1) flight = undefined;
      }
      if (intro && !intro.start) intro.start = time;
      const easing = shine(dt, time);
      draw(time);
      if (intro && (time - intro.start) / 1000 > intro.end) intro = undefined;
      if ((settling || !still || flight || easing || intro) && visible) frame = requestAnimationFrame(loop);
      else last = 0;
    }

    function draw(time        ) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.back;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = colors.star;
      for (let i = 0; i < stars.length; i += 3) ctx.fillRect(stars[i] * width, stars[i + 1] * height, stars[i + 2], stars[i + 2]);
      const t = intro?.start ? (time - intro.start) / 1000 : 0;

      const n = bodies.length;
      if (px.length !== n) { px = new Float32Array(n); py = new Float32Array(n); }
      if (reveal.length !== n) { reveal = new Float32Array(n); swell = new Float32Array(n); }
      reveal.fill(1);
      swell.fill(1);
      const X = px, Y = py;
      if (intro) {
        // Each body sets out at its time and travels out over 1.1 s as on the reference: the first
        // third creeps out an eighth of the way, close to where it started while the view is still
        // close up, then it rushes out on a quintic. An item turns about its hub as it goes; the
        // whole graph turns and the view pulls back from 5.6 times closer, both about the middle.
        const { birth, from, cx, cy } = intro;
        const out = (v        ) => v < 0.35 ? v / 0.35 * 0.12 : 0.12 + 0.88 * (1 - Math.pow(1 - (v - 0.35) / 0.65, 5));
        for (let r = order.length - 1; r >= 0; r--) { // the middle, then hubs, then items, then headings
          const i = order[r], b = bodies[i], since = t - birth[i], d = clamp(since / 1.1, 0, 1), e = out(d), a = from[i];
          reveal[i] = clamp(since / 1.1 * 6, 0, 1);
          swell[i] = 1 + Math.sin(Math.PI * d) * 0.7;
          if (a < 0) { X[i] = cx + (b.x - cx) * e; Y[i] = cy + (b.y - cy) * e; continue; }
          const turn = -67 * Math.PI / 180 * Math.pow(1 - clamp(since / 3, 0, 1), 5);
          const rx = (b.x - bodies[a].x) * e, ry = (b.y - bodies[a].y) * e;
          X[i] = X[a] + rx * Math.cos(turn) - ry * Math.sin(turn);
          Y[i] = Y[a] + rx * Math.sin(turn) + ry * Math.cos(turn);
        }
        const turn = -Math.PI * Math.pow(1 - clamp(t / 3, 0, 1), 5);
        const zoom = Math.pow(5.6, Math.pow(1 - clamp((t - 0.25) / 1.75, 0, 1), 3));
        const c = Math.cos(turn) * zoom, s = Math.sin(turn) * zoom;
        for (let i = 0; i < n; i++) {
          const dx = X[i] - cx, dy = Y[i] - cy;
          X[i] = (cx + dx * c - dy * s - cam.x) * cam.k + width / 2;
          Y[i] = (cy + dx * s + dy * c - cam.y) * cam.k + height / 2;
        }
      } else for (let i = 0; i < n; i++) { X[i] = sx(bodies[i]); Y[i] = sy(bodies[i]); }
      // What a lit hub touches gathers in toward it a little, and drifts back as it lets go.
      for (let i = 0; i < n; i++) {
        const b = bodies[i], a = b.anchor;
        if (b.pull > 0 && a >= 0 && a < n) { X[i] += (sx(bodies[a]) - X[i]) * 0.09 * b.pull; Y[i] += (sy(bodies[a]) - Y[i]) * 0.09 * b.pull; }
      }
      const scale = clamp(Math.sqrt(cam.k), 0.75, 1.5);
      const off = (x        , y        ) => x < -60 || y < -60 || x > width + 60 || y > height + 60;
      const recede = (b      ) => 1 - 0.5 * dim * (1 - b.lit); // what is not lit steps back to half

      // Lines add up ('lighter'), so a hub with many items glows by itself. Each fades from its
      // hub's tint to the hub colour; lines of what is lit turn light blue.
      ctx.globalCompositeOperation = 'lighter';
      for (const l of links) {
        const A = bodies[l.a], B = bodies[l.b];
        const x1 = X[l.hi], y1 = Y[l.hi], x2 = X[l.lo], y2 = Y[l.lo];
        if (off(x1, y1) && off(x2, y2)) continue;
        const seen = Math.min(reveal[l.a], reveal[l.b]);
        if (seen <= 0) continue;
        const glow = Math.max(A.self * B.lit, B.self * A.lit);
        const fade = (1 - 0.65 * dim * (1 - glow)) * seen;
        const light = Math.max(glow, Math.min(A.glint, B.glint) * 0.8);
        const tint = l.tint >= 0 ? colors.tints[l.tint] : [...colors.ink, 1];
        const a0 = l.tone * tint[3] * fade, a1 = l.tone * 0.5 * fade;
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, rgba(mix([tint[0], tint[1], tint[2]], colors.glow, light), a0 + (0.9 * seen - a0) * light));
        g.addColorStop(1, rgba(mix(colors.hub, colors.glow, light), a1 + (0.5 * seen - a1) * light));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1 + 0.35 * light;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // Along the lit node's lines, small dots travel out from the hub.
      if (!still && dim > 0.01) {
        for (const l of links) {
          const A = bodies[l.a], B = bodies[l.b];
          const glow = Math.max(A.self * B.lit, B.self * A.lit);
          if (glow < 0.02 || rank[bodies[l.hi].node.kind] < 2) continue;
          const along = (time * 0.00018 + l.phase) % 1;
          ctx.fillStyle = rgba(colors.glow, 0.9 * glow);
          ctx.beginPath();
          ctx.arc(X[l.hi] + (X[l.lo] - X[l.hi]) * along, Y[l.hi] + (Y[l.lo] - Y[l.hi]) * along, 1.3 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      // Nodes: hubs are squares; items without a picture, and headings, are dots that open into
      // rings when lit; pictures are framed thumbnails whose frame turns light blue.
      for (const i of order) {
        const b = bodies[i], x = X[i], y = Y[i];
        if (off(x, y) || reveal[i] <= 0) continue;
        ctx.globalAlpha = recede(b) * reveal[i];
        const kind = b.node.kind, grow = swell[i], ring = Math.max(b.lit, b.glint);
        if (kind === 'hub') {
          const on = Math.max(b.self, i === focus ? 1 : 0), hue = Math.max(on, b.glint);
          const s = (5 + Math.min(4, Math.sqrt(b.links.length) * 0.9) + 4 * on + 2 * b.glint) * scale * grow;
          ctx.fillStyle = rgba(mix(mix(colors.hub, colors.white, (b.lit - b.self) * 0.55), colors.glow, hue), 1);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        } else if (kind === 'item' && b.img && b.ready) {
          const size = (1 + 0.14 * b.self) * grow, w = 24 * scale * size, h = 17 * scale * size, img = b.img;
          const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), cw = w / s, ch = h / s;
          ctx.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, x - w / 2, y - h / 2, w, h);
          ctx.strokeStyle = rgba(mix(colors.white, colors.glow, ring), 0.45 + 0.55 * ring);
          ctx.lineWidth = 1 + 0.5 * ring;
          ctx.strokeRect(x - w / 2 - 0.5, y - h / 2 - 0.5, w + 1, h + 1);
        } else if (kind === 'item' || kind === 'dot') {
          const small = kind === 'dot', r0 = (small ? 1.3 : 2.5) * scale * grow;
          if (ring < 1) {
            ctx.fillStyle = rgba(colors.leaf, (small ? 0.85 : 1) * (1 - ring));
            ctx.beginPath();
            ctx.arc(x, y, r0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (ring > 0) {
            ctx.strokeStyle = rgba(mix(colors.white, colors.glow, b.self), 0.9 * ring);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, r0 + (small ? 1.8 : 2.8) * scale * ring, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = rgba(mix(colors.ink, colors.glow, ring), 1);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x, y, 5 * scale * grow, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Hub names, which grow when their hub is lit, and the titles of lit items once the view is
      // close enough to read them.
      ctx.textBaseline = 'middle';
      const taken             = [];
      for (const i of order) {
        const b = bodies[i];
        if (b.node.kind !== 'hub' || off(X[i], Y[i]) || reveal[i] <= 0) continue;
        const on = Math.max(b.self, i === focus ? 1 : 0);
        const base = 11.5 + Math.min(2.5, Math.sqrt(b.links.length) * 0.5);
        const size = base + (20 - base) * on;
        ctx.globalAlpha = (1 - 0.55 * dim * (1 - b.lit)) * reveal[i];
        ctx.font = `${size.toFixed(1)}px ${mono}`;
        ctx.fillStyle = colors.text;
        const tx = X[i] + (5 + Math.min(4, Math.sqrt(b.links.length) * 0.9) + 4 * on) * scale / 2 + 6 + 2 * on, ty = Y[i];
        ctx.fillText(b.node.label, tx, ty);
        b.labelWidth = ctx.measureText(b.node.label).width;
        if (b.node.count !== undefined) {
          ctx.font = `${(9.5 + 1.5 * on).toFixed(1)}px ${mono}`;
          ctx.fillStyle = colors.soft;
          ctx.fillText(String(b.node.count), tx + b.labelWidth + 4, ty - size * 0.45);
        }
        taken.push([tx - 2, ty - size * 0.6, tx + b.labelWidth + 22, ty + size * 0.6]);
      }
      ctx.globalAlpha = 1;
      if (dim > 0.01 && (focus >= 0 || cam.k > 1.6)) {
        ctx.font = `12px ${sans}`;
        for (let i = 0; i < n; i++) {
          const b = bodies[i];
          if (b.lit < 0.02 || i === tipNode || b.node.kind !== 'item' || off(X[i], Y[i])) continue;
          const full = b.node.label, label = full.length > 22 ? `${full.slice(0, 21)}…` : full;
          const tw = ctx.measureText(label).width, tx = X[i] + 11, ty = Y[i];
          const box = [tx - 4, ty - 9, tx + tw + 4, ty + 9];
          if (taken.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
          taken.push(box);
          ctx.globalAlpha = b.lit;
          ctx.fillStyle = colors.plate;
          ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
          ctx.fillStyle = colors.text;
          ctx.fillText(label, tx, ty);
        }
        ctx.globalAlpha = 1;
      }

      // The hover card fades with its node, beside it, on whichever side has room.
      const shownTip = tipNode >= 0 && tipNode < n ? bodies[tipNode].self : 0;
      if (shownTip < 0.02) { if (!tip.hidden) tip.hidden = true; }
      else {
        tip.hidden = false;
        tip.style.opacity = Math.min(1, shownTip * 1.25).toFixed(3);
        const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 12 * scale;
        const right = X[tipNode] + gap + tw <= width - 8;
        const tx = right ? X[tipNode] + gap : Math.max(8, X[tipNode] - gap - tw);
        const ty = clamp(Y[tipNode] - th / 2, 8, height - th - 8);
        tip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
      }
    }

    function showTip(i        ) {
      const node = i >= 0 ? bodies[i].node : undefined;
      // A hub has its name on the canvas; it gets a card only once zoomed to, to say a click opens it.
      if (!node || node.kind === 'center' || (node.kind === 'hub' && !(focus === i && node.url && options.hubHint))) return;
      const title = document.createElement('strong');
      title.textContent = node.label;
      tip.replaceChildren(title);
      if (node.meta) { const meta = document.createElement('span'); meta.textContent = node.meta; tip.append(meta); }
      const hint = node.kind === 'hub' ? options.hubHint : options.openHint;
      if (hint) { const em = document.createElement('em'); em.textContent = hint; tip.append(em); }
      tipNode = i;
    }
    function setHover(i        ) {
      if (i === hover) return;
      hover = i;
      canvas.style.cursor = i >= 0 ? 'pointer' : drag ? 'grabbing' : 'grab';
      showTip(i);
      wake();
    }

    // What the pointer is on: the nearest node within reach, a hub's name counting as the hub.
    // What it is already on stays until the pointer is well clear of it, so passing over a node's
    // edge, or between a hub and its name, does not flicker.
    function hit(x        , y        ) {
      const scale = clamp(Math.sqrt(cam.k), 0.75, 1.5);
      const drawn = px.length === bodies.length;
      const at = (i        ) => drawn ? [px[i], py[i]] : [sx(bodies[i]), sy(bodies[i])];
      const reach = (b      ) => (b.node.kind === 'hub' ? 12 : b.node.kind === 'center' ? 10 : b.node.kind === 'dot' ? 6 : b.img && b.ready ? 15 : 9) * scale;
      const onName = (i        ) => {
        const b = bodies[i], [bx, by] = at(i);
        return b.node.kind === 'hub' && x >= bx - 9 && x <= bx + 14 + b.labelWidth + 16 && Math.abs(y - by) <= 12;
      };
      if (hover >= 0 && hover < bodies.length) {
        const [hx, hy] = at(hover);
        if (onName(hover) || Math.hypot(x - hx, y - hy) <= reach(bodies[hover]) * 1.7) return hover;
      }
      let best = -1, closest = Infinity;
      for (let i = bodies.length - 1; i >= 0; i--) {
        const [bx, by] = at(i), d = Math.hypot(x - bx, y - by);
        if (d <= reach(bodies[i]) && d < closest) { closest = d; best = i; }
      }
      if (best >= 0) return best;
      for (let i = bodies.length - 1; i >= 0; i--) if (onName(i)) return i;
      return -1;
    }
    function click(i        , touch         ) {
      if (i < 0) { setHover(-1); if (focus >= 0) setFocus(-1); return; }
      const node = bodies[i].node;
      if (node.kind === 'center') { setFocus(-1); return; }
      if (node.kind === 'hub') {
        if (focus === i && node.url) options.onOpen?.(node);
        else setFocus(i);
        return;
      }
      // A tap first shows what it is, as hovering would; the next tap opens it.
      if (touch && hover !== i) { setHover(i); return; }
      options.onOpen?.(node);
    }

    const point = (e                           ) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const [x, y] = point(e);
      drag = { id: e.pointerId, x, y, moved: false, node: hit(x, y), cam: { ...cam }, touch: e.pointerType !== 'mouse' };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const [x, y] = point(e);
      if (drag && e.pointerId === drag.id) {
        if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) > 4) { drag.moved = true; canvas.style.cursor = 'grabbing'; }
        if (!drag.moved) return;
        const b = drag.node >= 0 ? bodies[drag.node] : undefined;
        if (b && b.node.kind !== 'center') {
          b.pinned = true;
          moved = true; // the camera stays where the reader put things
          b.x = cam.x + (x - width / 2) / cam.k;
          b.y = cam.y + (y - height / 2) / cam.k;
        } else {
          cam.x = drag.cam.x - (x - drag.x) / cam.k;
          cam.y = drag.cam.y - (y - drag.y) / cam.k;
          flight = undefined;
          moved = true;
        }
        wake();
        return;
      }
      calm = performance.now();
      ambient = -1;
      if (intro) { setHover(-1); return; }
      if (e.pointerType === 'mouse') setHover(hit(x, y));
    });
    const letGo = (e              , cancelled         ) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = undefined;
      if (d.node >= 0) bodies[d.node].pinned = false;
      canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
      if (!cancelled && !d.moved) click(d.node, d.touch);
    };
    canvas.addEventListener('pointerup', e => letGo(e, false));
    canvas.addEventListener('pointercancel', e => letGo(e, true));
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) setHover(-1); });
    canvas.addEventListener('wheel', e => {
      if (options.wheel !== 'zoom' && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const [x, y] = point(e);
      zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
    }, { passive: false });
    back.addEventListener('click', () => setFocus(-1));
    const onKey = (e               ) => { if (e.key === 'Escape' && focus >= 0) setFocus(-1); };
    host.addEventListener('keydown', onKey);

    function resize() {
      const r = host.getBoundingClientRect();
      width = Math.max(1, r.width);
      height = Math.max(1, r.height);
      ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      stars = [];
      const count = Math.round((width * height) / 4200);
      for (let i = 0; i < count; i++) stars.push(unit(`x${i}`), unit(`y${i}`), unit(`r${i}`) > 0.88 ? 1.5 : 1);
      if (!moved) flyTo(target(), false);
      wake();
    }
    const resizer = new ResizeObserver(resize);
    resizer.observe(host);
    // Off screen or in a hidden tab, nothing is drawn.
    const watcher = 'IntersectionObserver' in window ? new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; if (visible) wake(); }) : undefined;
    watcher?.observe(host);
    const onVisibility = () => { visible = !document.hidden; if (visible) wake(); };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    load(data);

    return {
      highlight(id) { lit = id === undefined ? -1 : ids.get(id) ?? -1; wake(); },
      focus(id) { setFocus(id === undefined ? -1 : ids.get(id) ?? -1); },
      focused: () => focus >= 0 ? bodies[focus].node.id : undefined,
      update: load,
      zoom(factor) { zoomAt(width / 2, height / 2, factor); },
      fit() { if (focus >= 0) setFocus(-1); else fit(true); },
      destroy() {
        cancelAnimationFrame(frame);
        resizer.disconnect();
        watcher?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        host.removeEventListener('keydown', onKey);
        canvas.remove();
        tip.remove();
        back.remove();
      },
    };
  }

  // The public site: the graph's data sits in a JSON script beside it, and the numbered list of
  // hubs over the canvas lights up its hub on hover. A first click on a hub zooms to it, the next
  // follows the link to the tag page; without JavaScript the list is plain links.
  function autoMount() {
    document.querySelectorAll             ('[data-graph]').forEach(box => {
      const source = document.getElementById(box.dataset.graph || '');
      let data           ;
      try { data = JSON.parse(source?.textContent || ''); } catch { return; }
      const stage = box.querySelector             ('.graph-stage') || box;
      const list = box.querySelector             ('.graph-index');
      const hubs = Array.prototype.slice.call(box.querySelectorAll('[data-hub]'))                 ;
      const handle = mount(stage, data, {
        wheel: 'page', label: box.dataset.label, backLabel: box.dataset.back, openHint: box.dataset.open, hubHint: box.dataset.hubHint,
        onOpen: node => { if (node.url) window.location.href = node.url; },
        onFocus: id => hubs.forEach(a => a.classList.toggle('active', a.dataset.hub === id)),
        inset: () => {
          if (!list) return {};
          const a = list.getBoundingClientRect(), b = stage.getBoundingClientRect();
          return a.width > b.width * 0.6 ? { bottom: b.bottom - a.top } : { left: a.right - b.left };
        },
      });
      box.classList.add('ready');
      hubs.forEach(a => {
        const id = a.dataset.hub ;
        a.addEventListener('mouseenter', () => handle.highlight(id));
        a.addEventListener('mouseleave', () => handle.highlight());
        a.addEventListener('focus', () => handle.highlight(id));
        a.addEventListener('blur', () => handle.highlight());
        a.addEventListener('click', e => { if (handle.focused() !== id) { e.preventDefault(); handle.focus(id); } });
      });
    });
  }

  return { mount, autoMount };
})().autoMount();
