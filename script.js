(function () {
  var body = document.body;
  document.documentElement.classList.add('scripted');
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
    a.className = 'anchor'; a.href = '#' + el.id;
    a.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
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

  // Contents: in the side and folded into the sheet on narrower screens, both mark the section
  // being read, the last heading above 140px. The dock (back to top, contents) shows after 600px.
  var tocLists = Array.prototype.slice.call(document.querySelectorAll('.toc'));
  var dock = document.querySelector('.dock');
  var heads = tocLists.length ? Array.prototype.map.call(tocLists[0].querySelectorAll('a'), function (a) {
    return document.getElementById(decodeURIComponent(a.hash.slice(1)));
  }) : [];
  var scrollFrame = 0;
  function onScroll() {
    scrollFrame = 0;
    var current = -1;
    heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 140) current = i; });
    tocLists.forEach(function (list) {
      Array.prototype.forEach.call(list.querySelectorAll('a'), function (a, i) { a.classList.toggle('active', i === current); });
    });
    if (dock) dock.classList.toggle('show', window.scrollY > 600);
  }
  if (heads.length || dock) {
    window.addEventListener('scroll', function () { if (!scrollFrame) scrollFrame = requestAnimationFrame(onScroll); }, { passive: true });
    onScroll();
  }
  // The dock's contents button opens the folded contents in the sheet.
  var tocButton = document.querySelector('.dock .toc-btn'), tocIn = document.getElementById('toc-in');
  if (tocButton && tocIn) tocButton.addEventListener('click', function () { tocIn.open = true; });

  // The end of a post: copy its address, share it (the system sheet where there is one, else copy),
  // and cite it (a panel with the citation and a copy button).
  function copied(button, text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      var label = button.querySelector('span') || button, before = label.textContent;
      label.textContent = button.dataset.done || before;
      setTimeout(function () { label.textContent = before; }, 1600);
    }, function () {});
  }
  var pageURL = function () { return location.href.split('#')[0]; };
  var copyPage = document.querySelector('[data-copy-page]');
  if (copyPage) copyPage.addEventListener('click', function () { copied(copyPage, pageURL()); });
  var share = document.querySelector('[data-share]');
  if (share) share.addEventListener('click', function () {
    if (navigator.share) navigator.share({ title: document.title, url: pageURL() }).catch(function () {});
    else copied(share, pageURL());
  });
  var citeButton = document.querySelector('.acts [aria-controls="cite-panel"]'), citePanel = document.getElementById('cite-panel');
  if (citeButton && citePanel) citeButton.addEventListener('click', function () {
    var open = citeButton.getAttribute('aria-expanded') !== 'true';
    citeButton.setAttribute('aria-expanded', String(open));
    citePanel.hidden = !open;
  });
  var copyCite = document.querySelector('[data-copy-cite]');
  if (copyCite) copyCite.addEventListener('click', function () {
    var code = citePanel && citePanel.querySelector('code');
    if (code) copied(copyCite, code.textContent);
  });

  // 文内引用: a link to another paragraph of the same post opens that paragraph in place, in a box
  // by the link (a sheet at the bottom on a phone), with a way to go there and come back. Without
  // this script it is a plain jump to the paragraph's id.
  (function () {
    var refs = Array.prototype.filter.call(document.querySelectorAll('a.xref[data-xref]'), function (a) { return document.getElementById(a.dataset.xref); });
    if (!refs.length) return;
    var phone = matchMedia('(max-width: 640px)'), still = matchMedia('(prefers-reduced-motion: reduce)');
    var header = document.querySelector('.site-header');
    var made = 0, open = null, frame = 0, back = null;
    refs.forEach(function (a) {
      a.setAttribute('aria-haspopup', 'dialog'); a.setAttribute('aria-expanded', 'false'); a.setAttribute('aria-controls', 'xref-box');
    });

    var box = document.createElement('div');
    box.className = 'xref-box'; box.id = 'xref-box'; box.hidden = true;
    box.setAttribute('role', 'dialog');
    var content = document.createElement('div');
    content.className = 'xref-body'; content.tabIndex = -1;
    var actions = document.createElement('div');
    actions.className = 'xref-actions';
    var jumpButton = document.createElement('button');
    jumpButton.type = 'button'; jumpButton.className = 'xref-jump'; jumpButton.textContent = body.dataset.xrefJump || '';
    var closeButton = document.createElement('button');
    closeButton.type = 'button'; closeButton.className = 'xref-close'; closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', body.dataset.xrefClose || ''); closeButton.title = body.dataset.xrefClose || '';
    actions.appendChild(jumpButton); actions.appendChild(closeButton);
    box.appendChild(content); box.appendChild(actions);
    var backdrop = document.createElement('div');
    backdrop.className = 'xref-backdrop'; backdrop.hidden = true;
    body.appendChild(backdrop); body.appendChild(box);

    // What the box shows: the paragraph, or a heading with the paragraph after it. Copies keep no
    // ids (they would be duplicates) and no paragraph marks; links in them to this post go there.
    function copyOf(target) {
      var nodes = [target], next = target.nextElementSibling;
      if (/^H[1-6]$/.test(target.tagName) && next && !/^H[1-6]$/.test(next.tagName)) nodes.push(next);
      var fragment = document.createDocumentFragment();
      nodes.forEach(function (node) {
        var copy = node.cloneNode(true);
        copy.removeAttribute('id'); copy.removeAttribute('tabindex'); copy.classList.remove('xref-flash');
        copy.querySelectorAll('[id]').forEach(function (e) { e.removeAttribute('id'); });
        copy.querySelectorAll('a.anchor').forEach(function (e) { e.remove(); });
        copy.querySelectorAll('a.xref').forEach(function (e) { e.removeAttribute('aria-haspopup'); e.removeAttribute('aria-expanded'); e.removeAttribute('aria-controls'); });
        fragment.appendChild(copy);
      });
      return fragment;
    }
    function nameOf(target) {
      var text = (target.textContent || '').replace(/¶/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 24) text = text.slice(0, 24) + '…';
      var label = body.dataset.xref || '';
      return label && text ? label + ': ' + text : label || text;
    }
    function topLimit() { return Math.max(16, header ? header.getBoundingClientRect().bottom + 8 : 16); }

    // Below the link, or above it when there is more room there; within the window, 16px from its sides.
    function place() {
      if (!open || open.sheet) return;
      var r = open.link.getBoundingClientRect(), gap = 8, margin = 16, top = topLimit();
      var width = document.documentElement.clientWidth, height = window.innerHeight;
      if (r.bottom < top || r.top > height) { close(false); return; } // scrolled out of view
      var below = height - margin - r.bottom - gap, above = r.top - gap - top;
      var down = open.natural <= below || below >= above;
      box.style.maxHeight = Math.min(360, Math.max(120, down ? below : above)) + 'px';
      var h = box.offsetHeight;
      box.style.top = (down ? r.bottom + gap : r.top - gap - h) + 'px';
      box.style.left = Math.max(margin, Math.min(r.left, width - margin - box.offsetWidth)) + 'px';
      box.dataset.side = down ? 'below' : 'above';
    }
    // Scrolling the page moves the link; scrolling inside the box does not.
    function follow(e) { if (e && e.target instanceof Node && box.contains(e.target)) return; if (open && !frame) frame = requestAnimationFrame(function () { frame = 0; place(); }); }

    function show(link, keyboard) {
      if (open) close(false);
      var target = document.getElementById(link.dataset.xref);
      if (!target) return false;
      content.replaceChildren(copyOf(target));
      box.setAttribute('aria-label', nameOf(target));
      var sheet = phone.matches;
      box.classList.toggle('sheet', sheet);
      box.style.top = box.style.left = box.style.maxHeight = '';
      box.hidden = false; backdrop.hidden = !sheet;
      content.scrollTop = 0;
      open = { link: link, target: target, sheet: sheet, keyboard: keyboard, natural: Math.min(box.offsetHeight, 360) };
      link.setAttribute('aria-expanded', 'true');
      place();
      if (keyboard || sheet) content.focus({ preventScroll: true });
      return true;
    }
    function close(returnFocus) {
      if (!open) return;
      var was = open; open = null;
      was.link.setAttribute('aria-expanded', 'false');
      var inside = box.contains(document.activeElement);
      box.hidden = true; backdrop.hidden = true;
      content.replaceChildren();
      if (returnFocus !== false && (was.keyboard || was.sheet || inside)) was.link.focus({ preventScroll: true });
    }

    function flash(el) {
      el.classList.remove('xref-flash'); void el.offsetWidth; el.classList.add('xref-flash');
      setTimeout(function () { el.classList.remove('xref-flash'); }, 1600);
    }
    // Going to the paragraph is a step in the history, so the browser's back button, like the
    // button left at the bottom, returns to the link.
    function jump(target, from) {
      if (!from.id) from.id = 'xref-from-' + (++made);
      close(false);
      history.pushState({ xrefFrom: from.id }, '', '#' + target.id);
      target.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'center' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      flash(target);
      showBack(from);
    }
    function showBack(from) {
      if (!back) {
        back = document.createElement('button');
        back.type = 'button'; back.className = 'xref-back';
        back.textContent = '↩ ' + (body.dataset.xrefBack || '');
        back.addEventListener('click', function () {
          var link = document.getElementById(back.dataset.from);
          if (history.state && history.state.xrefFrom === back.dataset.from) history.back();
          else if (link) returnTo(link);
        });
        body.appendChild(back);
      }
      back.dataset.from = from.id; back.hidden = false;
    }
    function returnTo(link) {
      if (back) back.hidden = true;
      var r = link.getBoundingClientRect();
      if (r.top < topLimit() || r.bottom > window.innerHeight) link.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'center' });
      link.focus({ preventScroll: true });
      flash(link);
    }
    window.addEventListener('popstate', function () {
      close(false);
      if (!back || back.hidden) return;
      var link = document.getElementById(back.dataset.from);
      if (link) requestAnimationFrame(function () { returnTo(link); });
      else back.hidden = true;
    });

    document.addEventListener('click', function (e) {
      var inBox = e.target.closest && e.target.closest('.xref-box a[data-xref]');
      if (inBox) {
        var to = document.getElementById(inBox.dataset.xref);
        if (to && open) { e.preventDefault(); jump(to, open.link); }
        return;
      }
      var a = e.target.closest && e.target.closest('a.xref[data-xref]');
      if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (open && open.link === a) { e.preventDefault(); close(); return; }
      if (show(a, e.detail === 0)) e.preventDefault();
    });
    jumpButton.addEventListener('click', function () { if (open) jump(open.target, open.link); });
    closeButton.addEventListener('click', function () { close(); });
    backdrop.addEventListener('click', function () { close(); });
    // A press outside closes the box and still does what it does; the sheet closes on its backdrop's click.
    document.addEventListener('pointerdown', function (e) {
      if (open && !open.sheet && !box.contains(e.target) && !open.link.contains(e.target)) close(false);
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
    });
    // Tabbing out of the box closes it, unless back to the link it came from.
    box.addEventListener('focusout', function (e) {
      if (open && e.relatedTarget && !box.contains(e.relatedTarget) && e.relatedTarget !== open.link) close(false);
    });
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    window.addEventListener('resize', function () { if (open && open.sheet !== phone.matches) close(false); else follow(); });
  })();

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
    // A 括号 is its ::after, wiped on down the page from its top, block after block.
    if (/(^|\s)bk(\s|$)/.test(el.className)) {
      const wipe = el.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { pseudoElement: '::after', duration: 600, easing: 'cubic-bezier(0, 0, .58, 1)', fill: 'both' });
      wipe.pause();
      waiting.set(el, [wipe]);
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
})(content, '.ann, .mk, mark, .bk');
})();

