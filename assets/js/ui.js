/* Jersey Orbit — ui: site shell (header, drawers, search, footer) + shared components. */
(function () {
  'use strict';
  const JO = window.JO;
  const CFG = JO.cfg;
  const { $, $$, esc, money } = JO;
  const page = document.body.dataset.page || '';

  /* ---------- icons ---------- */
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/>',
    menu: '<path d="M4 7h16M4 12h10M4 17h16"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    ruler: '<path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m7 13 2 2m1.5-5.5 2 2M14 6l2 2"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4l3 3v4h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21Z"/><circle cx="12" cy="9.500" r="2.500"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    gift: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9M12 8c-2-4-6-3-5 0 .5 1.500 3 1 5 0Zm0 0c2-4 6-3 5 0-.5 1.500-3 1-5 0Z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500 18 18M18 6l-2.500 2.500M8.500 15.500 6 18"/>',
    home: '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.500"/><rect x="13" y="4" width="7" height="7" rx="1.500"/><rect x="4" y="13" width="7" height="7" rx="1.500"/><rect x="13" y="13" width="7" height="7" rx="1.500"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.500" cy="6.500" r="1" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z"/>',
  };
  const WA = '<path fill="currentColor" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>';
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.800 2.800 5.900 6.400.8-4.700 4.400 1.200 6.400L12 17.200 6.300 20.300l1.200-6.400L2.800 9.500l6.400-.8L12 2.800Z"/></svg>';
  const GOOGLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.500 12.200c0-.8-.1-1.500-.2-2.200H12v4.200h5.900a5 5 0 0 1-2.200 3.300v2.700h3.500c2.100-1.900 3.300-4.700 3.300-8Z"/><path fill="#34A853" d="M12 23c3 0 5.400-1 7.200-2.700l-3.500-2.700c-1 .7-2.200 1-3.700 1-2.800 0-5.200-1.900-6-4.500H2.400v2.800A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M6 14.100a6.600 6.600 0 0 1 0-4.200V7.100H2.400a11 11 0 0 0 0 9.800L6 14.100Z"/><path fill="#EA4335" d="M12 5.400c1.600 0 3.100.6 4.200 1.700l3.100-3.100A11 11 0 0 0 2.400 7.100L6 9.900c.8-2.600 3.200-4.500 6-4.500Z"/></svg>';
  JO.ic = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${n === 'whatsapp' ? WA : P[n] || ''}</svg>`;
  JO.STAR = STAR;
  JO.GOOGLE = GOOGLE;
  const ic = JO.ic;

  /* ---------- toast ---------- */
  let toastHost;
  JO.toast = (msg, icon = 'check') => {
    if (!toastHost) toastHost = $('.toast-host');
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `${ic(icon)}<span>${esc(msg)}</span>`;
    toastHost.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 380);
    }, 2600);
  };

  /* ---------- reusable fragments ---------- */
  JO.stars = (n = 5) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${STAR.repeat(n)}</span>`;

  JO.priceHtml = (p) => {
    const off = JO.pct(p);
    return `<span class="price${off ? ' price--sale' : ''}"><span class="now">${money(p.p)}</span>${off ? `<s>${money(p.c)}</s>` : ''}</span>`;
  };

  JO.card = (p, o = {}) => {
    const oos = !p.a,
      off = JO.pct(p),
      i2 = p.i[1];
    const sizes = p.v;
    const single = sizes.length === 1;
    const badges = oos ? '<span class="pill pill--oos">Sold out</span>' : (off ? `<span class="pill pill--sale">-${off}%</span>` : '') + (JO.isNew(p) ? '<span class="pill pill--new">New</span>' : '');
    const quick = oos
      ? ''
      : single
      ? `<button class="card__quick" type="button" data-add="${sizes[0].id}" aria-label="Add ${esc(p.t)} to cart">${ic('plus')}</button>`
      : `<button class="card__quick" type="button" data-quick aria-label="Quick add ${esc(p.t)}" aria-expanded="false">${ic('plus')}</button>
         <div class="quick" role="group" aria-label="Choose a size"><div class="quick__label">Quick add — choose size</div><div class="sizes">${sizes
           .map((v) => `<button type="button" class="size${v.a ? '' : ' is-oos'}" ${v.a ? `data-add="${v.id}"` : 'disabled aria-disabled="true" title="Sold out"'}>${esc(v.s)}</button>`)
           .join('')}</div></div>`;
    const sz = o.sizes || '(min-width:1100px) 25vw, (min-width:700px) 33vw, 50vw';
    return `<article class="card${oos ? ' is-soldout' : ''}${i2 ? '' : ' has-one'}" ${o.reveal === false ? '' : `data-reveal style="--i:${(o.index || 0) % 4}"`}>
      <div class="card__top">
        <a class="card__media" href="${JO.url.product(p)}" aria-label="${esc(p.t)}">
          ${JO.imgTag(p.i[0], { cls: 'card__img card__img--1', sizes: sz, alt: p.t, eager: o.eager })}
          ${i2 ? JO.imgTag(i2, { cls: 'card__img card__img--2', sizes: sz, alt: '' }) : ''}
          <span class="card__badges">${badges}</span>
        </a>
        ${quick}
      </div>
      <div class="card__body"><h3 class="card__title"><a href="${JO.url.product(p)}">${esc(p.t)}</a></h3>${JO.priceHtml(p)}</div>
    </article>`;
  };

  JO.rail = (inner, cls = '') => `<div class="rail ${cls}"><div class="rail__track">${inner}</div></div>`;
  JO.railNav = () => `<div class="rail__nav"><button class="rail__btn" data-rail="-1" aria-label="Previous">${ic('chevL')}</button><button class="rail__btn" data-rail="1" aria-label="Next">${ic('chevR')}</button></div>`;

  /** wire prev/next buttons that sit anywhere inside `scope` to the .rail__track inside `scope` */
  JO.initRails = (scope = document) => {
    $$('.rail', scope).forEach((rail) => {
      if (rail._init) return;
      rail._init = true;
      const track = $('.rail__track', rail);
      const sec = rail.closest('section') || rail.parentElement;
      const btns = $$('[data-rail]', sec);
      const upd = () => {
        const max = track.scrollWidth - track.clientWidth - 4;
        btns.forEach((b) => (b.disabled = b.dataset.rail === '-1' ? track.scrollLeft <= 4 : track.scrollLeft >= max));
      };
      btns.forEach((b) =>
        b.addEventListener('click', () => {
          track.scrollBy({ left: Number(b.dataset.rail) * track.clientWidth * 0.82, behavior: 'smooth' });
        })
      );
      let raf;
      track.addEventListener('scroll', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(upd);
      }, { passive: true });
      new ResizeObserver(upd).observe(track);
      upd();
    });
  };

  /* accordions */
  JO.acc = (title, body, open) => `<div class="acc"><button class="acc__btn" type="button" aria-expanded="${open ? 'true' : 'false'}">${esc(title)}${ic('plus')}</button><div class="acc__panel${open ? ' is-open' : ''}"><div class="acc__inner"><div class="acc__body">${body}</div></div></div></div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.acc__btn');
    if (!b) return;
    const open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open));
    b.nextElementSibling.classList.toggle('is-open', !open);
  });

  /* scroll reveal */
  let io;
  JO.reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.in)', root);
    if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => en.isIntersecting && (en.target.classList.add('in'), io.unobserve(en.target))), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    els.forEach((e) => io.observe(e));
  };

  /* image fade-in (delegated — works for any <img> that is added later) */
  document.addEventListener('load', (e) => e.target.tagName === 'IMG' && e.target.classList.add('is-loaded'), true);
  document.addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.classList.add('is-loaded'), true);
  JO.markLoaded = (root = document) => $$('img', root).forEach((i) => i.complete && i.naturalWidth && i.classList.add('is-loaded'));

  /* ---------- layers (drawers / search / modals) ---------- */
  const lockHtml = document.documentElement;
  let overlay,
    openLayerEl = null,
    lastFocus = null;
  const focusables = (el) => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', el).filter((n) => n.offsetParent !== null || n === document.activeElement);
  JO.open = (el, { overlayOn = true, focus } = {}) => {
    if (!el || el.classList.contains('is-open')) return;
    if (openLayerEl && openLayerEl !== el) JO.close(openLayerEl, true);
    lastFocus = document.activeElement;
    el.removeAttribute('inert');
    el.setAttribute('aria-hidden', 'false');
    // next frame so the transition runs from the closed state
    requestAnimationFrame(() => {
      el.classList.add('is-open');
      if (overlayOn) overlay.classList.add('is-open');
    });
    lockHtml.classList.add('is-locked');
    openLayerEl = el;
    el._overlay = overlayOn;
    setTimeout(() => {
      const f = (focus && $(focus, el)) || focusables(el)[0];
      f && f.focus({ preventScroll: true });
    }, 60);
    JO.emit('layer', { el, open: true });
  };
  JO.close = (el, silent) => {
    el = el || openLayerEl;
    if (!el || !el.classList.contains('is-open')) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(() => !el.classList.contains('is-open') && el.setAttribute('inert', ''), 520);
    if (el._overlay) overlay.classList.remove('is-open');
    if (openLayerEl === el) {
      openLayerEl = null;
      if (!silent) {
        lockHtml.classList.remove('is-locked');
        lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
      }
    }
    JO.emit('layer', { el, open: false });
  };
  JO.closeAll = () => openLayerEl && JO.close(openLayerEl);
  document.addEventListener('keydown', (e) => {
    if (!openLayerEl) return;
    if (e.key === 'Escape') return JO.close(openLayerEl);
    if (e.key === 'Tab') {
      const f = focusables(openLayerEl);
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
  });

  /* ---------- shell markup ---------- */
  const navHtml = CFG.nav
    .map((n) =>
      n.mega
        ? `<button class="hdr__link" type="button" data-mega aria-expanded="false" aria-controls="mega" ${page === n.page ? 'aria-current="page"' : ''}>${n.label}${ic('chev')}</button>`
        : `<a class="hdr__link" href="${n.href}" ${page === n.page ? 'aria-current="page"' : ''}>${n.label}</a>`
    )
    .join('');

  const marquee = (() => {
    const set = CFG.announcements.map((t) => `<span class="announce__item">${esc(t)}</span>`).join('');
    return set.repeat(3) + set.repeat(3); // two identical halves → seamless -50% loop
  })();

  const shellTop = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="announce" role="region" aria-label="Announcements"><div class="announce__track">${marquee}</div></div>
    <header class="hdr" id="hdr">
      <div class="hdr__inner">
        <button class="icon-btn hdr__burger" type="button" data-open="menu" aria-label="Open menu">${ic('menu')}</button>
        <a class="hdr__logo" href="index.html" aria-label="${CFG.brand.name} — home"><img src="${CFG.brand.logo}" alt="${CFG.brand.name}" width="88" height="52"></a>
        <nav class="hdr__nav" aria-label="Main">${navHtml}</nav>
        <div class="hdr__icons">
          <button class="icon-btn" type="button" data-open="search" aria-label="Search">${ic('search')}</button>
          <a class="icon-btn acc-link" href="account.html" aria-label="My account" ${page === 'account' ? 'aria-current="page"' : ''}>${ic('user')}</a>
          <button class="icon-btn" type="button" data-open="cart" aria-label="Open cart">${ic('bag')}<span class="badge" data-cart-count>0</span></button>
        </div>
      </div>
      <div class="mega" id="mega" aria-label="Catalog"><div class="mega__inner"></div></div>
    </header>`;

  const shellBottom = `
    <div class="overlay" id="overlay"></div>

    <aside class="drawer drawer--left" id="menu" role="dialog" aria-modal="true" aria-label="Menu" inert>
      <div class="drawer__head"><a href="index.html" class="hdr__logo" style="height:44px"><img src="${CFG.brand.logo}" alt="${CFG.brand.name}" width="74" height="44"></a><button class="icon-btn" type="button" data-close aria-label="Close menu">${ic('x')}</button></div>
      <div class="drawer__body" style="padding:0"><nav class="mnav" aria-label="Mobile">
        ${CFG.nav
          .map((n) =>
            n.mega
              ? `<button class="mnav__btn" type="button" aria-expanded="false" data-sub>${n.label}${ic('chev')}</button>
                 <div class="mnav__sub"><div>${CFG.categories.map((c) => `<a href="${JO.url.shop(c.key)}">${esc(c.title)} <small>${JO.catCount(c.key)}</small></a>`).join('')}</div></div>`
              : `<a href="${n.href}">${n.label}</a>`
          )
          .join('')}
        <a href="account.html">My Account</a>
      </nav></div>
      <div class="mnav__foot"><a class="btn btn--block" href="${JO.wa('Hi Jersey Orbit!')}" target="_blank" rel="noopener">${ic('whatsapp')} Chat on WhatsApp</a><a class="btn btn--outline btn--block" href="${CFG.contact.instagram}" target="_blank" rel="noopener">${ic('instagram')} ${CFG.contact.instagramHandle}</a></div>
    </aside>

    <aside class="drawer drawer--right" id="cart" role="dialog" aria-modal="true" aria-label="Shopping cart" inert>
      <div class="drawer__head"><h2 class="drawer__title">Your cart <small data-cart-label></small></h2><button class="icon-btn" type="button" data-close aria-label="Close cart">${ic('x')}</button></div>
      <div class="drawer__body" data-cart-body></div>
      <div class="drawer__foot" data-cart-foot></div>
    </aside>

    <section class="search" id="search" role="dialog" aria-modal="true" aria-label="Search" inert>
      <form class="search__bar" action="shop.html" method="get" role="search">
        <label class="search__field"><span class="sr-only">Search jerseys</span>${ic('search')}<input type="search" name="q" placeholder="Search jerseys, teams, players" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></label>
        <button class="icon-btn" type="button" data-close aria-label="Close search">${ic('x')}</button>
      </form>
      <div class="search__body" data-search-body></div>
    </section>

    <nav class="tabbar" aria-label="Quick navigation">
      <a href="index.html" ${page === 'home' ? 'aria-current="page"' : ''}>${ic('home')}Home</a>
      <a href="shop.html" ${page === 'shop' ? 'aria-current="page"' : ''}>${ic('grid')}Catalog</a>
      <button type="button" data-open="search">${ic('search')}Search</button>
      <button type="button" data-open="cart">${ic('bag')}Cart<span class="badge" data-cart-count>0</span></button>
      <a href="account.html" ${page === 'account' ? 'aria-current="page"' : ''}>${ic('user')}Account</a>
    </nav>

    <a class="wa" href="${JO.wa('Hi Jersey Orbit! I have a question.')}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">${ic('whatsapp')}</a>
    <div class="toast-host" aria-live="polite"></div>`;

  const footer = `
    <footer class="ftr">
      <div class="wrap">
        <div class="ftr__grid">
          <div class="ftr__brand">
            <img src="${CFG.brand.logo}" alt="${CFG.brand.name}" width="124" height="74" loading="lazy">
            <p>${esc(CFG.brand.tagline)} Premium football jerseys, shipped fast from Kerala across India.</p>
            <div class="social">
              <a href="${CFG.contact.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${ic('instagram')}</a>
              <a href="${CFG.contact.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${ic('facebook')}</a>
              <a href="${JO.wa('Hi Jersey Orbit!')}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic('whatsapp')}</a>
              <a href="mailto:${CFG.contact.email}" aria-label="Email">${ic('mail')}</a>
            </div>
          </div>
          <div><h4>Shop</h4><ul>${CFG.categories.slice(0, 7).map((c) => `<li><a href="${JO.url.shop(c.key)}">${esc(c.title)}</a></li>`).join('')}</ul></div>
          <div><h4>Help</h4><ul>
            <li><a href="track.html">Order Tracking</a></li><li><a href="faq.html">FAQ</a></li><li><a href="contact.html">Contact Us</a></li><li><a href="reviews.html">Reviews</a></li><li><a href="about.html">About Us</a></li><li><a href="account.html">My Account</a></li></ul></div>
          <div><h4>Policies</h4><ul>
            <li><a href="policies.html?p=shipping">Shipping Policy</a></li><li><a href="policies.html?p=refund">Refund Policy</a></li><li><a href="policies.html?p=privacy">Privacy Policy</a></li><li><a href="policies.html?p=terms">Terms of Service</a></li></ul>
            <p style="margin-top:18px;font-size:13px"><span style="white-space:nowrap">WhatsApp ${CFG.contact.whatsappDisplay}</span><br>${CFG.contact.email}</p></div>
        </div>
        <div class="ftr__bar"><span>© ${new Date().getFullYear()} ${CFG.brand.name}. All rights reserved.</span><span>Prices in INR · Secure checkout by Shopify</span></div>
      </div>
    </footer>`;

  JO.newsBand = () => `
    <section class="section news" aria-labelledby="news-t">
      <div class="wrap">
        <h2 id="news-t">Sign up and save</h2>
        <p>Get exclusive deals and early access to new products.</p>
        <form class="news__form" data-news novalidate>
          <label class="sr-only" for="news-email">Email address</label>
          <input id="news-email" type="email" name="email" placeholder="Enter your email" autocomplete="email" required>
          <button type="submit">Subscribe</button>
        </form>
        <p class="news__msg" role="status" data-news-msg></p>
      </div>
    </section>`;

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-news]');
    if (!f) return;
    e.preventDefault();
    const msg = f.parentElement.querySelector('[data-news-msg]');
    const email = f.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('is-err');
      return f.email.focus();
    }
    msg.classList.remove('is-err');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      // Shopify's built-in customer form: the address appears under Customers (tagged "newsletter").
      const fd = new FormData();
      fd.append('form_type', 'customer');
      fd.append('utf8', '✓');
      fd.append('contact[email]', email);
      fd.append('contact[tags]', CFG.newsletter.tag);
      await fetch(CFG.newsletter.action, { method: 'POST', body: fd, mode: 'no-cors' });
      f.reset();
      msg.textContent = 'Thanks for subscribing! You’re on the list.';
    } catch (err) {
      msg.textContent = 'Could not subscribe right now — please try again in a moment.';
      msg.classList.add('is-err');
    }
    btn.disabled = false;
  });

  /* ---------- mount shell ---------- */
  document.body.insertAdjacentHTML('afterbegin', shellTop);
  document.body.insertAdjacentHTML('beforeend', shellBottom);
  const main = $('main') || $('#main');
  if (main) {
    main.id = main.id || 'main';
    main.insertAdjacentHTML('afterend', footer);
  } else document.body.insertAdjacentHTML('beforeend', footer);
  overlay = $('#overlay');
  document.body.classList.add(page === 'product' ? 'no-tabbar' : 'has-tabbar');

  /* mega menu (tiles are filled lazily on first open) */
  const hdr = $('#hdr'),
    mega = $('#mega'),
    megaBtn = $('[data-mega]');
  let megaBuilt = false,
    megaT;
  function buildMega() {
    if (megaBuilt) return;
    megaBuilt = true;
    $('.mega__inner', mega).innerHTML = CFG.categories
      .map((c) => {
        const im = JO.catImage(c.key);
        return `<a class="mega__tile" href="${JO.url.shop(c.key)}"><div class="mega__img">${im ? JO.imgTag(im, { widths: [240, 360, 480], sizes: '20vw', alt: c.title }) : ''}</div><span class="mega__name">${esc(c.title)}<small>${JO.catCount(c.key)}</small></span></a>`;
      })
      .join('');
  }
  const megaOpen = () => {
    if (!megaBtn) return;
    clearTimeout(megaT);
    buildMega();
    mega.classList.add('is-open');
    megaBtn.setAttribute('aria-expanded', 'true');
  };
  const megaClose = (delay = 140) => {
    clearTimeout(megaT);
    megaT = setTimeout(() => {
      mega.classList.remove('is-open');
      megaBtn && megaBtn.setAttribute('aria-expanded', 'false');
    }, delay);
  };
  if (megaBtn) {
    megaBtn.addEventListener('mouseenter', () => matchMedia('(hover:hover)').matches && megaOpen());
    megaBtn.addEventListener('click', () => (mega.classList.contains('is-open') ? megaClose(0) : megaOpen()));
    hdr.addEventListener('mouseleave', () => matchMedia('(hover:hover)').matches && megaClose());
    mega.addEventListener('mouseenter', () => clearTimeout(megaT));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && megaClose(0));
    document.addEventListener('click', (e) => !hdr.contains(e.target) && megaClose(0));
    // warm the tile images shortly after load so the first hover is instant
    window.requestIdleCallback ? requestIdleCallback(buildMega, { timeout: 3000 }) : setTimeout(buildMega, 1800);
  }

  /* header: hide on scroll down, show on scroll up */
  let lastY = scrollY,
    tick = false;
  const onScroll = () => {
    tick = false;
    const y = scrollY;
    hdr.classList.toggle('is-scrolled', y > 8);
    const dy = y - lastY;
    if (Math.abs(dy) > 6) {
      const hide = dy > 0 && y > 220 && !mega.classList.contains('is-open') && !hdr.contains(document.activeElement);
      hdr.classList.toggle('is-hidden', hide);
      document.body.classList.toggle('hdr-hidden', hide);
      lastY = y;
    }
  };
  addEventListener('scroll', () => !tick && ((tick = true), requestAnimationFrame(onScroll)), { passive: true });
  onScroll();

  /* ---------- global click wiring ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const op = t.closest('[data-open]');
    if (op) {
      e.preventDefault();
      const name = op.dataset.open;
      if (name === 'search') return openSearch();
      if (name === 'cart' && page === 'cart') return; // already on the cart page
      return JO.open($('#' + name), { focus: name === 'cart' ? '[data-close]' : undefined });
    }
    if (t.closest('[data-close]') || t === overlay) return JO.closeAll();
    const sub = t.closest('[data-sub]');
    if (sub) {
      const open = sub.getAttribute('aria-expanded') === 'true';
      sub.setAttribute('aria-expanded', String(!open));
      sub.nextElementSibling.classList.toggle('is-open', !open);
      return;
    }
    // quick-add toggle
    const q = t.closest('[data-quick]');
    $$('.card.is-quick').forEach((c) => c !== (q && q.closest('.card')) && c.classList.remove('is-quick'));
    if (q) {
      const card = q.closest('.card');
      const on = card.classList.toggle('is-quick');
      q.setAttribute('aria-expanded', String(on));
      return;
    }
    if (!t.closest('.quick')) $$('.card.is-quick').forEach((c) => c.classList.remove('is-quick'));
    // add by variant (cards, quick panel)
    const add = t.closest('[data-add]');
    if (add && !add.disabled) {
      e.preventDefault();
      const vid = add.dataset.add;
      if (JO.cart.add(vid, 1)) {
        const card = add.closest('.card');
        card && card.classList.remove('is-quick');
      }
    }
  });
  $$('.mnav a').forEach((a) => a.addEventListener('click', () => JO.closeAll()));

  /* ---------- cart drawer / cart lines ---------- */
  const cartBody = $('[data-cart-body]'),
    cartFoot = $('[data-cart-foot]');
  let justAdded = null;

  JO.lineHtml = (l, big) => `
    <li class="line${justAdded === l.vid ? ' is-new' : ''}" data-line="${l.vid}">
      <a class="line__img" href="${JO.url.product(l.p)}">${JO.imgTag(l.img, { widths: [160, 240, 320], sizes: big ? '110px' : '84px', alt: l.p.t })}</a>
      <div>
        <a class="line__title" href="${JO.url.product(l.p)}">${esc(l.p.t)}</a>
        <div class="line__meta">${l.size === 'One Size' ? 'One size' : 'Size: ' + esc(l.size)}</div>
        <div class="line__row">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-dec="${l.vid}" aria-label="Decrease quantity">${ic('minus')}</button>
            <output>${l.qty}</output>
            <button type="button" data-inc="${l.vid}" aria-label="Increase quantity" ${l.qty >= JO.cart.MAX_QTY ? 'disabled' : ''}>${ic('plus')}</button>
          </div>
          <div class="line__price">${money(l.price * l.qty)}${l.compare ? `<s>${money(l.compare * l.qty)}</s>` : ''}</div>
        </div>
        ${l.oos ? '<p class="line__warn">This size is currently sold out — it may not be available at checkout.</p>' : ''}
      </div>
      <button class="line__remove" type="button" data-remove="${l.vid}" aria-label="Remove ${esc(l.p.t)}">${ic('trash')}</button>
    </li>`;

  JO.cartTotalsHtml = () => {
    const sub = JO.cart.subtotal(),
      save = JO.cart.savings();
    return `<div class="totals">
      ${save ? `<div class="save"><span>You save</span><span>${money(save)}</span></div>` : ''}
      <div class="grand"><span>Subtotal</span><span>${money(sub)}</span></div>
      <small>Shipping: flat ${money(CFG.shipping.kerala.fee)} in Kerala, ${money(CFG.shipping.india.fee)} for the rest of India — confirmed at checkout.</small>
    </div>`;
  };

  JO.shipBarHtml = () => {
    const thr = CFG.freeShippingThreshold;
    if (!thr) return '';
    const sub = JO.cart.subtotal(),
      left = Math.max(0, thr - sub);
    return `<div class="ship-bar">${left ? `Add <b>${money(left)}</b> more for free shipping` : '<b>🎉 You’ve unlocked free shipping!</b>'}<div class="ship-bar__track"><div class="ship-bar__fill" style="width:${Math.min(100, (sub / thr) * 100)}%"></div></div></div>`;
  };

  JO.codeBlockHtml = () =>
    JO.cart.code
      ? `<div class="code-chip">Code ${esc(JO.cart.code)} · applied at checkout <button type="button" data-clear-code aria-label="Remove code">${ic('x')}</button></div>`
      : `<form class="disc" data-code-form><input type="text" name="code" placeholder="Discount code" autocomplete="off" aria-label="Discount code"><button class="btn btn--outline" type="submit">Apply</button></form>`;

  JO.noteHtml = () => `<button type="button" class="note-toggle" data-note-toggle>${JO.cart.note ? 'Edit order note' : 'Add an order note'}</button><textarea class="note-box${JO.cart.note ? ' is-open' : ''}" data-note placeholder="Anything we should know? (e.g. name/number on the jersey, delivery notes)" aria-label="Order note" maxlength="500">${esc(JO.cart.note)}</textarea>`;

  function renderCart() {
    const lines = JO.cart.lines(),
      n = JO.cart.count();
    $$('[data-cart-count]').forEach((b) => {
      const was = Number(b.textContent) || 0;
      b.textContent = n;
      b.classList.toggle('is-on', n > 0);
      if (n > was) {
        b.classList.remove('is-bump');
        void b.offsetWidth;
        b.classList.add('is-bump');
      }
    });
    $('[data-cart-label]').textContent = n ? `(${n})` : '';
    if (!lines.length) {
      cartBody.innerHTML = `<div class="empty"><div class="empty__art">${ic('bag')}</div><h3>Your cart is empty</h3><p>Looks like you haven’t picked a jersey yet.</p><a class="btn" href="shop.html">Continue shopping ${ic('arrow')}</a></div>`;
      cartFoot.innerHTML = '';
      cartFoot.hidden = true;
    } else {
      cartFoot.hidden = false;
      cartBody.innerHTML = `${JO.shipBarHtml()}<ul>${lines.map((l) => JO.lineHtml(l)).join('')}</ul>`;
      cartFoot.innerHTML = `${JO.noteHtml()}${JO.codeBlockHtml()}${JO.cartTotalsHtml()}
        <div class="foot-actions"><a class="btn btn--block" href="${JO.cart.checkoutUrl()}" data-checkout>Checkout ${ic('arrow')}</a><a class="btn btn--outline btn--block" href="cart.html">View cart</a></div>`;
    }
    JO.markLoaded(cartBody);
    JO.emit('cart-rendered');
    justAdded = null;
  }
  JO.renderCart = renderCart;
  JO.on('cart', (d) => {
    if (d && d.added) {
      justAdded = d.added;
      renderCart();
      if (page !== 'cart') JO.open($('#cart'), { focus: '[data-close]' });
    } else renderCart();
  });

  // quantity / remove / code / note — delegated so it also drives the cart page
  document.addEventListener('click', (e) => {
    const t = e.target;
    let b;
    if ((b = t.closest('[data-inc]'))) {
      const l = JO.cart.lines().find((x) => x.vid == b.dataset.inc);
      l && JO.cart.set(l.vid, l.qty + 1);
    } else if ((b = t.closest('[data-dec]'))) {
      const l = JO.cart.lines().find((x) => x.vid == b.dataset.dec);
      l && JO.cart.set(l.vid, l.qty - 1);
    } else if ((b = t.closest('[data-remove]'))) {
      const li = b.closest('.line');
      if (li) {
        li.style.transition = 'opacity .3s, transform .3s';
        li.style.opacity = '0';
        li.style.transform = 'translateX(30px)';
      }
      setTimeout(() => JO.cart.remove(b.dataset.remove), li ? 260 : 0);
    } else if (t.closest('[data-clear-code]')) JO.cart.setCode('');
    else if ((b = t.closest('[data-note-toggle]'))) {
      const box = b.nextElementSibling;
      box.classList.toggle('is-open');
      box.classList.contains('is-open') && box.focus();
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-code-form]');
    if (!f) return;
    e.preventDefault();
    const v = f.code.value.trim();
    if (!v) return f.code.focus();
    JO.cart.setCode(v);
    JO.toast('Code saved — it will be applied at checkout');
  });
  document.addEventListener('input', (e) => e.target.matches('[data-note]') && JO.cart.setNote(e.target.value));
  // keep checkout links fresh if the note/code changed without re-render
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-checkout]');
    a && (a.href = JO.cart.checkoutUrl());
  }, true);

  /* ---------- search ---------- */
  const sEl = $('#search'),
    sInput = $('input[name=q]', sEl),
    sBody = $('[data-search-body]', sEl);
  let sActive = -1;
  function searchIdle() {
    const trending = JO.catProducts('new-drops', 4);
    sBody.innerHTML = `
      <div class="search__label">Popular searches</div>
      <div class="chips">${CFG.searchSuggestions.map((s) => `<a class="chip" href="shop.html?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
      <div class="search__label">Browse</div>
      <div class="chips">${CFG.categories.slice(0, 8).map((c) => `<a class="chip" href="${JO.url.shop(c.key)}">${esc(c.title)}</a>`).join('')}</div>
      <div class="search__label">Trending now</div>
      <div class="sres">${trending.map(resRow).join('')}</div>`;
    JO.markLoaded(sBody);
  }
  const resRow = (p) => `<a href="${JO.url.product(p)}" role="option"><span class="sres__img">${JO.imgTag(p.i[0], { widths: [112, 168], sizes: '56px', alt: '' })}</span><span><span class="sres__t">${esc(p.t)}</span><br><span class="sres__s">${p.a ? 'In stock' : 'Sold out'}</span></span><span class="sres__p">${money(p.p)}${JO.pct(p) ? `<s>${money(p.c)}</s>` : ''}</span></a>`;
  function runSearch() {
    const q = sInput.value.trim();
    sActive = -1;
    if (!q) return searchIdle();
    const res = JO.search(q);
    if (!res.length) {
      sBody.innerHTML = `<div class="search-none"><b>No results for “${esc(q)}”.</b><br>Try a team, player or season — or <a href="${JO.wa('Hi! I am looking for: ' + q)}" target="_blank" rel="noopener" style="text-decoration:underline">ask us on WhatsApp</a>.</div>`;
      return;
    }
    sBody.innerHTML = `<div class="search__label">${res.length} result${res.length > 1 ? 's' : ''}</div><div class="sres" role="listbox">${res.slice(0, 8).map(resRow).join('')}</div>
      <div class="search__all"><a class="btn btn--block" href="shop.html?q=${encodeURIComponent(q)}">View all ${res.length} results ${ic('arrow')}</a></div>`;
    JO.markLoaded(sBody);
  }
  function openSearch() {
    JO.open(sEl, { focus: 'input' });
    if (!sInput.value) searchIdle();
  }
  sInput.addEventListener('input', JO.debounce(runSearch, 90));
  sInput.addEventListener('keydown', (e) => {
    const rows = $$('.sres a', sBody);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      sActive = (sActive + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('is-active', i === sActive));
      rows[sActive].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && sActive >= 0 && rows[sActive]) {
      e.preventDefault();
      location.href = rows[sActive].href;
    }
  });
  addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ---------- prefetch internal pages on intent (instant navigation) ---------- */
  const seen = new Set();
  const prefetch = (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin && location.protocol !== 'file:') return;
    if (!/\.html$/.test(u.pathname) || seen.has(u.pathname + u.search)) return;
    seen.add(u.pathname + u.search);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = u.href;
    document.head.appendChild(l);
  };
  document.addEventListener('pointerover', prefetch, { passive: true });
  document.addEventListener('touchstart', prefetch, { passive: true });

  /* initial paint */
  renderCart();
  JO.initRails();
  JO.reveal();
  JO.markLoaded();
})();
