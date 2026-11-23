// 灵感图谱 on a post page (inspire.go): the post's neighbours as a map beside the article. A line
// across the window marks where reading is; the posts linked from the paragraph at the line light
// up and the map moves to them. Wide windows only (1280px and up, inspire.css); closing it is
// remembered for this browser. Everything it shows is in #inspire-data: no requests.
(function () {
  var data;
  try { data = JSON.parse(document.getElementById('inspire-data').textContent); } catch (e) { return; }
  if (!data || !data.nodes || data.nodes.length < 2) return;
  var root = document.documentElement, labels = data.labels || {};
  var wide = window.matchMedia('(min-width: 1280px)');
  var LINE = 0.4, SVG = 'http://www.w3.org/2000/svg';

  // Where each thing sits: a small force layout run a fixed number of steps from a spiral, so a
  // page draws the same map each time (the reader's panel in 捎个信 lays out the same way).
  function layout(ids, edges, spacing) {
    var n = ids.length, index = {}, pos = [], i, j, step;
    ids.forEach(function (id, k) {
      index[id] = k;
      var r = spacing * 0.7 * Math.sqrt(k + 0.5), a = k * 2.399963;
      pos.push({ x: k === 0 ? 0 : r * Math.cos(a), y: k === 0 ? 0 : r * Math.sin(a) });
    });
    var springs = edges.map(function (e) { return [index[e[0]], index[e[1]]]; }).filter(function (e) { return e[0] !== undefined && e[1] !== undefined; });
    for (step = 0; step < 220; step++) {
      var cool = 1 - step / 240, force = pos.map(function () { return { x: 0, y: 0 }; });
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d2 = dx * dx / 2.2 + dy * dy;
        if (d2 < 1) { dx = (i - j) || 1; dy = 1; d2 = 2; }
        var push = spacing * spacing / d2 * 0.05;
        force[i].x += dx * push; force[i].y += dy * push; force[j].x -= dx * push; force[j].y -= dy * push;
      }
      springs.forEach(function (s) {
        var a = s[0], b = s[1], dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y, d = Math.hypot(dx, dy) || 1, pull = (d - spacing) / d * 0.08;
        force[a].x += dx * pull; force[a].y += dy * pull; force[b].x -= dx * pull; force[b].y -= dy * pull;
      });
      for (i = 1; i < n; i++) { // the post itself stays in the middle
        force[i].x -= pos[i].x * 0.01; force[i].y -= pos[i].y * 0.01;
        var f = Math.hypot(force[i].x, force[i].y), cap = 30 * cool, k = f > cap ? cap / f : 1;
        pos[i].x += force[i].x * k; pos[i].y += force[i].y * k;
      }
    }
    var out = {};
    ids.forEach(function (id, k) { out[id] = { x: Math.round(pos[k].x), y: Math.round(pos[k].y) }; });
    return out;
  }

  var byId = {}, byPath = {};
  var pathOf = function (url) { try { return new URL(url, location.href).pathname.replace(/\/index\.html$/, '/'); } catch (e) { return ''; } };
  data.nodes.forEach(function (n) { byId[n.id] = n; if (n.url && n.kind !== 'tag') byPath[pathOf(n.url)] = n.id; });
  var where = layout(data.nodes.map(function (n) { return n.id; }), data.edges, 150);

  // The links in the text to posts on the map, each with its paragraph.
  var anchors = [];
  document.querySelectorAll('.post .content a[href]').forEach(function (a) {
    var id = byPath[pathOf(a.getAttribute('href'))];
    if (id) anchors.push({ el: a, id: id, block: a.closest('p, li, blockquote, h2, h3, h4, td') || a });
  });
  // Paragraphs that mention things on the map without a link (inspire.go paragraphHints) are read
  // the same way; a paragraph with a link goes by its links.
  var linkedBlocks = anchors.map(function (a) { return a.block; });
  Object.keys(data.paras || {}).forEach(function (pid) {
    var block = document.getElementById(pid);
    if (!block || !block.closest('.post .content') || linkedBlocks.indexOf(block) >= 0) return;
    var hints = data.paras[pid].filter(function (h) { return byId[h.node]; });
    if (hints.length) anchors.push({ el: block, id: hints[0].node, block: block, hints: hints });
  });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  var icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

  // The panel, the button that opens it and the reading line.
  var panel = el('aside', 'inspire'); panel.setAttribute('aria-label', labels.title || '');
  var head = el('div', 'inspire-head'), tabs = el('div'); tabs.setAttribute('role', 'tablist');
  var tabGraph = el('button', '', labels.graph), tabList = el('button', '', labels.list);
  [tabGraph, tabList].forEach(function (t) { t.type = 'button'; t.setAttribute('role', 'tab'); tabs.appendChild(t); });
  var close = el('button', 'inspire-close'); close.type = 'button'; close.setAttribute('aria-label', labels.close || ''); close.title = labels.close || '';
  close.innerHTML = icon + '<path d="M18 6 6 18M6 6l12 12"/></svg>';
  head.appendChild(tabs); head.appendChild(close); panel.appendChild(head);
  var stage = el('div', 'inspire-stage'), plane = el('div', 'inspire-plane'), lines = document.createElementNS(SVG, 'svg');
  lines.setAttribute('class', 'inspire-edges'); lines.setAttribute('aria-hidden', 'true');
  plane.appendChild(lines); stage.appendChild(plane); panel.appendChild(stage);
  var list = el('ol', 'inspire-list'); list.hidden = true; panel.appendChild(list);
  var toggle = el('button', 'inspire-toggle'); toggle.type = 'button'; toggle.title = labels.open || '';
  toggle.innerHTML = icon + '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-5.5 6.5M12 11l5.5 6.5"/></svg>';
  toggle.appendChild(el('span', '', labels.title));
  var line = el('div', 'inspire-line'); line.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel); document.body.appendChild(toggle); document.body.appendChild(line);

  // The map's nodes and lines, drawn once; reading only changes their classes.
  var nodeEls = {}, edgeEls = [];
  data.edges.forEach(function (e) {
    var p = where[e[0]], q = where[e[1]];
    if (!p || !q) return;
    var l = document.createElementNS(SVG, 'line');
    l.setAttribute('x1', p.x); l.setAttribute('y1', p.y); l.setAttribute('x2', q.x); l.setAttribute('y2', q.y);
    lines.appendChild(l); edgeEls.push({ el: l, a: e[0], b: e[1] });
  });
  data.nodes.forEach(function (n) {
    // Kinds are prefixed: the site already has .related (接着读) and .tag classes.
    var node = el(n.kind === 'self' ? 'span' : 'a', 'inspire-node k-' + n.kind, n.kind === 'tag' ? '#' + n.title : n.title);
    if (n.url && n.kind !== 'self') node.href = n.url;
    node.title = n.kind === 'self' ? (labels.here || '') : (n.why ? n.why + ' · ' : '') + n.title;
    node.style.left = where[n.id].x + 'px'; node.style.top = where[n.id].y + 'px';
    plane.appendChild(node); nodeEls[n.id] = node;
  });
  data.nodes.forEach(function (n) {
    if (n.kind === 'self') return;
    var li = el('li'), a = el('a');
    a.href = n.url;
    a.appendChild(el('small', '', n.kind === 'tag' ? '#' : n.why || ''));
    a.appendChild(el('b', '', n.title));
    if (n.text) a.appendChild(el('p', '', n.text));
    li.appendChild(a); li.dataset.id = n.id; list.appendChild(li);
  });

  // lead is the lit node's id and the card's reason, so a new reason redraws the card.
  var card = null, cardLine = null, lead = null, camera = { x: 0, y: 0, s: 1 };
  // why, when given, is what the card says instead of the post's own reason (这段提到「…」).
  function draw(litIds, leadId, why) {
    var near = {};
    edgeEls.forEach(function (e) {
      var on = litIds.indexOf(e.a) >= 0 || litIds.indexOf(e.b) >= 0;
      e.el.setAttribute('class', on && leadId ? 'on' : '');
      if (on) { near[e.a] = true; near[e.b] = true; }
    });
    data.nodes.forEach(function (n) {
      var c = 'inspire-node k-' + n.kind;
      if (leadId) c += litIds.indexOf(n.id) >= 0 ? ' lit' : near[n.id] ? ' near' : ' faint';
      if (n.id === leadId) c += ' lead';
      nodeEls[n.id].className = c;
    });
    list.querySelectorAll('li').forEach(function (li) { li.className = litIds.indexOf(li.dataset.id) >= 0 && leadId ? 'lit' : ''; });
    anchors.forEach(function (a) { a.el.classList.toggle(a.hints ? 'inspire-para' : 'inspire-at', Boolean(leadId) && a === current); });
    var key = leadId ? leadId + '\n' + (why || '') : null;
    if (key !== lead) {
      lead = key;
      if (card) { card.remove(); card = null; }
      if (cardLine) { cardLine.remove(); cardLine = null; }
      var n = byId[leadId];
      if (n && (n.text || n.image)) {
        // The card hangs above or below the lead, on the side away from the post itself: the lead
        // is in the middle of the panel, so a card beside it would run past the panel's edge.
        var p = where[leadId], dx = p.x, d = Math.hypot(p.x, p.y) || 1, side = p.y >= 0 ? 1 : -1;
        var at = { x: Math.round(p.x + Math.max(-60, Math.min(60, dx / d * 60))), y: Math.round(p.y + side * (n.image ? 160 : 110)) };
        card = el('a', 'inspire-card'); card.href = n.url;
        if (n.image) {
          // The cover across the card's top; a cover that does not load leaves no gap.
          var img = el('img', 'inspire-card-image'); img.src = n.image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          img.addEventListener('error', function () { img.remove(); });
          card.appendChild(img); card.classList.add('pictured');
        }
        card.appendChild(el('b', '', n.title)); card.appendChild(el('p', '', n.text));
        var small = el('small', '', why || n.why || ''); small.appendChild(el('i', '', '→')); card.appendChild(small);
        card.style.left = at.x + 'px'; card.style.top = at.y + 'px';
        plane.appendChild(card);
        cardLine = document.createElementNS(SVG, 'line');
        cardLine.setAttribute('x1', p.x); cardLine.setAttribute('y1', p.y); cardLine.setAttribute('x2', at.x); cardLine.setAttribute('y2', at.y);
        cardLine.setAttribute('pathLength', '1'); cardLine.setAttribute('class', 'to-card'); // not .card: the site has one
        lines.appendChild(cardLine);
      }
    }
    place();
  }
  function place() {
    var r = stage.getBoundingClientRect(), w = r.width, h = r.height;
    var leadId = lead && lead.split('\n')[0];
    if (leadId && where[leadId]) {
      // The node being read sits right on the reading line.
      var y = window.innerHeight * LINE - r.top;
      camera = { x: w / 2 - where[leadId].x, y: (y > 40 && y < h - 40 ? y : h * LINE) - where[leadId].y, s: 1 };
    } else {
      var xs = [], ys = [];
      Object.keys(where).forEach(function (k) { xs.push(where[k].x); ys.push(where[k].y); });
      var left = Math.min.apply(null, xs), right = Math.max.apply(null, xs), top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
      // Small enough to show it all, not so small that the words cannot be read.
      var s = Math.max(0.75, Math.min(1, w / (right - left + 260), h / (bottom - top + 160)));
      camera = { x: w / 2 - (left + right) / 2 * s, y: h / 2 - (top + bottom) / 2 * s, s: s };
    }
    plane.style.transform = 'translate(' + camera.x + 'px, ' + camera.y + 'px) scale(' + camera.s + ')';
  }

  // The link being read: the one the line crosses, else the nearest within reach, those just
  // read before those to come. Between links the last one stays lit; above the first, none.
  var current = null, frame = 0;
  function measure() {
    frame = 0;
    if (!root.classList.contains('inspire-on')) return;
    var at = window.innerHeight * LINE, reach = window.innerHeight * 0.6, best = null, score = Infinity, first = Infinity;
    anchors.forEach(function (a) {
      var r = a.el.getBoundingClientRect();
      if (!r.height) return;
      first = Math.min(first, r.top);
      var d = r.top <= at && r.bottom >= at ? 0 : r.bottom < at ? at - r.bottom : (r.top - at) * 1.6;
      if (d <= reach && d < score) { best = a; score = d; }
    });
    if (best) current = best;
    else if (at < first - reach) current = null;
    var lit = [], why = '';
    if (current && current.hints) {
      current.hints.forEach(function (h) { lit.push(h.node); });
      why = (labels.mentions || '{}').replace('{}', current.hints[0].term);
    } else if (current) {
      lit.push(current.id);
      anchors.forEach(function (a) { if (a.block === current.block && lit.indexOf(a.id) < 0) lit.push(a.id); });
    }
    draw(lit, current ? current.id : null, why);
  }
  function later() { if (!frame) frame = requestAnimationFrame(measure); }

  function setWidth() { root.style.setProperty('--inspire-w', Math.max(360, Math.min(640, window.innerWidth - 768 - 120)) + 'px'); }
  function open(on, keep) {
    root.classList.toggle('inspire-on', on && wide.matches);
    if (keep) { try { localStorage.setItem('inspire', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ } }
    if (on) { setWidth(); measure(); place(); }
  }
  function show(tab) {
    tabGraph.setAttribute('aria-selected', String(tab === 'graph')); tabList.setAttribute('aria-selected', String(tab === 'list'));
    stage.hidden = tab !== 'graph'; list.hidden = tab !== 'list';
    if (tab === 'graph') place();
  }
  tabGraph.addEventListener('click', function () { show('graph'); });
  tabList.addEventListener('click', function () { show('list'); });
  close.addEventListener('click', function () { open(false, true); });
  toggle.addEventListener('click', function () { open(true, true); });
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', function () { setWidth(); open(root.classList.contains('inspire-on') || wanted(), false); later(); });
  function wanted() { try { return localStorage.getItem('inspire') !== 'off'; } catch (e) { return true; } }
  root.classList.add('inspire-ready');
  show('graph');
  open(wanted(), false);
})();
