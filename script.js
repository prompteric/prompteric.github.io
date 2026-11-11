(function () {
  var body = document.body;
  function toast(message) {
    var note = document.createElement('div');
    note.className = 'toast'; note.setAttribute('role', 'status'); note.textContent = message;
    document.body.appendChild(note);
    setTimeout(function () { note.remove(); }, 1800);
  }

  // Light and dark: the page opens in the saved theme (set in <head> before it is drawn); the
  // header button switches and remembers it for this browser.
  var root = document.documentElement, themeButton = document.querySelector('.theme');
  function labelTheme() {
    var label = root.dataset.theme === 'dark' ? themeButton.dataset.light : themeButton.dataset.dark;
    themeButton.setAttribute('aria-label', label); themeButton.title = label;
  }
  if (themeButton) {
    labelTheme();
    themeButton.addEventListener('click', function () {
      var dark = root.dataset.theme !== 'dark';
      if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) { /* storage blocked */ }
      labelTheme();
    });
  }

  // Paragraph links: each paragraph and heading of a post has a stable id; the mark copies its address.
  document.querySelectorAll('.content > p[id], .content > h2[id], .content > h3[id], .content > h4[id], .content > blockquote[id]').forEach(function (el) {
    var a = document.createElement('a');
    a.className = 'anchor'; a.href = '#' + el.id; a.textContent = '\u00b6';
    a.setAttribute('aria-label', body.dataset.copyLink || '');
    a.title = body.dataset.copyLink || '';
    a.addEventListener('click', function (event) {
      event.preventDefault();
      history.replaceState(null, '', '#' + el.id);
      var url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(body.dataset.copied || url); }, function () {});
    });
    el.insertBefore(a, el.firstChild);
  });

  // Table of contents: marks the section being read.
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var targets = tocLinks.map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); });
    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
      var current = -1;
      targets.forEach(function (t, i) { if (t && (visible.has(t) || t.getBoundingClientRect().top < 100)) current = i; });
      tocLinks.forEach(function (a, i) { a.classList.toggle('active', i === current); });
    }, { rootMargin: '-80px 0px -60% 0px' });
    targets.forEach(function (t) { if (t) observer.observe(t); });
  }

  // Search: loads search.json once and matches every word against titles, tags, summaries and text.
  var box = document.getElementById('search');
  if (!box) return;
  var input = box.querySelector('input');
  var status = box.querySelector('.search-status');
  var results = box.querySelector('.post-list');
  var index = null;
  function snippet(text, term) {
    var at = text.toLowerCase().indexOf(term);
    if (at < 0) return document.createTextNode(text.slice(0, 120));
    var start = Math.max(0, at - 40);
    var span = document.createElement('span');
    span.appendChild(document.createTextNode((start ? '\u2026' : '') + text.slice(start, at)));
    var mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + term.length);
    span.appendChild(mark);
    span.appendChild(document.createTextNode(text.slice(at + term.length, at + term.length + 80) + '\u2026'));
    return span;
  }
  function render(hit, terms) {
    var e = hit.entry;
    var li = document.createElement('li'); li.className = 'post-item';
    var div = document.createElement('div');
    var meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = e.date || '';
    var h2 = document.createElement('h2'); var a = document.createElement('a'); a.href = e.url; a.textContent = e.title; h2.appendChild(a);
    var p = document.createElement('p'); p.className = 'excerpt';
    var inText = terms.filter(function (t) { return e.description.toLowerCase().indexOf(t) < 0 && e.text.toLowerCase().indexOf(t) >= 0; })[0];
    p.appendChild(inText ? snippet(e.text, inText) : document.createTextNode(e.description));
    div.appendChild(meta); div.appendChild(h2); div.appendChild(p);
    li.appendChild(div);
    return li;
  }
  function score(entry, terms) {
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i], s = 0;
      if (entry.title.toLowerCase().indexOf(t) >= 0) s += 8;
      if (entry.tags.some(function (tag) { return tag.toLowerCase().indexOf(t) >= 0; })) s += 4;
      if (entry.description.toLowerCase().indexOf(t) >= 0) s += 2;
      if (entry.text.toLowerCase().indexOf(t) >= 0) s += 1;
      if (!s) return 0;
      total += s;
    }
    return total;
  }
  function run() {
    var query = input.value.trim();
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    history.replaceState(null, '', query ? '?q=' + encodeURIComponent(query) : location.pathname);
    if (!terms.length) { results.replaceChildren(); status.textContent = box.dataset.hint; return; }
    (index ? Promise.resolve(index) : fetch(box.dataset.index).then(function (r) { return r.json(); })).then(function (data) {
      index = data;
      var hits = data.map(function (entry) { return { entry: entry, score: score(entry, terms) }; })
        .filter(function (h) { return h.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      status.textContent = hits.length ? box.dataset.found.replace('{n}', hits.length) : box.dataset.empty;
      results.replaceChildren.apply(results, hits.slice(0, 50).map(function (h) { return render(h, terms); }));
    }, function () { status.textContent = box.dataset.failed; });
  }
  var timer;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 150); });
  box.querySelector('form').addEventListener('submit', function (event) { event.preventDefault(); run(); });
  input.value = new URLSearchParams(location.search).get('q') || '';
  run();
})();
// Draw-on: a post's highlights and hand-drawn notes draw themselves as they first come into view.
(function () {
  var content = document.querySelector('.post .content');
  if (content) (function drawOn(root            , selector        )             {
  if (typeof IntersectionObserver === 'undefined' || typeof Element.prototype.animate !== 'function'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  // Where an arrow starts drawing: at the note, by the direction the arrow points (n: the note
  // is below and the arrow points up, so it draws from the bottom).
  const start                         = {
    n: 'inset(100% 0 0 0)', s: 'inset(0 0 100% 0)', e: 'inset(0 100% 0 0)', w: 'inset(0 0 0 100%)',
    ne: 'inset(100% 100% 0 0)', nw: 'inset(100% 0 0 100%)', se: 'inset(0 100% 100% 0)', sw: 'inset(0 0 100% 100%)',
  };
  const waiting = new Map                      ();
  // 划线: the shape (from its class), and the SVG it is drawn with, to make the drawing copy from.
  const shapeOf = (el         ) => /\bmk-(underline|circle|box)\b/.exec(el.className)?.[1];
  const svgOf = (image        ) => {
    const match = /^url\("?data:image\/svg\+xml,(.*?)"?\)$/.exec(image);
    if (!match) return undefined;
    try { return decodeURIComponent(match[1]); } catch { return undefined; }
  };
  // A waiting 划线's SVG, read before it was hidden.
  const drawn = new Map                 ();
  let copies = 0;
  // The SVG drawing itself after a delay (s): a ring or a box along its path, an underline wiped on
  // from the left. A comment makes each copy a new image, with its own clock.
  const drawing = (svg        , shape        , delay        ) => {
    const timing = `begin='${delay}s' dur='0.6s' fill='freeze' calcMode='spline' keyTimes='0;1' keySplines='0 0 .58 1'`;
    const body = shape === 'underline'
      ? svg.replace('<path ', `<defs><clipPath id='wipe'><rect x='-4' y='-10' width='0' height='120'><animate attributeName='width' from='0' to='108' ${timing}/></rect></clipPath></defs><path clip-path='url(#wipe)' `)
      : svg.replace('<path ', "<path pathLength='1' stroke-dasharray='1' stroke-dashoffset='1' ").replace(/\/>(\s*<\/svg>)$/, `><animate attributeName='stroke-dashoffset' from='1' to='0' ${timing}/></path>$1`);
    return `url("data:image/svg+xml,${encodeURIComponent(body.replace('>', `><!--${++copies}-->`)).replace(/'/g, '%27')}")`;
  };
  const observer = new IntersectionObserver(entries => {
    const due = entries.filter(e => e.isIntersecting && waiting.has(e.target)).map(e => e.target);
    due.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    due.forEach((el, i) => {
      const animations = waiting.get(el) ;
      waiting.delete(el);
      observer.unobserve(el);
      const shape = shapeOf(el), svg = drawn.get(el);
      drawn.delete(el);
      if (shape && svg && el instanceof HTMLElement) {
        // Hidden until now; drawn by the animating copy, then the mark as it is.
        animations.forEach(a => a.cancel());
        const copy = drawing(svg, shape, 0.16 * i);
        el.animate([{ backgroundImage: copy }, { backgroundImage: copy }], { duration: 160 * i + 700 });
        return;
      }
      animations.forEach(a => {
        a.currentTime = -160 * i;
        a.play();
        a.finished.then(() => a.cancel(), () => {});
      });
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  root.querySelectorAll(selector).forEach(el => {
    if (!(el instanceof HTMLElement) || waiting.has(el)) return;
    // A 划线 waits unseen (its lines are its background); it is drawn when it comes into view.
    const svg = shapeOf(el) && svgOf(getComputedStyle(el).backgroundImage);
    if (svg) {
      drawn.set(el, svg);
      const hidden = el.animate([{ backgroundImage: 'none' }, { backgroundImage: 'none' }], { duration: 1, fill: 'both' });
      hidden.pause();
      waiting.set(el, [hidden]);
      observer.observe(el);
      return;
    }
    const animations = [el.animate([
      { backgroundSize: '0% 100%', boxShadow: 'none' },
      { backgroundSize: '100% 100%', boxShadow: getComputedStyle(el).boxShadow },
    ], { duration: 560, easing: 'cubic-bezier(.3, .7, .4, 1)', fill: 'both' })];
    const side = /\bann-(n|ne|e|se|s|sw|w|nw)\b/.exec(el.className)?.[1];
    if (side && el.dataset.note) {
      animations.push(el.animate([{ clipPath: start[side] }, { clipPath: 'inset(0 0 0 0)' }],
        { pseudoElement: '::before', delay: 440, duration: 380, easing: 'ease-in-out', fill: 'both' }));
      animations.push(el.animate([{ clipPath: 'inset(-40% 100% -40% -10%)' }, { clipPath: 'inset(-40% -10% -40% -10%)' }],
        { pseudoElement: '::after', delay: 780, duration: Math.min(1400, 160 + 70 * el.dataset.note.length), easing: 'linear', fill: 'both' }));
    }
    animations.forEach(a => a.pause());
    waiting.set(el, animations);
    observer.observe(el);
  });
  return () => {
    observer.disconnect();
    waiting.forEach(animations => animations.forEach(a => a.cancel()));
    waiting.clear();
    drawn.clear();
  };
})(content, '.ann, .mk, mark');
})();
