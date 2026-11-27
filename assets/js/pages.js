/* Jersey Orbit — content pages: cart, checkout, about, contact, faq, track, reviews, policies, 404 */
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
  const page = document.body.dataset.page;
  const phead = (title, sub, crumb) => `<div class="phead"><nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span>${esc(crumb || title)}</span></nav><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const cta = (title, text) => `<section class="section section--soft"><div class="wrap" style="text-align:center"><h2 style="font-size:clamp(30px,4vw,52px);text-transform:uppercase;margin-bottom:10px">${title}</h2><p style="color:var(--muted);max-width:52ch;margin:0 auto 24px">${text}</p><div class="hero__cta" style="justify-content:center"><a class="btn" href="${JO.wa('Hi Jersey Orbit!')}" target="_blank" rel="noopener">${ic('whatsapp')} Chat on WhatsApp</a><a class="btn btn--outline" href="mailto:${CFG.contact.email}">${ic('mail')} Email us</a></div></div></section>`;

  const R = {};

  /* ---------- cart ---------- */
  R.cart = () => {
    main.innerHTML = `<div class="wrap">${phead('Your cart', '', 'Cart')}<div data-cart-page></div></div><div data-cart-rec></div>`;
    const root = $('[data-cart-page]');
    const draw = () => {
      const lines = JO.cart.lines();
      if (!lines.length) {
        root.innerHTML = `<div class="empty"><div class="empty__art">${ic('bag')}</div><h3>Your cart is empty</h3><p>Looks like you haven’t picked a jersey yet.</p><a class="btn" href="shop.html">Continue shopping ${ic('arrow')}</a></div>`;
        $('[data-cart-rec]').innerHTML = recs();
        JO.initRails(main);
        JO.markLoaded(main);
        return;
      }
      const refocus = JO.holdFocus(root);
      root.innerHTML = `<div class="cartp">
        <div>${JO.shipBarHtml()}<ul>${lines.map((l) => JO.lineHtml(l, true)).join('')}</ul><p style="margin-top:20px"><a class="link-arrow" href="shop.html">Continue shopping ${ic('arrow')}</a></p></div>
        <aside class="summary" aria-label="Order summary"><h2>Order summary</h2>${JO.noteHtml()}${JO.cartTotalsHtml()}<a class="btn btn--block" href="${JO.cart.checkoutUrl()}" data-checkout>Checkout ${ic('arrow')}</a><p style="font-size:12.5px;color:var(--muted);margin:14px 0 0;text-align:center">No payment is taken on this website.</p></aside>
      </div>`;
      refocus();
      $('[data-cart-rec]').innerHTML = recs();
      JO.initRails(main);
      JO.markLoaded(main);
    };
    const recs = () => {
      const have = new Set(JO.cart.lines().map((l) => l.p.id));
      const items = JO.catProducts('new-drops', 24).filter((p) => !have.has(p.id)).slice(0, 10);
      return items.length
        ? `<section class="section section--tight"><div class="wrap"><div class="sec-head"><div><h2>You may also like</h2></div><div class="sec-head__r">${JO.railNav()}</div></div>${JO.rail(items.map((p) => JO.card(p, { reveal: false, sizes: JO.RAIL_SIZES })).join(''))}</div></section>`
        : '';
    };
    draw();
    JO.on('cart', () => setTimeout(draw, 0));
  };

  /* ---------- about ---------- */
  R.about = () => {
    const pillars = [
      ['01', 'Elite craftsmanship', 'Quality is non-negotiable. We’re obsessed with the details — the texture of the fabric, the durability of the print. We provide gear that looks just as good in the streets as it does on the pitch.'],
      ['02', 'The perfect fit', 'A jersey is more than just a shirt; it’s an identity. That’s why we focus heavily on fit and comfort — an athletic, comfortable fit that moves with you.'],
      ['03', 'Driven by passion', 'We are based in Kerala, a land where football is a religion. We understand the anticipation of a new season and the excitement of a new kit — so we work tirelessly to get your order delivered fast across India.'],
    ];
    main.innerHTML = `
      <div class="wrap">${phead('About us', 'Welcome to Jersey Orbit — <b style="color:var(--ink)">the centre of your football universe.</b>')}
        <div class="split" style="margin-bottom:clamp(30px,5vw,60px)">
          <div class="prose"><p style="font-size:19px;color:var(--ink)">Football isn’t just a game. It’s the 90th-minute winner, the roar of the stadium, the badge over your heart, and the memories that last a lifetime. At Jersey Orbit, we believe the kit you wear should match the passion you feel.</p><p>We didn’t just start a store; we started a movement to elevate football culture in India.</p>
            <h2>Our story</h2><p>Jersey Orbit was born out of a simple desire: to bring the world-class football experience closer to home. We realised that true fans deserve jerseys that look and feel professional, without barriers.</p><p>We set out on a mission to bridge the gap between passion and performance. We curate only the finest jerseys — pieces that capture the spirit of the sport. From the precise stitching of the crest to the breathable, match-ready fabric, we ensure that every fan can wear their colours with pride.</p></div>
          <div class="hero__media" style="max-width:520px;margin-inline:auto">${JO.catProducts('2026-27', 8).slice(2, 4).map((p, i) => `<a class="hero__img" style="opacity:1;transform:rotate(${i ? 2.5 : -2.5}deg)" href="${JO.url.product(p)}">${JO.imgTag(p.i[0], { widths: [360, 540], sizes: '30vw', alt: p.t })}</a>`).join('')}</div>
        </div>
        <h2 style="font-size:clamp(30px,4vw,52px);text-transform:uppercase">What we stand for</h2>
        <div class="cards3">${pillars.map((c) => `<div class="cardx" data-reveal><div class="n">${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p></div>`).join('')}</div>
        <h2 style="font-size:clamp(30px,4vw,52px);text-transform:uppercase;margin-top:clamp(30px,5vw,60px)">Why choose Jersey Orbit?</h2>
        <div class="cards3">
          <div class="cardx" data-reveal><h3>Curated excellence</h3><p>We don’t just sell jerseys; we celebrate them. We bring you the latest drops and the most sought-after designs.</p></div>
          <div class="cardx" data-reveal style="--i:1"><h3>Fan-first approach</h3><p>We are football fans first, retailers second. We speak your language, understand your needs, and share your excitement for the beautiful game.</p></div>
          <div class="cardx" data-reveal style="--i:2"><h3>Reliability</h3><p>When you shop with us, you are choosing a brand that values trust and customer satisfaction above all else.</p></div>
        </div>
      </div>
      <section class="section" style="background:var(--navy);color:#fff;text-align:center"><div class="wrap"><p class="eyebrow" style="color:var(--lime)">Join the orbit</p><h2 style="color:#fff;font-size:clamp(34px,5.4vw,76px);text-transform:uppercase;line-height:1;margin-bottom:16px">Don’t just watch the game.<br><span style="color:var(--lime)">Wear the game.</span></h2><p style="max-width:56ch;margin:0 auto 26px;color:rgba(255,255,255,.75)">Whether you are cheering from the stands or scoring the winning goal, Jersey Orbit is here to make sure you look the part.</p><a class="btn btn--lime" href="shop.html">Shop the collection ${ic('arrow')}</a></div></section>`;
  };

  /* ---------- contact ---------- */
  R.contact = () => {
    main.innerHTML = `<div class="wrap">${phead('Contact us', 'Questions about a jersey, a size or your order? Send us a message — we’re happy to help.')}
      <div class="split" style="padding-bottom:clamp(40px,6vw,90px)">
        <form class="form" data-contact novalidate>
          <div class="form-row">
            <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" autocomplete="name" required><span class="err">Please enter your name.</span></div>
            <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" autocomplete="email" required><span class="err">Please enter a valid email.</span></div>
          </div>
          <div class="field"><label for="c-phone">Phone <span style="font-weight:400;color:var(--muted);letter-spacing:0;text-transform:none">(optional)</span></label><input id="c-phone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="msg" required></textarea><span class="err">Please tell us how we can help.</span></div>
          <div class="hero__cta"><button class="btn" type="submit" data-via="wa">${ic('whatsapp')} Send on WhatsApp</button><button class="btn btn--outline" type="submit" data-via="mail">${ic('mail')} Send by email</button></div>
          <p style="font-size:13px;color:var(--muted);margin:0">Your message opens in WhatsApp or your email app, ready to send.</p>
        </form>
        <div class="info-list">
          <a class="info-item" href="${JO.wa('Hi Jersey Orbit!')}" target="_blank" rel="noopener"><span class="ic">${ic('whatsapp')}</span><span><b>WhatsApp</b><span>${CFG.contact.whatsappDisplay}</span></span></a>
          <a class="info-item" href="mailto:${CFG.contact.email}"><span class="ic">${ic('mail')}</span><span><b>Email</b><span>${CFG.contact.email}</span></span></a>
          <a class="info-item" href="${CFG.contact.instagram}" target="_blank" rel="noopener"><span class="ic">${ic('instagram')}</span><span><b>Instagram</b><span>${CFG.contact.instagramHandle}</span></span></a>
          <div class="info-item"><span class="ic" style="background:#ffe9a8">${ic('pin')}</span><span><b>Based in</b><span>${CFG.contact.location}</span></span></div>
        </div>
      </div></div>`;
    let via = 'wa';
    main.addEventListener('click', (e) => {
      const b = e.target.closest('[data-via]');
      if (b) via = b.dataset.via;
    });
    $('[data-contact]').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target,
        v = (n) => f[n].value.trim();
      const bad = { name: !v('name'), email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')), msg: !v('msg') };
      ['name', 'email', 'msg'].forEach((n) => JO.markField(f[n], bad[n]));
      if (bad.name || bad.email || bad.msg) return f.querySelector('.is-err input, .is-err textarea').focus();
      const text = `Hi Jersey Orbit!\n\n${v('msg')}\n\n— ${v('name')}\nEmail: ${v('email')}${v('phone') ? '\nPhone: ' + v('phone') : ''}`;
      if (via === 'wa') window.open(JO.wa(text), '_blank', 'noopener');
      else location.href = `mailto:${CFG.contact.email}?subject=${encodeURIComponent('Message from ' + v('name'))}&body=${encodeURIComponent(text)}`;
      JO.toast(via === 'wa' ? 'Opening WhatsApp…' : 'Opening your email app…');
    });
  };

  /* ---------- faq ---------- */
  R.faq = () => {
    main.innerHTML = `<div class="wrap">${phead('Frequently asked questions', 'Everything about delivery, tracking, returns and sizes.', 'FAQ')}<div class="prose" style="max-width:900px;padding-bottom:clamp(30px,5vw,70px)">${CFG.faq.map((f, i) => JO.acc(f.q, `<p style="margin:0">${f.a}</p>`, i === 0)).join('')}</div></div>${cta('Still have questions?', 'Our team is happy to help with sizing, stock and orders.')}`;
  };

  /* ---------- track ---------- */
  const STATUS_TEXT = { pending: 'Waiting for confirmation', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
  const trackResult = (o) => {
    const row = (label, value) => (value ? `<dt>${label}</dt><dd>${value}</dd>` : '');
    return `<div class="callout" style="margin:0"><b>Order ${esc(o.orderNumber)}: ${esc(STATUS_TEXT[o.status] || o.status)}</b>
      <dl class="kv" style="grid-template-columns:100px 1fr;margin-top:12px">
        ${row('Placed', new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}
        ${row('Items', o.items.map((i) => `${esc(i.title)} (${i.size === 'One Size' ? 'one size' : 'size ' + esc(i.size)}) × ${esc(i.quantity)}`).join('<br>'))}
        ${row('Total', money(o.total))}
        ${row('Courier', esc(o.courier))}
        ${row('Tracking ID', esc(o.trackingId))}
      </dl></div>`;
  };

  R.track = () => {
    main.innerHTML = `<div class="wrap">${phead('Order tracking', 'Enter your order number and the phone number used on the order to see its status. Only have a tracking ID? Send it to us on WhatsApp and we’ll get you the latest status.', 'Order tracking')}
      <div class="split" style="padding-bottom:20px">
        <form class="form" data-track novalidate>
          <div class="field"><label for="t-id">Order number or tracking ID</label><input id="t-id" name="id" placeholder="e.g. JO-1042 or your tracking ID" autocomplete="off" required><span class="err">Please enter your order number or tracking ID.</span></div>
          <div class="field"><label for="t-phone">Phone number on the order</label><input id="t-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"><span class="err">Enter the 10-digit mobile number used on the order.</span></div>
          <div class="hero__cta"><button class="btn" type="submit">Check status</button><button class="btn btn--outline" type="button" data-track-wa>${ic('whatsapp')} Get status on WhatsApp</button></div>
          <div data-track-result role="status"></div>
        </form>
        <div class="callout" style="margin:0;align-self:start"><b>No tracking ID yet?</b> Orders are packed and dispatched within 24 hours (excluding Sundays and public holidays).</div>
      </div>
      <div class="steps" style="padding-bottom:clamp(40px,6vw,90px)">
        <div class="step"><b>01</b><h2 style="font-size:22px;text-transform:uppercase;margin-bottom:6px">Order placed</h2><p>Your order comes in and we start getting it ready.</p></div>
        <div class="step"><b>02</b><h2 style="font-size:22px;text-transform:uppercase;margin-bottom:6px">Packed &amp; dispatched</h2><p>Within 24 hours. We confirm once it’s packed, then send your tracking ID on WhatsApp or email.</p></div>
        <div class="step"><b>03</b><h2 style="font-size:22px;text-transform:uppercase;margin-bottom:6px">Delivered</h2><p>Kerala in 2–5 business days, rest of India in 5–9 business days.</p></div>
      </div></div>`;
    const form = $('[data-track]');
    const idInput = form.elements.id,
      phoneInput = form.elements.phone,
      button = $('button[type="submit"]', form),
      result = $('[data-track-result]', form);
    const note = (text) => (result.innerHTML = `<div class="callout" style="margin:0">${esc(text)}</div>`);
    $('[data-track-wa]').addEventListener('click', () => {
      const id = idInput.value.trim();
      JO.markField(idInput, !id);
      JO.markField(phoneInput, false);
      if (!id) return idInput.focus();
      window.open(JO.wa(`Hi Jersey Orbit! Could you share the latest status of my order / tracking ID: ${id}`), '_blank', 'noopener');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      const id = idInput.value.trim(),
        phone = JO.normPhone(phoneInput.value);
      const bad = { id: !id, phone: !/^[6-9]\d{9}$/.test(phone) };
      JO.markField(idInput, bad.id);
      JO.markField(phoneInput, bad.phone);
      if (bad.id) return idInput.focus();
      if (bad.phone) return phoneInput.focus();
      button.disabled = true;
      note('Checking your order…');
      const res = await JO.api('api/orders/track', { orderNumber: id.slice(0, 30), phone });
      button.disabled = false;
      if (!res) return note('We can’t check orders online right now. Please use “Get status on WhatsApp”.');
      if (!res.ok) return note(`${res.data.message} Check both, or use “Get status on WhatsApp”.`);
      result.innerHTML = trackResult(res.data);
    });
  };

  /* ---------- reviews ---------- */
  R.reviews = () => {
    main.innerHTML = `<div class="wrap">${phead('Customer reviews', 'Real messages from our WhatsApp and Instagram chats. Tap a review to see the chat.', 'Reviews')}
      <div class="chats">${CFG.chatReviews.map(JO.chatCard).join('')}</div>
      <h2 style="font-size:clamp(28px,3.4vw,44px);text-transform:uppercase;margin:clamp(34px,5vw,64px) 0 20px">More reviews</h2>
      <div class="rev-grid">${CFG.reviews.map(JO.revCard).join('')}</div></div>
      ${cta('Got your jersey?', 'We’d love to hear how it fits. Share a photo or a few words with us on WhatsApp or Instagram.')}`;
  };

  /* ---------- policies ---------- */
  R.policies = () => {
    const T = { shipping: 'Shipping Policy', refund: 'Return & Refund Policy' };
    const key = T[new URLSearchParams(location.search).get('p')] ? new URLSearchParams(location.search).get('p') : 'shipping';
    document.title = `${T[key]} — Jersey Orbit`;
    main.innerHTML = `<div class="wrap">${phead(T[key], '', T[key])}
      <div class="ptabs">${Object.entries(T).map(([k, v]) => `<a class="chip${k === key ? ' is-on' : ''}" href="policies.html?p=${k}">${esc(v)}</a>`).join('')}</div>
      <div class="rte prose" style="padding-bottom:clamp(40px,6vw,90px)">${(window.JO_CONTENT || {})[key] || '<p>This policy is not available right now.</p>'}</div></div>`;
  };

  /* ---------- account ---------- */
  R.checkout = () => {
    const [buyId, buyQty] = (new URLSearchParams(location.search).get('buy') || '').split(':');
    const getLines = () => {
      if (!buyId) return JO.cart.lines();
      const r = JO.byVid(buyId);
      return r && r.v.a ? [{ vid: r.v.id, p: r.p, size: r.v.s, price: r.v.p, img: r.p.i[0], qty: Math.min(JO.cart.MAX_QTY, Math.max(1, parseInt(buyQty, 10) || 1)) }] : [];
    };
    const lines = getLines();
    if (!lines.length) {
      main.innerHTML = `<div class="wrap">${phead('Checkout', '')}<div class="empty"><div class="empty__art">${ic('bag')}</div><h3>Nothing to check out</h3><p>Add a jersey to your cart first.</p><a class="btn" href="shop.html">Browse jerseys ${ic('arrow')}</a></div></div>`;
      return;
    }
    const sub = lines.reduce((n, l) => n + l.price * l.qty, 0);
    const fee = JO.shippingFee(lines);
    const shipText = fee ? money(fee) : 'Free';
    const AREAS = { kerala: 'Kerala', india: 'Outside Kerala' };
    const field = (id, label, attrs, error) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id.slice(3)}" ${attrs}><span class="err">${error}</span></div>`;
    main.innerHTML = `<div class="wrap">${phead('Checkout', 'Add your delivery details, then send the order to us on WhatsApp. No payment is taken on this website.')}
      <div class="cartp">
        <form class="form" data-checkout-form novalidate>
          <div class="form-row">
            ${field('co-name', 'Full name', 'autocomplete="name"', 'Please enter your name.')}
            ${field('co-phone', 'Phone', 'type="tel" inputmode="numeric" autocomplete="tel"', 'Enter a 10-digit mobile number.')}
          </div>
          <div class="field"><label for="co-address">Address</label><textarea id="co-address" name="address" autocomplete="street-address" style="min-height:90px"></textarea><span class="err">Please enter your address.</span></div>
          <div class="form-row">
            ${field('co-city', 'Town / city', 'autocomplete="address-level2"', 'Please enter your town or city.')}
            ${field('co-pin', 'PIN code', 'inputmode="numeric" maxlength="6" autocomplete="postal-code"', 'Enter a 6-digit PIN code.')}
          </div>
          <div class="field"><label for="co-area">Delivery area</label><select id="co-area" name="area"><option value="">Choose…</option>${Object.entries(AREAS).map(([k, name]) => `<option value="${k}">${name} — ${CFG.shipping[k].minDays}–${CFG.shipping[k].maxDays} business days</option>`).join('')}</select><span class="err">Please choose your delivery area.</span></div>
          <div class="field"><label for="co-note">Order note (optional)</label><textarea id="co-note" name="note" style="min-height:70px" maxlength="500">${esc(JO.cart.note)}</textarea></div>
          <div class="callout" data-co-alert role="alert" tabindex="-1" style="margin:0;background:#ffe3ec;color:#8a0f38" hidden></div>
          <button class="btn btn--block" type="submit">${ic('whatsapp')} Send order on WhatsApp</button>
          <p style="font-size:13px;color:var(--muted);margin:0;text-align:center">We use these details to process and deliver your order.</p>
        </form>
        <aside class="summary" aria-label="Your order"><h2>Your order</h2>
          <ul class="co-lines">${lines.map((l) => `<li><span class="co-lines__img">${JO.imgTag(l.img, { widths: [200], alt: '' })}</span><span><b>${esc(l.p.t)}</b><small>${l.size === 'One Size' ? 'One size' : 'Size ' + esc(l.size)} × ${l.qty}</small></span><em>${money(l.price * l.qty)}</em></li>`).join('')}</ul>
          <div class="totals"><div><span>Subtotal</span><span>${money(sub)}</span></div><div><span>Shipping</span><span>${shipText}</span></div><div class="grand"><span>Total</span><span>${money(sub + fee)}</span></div></div>
        </aside>
      </div></div>`;
    const form = $('[data-checkout-form]');
    const submit = $('button[type="submit"]', form),
      submitHtml = submit.innerHTML,
      alertBox = $('[data-co-alert]', form);
    /* the same details sent twice keep one reference, so the server makes only one order */
    let attempt = { body: '', ref: '' };

    const showProblem = (problem) => {
      const why = { sold_out: 'is sold out', gone: 'is no longer available' };
      const items = problem.error === 'ITEMS_UNAVAILABLE' ? problem.details || [] : [];
      alertBox.innerHTML = `<b>${esc(problem.message)}</b>${
        items.length
          ? `<ul style="margin:8px 0">${items.map((d) => `<li>${esc(d.title || 'An item')}${d.size ? ` (${esc(d.size)})` : ''} ${d.reason === 'not_enough' ? `has only ${esc(d.left)} left` : why[d.reason] || 'is unavailable'}.</li>`).join('')}</ul><a href="${buyId ? 'shop.html' : 'cart.html'}" style="text-decoration:underline">${buyId ? 'Back to the catalog' : 'Change your cart'}</a>`
          : problem.error === 'TOTAL_CHANGED'
          ? ' <a href="" style="text-decoration:underline">Reload now</a>'
          : ''
      }`;
      alertBox.hidden = false;
      alertBox.focus();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const v = (n) => form.elements[n].value.trim();
      const phone = JO.normPhone(v('phone'));
      const bad = { name: !v('name'), phone: !/^[6-9]\d{9}$/.test(phone), address: !v('address'), city: !v('city'), pin: !/^[1-9]\d{5}$/.test(v('pin')), area: !AREAS[v('area')] };
      Object.entries(bad).forEach(([n, isBad]) => JO.markField(form.elements[n], isBad));
      const first = Object.keys(bad).find((n) => bad[n]);
      if (first) return form.elements[first].focus();
      const areaName = AREAS[v('area')];

      // open the tab now, while this still counts as the customer's click, or the browser blocks it
      const tab = window.open('', '_blank');
      if (tab) {
        tab.opener = null;
        tab.document.title = 'Opening WhatsApp…';
        tab.document.body.textContent = 'Saving your order…';
      }
      submit.disabled = true;
      submit.textContent = 'Saving your order…';
      alertBox.hidden = true;

      const order = {
        items: lines.map((l) => ({ variantId: l.vid, quantity: l.qty })),
        name: v('name').slice(0, 100),
        phone,
        address: v('address').slice(0, 500),
        city: v('city').slice(0, 100),
        pincode: v('pin'),
        area: v('area'),
        note: v('note').slice(0, 500),
        expectedTotal: sub + fee,
      };
      const body = JSON.stringify(order);
      if (body !== attempt.body) attempt = { body, ref: JO.uuid() };
      const res = await JO.api('api/orders', { clientRef: attempt.ref, ...order });
      submit.disabled = false;
      submit.innerHTML = submitHtml;

      // the server looked at the order and said no (sold out, price changed…): don't send it
      if (res && !res.ok && (res.status === 400 || res.status === 409)) {
        if (tab) tab.close();
        return showProblem(res.data);
      }
      // no server, or it couldn't answer: send the order on WhatsApp without an order number
      const saved = res && res.ok && res.data.orderNumber ? res.data : null;

      const text = [
        'Hi Jersey Orbit! I would like to order:',
        saved ? `Order no: ${saved.orderNumber}` : '',
        '',
        ...lines.map((l, i) => `${i + 1}) ${l.p.t}\n    Size: ${l.size} x ${l.qty} = ${money(l.price * l.qty)}`),
        '',
        `Subtotal: ${money(sub)}`,
        `Shipping (${areaName}): ${shipText}`,
        `Total: ${money(sub + fee)}`,
        '',
        `Name: ${v('name')}`,
        `Phone: ${phone}`,
        `Address: ${v('address')}`,
        `Town/City: ${v('city')} - ${v('pin')}`,
        v('note') ? `Note: ${v('note')}` : '',
      ].join('\n').trim();
      const link = JO.wa(text);
      const opened = !!(tab && !tab.closed);
      if (opened) tab.location.replace(link);
      const message = saved
        ? `Your order number is <b>${esc(saved.orderNumber)}</b>. Press <b>Send</b> in WhatsApp. We confirm your order after we get that message. Keep the number to check your order on the <a href="track.html" style="text-decoration:underline">Order Tracking</a> page.`
        : 'Press <b>Send</b> in WhatsApp. Your order isn’t placed until you send that message.';
      main.innerHTML = `<div class="wrap"><div class="empty" style="padding-block:clamp(60px,10vw,120px)"><div class="empty__art">${ic('whatsapp')}</div><h3>One last step</h3><p>${message}</p><div class="hero__cta" style="justify-content:center"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${opened ? 'Open WhatsApp again' : 'Open WhatsApp'}</a>${buyId ? '' : '<button class="btn btn--outline" type="button" data-sent>I’ve sent it — clear my cart</button>'}<a class="btn btn--outline" href="shop.html">Keep shopping</a></div></div></div>`;
      scrollTo({ top: 0, behavior: 'instant' });
      const sent = $('[data-sent]');
      sent && sent.addEventListener('click', () => {
        JO.cart.clear();
        JO.cart.setNote('');
        sent.remove();
        JO.toast('Cart cleared');
      });
    });
  };

  /* ---------- 404 ---------- */
  R['404'] = () => {
    main.innerHTML = `<div class="wrap"><div class="nf"><h1>4<span>0</span>4</h1><h2 style="font-size:clamp(26px,3vw,38px);text-transform:uppercase;margin-bottom:12px">Offside! This page doesn’t exist.</h2><p style="color:var(--muted);margin-bottom:24px">The link may be old or the page was moved.</p><div class="hero__cta" style="justify-content:center"><a class="btn" href="index.html">Back to home ${ic('arrow')}</a><a class="btn btn--outline" href="shop.html">Browse the catalog</a></div></div></div>`;
  };

  (R[page] || (() => {}))();
  if (['about', 'policies', 'track'].includes(page)) {
    // newsletter band on content pages
    main.insertAdjacentHTML('beforeend', JO.newsBand());
  }
  JO.reveal(main);
  JO.markLoaded(main);
  JO.initRails(main);
})();
