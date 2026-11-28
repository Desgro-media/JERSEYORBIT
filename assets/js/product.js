/* Jersey Orbit — product page */
(function () {
  'use strict';
  const JO = window.JO,
    CFG = JO.cfg,
    ic = JO.ic,
    esc = JO.esc,
    $ = JO.$,
    $$ = JO.$$,
    money = JO.money;
  const main = $('#main');
  const handle = new URLSearchParams(location.search).get('p');
  const p = JO.byHandle(handle);

  if (!p) {
    document.title = 'Jersey not found — Jersey Orbit';
    main.innerHTML = `<div class="wrap"><div class="nf"><h1>4<span>0</span>4</h1><h2 style="font-size:32px;text-transform:uppercase;margin-bottom:12px">We couldn’t find that jersey</h2><p style="color:var(--muted);margin-bottom:24px">It may have sold out and been removed, or the link is old.</p><a class="btn" href="shop.html">Browse categories ${ic('arrow')}</a></div></div>`;
    return;
  }

  /* ---------- derived ---------- */
  const off = JO.pct(p);
  const cats = ['2026-27', 'world-cup-collections', 'retro', 'embroidery', 'retro-jerseys', 'collar', 'imported', 'socks'].filter((k) => p.k.includes(k));
  const mainCat = cats[0] || 'all';
  const single = p.v.length === 1;
  let selected = single ? p.v[0] : null;
  let qty = 1;
  const url = JO.absUrl(JO.url.product(p));
  const waAsk = (extra) => JO.wa(`Hi Jersey Orbit! ${extra || 'I have a question about'} "${p.t}" ${url}`);

  document.title = `${p.t} — Jersey Orbit`;
  const setMeta = (sel, attr, val) => {
    let m = $(sel);
    if (!m) {
      m = document.createElement('meta');
      const [a, v] = sel.match(/\[(.+?)="(.+?)"\]/).slice(1);
      m.setAttribute(a, v);
      document.head.appendChild(m);
    }
    m.setAttribute(attr, val);
  };
  const desc = `${p.t} — ${money(p.p)}. ${p.d.slice(0, 3).join(' · ')}${p.d.length ? '. ' : ''}Fast delivery across India from Jersey Orbit.`;
  setMeta('meta[name="description"]', 'content', desc);
  setMeta('meta[property="og:title"]', 'content', p.t);
  setMeta('meta[property="og:image"]', 'content', JO.absUrl(JO.img(p.i[0], 1200)));
  setMeta('meta[property="og:type"]', 'content', 'product');
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.t,
    image: p.i.map((i) => JO.absUrl(JO.img(i, 1200))),
    description: desc,
    brand: { '@type': 'Brand', name: 'Jersey Orbit' },
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: p.p, availability: p.a ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url },
  });
  document.head.appendChild(ld);
  JO.recent.push(p.id);

  /* ---------- markup ---------- */
  const badges = !p.a ? '<span class="pill pill--oos">Sold out</span>' : (off ? `<span class="pill pill--sale">-${off}%</span>` : '') + (JO.isNew(p) ? '<span class="pill pill--new">New</span>' : '');
  const gallery = `
    <div class="pdp__gallery">
      <div class="pdp__thumbs" role="group" aria-label="Product images">${p.i.map((im, i) => `<button class="thumb${i ? '' : ' is-active'}" type="button" aria-label="Show image ${i + 1}" aria-current="${i === 0}" data-thumb="${i}">${JO.imgTag(im, { widths: [120, 180], sizes: '84px', alt: '' })}</button>`).join('')}</div>
      <div class="pdp__stage">
        <div class="pdp__track" data-track tabindex="0" role="group" aria-label="Product photos, scroll sideways">${p.i.map((im, i) => `<figure class="pdp__slide" data-slide="${i}" style="margin:0">${JO.imgTag(im, { widths: [480, 720, 960, 1200], sizes: '(min-width:900px) 50vw, 100vw', alt: `${p.t} — image ${i + 1}`, eager: i === 0 })}</figure>`).join('')}</div>
        <div class="card__badges">${badges}</div>
        <button class="pdp__expand" type="button" data-lb="0" aria-label="View full screen">${ic('expand')}</button>
        <div class="pdp__dots" data-dots>${p.i.map((_, i) => `<i class="${i ? '' : 'is-active'}"></i>`).join('')}</div>
      </div>
    </div>`;

  const kv = p.d.filter((l) => /^[A-Za-z ]{2,18}: /.test(l));
  const plain = p.d.filter((l) => !/^[A-Za-z ]{2,18}: /.test(l));
  const detailsBody = p.d.length
    ? `${kv.length ? `<dl class="kv">${kv.map((l) => { const [k, ...v] = l.split(': '); return `<dt>${esc(k)}</dt><dd>${esc(v.join(': '))}</dd>`; }).join('')}</dl>` : ''}${plain.length ? `<ul style="${kv.length ? 'margin-top:16px' : ''}">${plain.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`
    : '<p>Premium quality football socks. Message us on WhatsApp for any detail you would like to know.</p>';

  const k = CFG.shipping.kerala,
    r = CFG.shipping.india,
    now = new Date();
  const est = (s) => `${JO.fmtDay(JO.addBizDays(now, s.minDays))} – ${JO.fmtDay(JO.addBizDays(now, s.maxDays))}`;

  const info = `
    <div class="pdp__info">
      <h1 class="pdp__title">${esc(p.t)}</h1>
      <div class="pdp__price"><span class="now">${money(p.p)}</span>${off ? `<s><span class="sr-only">Original price </span>${money(p.c)}</s><span class="pill pill--sale">Save ${off}%</span>` : ''}</div>
      <p class="pdp__tax">${money(CFG.shippingFee)} shipping all over India${CFG.freeShippingJerseys ? ` · Free on ${CFG.freeShippingJerseys} or more jerseys` : ''}</p>
      <div class="stock${p.a ? '' : ' is-out'}" data-stock>${p.a ? 'In stock — ready to ship' : 'Sold out'}</div>

      ${
        single
          ? ''
          : `<div class="opt">
        <div class="opt__head"><span>Size <em data-size-label></em></span><button class="opt__guide" type="button" data-guide>${ic('ruler')}Find your size</button></div>
        <div class="sizes" role="group" aria-label="Size" data-sizes>${p.v.map((v) => `<button class="size${v.a ? '' : ' is-oos'}" type="button" aria-pressed="false" data-size="${v.id}" ${v.a ? '' : `title="Sold out" aria-label="${esc(v.s)}, sold out"`}>${esc(v.s)}</button>`).join('')}</div>
        <p class="size-msg" data-size-msg role="alert"></p>
      </div>`
      }

      <div class="buy">
        <div class="qty" role="group" aria-label="Quantity"><button type="button" data-q="-1" aria-label="Decrease quantity">${ic('minus')}</button><output data-qty>1</output><button type="button" data-q="1" aria-label="Increase quantity">${ic('plus')}</button></div>
        <button class="btn btn--outline" type="button" data-atc ${p.a ? '' : 'disabled'}>${p.a ? 'Add to cart' : 'Sold out'}</button>
      </div>
      <div class="buy-now"><button class="btn btn--block" type="button" data-buy ${p.a ? '' : 'disabled'}>${ic('bolt')} Buy it now</button></div>
      <a class="wa-ask" href="${waAsk()}" target="_blank" rel="noopener">${ic('whatsapp')}<span>Ask about this jersey on WhatsApp</span></a>

      <div class="assure">
        <div>${ic('truck')}<p style="margin:0"><b>Estimated delivery</b><span>Kerala ${est(k)} · Rest of India ${est(r)}</span></p></div>
        <div>${ic('box')}<p style="margin:0"><b>Dispatched within 24 hours</b><span>Excluding Sundays &amp; public holidays. Tracking ID on WhatsApp or email.</span></p></div>
        <div>${ic('shield')}<p style="margin:0"><b>Order on WhatsApp</b><span>No payment is taken on this website.</span></p></div>
      </div>

      ${JO.acc('Product details', detailsBody, true)}
      ${JO.acc('Shipping & delivery', `<ul><li>Kerala: <strong>${k.minDays}–${k.maxDays} business days</strong></li><li>Rest of India: <strong>${r.minDays}–${r.maxDays} business days</strong></li><li>Flat <strong>${money(CFG.shippingFee)}</strong> shipping all over India${CFG.freeShippingJerseys ? `, <strong>free</strong> on ${CFG.freeShippingJerseys} or more jerseys (socks don’t count)` : ''}.</li><li>Orders are processed and dispatched within 24 hours (excluding Sundays and public holidays).</li></ul><p style="margin-top:12px"><a href="policies.html?p=shipping" style="text-decoration:underline">Read the full shipping policy</a></p>`)}
      ${JO.acc('Returns & exchange', `<p>We do not accept returns or exchanges for size issues, change of mind or dislike of the product — please check the size guide before ordering.</p><p>Returns or exchanges are only possible for <strong>damaged / defective</strong> or <strong>wrong</strong> items, reported within <strong>48 hours</strong> of delivery with a continuous, unedited <strong>unboxing video</strong>.</p><p style="margin:0"><a href="policies.html?p=refund" style="text-decoration:underline">Read the full return &amp; refund policy</a></p>`)}
    </div>`;

  main.innerHTML = `
    <div class="wrap" style="padding-top:clamp(14px,2vw,22px)">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><a href="${JO.url.shop(mainCat)}">${esc(mainCat === 'all' ? 'Category' : JO.catTitle(mainCat))}</a><span aria-hidden="true">/</span><span>${esc(p.t.length > 38 ? p.t.slice(0, 36) + '…' : p.t)}</span></nav>
      <div class="pdp">${gallery}${info}</div>
    </div>
    <section class="section section--tight" data-similar hidden>
      <div class="wrap"><div class="sec-head"><div><h2>You may also like</h2></div><div class="sec-head__r">${JO.railNav()}</div></div><div data-similar-rail></div></div>
    </section>
    <section class="section section--tight" data-recent hidden>
      <div class="wrap"><div class="sec-head"><div><h2>Recently viewed</h2></div><div class="sec-head__r">${JO.railNav()}</div></div><div data-recent-rail></div></div>
    </section>`;

  /* sticky bar + modals */
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="sticky-atc" data-sticky aria-hidden="true"><div class="sticky-atc__in">
        <span class="sticky-atc__img">${JO.imgTag(p.i[0], { widths: [100, 150], sizes: '46px', alt: '' })}</span>
        <div class="sticky-atc__t"><b>${esc(p.t)}</b><span>${money(p.p)}</span></div>
        <button class="btn" type="button" data-atc2 ${p.a ? '' : 'disabled'} tabindex="-1">${p.a ? 'Add to cart' : 'Sold out'}</button></div></div>
     <div class="modal" id="guide" role="dialog" aria-modal="true" aria-label="Size guide" inert>
       <div class="modal__bg" data-close></div>
       <div class="modal__box">
         <button class="icon-btn modal__x" type="button" data-close aria-label="Close size guide">${ic('x')}</button>
         <h3>Size guide</h3><p class="modal__note">${esc(CFG.sizeChart.note)}</p>
         <table class="tbl"><thead><tr><th>Size</th><th>Chest (in)</th><th>Chest (cm)</th></tr></thead><tbody>${CFG.sizeChart.rows.map((rw) => `<tr data-size-row="${esc(rw.size)}"><td>${esc(rw.size)}</td><td>${esc(rw.chest)}</td><td>${esc(rw.cm)}</td></tr>`).join('')}</tbody></table>
         <div class="measure">${ic('ruler')}<div><b style="color:var(--ink)">How to measure</b><br>Wrap a tape around the fullest part of your chest, under your arms, keeping it level and snug. Compare it with the chart above.</div></div>
         <a class="btn btn--outline btn--block" style="margin-top:18px" href="${waAsk('Please help me pick a size for')}" target="_blank" rel="noopener">${ic('whatsapp')} Ask us for sizing help</a>
       </div>
     </div>
     <div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Product images" inert>
       <div class="lb__top"><span data-lb-count></span><button class="icon-btn" type="button" data-close aria-label="Close">${ic('x')}</button></div>
       <button class="lb__nav lb__nav--prev" type="button" data-lb-step="-1" aria-label="Previous image">${ic('chevL')}</button>
       <button class="lb__nav lb__nav--next" type="button" data-lb-step="1" aria-label="Next image">${ic('chevR')}</button>
       <div class="lb__stage"><img class="lb__img" alt="" draggable="false"></div>
     </div>`
  );

  /* ---------- gallery behaviour ---------- */
  const track = $('[data-track]'),
    thumbs = $$('[data-thumb]'),
    dots = $$('[data-dots] i');
  let active = 0;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    thumbs.forEach((t, k) => (t.classList.toggle('is-active', k === i), t.setAttribute('aria-current', String(k === i))));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    const t = thumbs[i];
    t && t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  let raf;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setActive(Math.round(track.scrollLeft / track.clientWidth)));
  }, { passive: true });
  thumbs.forEach((t, i) => t.addEventListener('click', () => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })));

  // hover zoom (mouse only)
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    $$('.pdp__slide').forEach((s) => {
      const img = $('img', s);
      s.addEventListener('mouseenter', () => s.classList.add('is-zoom'));
      s.addEventListener('mouseleave', () => (s.classList.remove('is-zoom'), (img.style.transformOrigin = '')));
      s.addEventListener('mousemove', (e) => {
        const b = s.getBoundingClientRect();
        img.style.transformOrigin = `${((e.clientX - b.left) / b.width) * 100}% ${((e.clientY - b.top) / b.height) * 100}%`;
      });
    });
  }

  /* lightbox */
  const lb = $('#lb'),
    lbImg = $('.lb__img', lb);
  let lbI = 0,
    zoomed = false;
  const lbShow = (i) => {
    lbI = (i + p.i.length) % p.i.length;
    zoomed = false;
    lbImg.classList.remove('is-zoom');
    lbImg.style.transformOrigin = '';
    lbImg.style.opacity = '0.3';
    lbImg.src = JO.img(p.i[lbI], 1600);
    lbImg.onload = () => (lbImg.style.opacity = '1');
    $('[data-lb-count]', lb).textContent = `${lbI + 1} / ${p.i.length}`;
    $$('.lb__nav', lb).forEach((b) => (b.hidden = p.i.length < 2));
    const n = new Image();
    n.src = JO.img(p.i[(lbI + 1) % p.i.length], 1600);
  };
  const lbOpen = (i) => {
    lbShow(i);
    JO.open(lb, { overlayOn: false, focus: '[data-close]' });
  };
  document.addEventListener('click', (e) => {
    const s = e.target.closest('.pdp__slide');
    if (s && !e.target.closest('[data-close]')) return lbOpen(Number(s.dataset.slide));
    const b = e.target.closest('[data-lb]');
    if (b) return lbOpen(active);
    const st = e.target.closest('[data-lb-step]');
    if (st) return lbShow(lbI + Number(st.dataset.lbStep));
    if (e.target === lbImg) {
      zoomed = !zoomed;
      lbImg.classList.toggle('is-zoom', zoomed);
      if (zoomed) {
        const r = lbImg.getBoundingClientRect();
        lbImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      }
    }
  });
  lbImg.addEventListener('mousemove', (e) => {
    if (!zoomed) return;
    const r = lbImg.getBoundingClientRect(); // rect is of the scaled image; map the pointer back into 0-100%
    const w = lbImg.offsetWidth, h = lbImg.offsetHeight;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const nx = (e.clientX - cx) / (w * 2) + 0.5, ny = (e.clientY - cy) / (h * 2) + 0.5;
    lbImg.style.transformOrigin = `${Math.min(100, Math.max(0, nx * 100))}% ${Math.min(100, Math.max(0, ny * 100))}%`;
  });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'ArrowRight') lbShow(lbI + 1);
    if (e.key === 'ArrowLeft') lbShow(lbI - 1);
  });
  let tx = null;
  lb.addEventListener('touchstart', (e) => (tx = e.touches[0].clientX), { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (tx == null || zoomed) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) lbShow(lbI + (dx < 0 ? 1 : -1));
    tx = null;
  }, { passive: true });

  /* ---------- buying ---------- */
  const sizesEl = $('[data-sizes]'),
    sizeMsg = $('[data-size-msg]'),
    sizeLabel = $('[data-size-label]'),
    atc = $('[data-atc]'),
    atc2 = $('[data-atc2]'),
    buy = $('[data-buy]'),
    stock = $('[data-stock]');

  function renderSel() {
    if (sizesEl) {
      $$('.size', sizesEl).forEach((b) => {
        const on = selected && Number(b.dataset.size) === selected.id;
        b.classList.toggle('is-on', !!on);
        b.setAttribute('aria-pressed', String(!!on));
      });
      sizeLabel.textContent = selected ? '— ' + selected.s : '';
      sizeMsg.classList.remove('is-on');
      if (selected && !selected.a) {
        sizeMsg.innerHTML = `Size ${esc(selected.s)} is sold out. <a href="${waAsk(`Is size ${selected.s} coming back in stock for`)}" target="_blank" rel="noopener">Ask about restock on WhatsApp</a>`;
        sizeMsg.classList.add('is-on');
      }
      $$('[data-size-row]').forEach((tr) => tr.classList.toggle('is-hl', !!selected && tr.dataset.sizeRow === JO.sizeKey(selected.s)));
    }
    const ok = p.a && (!selected || selected.a);
    [atc, atc2, buy].forEach((b) => b && (b.disabled = !ok));
    if (selected && !selected.a) {
      atc.textContent = 'Sold out';
      atc2.textContent = 'Sold out';
    } else {
      atc.textContent = p.a ? 'Add to cart' : 'Sold out';
      atc2.textContent = p.a ? 'Add to cart' : 'Sold out';
    }
    const left = selected ? selected.a : p.a;
    stock.classList.toggle('is-out', !left);
    stock.textContent = left ? 'In stock — ready to ship' : 'Sold out';
  }

  function needSize() {
    if (selected) return false;
    sizeMsg.textContent = 'Please select a size to continue.';
    sizeMsg.classList.add('is-on');
    sizesEl.classList.remove('is-shake');
    void sizesEl.offsetWidth;
    sizesEl.classList.add('is-shake');
    sizesEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  }
  function addToCart(btn) {
    if (needSize()) return;
    if (!selected.a) return;
    JO.cart.add(selected.id, qty);
    [atc, atc2].forEach((b) => {
      b.classList.add('is-added');
      b.textContent = 'Added ✓';
    });
    setTimeout(() => {
      [atc, atc2].forEach((b) => b.classList.remove('is-added'));
      renderSel();
    }, 1400);
  }
  document.addEventListener('click', (e) => {
    const t = e.target;
    let b;
    if ((b = t.closest('[data-size]'))) {
      selected = p.v.find((v) => v.id === Number(b.dataset.size));
      renderSel();
    } else if ((b = t.closest('[data-q]'))) {
      qty = Math.min(JO.cart.MAX_QTY, Math.max(1, qty + Number(b.dataset.q)));
      $('[data-qty]').textContent = qty;
    } else if (t.closest('[data-atc]') || t.closest('[data-atc2]')) addToCart();
    else if (t.closest('[data-buy]')) {
      if (needSize() || !selected.a) return;
      location.href = JO.cart.checkoutUrl([{ v: selected.id, q: qty }]);
    } else if (t.closest('[data-guide]')) JO.open($('#guide'), { overlayOn: false, focus: '[data-close]' });
  });
  renderSel();

  /* sticky add-to-cart bar once the main buttons scroll away */
  const sticky = $('[data-sticky]');
  const buyBox = $('.buy');
  new IntersectionObserver(
    ([en]) => {
      const show = !en.isIntersecting && en.boundingClientRect.top < 0;
      sticky.classList.toggle('is-on', show);
      sticky.setAttribute('aria-hidden', String(!show));
      atc2.tabIndex = show ? 0 : -1;
    },
    { threshold: 0 }
  ).observe(buyBox);

  /* ---------- related rails ---------- */
  const rel = JO.similar(p, 12);
  const fillRail = (secSel, railSel, items) => {
    if (!items.length) return;
    const sec = $(secSel);
    sec.hidden = false;
    $(railSel, sec).innerHTML = JO.rail(items.map((x) => JO.card(x, { reveal: false, sizes: JO.RAIL_SIZES })).join(''));
    JO.initRails(sec);
    JO.markLoaded(sec);
  };
  fillRail('[data-similar]', '[data-similar-rail]', rel.length >= 4 ? rel : JO.col(mainCat).filter((x) => x.id !== p.id && x.a).slice(0, 12));
  fillRail('[data-recent]', '[data-recent-rail]', JO.recent.get().filter((x) => x.id !== p.id).slice(0, 10));
  JO.markLoaded(main);
})();