// Comments (giscus): the widget is loaded when the reader comes near the section, and takes the
// site's theme now and whenever the button changes it.
(function () {
  var box = document.querySelector('.comments[data-repo]');
  if (!box) return;
  var root = document.documentElement, mount = box.querySelector('.giscus-mount');
  function theme() { return root.dataset.theme === 'dark' ? box.dataset.themeDark : box.dataset.themeLight; }
  function load() {
    if (box.dataset.loaded) return;
    box.dataset.loaded = '1';
    var s = document.createElement('script');
    s.src = 'https://giscus.app/client.js'; s.async = true; s.crossOrigin = 'anonymous';
    var attrs = { repo: box.dataset.repo, 'repo-id': box.dataset.repoId, category: box.dataset.category, 'category-id': box.dataset.categoryId,
      mapping: 'specific', term: box.dataset.term, strict: '1', 'reactions-enabled': '1', 'emit-metadata': '0', 'input-position': 'top',
      theme: theme(), lang: box.dataset.lang, loading: 'lazy' };
    Object.keys(attrs).forEach(function (k) { s.setAttribute('data-' + k, attrs[k]); });
    s.onerror = function () { mount.replaceChildren(); var p = document.createElement('p'); p.className = 'meta'; p.textContent = box.dataset.failed || ''; mount.appendChild(p); };
    mount.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) { if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
    io.observe(box);
  } else load();
  if (location.hash === '#comments') load();
  new MutationObserver(function () {
    var frame = box.querySelector('iframe.giscus-frame');
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ giscus: { setConfig: { theme: theme() } } }, 'https://giscus.app');
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();

// The face on the home board looks at the pointer, a little.
(function () {
  var eyes = document.querySelector('.wb-face .eyes');
  if (!eyes || !matchMedia('(pointer:fine)').matches || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  addEventListener('pointermove', function (e) {
    var r = eyes.ownerSVGElement.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    var d = Math.hypot(dx, dy) || 1, k = Math.min(2.6, d / 40);
    eyes.style.transform = 'translate(' + (dx / d) * k + 'px,' + (dy / d) * k + 'px)';
  });
})();
