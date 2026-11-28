/* Jersey Orbit — catalog / collection / search results */
(function () {
  'use strict';
  const JO = window.JO,
    CFG = JO.cfg,
    ic = JO.ic,
    esc = JO.esc,
    $ = JO.$,
    $$ = JO.$$,
    money = JO.money;
  const PAGE = 24;
  const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  const SORTS = [
    ['featured', 'Featured'],
    ['newest', 'Date: new to old'],
    ['oldest', 'Date: old to new'],
    ['price-asc', 'Price: low to high'],
    ['price-desc', 'Price: high to low'],
    ['title-asc', 'Alphabetically, A–Z'],
    ['title-desc', 'Alphabetically, Z–A'],
  ];
  const prices = JO.products.map((p) => p.p);
  const PMIN = Math.min(...prices),
    PMAX = Math.max(...prices);

  let state = readUrl();
  let view = JO.store.get('jo_view_v1', { d: 3, m: 2 });
  let list = [],
    shown = 0;

  function readUrl() {
    const q = new URLSearchParams(location.search);
    const c = q.get('c') || 'all';
    return {
      c: JO.cat(c) ? c : 'all',
      q: (q.get('q') || '').trim(),
      sort: SORTS.some((s) => s[0] === q.get('sort')) ? q.get('sort') : 'featured',
      avail: q.get('avail') === '1',
      sizes: (q.get('size') || '').split(',').filter((s) => SIZES.includes(s)),
      min: Math.max(0, Number(q.get('min')) || 0),
      max: Math.max(0, Number(q.get('max')) || 0),
    };
  }
  function writeUrl(push) {
    const q = new URLSearchParams();
    if (state.c !== 'all') q.set('c', state.c);
    if (state.q) q.set('q', state.q);
    if (state.sort !== 'featured') q.set('sort', state.sort);
    if (state.avail) q.set('avail', '1');
    if (state.sizes.length) q.set('size', state.sizes.join(','));
    if (state.min) q.set('min', state.min);
    if (state.max) q.set('max', state.max);
    const url = location.pathname + (q.toString() ? '?' + q : '');
    try {
      history[push ? 'pushState' : 'replaceState'](null, '', url);
    } catch (e) {}
  }

  /* ---------- skeleton ---------- */
  const main = $('#main');
  main.innerHTML = `
    <div class="wrap">
      <div class="phead">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span data-crumb>Category</span></nav>
        <h1 data-title>Category</h1>
        <p data-sub></p>
      </div>
      <div class="shop-cats" role="group" aria-label="Categories" data-cats></div>
      <div class="toolbar">
        <div class="toolbar__l">
          <button class="fbtn" type="button" data-open="filters" aria-haspopup="dialog">${ic('filter')}Filter<span class="n" data-fn>0</span></button>
          <span class="count" data-count role="status"></span>
        </div>
        <div class="toolbar__r">
          <label class="sort"><span class="sr-only">Sort by</span><select data-sort>${SORTS.map((s) => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select>${ic('chev')}</label>
          <div class="views" role="group" aria-label="Grid size">
            <button type="button" data-v="1" aria-label="One column"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="14" height="16" rx="2"/></svg></button>
            <button type="button" data-v="2" aria-label="Two columns"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="7" height="16" rx="1.500"/><rect x="13" y="4" width="7" height="16" rx="1.500"/></svg></button>
            <button type="button" data-v="3" aria-label="Three columns"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="5" height="16" rx="1.200"/><rect x="9.500" y="4" width="5" height="16" rx="1.200"/><rect x="16" y="4" width="5" height="16" rx="1.200"/></svg></button>
            <button type="button" data-v="4" aria-label="Four columns"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="2.500" y="4" width="3.600" height="16" rx="1"/><rect x="7.500" y="4" width="3.600" height="16" rx="1"/><rect x="12.500" y="4" width="3.600" height="16" rx="1"/><rect x="17.500" y="4" width="3.600" height="16" rx="1"/></svg></button>
          </div>
        </div>
      </div>
      <div class="active-filters" data-active></div>
      <h2 class="sr-only">Products</h2>
      <div class="shop-grid"><div class="grid" data-grid></div></div>
      <div class="more" data-more></div>
    </div>
    <div class="wrap"><div style="height:30px"></div></div>`;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="drawer drawer--right" id="filters" role="dialog" aria-modal="true" aria-label="Filter products" inert>
      <div class="drawer__head"><h2 class="drawer__title">Filter <small data-fcount></small></h2><button class="icon-btn" type="button" data-close aria-label="Close filters">${ic('x')}</button></div>
      <div class="drawer__body">
        <div class="fdrawer__sec"><h3>Availability</h3><label class="check"><input type="checkbox" data-f-avail> In stock only</label></div>
        <div class="fdrawer__sec"><h3>Size</h3><div class="chips">${SIZES.map((s) => `<button class="chip" type="button" data-f-size="${s}" aria-pressed="false">${s}</button>`).join('')}</div></div>
        <div class="fdrawer__sec"><h3>Price</h3>
          <div class="price-fields"><label><span class="sr-only">Minimum price</span><input type="number" inputmode="numeric" min="0" placeholder="${PMIN}" data-f-min></label><span>to</span><label><span class="sr-only">Maximum price</span><input type="number" inputmode="numeric" min="0" placeholder="${PMAX}" data-f-max></label></div>
          <div class="chips" style="margin-top:14px">${[[0, 349, 'Under ₹350'], [350, 399, '₹350 – ₹399'], [400, 0, '₹400 & above']].map((r) => `<button class="chip" type="button" data-f-range="${r[0]},${r[1]}">${r[2]}</button>`).join('')}</div>
        </div>
      </div>
      <div class="drawer__foot fdrawer__foot"><button class="btn btn--outline" type="button" data-f-clear>Clear all</button><button class="btn" type="button" data-close data-f-show>Show results</button></div>
    </div>`
  );

  const grid = $('[data-grid]'),
    more = $('[data-more]');

  /* ---------- compute ---------- */
  function compute() {
    let l = state.q ? JO.search(state.q) : JO.col(state.c);
    if (state.q && state.c !== 'all') l = l.filter((p) => p.k.includes(state.c));
    if (state.avail) l = l.filter((p) => p.a);
    if (state.sizes.length) l = l.filter((p) => p.v.some((v) => v.a && state.sizes.includes(JO.sizeKey(v.s))));
    if (state.min) l = l.filter((p) => p.p >= state.min);
    if (state.max) l = l.filter((p) => p.p <= state.max);
    const s = state.sort;
    l = l.slice();
    if (s === 'featured') {
      if (!state.q) l.sort((a, b) => (b.a ? 1 : 0) - (a.a ? 1 : 0) || a.o - b.o); // in-stock first, store order
    } else if (s === 'newest') l.sort((a, b) => b.ts - a.ts);
    else if (s === 'oldest') l.sort((a, b) => a.ts - b.ts);
    else if (s === 'price-asc') l.sort((a, b) => a.p - b.p || a.o - b.o);
    else if (s === 'price-desc') l.sort((a, b) => b.p - a.p || a.o - b.o);
    else if (s === 'title-asc') l.sort((a, b) => a.t.localeCompare(b.t));
    else if (s === 'title-desc') l.sort((a, b) => b.t.localeCompare(a.t));
    return l;
  }

  /* ---------- render ---------- */
  const cardSizes = () => (view.m === 1 ? '(max-width:699px) 100vw, ' : '') + JO.CARD_SIZES;
  function chunk() {
    const next = list.slice(shown, shown + PAGE);
    grid.insertAdjacentHTML('beforeend', next.map((p, i) => JO.card(p, { index: i, eager: shown === 0 && i < 4, sizes: cardSizes() })).join(''));
    shown += next.length;
    JO.reveal(grid);
    JO.markLoaded(grid);
    renderMore();
  }
  function renderMore() {
    if (!list.length) return (more.innerHTML = '');
    const left = list.length - shown;
    more.innerHTML = `<span>Showing ${shown} of ${list.length}</span><div class="more__bar"><i style="width:${(shown / list.length) * 100}%"></i></div>${left > 0 ? `<button class="btn btn--outline" type="button" data-more-btn>Load ${Math.min(PAGE, left)} more</button>` : ''}`;
    sentinel.disconnect();
    left > 0 && sentinel.observe(more);
  }
  const sentinel = new IntersectionObserver(
    (ents) => {
      if (ents.some((e) => e.isIntersecting) && shown < list.length) chunk();
    },
    { rootMargin: '1100px 0px' }
  );
  more.addEventListener('click', (e) => e.target.closest('[data-more-btn]') && chunk());

  function fillGrid() {
    list = compute();
    shown = 0;
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = '';
      more.innerHTML = `<div class="nores"><h3>No jerseys found</h3><p>${state.q ? `Nothing matched “${esc(state.q)}”.` : 'Nothing matches those filters.'} Try removing a filter or searching a team or player.</p><div class="hero__cta"><button class="btn" type="button" data-f-clear>Clear filters</button><a class="btn btn--outline" href="${JO.wa('Hi! I am looking for a jersey' + (state.q ? ': ' + state.q : ''))}" target="_blank" rel="noopener">${ic('whatsapp')} Ask us on WhatsApp</a></div></div>`;
    } else chunk();
    renderMeta();
  }

  function renderMeta() {
    const isSearch = !!state.q,
      cat = JO.cat(state.c);
    const title = isSearch ? `Results for “${state.q}”` : state.c === 'all' ? 'All products' : cat.title;
    $('[data-title]').textContent = title;
    $('[data-crumb]').textContent = isSearch ? 'Search' : state.c === 'all' ? 'Category' : cat.title;
    $('[data-sub]').textContent = isSearch ? '' : state.c === 'all' ? 'Every jersey in the orbit — new drops, retro classics, embroidery and more.' : cat.blurb || '';
    $('[data-sub]').hidden = !$('[data-sub]').textContent;
    document.title = `${title} — Jersey Orbit`;
    $('[data-count]').innerHTML = `<b>${list.length}</b> product${list.length === 1 ? '' : 's'}`;
    $('[data-sort]').value = state.sort;
    const nFilters = (state.avail ? 1 : 0) + state.sizes.length + (state.min || state.max ? 1 : 0);
    const fb = $('.fbtn');
    fb.classList.toggle('has-n', nFilters > 0);
    $('[data-fn]').textContent = nFilters;
    $('[data-fcount]').textContent = list.length ? `${list.length} results` : '';
    $('[data-f-show]').textContent = list.length ? `Show ${list.length} result${list.length === 1 ? '' : 's'}` : 'No results';
    // chips (redrawing them must not lose a keyboard user's place)
    const held = document.activeElement.closest('[data-cats]') && document.activeElement.dataset.c;
    $('[data-cats]').innerHTML = [{ key: 'all', title: 'All' }, ...CFG.categories.filter((c) => c.key !== 'all')]
      .map((c) => `<button class="chip${!isSearch && state.c === c.key ? ' is-on' : ''}" type="button" aria-pressed="${!isSearch && state.c === c.key}" data-c="${c.key}">${esc(c.title)}</button>`)
      .join('');
    held && $(`[data-cats] [data-c="${held}"]`).focus({ preventScroll: true });
    // active filter pills
    const act = [];
    if (isSearch) act.push(['q', `Search: ${state.q}`]);
    if (state.avail) act.push(['avail', 'In stock']);
    state.sizes.forEach((s) => act.push(['size:' + s, `Size ${s}`]));
    if (state.min || state.max) act.push(['price', `₹${state.min || PMIN} – ₹${state.max || PMAX}`]);
    $('[data-active]').innerHTML = act.length
      ? act.map((a) => `<button class="chip is-on" type="button" data-rm="${esc(a[0])}">${esc(a[1])}${ic('x')}</button>`).join('') + '<button class="chip" type="button" data-f-clear>Clear all</button>'
      : '';
    // drawer controls
    $('[data-f-avail]').checked = state.avail;
    $$('[data-f-size]').forEach((b) => {
      const on = state.sizes.includes(b.dataset.fSize);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const mi = $('[data-f-min]'),
      ma = $('[data-f-max]');
    if (document.activeElement !== mi) mi.value = state.min || '';
    if (document.activeElement !== ma) ma.value = state.max || '';
    $$('[data-f-range]').forEach((b) => {
      const [a, z] = b.dataset.fRange.split(',').map(Number);
      b.classList.toggle('is-on', state.min === a && state.max === z);
    });
    applyView();
  }

  function applyView() {
    const mobile = matchMedia('(max-width:699px)').matches;
    grid.dataset.d = view.d;
    grid.dataset.m = view.m;
    $$('img[srcset]', grid).forEach((i) => i.sizes !== cardSizes() && (i.sizes = cardSizes()));
    $$('.views button').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.v) === (mobile ? view.m : view.d)));
  }

  /* swap list with a quick cross-fade so the change feels smooth */
  let fadeT;
  function update(push, scrollTop) {
    writeUrl(push);
    grid.classList.add('is-updating');
    clearTimeout(fadeT);
    fadeT = setTimeout(() => {
      fillGrid();
      requestAnimationFrame(() => grid.classList.remove('is-updating'));
      if (scrollTop) {
        const top = $('.toolbar').getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 72) - 4;
        scrollY > top && scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' });
      }
    }, 150);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    let b;
    if ((b = t.closest('[data-c]'))) {
      state = { ...state, c: b.dataset.c, q: '' };
      update(true, true);
    } else if ((b = t.closest('[data-v]'))) {
      const v = Number(b.dataset.v);
      if (matchMedia('(max-width:699px)').matches) view.m = v;
      else view.d = v;
      JO.store.set('jo_view_v1', view);
      applyView();
    } else if ((b = t.closest('[data-rm]'))) {
      const k = b.dataset.rm;
      if (k === 'q') state.q = '';
      else if (k === 'avail') state.avail = false;
      else if (k === 'price') state.min = state.max = 0;
      else if (k.startsWith('size:')) state.sizes = state.sizes.filter((s) => s !== k.slice(5));
      update(true);
    } else if (t.closest('[data-f-clear]')) {
      state = { ...state, avail: false, sizes: [], min: 0, max: 0, q: state.q };
      update(true);
    } else if ((b = t.closest('[data-f-size]'))) {
      const s = b.dataset.fSize;
      state.sizes = state.sizes.includes(s) ? state.sizes.filter((x) => x !== s) : [...state.sizes, s].sort((a, b) => SIZES.indexOf(a) - SIZES.indexOf(b));
      update(false);
    } else if ((b = t.closest('[data-f-range]'))) {
      const [a, z] = b.dataset.fRange.split(',').map(Number);
      const same = state.min === a && state.max === z;
      state.min = same ? 0 : a;
      state.max = same ? 0 : z;
      update(false);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-sort]')) {
      state.sort = e.target.value;
      update(true);
    } else if (e.target.matches('[data-f-avail]')) {
      state.avail = e.target.checked;
      update(false);
    }
  });
  const onPrice = JO.debounce(() => {
    const mn = Math.max(0, parseInt($('[data-f-min]').value) || 0),
      mx = Math.max(0, parseInt($('[data-f-max]').value) || 0);
    state.min = mn;
    state.max = mx && mx >= mn ? mx : 0;
    update(false);
  }, 350);
  document.addEventListener('input', (e) => e.target.matches('[data-f-min],[data-f-max]') && onPrice());
  addEventListener('popstate', () => {
    state = readUrl();
    update(false);
    writeUrl(false);
  });
  matchMedia('(max-width:699px)').addEventListener('change', applyView);

  fillGrid();
})();
