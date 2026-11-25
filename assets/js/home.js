/* Jersey Orbit — home page */
(function () {
  'use strict';
  const JO = window.JO,
    CFG = JO.cfg,
    ic = JO.ic,
    esc = JO.esc,
    $ = JO.$,
    $$ = JO.$$;
  const main = $('#main');

  /* ---------- hero ---------- */
  const TINTS = ['#eaffd0', '#ffe3f3', '#dfe8ff'];
  const heroSlides = CFG.hero
    .map((h, i) => {
      const picks = JO.catProducts(h.key, 12).filter((p) => p.i[0].w / p.i[0].h < 0.8).slice(0, 2);
      if (picks.length < 2) return null;
      return { h, i, picks };
    })
    .filter(Boolean);

  const heroHtml = `
    <section class="hero" aria-roledescription="carousel" aria-label="Featured collections">
      ${heroSlides.map((s, i) => `<div class="hero__bg${i === 0 ? ' is-active' : ''}" style="--bg:${TINTS[i % TINTS.length]}"></div>`).join('')}
      <div class="hero__slides">
        ${heroSlides
          .map(
            (s, i) => `
          <article class="hero__slide${i === 0 ? ' is-active' : ''}" aria-roledescription="slide" aria-label="${i + 1} of ${heroSlides.length}" ${i ? 'aria-hidden="true"' : ''}>
            <div class="hero__copy">
              <p class="eyebrow">${esc(s.h.eyebrow)}</p>
              ${i === 0 ? '<h1>' : '<h2 class="h1like" style="font-size:clamp(44px,7vw,108px);text-transform:uppercase;line-height:.96;margin-bottom:18px">'}${esc(s.h.title)}${i === 0 ? '</h1>' : '</h2>'}
              <p>${esc(s.h.text)}</p>
              <div class="hero__cta"><a class="btn" href="${JO.url.shop(s.h.key)}">${esc(s.h.cta)} ${ic('arrow')}</a><a class="btn btn--outline" href="shop.html">All jerseys</a></div>
            </div>
            <div class="hero__media">
              ${s.picks.map((p, k) => `<a class="hero__img" href="${JO.url.product(p)}" tabindex="${i ? -1 : 0}" aria-label="${esc(p.t)}">${JO.imgTag(p.i[0], { widths: [360, 540, 760], sizes: '(min-width:900px) 27vw, 42vw', alt: p.t, eager: i === 0 })}</a>`).join('')}
            </div>
          </article>`
          )
          .join('')}
      </div>
      <div class="hero__ui">
        <button class="hero__arrow" type="button" data-hero="-1" aria-label="Previous slide">${ic('chevL')}</button>
        <div class="hero__dots" role="tablist" aria-label="Choose slide">${heroSlides.map((s, i) => `<button class="hero__dot${i === 0 ? ' is-active' : ''}" type="button" role="tab" aria-label="Slide ${i + 1}" data-dot="${i}"></button>`).join('')}</div>
        <button class="hero__arrow" type="button" data-hero="1" aria-label="Next slide">${ic('chevR')}</button>
      </div>
    </section>`;

  /* ---------- category tiles ---------- */
  const tilesHtml = `
    <section class="section section--tight" aria-labelledby="cat-t">
      <div class="wrap">
        <div class="sec-head"><div><h2 id="cat-t">Shop by category</h2></div><a class="link-arrow" href="shop.html">View all ${ic('arrow')}</a></div>
        <div class="tiles">
          ${CFG.categories
            .map((c, i) => {
              const im = JO.catImage(c.key);
              return `<a class="tile" href="${JO.url.shop(c.key)}" data-reveal style="--i:${i % 5}">
                <div class="tile__img">${im ? JO.imgTag(im, { widths: [260, 400, 560], sizes: '(min-width:1100px) 20vw, (min-width:700px) 25vw, 50vw', alt: c.title }) : ''}<span class="tile__count pill">${JO.catCount(c.key)}</span></div>
                <span class="tile__name">${esc(c.title)}</span>
              </a>`;
            })
            .join('')}
        </div>
      </div>
    </section>`;

  /* ---------- product rails ---------- */
  const railSection = (id, title, sub, key, n, extraCls = '') => {
    const list = JO.catProducts(key, n);
    if (!list.length) return '';
    return `
    <section class="section section--tight ${extraCls}" aria-labelledby="${id}">
      <div class="wrap">
        <div class="sec-head"><div><h2 id="${id}">${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
          <div class="sec-head__r">${JO.railNav()}<a class="link-arrow" href="${JO.url.shop(key)}">View all ${ic('arrow')}</a></div></div>
        ${JO.rail(list.map((p, i) => JO.card(p, { reveal: false, sizes: '(min-width:1100px) 24vw, (min-width:700px) 32vw, 66vw' })).join(''))}
      </div>
    </section>`;
  };

  const bandItems = ['New season', 'Retro classics', 'World Cup 2026', 'Embroidery', 'Fast delivery', 'Limited stock'];
  const bandHtml = (() => {
    const one = bandItems.map((t) => `<span class="band__item"><span>${esc(t)}</span><i></i></span>`).join('');
    return `<div class="band" aria-hidden="true"><div class="band__track">${one.repeat(2)}${one.repeat(2)}</div></div>`;
  })();

  const retroPicks = JO.catProducts('retro', 20).filter((p) => p.i[0].w / p.i[0].h < 0.8).slice(2, 4);
  const bannerHtml = `
    <section class="section section--tight">
      <div class="wrap">
        <div class="banner" data-reveal>
          <div class="banner__copy">
            <p class="eyebrow" style="color:var(--lime)">Retro &amp; classic</p>
            <h2>Looking for <em>retro</em> classics?</h2>
            <p>${JO.catCount('retro')} vintage-inspired shirts — from the golden eras of Milan, Madrid, Brazil, Argentina and more.</p>
            <a class="btn btn--lime" href="${JO.url.shop('retro')}">Shop retro ${ic('arrow')}</a>
          </div>
          <div class="banner__media" aria-hidden="true">${retroPicks.map((p) => `<div>${JO.imgTag(p.i[0], { widths: [300, 450], sizes: '22vw', alt: '' })}</div>`).join('')}</div>
        </div>
      </div>
    </section>`;

  const uspsHtml = `
    <section class="section section--tight" aria-label="Why Jersey Orbit">
      <div class="wrap"><div class="usps">
        <div class="usp" data-reveal style="--i:0"><div class="usp__ic">${ic('sparkle')}</div><h3>Premium quality</h3><p>Dot-knit fabric and detailed stitching — made to look as good in the street as on the pitch.</p></div>
        <div class="usp" data-reveal style="--i:1"><div class="usp__ic">${ic('truck')}</div><h3>Fast delivery</h3><p>Kerala in 2–3 days, rest of India in 5–10 days. Dispatched within 24 hours.</p></div>
        <div class="usp" data-reveal style="--i:2"><div class="usp__ic">${ic('bag')}</div><h3>Easy ordering</h3><p>Pick your jerseys, add your address and send the order to us on WhatsApp.</p></div>
        <div class="usp" data-reveal style="--i:3"><div class="usp__ic">${ic('whatsapp')}</div><h3>Real human support</h3><p>Questions about size or stock? Chat with us on WhatsApp — we’re happy to help.</p></div>
      </div></div>
    </section>`;

  const reviewsHtml = `
    <section class="section section--soft" aria-labelledby="rev-t">
      <div class="wrap">
        <div class="sec-head"><div><h2 id="rev-t">What our customers say</h2><p>Real messages from our WhatsApp and Instagram chats.</p></div><div class="sec-head__r">${JO.railNav()}<a class="link-arrow" href="reviews.html">All reviews ${ic('arrow')}</a></div></div>
        ${JO.rail(CFG.chatReviews.map(JO.chatCard).join(''), 'rail--chats')}
      </div>
    </section>`;

  const storyHtml = `
    <section class="section">
      <div class="wrap story">
        <div data-reveal><p class="eyebrow">About Jersey Orbit</p><h2>The centre of your <em>football</em> universe.</h2></div>
        <div data-reveal style="--i:1">
          <p>Football isn’t just a game. It’s the 90th-minute winner, the roar of the stadium, the badge over your heart. We believe the kit you wear should match the passion you feel.</p>
          <p>Based in Kerala — a land where football is a religion — we bring you jerseys that look and feel professional, delivered fast across India.</p>
          <div class="hero__cta"><a class="btn" href="about.html">Our story ${ic('arrow')}</a><a class="btn btn--outline" href="${CFG.contact.instagram}" target="_blank" rel="noopener">${ic('instagram')} ${esc(CFG.contact.instagramHandle)}</a></div>
        </div>
      </div>
    </section>`;

  main.innerHTML =
    heroHtml +
    tilesHtml +
    railSection('nd-t', 'New drops', 'Fresh in — grab your size before it’s gone.', 'new-drops', 12) +
    bandHtml +
    railSection('kit-t', '2026/27 kits', 'The new season’s home, away & third shirts.', '2026-27', 12) +
    bannerHtml +
    railSection('emb-t', 'The embroidery edit', 'Stitched crests and details, premium finish.', 'embroidery', 12) +
    uspsHtml +
    reviewsHtml +
    storyHtml +
    JO.newsBand();

  JO.initRails(main);
  JO.reveal(main);
  JO.markLoaded(main);

  /* ---------- hero behaviour ---------- */
  const hero = $('.hero');
  if (hero && heroSlides.length > 1) {
    const slides = $$('.hero__slide', hero),
      bgs = $$('.hero__bg', hero),
      dots = $$('.hero__dot', hero);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cur = 0;
    const go = (i) => {
      cur = (i + slides.length) % slides.length;
      slides.forEach((s, k) => {
        const on = k === cur;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
        $$('a', s).forEach((a) => (a.tabIndex = on ? 0 : -1));
        bgs[k].classList.toggle('is-active', on);
      });
      dots.forEach((d, k) => {
        d.classList.remove('is-active');
        void d.offsetWidth; // restart the progress animation
        d.classList.toggle('is-active', k === cur);
        d.setAttribute('aria-selected', String(k === cur));
      });
    };
    if (!reduced) hero.addEventListener('animationend', (e) => e.target.classList.contains('hero__dot') && e.target.classList.contains('is-active') && go(cur + 1));
    else dots.forEach((d) => d.classList.remove('is-active'));
    hero.addEventListener('click', (e) => {
      const a = e.target.closest('[data-hero]'),
        d = e.target.closest('[data-dot]');
      if (a) go(cur + Number(a.dataset.hero));
      else if (d) go(Number(d.dataset.dot));
    });
    const pause = (v) => hero.classList.toggle('is-paused', v);
    hero.addEventListener('pointerenter', () => pause(true));
    hero.addEventListener('pointerleave', () => pause(false));
    hero.addEventListener('focusin', () => pause(true));
    hero.addEventListener('focusout', () => pause(false));
    document.addEventListener('visibilitychange', () => pause(document.hidden));
    // swipe
    let x0 = null,
      y0 = 0;
    hero.addEventListener('touchstart', (e) => ((x0 = e.touches[0].clientX), (y0 = e.touches[0].clientY)), { passive: true });
    hero.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0,
        dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
    go(0);
  }
})();
