/* Jersey Orbit admin. Plain JavaScript, no build step.
   Rule for this file: anything that came from the server goes through esc() before it becomes HTML.
   Order details are typed by strangers. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
  const when = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const tag = (value, text = value) => `<span class="tag tag--${esc(value)}">${esc(text)}</span>`;
  const photoSrc = (url) => '/' + url.replace(/^\//, '');
  const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
  const ACTIONS = { confirmed: 'Confirm order', packed: 'Mark packed', shipped: 'Mark shipped', delivered: 'Mark delivered', cancelled: 'Cancel order' };

  const view = $('[data-view]');
  const bar = $('[data-bar]');
  let user = null;
  let renderId = 0;

  function toast(message, bad) {
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' toast--bad' : '');
    el.setAttribute('role', bad ? 'alert' : 'status');
    el.textContent = message;
    $('[data-toasts]').appendChild(el);
    setTimeout(() => el.remove(), bad ? 7000 : 3000);
  }

  async function api(method, path, body) {
    const headers = { 'x-jo-admin': '1' };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch('/api/admin' + path, { method, headers, body: payload, credentials: 'same-origin' });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection.');
    }
    const data = await res.json().catch(() => null);
    if (res.ok) return data;
    const err = new Error((data && data.message) || 'Something went wrong.');
    err.code = data && data.error;
    if (res.status === 401 && path !== '/login') {
      user = null;
      showLogin();
      err.handled = true;
    }
    throw err;
  }

  /** run an action from a button: block double clicks and show what went wrong */
  async function busy(button, fn) {
    if (button) button.disabled = true;
    try {
      await fn();
    } catch (err) {
      if (!err.handled) toast(err.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ---------- sign in ---------- */
  function showLogin() {
    renderId++;
    bar.hidden = true;
    document.title = 'Sign in — Jersey Orbit Admin';
    view.innerHTML = `<form class="card login stack">
      <h1>Jersey Orbit Admin</h1>
      <label class="field">Username<input name="username" autocomplete="username" autocapitalize="off" required></label>
      <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn" type="submit">Sign in</button>
    </form>`;
    const form = $('form', view);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', form), async () => {
        try {
          user = await api('POST', '/login', { username: form.username.value, password: form.password.value });
        } catch (err) {
          const box = $('.error', form);
          box.hidden = false;
          box.textContent = err.message;
          return;
        }
        route();
      });
    });
    form.username.focus();
  }

  $('[data-logout]').addEventListener('click', (e) =>
    busy(e.currentTarget, async () => {
      await api('POST', '/logout');
      user = null;
      history.replaceState(null, '', '#/');
      showLogin();
    })
  );

  /* ---------- dashboard ---------- */
  async function dashboard(draw) {
    const s = await api('GET', '/summary');
    const tile = (label, value, href) => (href ? `<a class="stat" href="${href}"><b>${esc(value)}</b>${label}</a>` : `<div class="stat"><b>${esc(value)}</b>${label}</div>`);
    draw(
      'Dashboard',
      `<div class="head"><h1>Dashboard</h1></div>
      <div class="stats">
        ${tile('To confirm', s.byStatus.pending, '#/orders?status=pending')}
        ${tile('To pack', s.byStatus.confirmed, '#/orders?status=confirmed')}
        ${tile('To ship', s.byStatus.packed, '#/orders?status=packed')}
        ${tile('On the way', s.byStatus.shipped, '#/orders?status=shipped')}
        ${tile('Orders today', s.ordersToday)}
        ${tile('Marked paid, orders this month', money(s.paidThisMonth))}
      </div>
      <section class="card"><h2>Low stock</h2>${
        s.lowStock.length
          ? `<table><thead><tr><th>Jersey</th><th>Size</th><th class="num">Left</th></tr></thead><tbody>${s.lowStock
              .map((r) => `<tr><td><a href="#/products/${r.productId}">${esc(r.title)}</a></td><td>${esc(r.size)}</td><td class="num">${esc(r.stock)}</td></tr>`)
              .join('')}</tbody></table>`
          : '<p class="muted">Nothing is running low. Only sizes with a stock number are watched.</p>'
      }</section>`
    );
  }

  /* ---------- orders ---------- */
  const pager = (data, base) => {
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const link = (n, text) => {
      const q = new URLSearchParams(base);
      q.set('page', n);
      return `<a class="btn btn--outline btn--sm" href="?${q}" data-page="${n}">${text}</a>`;
    };
    return `<div class="pager"><span>${data.page > 1 ? link(data.page - 1, '← Previous') : ''}</span><span class="small muted">Page ${data.page} of ${pages} · ${data.total} in total</span><span>${data.page < pages ? link(data.page + 1, 'Next →') : ''}</span></div>`;
  };

  /** make the search box and page links change the address, so Back works */
  function wireList(section, params) {
    const go = (changes) => {
      const q = new URLSearchParams(params);
      Object.entries(changes).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
      location.hash = `#/${section}${q.toString() ? '?' + q : ''}`;
    };
    const form = $('form.search', view);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      go({ q: form.q.value.trim(), page: '' });
    });
    $$('[data-page]', view).forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        go({ page: a.dataset.page });
      })
    );
  }

  const listUrl = (section, params, key, value) => {
    const q = new URLSearchParams(params);
    q.delete('page');
    if (value) q.set(key, value);
    else q.delete(key);
    return `#/${section}${q.toString() ? '?' + q : ''}`;
  };

  async function orders(draw, params) {
    const status = params.get('status') || '';
    const data = await api('GET', '/orders?' + params);
    draw(
      'Orders',
      `<div class="head"><h1>Orders</h1></div>
      <div class="chips">${['', ...STATUSES]
        .map((s) => `<a class="${s === status ? 'is-on' : ''}" href="${listUrl('orders', params, 'status', s)}">${s ? s[0].toUpperCase() + s.slice(1) : 'All'}</a>`)
        .join('')}</div>
      <form class="search" role="search"><input name="q" type="search" placeholder="Order number, name, phone or tracking ID" aria-label="Search orders" value="${esc(params.get('q') || '')}"><button class="btn">Search</button></form>
      ${
        data.orders.length
          ? `<ul class="list orders">${data.orders
              .map(
                (o) => `<li><a href="#/orders/${o.id}">
                  <span><b>${esc(o.orderNumber)}</b><br><span class="small muted">${esc(when(o.createdAt))}</span></span>
                  <span><b>${esc(o.name)}</b><br><span class="small muted">${esc(o.city)} · ${esc(o.pieces)} item${o.pieces === 1 ? '' : 's'}</span></span>
                  <b class="num">${money(o.total)}</b>
                  <span class="tags">${tag(o.status)}${tag(o.paymentStatus)}</span></a></li>`
              )
              .join('')}</ul>${pager(data, params)}`
          : '<div class="card muted">No orders here yet.</div>'
      }`
    );
    wireList('orders', params);
  }

  function customerMessage(o) {
    const first = o.name.split(/\s+/)[0];
    const line = {
      pending: `we received your order ${o.orderNumber} (total ${money(o.total)}).`,
      confirmed: `your order ${o.orderNumber} is confirmed.`,
      packed: `your order ${o.orderNumber} is packed and will be sent soon.`,
      shipped: `your order ${o.orderNumber} is on the way.${o.courier ? ` Courier: ${o.courier}.` : ''}${o.trackingId ? ` Tracking ID: ${o.trackingId}.` : ''}`,
      delivered: `your order ${o.orderNumber} has been delivered. Thank you!`,
      cancelled: `your order ${o.orderNumber} has been cancelled.`,
    }[o.status];
    return `Hi ${first}, this is Jersey Orbit: ${line}`;
  }

  function orderHtml(o) {
    const wa = `https://wa.me/91${encodeURIComponent(o.phone)}?text=${encodeURIComponent(customerMessage(o))}`;
    return `<p><a href="#/orders">← All orders</a></p>
      <div class="head"><div><h1>${esc(o.orderNumber)}</h1><span class="muted">Placed ${esc(when(o.createdAt))}</span></div><div class="row">${tag(o.status)}${tag(o.paymentStatus)}</div></div>
      <div class="cols">
        <div>
          <section class="card"><h2>Items</h2>
            <table><thead><tr><th>Jersey</th><th>Size</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
              <tbody>${o.items.map((i) => `<tr><td>${esc(i.title)}${i.stockTaken ? '<br><span class="small muted">Taken from stock</span>' : ''}</td><td>${esc(i.size)}</td><td class="num">${esc(i.quantity)}</td><td class="num">${money(i.lineTotal)}</td></tr>`).join('')}</tbody>
              <tfoot><tr><td colspan="3">Subtotal</td><td class="num">${money(o.subtotal)}</td></tr><tr><td colspan="3">Shipping</td><td class="num">${o.shipping ? money(o.shipping) : 'Free'}</td></tr><tr><td colspan="3">Total</td><td class="num">${money(o.total)}</td></tr></tfoot>
            </table>
          </section>
          <section class="card"><h2>Update order</h2>
            <form class="stack" data-order-form>
              <div class="two">
                <label class="field">Payment<select name="paymentStatus">${['unpaid', 'paid', 'refunded'].map((s) => `<option value="${s}"${s === o.paymentStatus ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
                <label class="field">Courier<input name="courier" maxlength="80" value="${esc(o.courier)}"></label>
              </div>
              <label class="field">Tracking ID (the customer sees this once shipped)<input name="trackingId" maxlength="80" value="${esc(o.trackingId)}"></label>
              <label class="field">Private note (only admins see this)<textarea name="adminNote" maxlength="1000">${esc(o.adminNote)}</textarea></label>
              <div class="row"><button class="btn btn--outline" type="submit">Save details</button></div>
              ${o.status === 'pending' ? '<p class="note">Confirm after the customer’s WhatsApp message and payment arrive. Check the amount here, not in the message, because customers can edit the message. Confirming takes counted stock.</p>' : ''}
              ${o.nextStatuses.length ? `<div class="row">${o.nextStatuses.map((s) => `<button class="btn${s === 'cancelled' ? ' btn--danger' : ''}" type="button" data-to="${s}">${ACTIONS[s]}</button>`).join('')}</div>` : ''}
            </form>
          </section>
        </div>
        <div>
          <section class="card"><h2>Customer</h2>
            <dl><dt>Name</dt><dd>${esc(o.name)}</dd><dt>Phone</dt><dd>${esc(o.phone)}</dd><dt>Address</dt><dd>${esc(o.address)}</dd><dt>City</dt><dd>${esc(o.city)} – ${esc(o.pincode)}</dd><dt>Area</dt><dd>${o.area === 'kerala' ? 'Kerala' : 'Outside Kerala'}</dd>${o.customerNote ? `<dt>Note</dt><dd>${esc(o.customerNote)}</dd>` : ''}</dl>
            <div class="row"><a class="btn" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp customer</a><a class="btn btn--outline" href="tel:+91${esc(o.phone)}">Call</a></div>
          </section>
          <section class="card"><h2>History</h2><ul class="history">${o.history.map((h) => `<li><span>${tag(h.status)} ${h.by ? `<span class="small muted">by ${esc(h.by)}</span>` : ''}</span><span class="small muted">${esc(when(h.at))}</span></li>`).join('')}</ul></section>
        </div>
      </div>`;
  }

  async function orderDetail(draw, params, id) {
    let o = await api('GET', '/orders/' + id);
    const paint = () => {
      draw(o.orderNumber, orderHtml(o));
      const form = $('[data-order-form]', view);
      // only send what the admin actually changed, so another admin's edits are not overwritten
      const changes = () =>
        Object.fromEntries(['paymentStatus', 'courier', 'trackingId', 'adminNote'].filter((k) => form.elements[k].value !== o[k]).map((k) => [k, form.elements[k].value]));
      const save = (button, body, done) =>
        busy(button, async () => {
          const updated = await api('PATCH', '/orders/' + id, body);
          if (!form.isConnected) return;
          o = updated;
          paint();
          toast(done);
        });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const body = changes();
        if (!Object.keys(body).length) return toast('Nothing to save.');
        save($('[type=submit]', form), body, 'Saved.');
      });
      $$('[data-to]', form).forEach((b) =>
        b.addEventListener('click', () => {
          const status = b.dataset.to;
          if (status === 'cancelled' && !confirm(`Cancel ${o.orderNumber}? Any stock it holds goes back. This cannot be undone.`)) return;
          save(b, { ...changes(), status }, `Order is now ${status}.`);
        })
      );
    };
    paint();
  }

  /* ---------- products ---------- */
  async function products(draw, params) {
    const filter = params.get('filter') || 'all';
    const data = await api('GET', '/products?' + params);
    draw(
      'Products',
      `<div class="head"><h1>Products</h1><a class="btn" href="#/products/new">Add product</a></div>
      <div class="chips">${[['all', 'All'], ['published', 'On website'], ['hidden', 'Hidden'], ['soldout', 'Sold out']]
        .map(([k, text]) => `<a class="${k === filter ? 'is-on' : ''}" href="${listUrl('products', params, 'filter', k === 'all' ? '' : k)}">${text}</a>`)
        .join('')}</div>
      <form class="search" role="search"><input name="q" type="search" placeholder="Search by name" aria-label="Search products" value="${esc(params.get('q') || '')}"><button class="btn">Search</button></form>
      ${
        data.products.length
          ? `<ul class="list products">${data.products
              .map(
                (p) => `<li><a href="#/products/${p.id}">
                  ${p.image ? `<img src="${esc(photoSrc(p.image))}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
                  <b>${esc(p.title)}</b><span class="num">${money(p.price)}</span>
                  <span class="tags">${p.published ? '' : tag('hidden', 'Hidden')}${p.sellable ? '' : tag('soldout', 'Sold out')}</span></a></li>`
              )
              .join('')}</ul>${pager(data, params)}`
          : '<div class="card muted">No products match.</div>'
      }`
    );
    wireList('products', params);
  }

  const sizeRow = (v) => `<div class="size-row" data-size-row data-id="${esc(v.id || '')}">
    <label class="field">Size<input data-f="size" maxlength="20" required value="${esc(v.size)}"></label>
    <label class="field">Price ₹<input data-f="price" type="number" min="1" step="0.01" required value="${esc(v.price)}"></label>
    <label class="field">Was ₹<input data-f="compareAt" type="number" min="0" step="0.01" placeholder="none" value="${esc(v.compareAt)}"></label>
    <label class="field">Stock<input data-f="stock" type="number" min="0" step="1" placeholder="not counted" value="${esc(v.stock)}"></label>
    <label class="check"><input data-f="available" type="checkbox"${v.available ? ' checked' : ''}> On sale</label>
    <button class="btn btn--danger btn--sm" type="button" data-drop-size aria-label="Remove size ${esc(v.size)}">Remove</button>
  </div>`;

  function readSizes() {
    return $$('[data-size-row]', view).map((row) => {
      const f = (name) => $(`[data-f="${name}"]`, row);
      // a number box that holds something unreadable reports an empty value; don't take that as "blank"
      for (const name of ['compareAt', 'stock']) if (f(name).validity.badInput) throw new Error('Check the numbers in the size list.');
      const v = {
        size: f('size').value,
        price: Number(f('price').value),
        compareAt: f('compareAt').value === '' ? null : Number(f('compareAt').value),
        stock: f('stock').value === '' ? null : Number(f('stock').value),
        available: f('available').checked,
      };
      if (row.dataset.id) v.id = Number(row.dataset.id);
      return v;
    });
  }

  async function productEditor(draw, params, id) {
    const isNew = id === 'new';
    const [collections, loaded] = await Promise.all([
      api('GET', '/collections'),
      isNew
        ? Promise.resolve({ title: '', details: [], collections: ['new-drops'], published: false, images: [], variants: ['S', 'M', 'L', 'XL', '2XL'].map((size) => ({ size, price: '', compareAt: '', stock: '', available: true })) })
        : api('GET', '/products/' + id),
    ]);
    let product = loaded;

    draw(
      isNew ? 'Add product' : product.title,
      `<p><a href="#/products">← All products</a></p>
      <div class="head"><h1>${isNew ? 'Add product' : 'Edit product'}</h1>${!isNew && product.published ? `<a class="btn btn--outline" href="/product.html?p=${encodeURIComponent(product.handle)}" target="_blank">View on website</a>` : ''}</div>
      ${isNew ? '<p class="note">Save the product first, then add photos and switch it on. It stays hidden until then.</p><br>' : ''}
      <form data-product-form>
        <section class="card stack">
          <label class="field">Name<input name="title" maxlength="200" required value="${esc(product.title)}"></label>
          <label class="field">Details, one per line (for example “Material: Dot knit”)<textarea name="details">${esc(product.details.join('\n'))}</textarea></label>
        </section>
        <section class="card"><h2>Sizes, prices and stock</h2>
          <p class="small muted">Leave Stock empty if you don’t count it. A size shows as sold out when “On sale” is off or its stock is 0.</p>
          <div class="sizes" data-sizes>${product.variants.map(sizeRow).join('')}</div><br>
          <div class="row"><button class="btn btn--outline btn--sm" type="button" data-add-size>Add a size</button><button class="btn btn--outline btn--sm" type="button" data-copy-price>Copy first price to all sizes</button></div>
        </section>
        <section class="card"><h2>Collections</h2>
          <div class="checks">${collections.map((c) => `<label class="check"><input type="checkbox" name="collection" value="${esc(c.key)}"${product.collections.includes(c.key) ? ' checked' : ''}> ${esc(c.title)}</label>`).join('')}</div>
          <p class="small muted">Full Sleeve and Half Sleeve are worked out from the name and the “Fit:” line.</p>
        </section>
        <section class="card row" style="justify-content:space-between">
          ${isNew ? '<span></span>' : `<label class="check"><input type="checkbox" name="published"${product.published ? ' checked' : ''}> Show on website</label>`}
          <button class="btn" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
        </section>
      </form>
      ${isNew ? '' : '<section class="card" data-photos></section>'}`
    );

    const form = $('[data-product-form]', view);
    const sizesBox = $('[data-sizes]', view);
    $('[data-add-size]', view).addEventListener('click', () => {
      const price = $('[data-f="price"]', sizesBox);
      sizesBox.insertAdjacentHTML('beforeend', sizeRow({ size: '', price: price ? price.value : '', compareAt: '', stock: '', available: true }));
      $('[data-f="size"]', sizesBox.lastElementChild).focus();
    });
    $('[data-copy-price]', view).addEventListener('click', () => {
      const rows = $$('[data-size-row]', sizesBox);
      if (!rows.length) return;
      for (const name of ['price', 'compareAt']) {
        const value = $(`[data-f="${name}"]`, rows[0]).value;
        rows.forEach((r) => ($(`[data-f="${name}"]`, r).value = value));
      }
    });
    sizesBox.addEventListener('click', (e) => {
      const drop = e.target.closest('[data-drop-size]');
      if (!drop) return;
      if ($$('[data-size-row]', sizesBox).length === 1) return toast('A product needs at least one size.', true);
      drop.closest('[data-size-row]').remove();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('[type=submit]', form), async () => {
        const body = {
          title: form.elements.title.value,
          details: form.elements.details.value.split('\n').map((l) => l.trim()).filter(Boolean),
          collections: $$('input[name=collection]:checked', form).map((c) => c.value),
          variants: readSizes(),
        };
        if (isNew) {
          const created = await api('POST', '/products', body);
          toast('Product created. Now add its photos.');
          location.hash = '#/products/' + created.id;
          return;
        }
        await api('PUT', '/products/' + id, { ...body, version: product.version, published: form.elements.published.checked });
        toast('Saved. The website is updated.');
        if (form.isConnected) route();
      });
    });

    if (isNew) return;

    const photosBox = $('[data-photos]', view);
    /* A photo change moves the product on by one version. If it moved further, something else changed it
       (an order taking stock, say): keep the old version so Save is refused and nothing is overwritten. */
    const adopt = (updated) => {
      const onlyThis = updated.version === product.version + 1;
      product = { ...product, images: updated.images, version: onlyThis ? updated.version : product.version };
      if (!onlyThis) toast('This product also changed elsewhere. Reload the page before saving other changes.', true);
    };
    const paintPhotos = () => {
      photosBox.innerHTML = `<h2>Photos</h2><p class="small muted">The first photo is the main one. Photos save as soon as you change them.</p>
        <div class="photos">${product.images
          .map(
            (im, i) => `<div class="photo"><img src="${esc(photoSrc(im.small))}" alt="Photo ${i + 1}">
              <div class="row">${i ? `<button class="btn btn--outline btn--sm" type="button" data-main="${im.id}">Make main</button>` : tag('paid', 'Main')}<button class="btn btn--danger btn--sm" type="button" data-delete="${im.id}">Delete</button></div></div>`
          )
          .join('')}</div>
        <label class="field">Add photos (JPG, PNG or WebP, up to 10 MB each)<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload></label>`;
      $('[data-upload]', photosBox).addEventListener('change', async (e) => {
        const input = e.target;
        const files = Array.from(input.files);
        input.disabled = true;
        for (const file of files) {
          const data = new FormData();
          data.append('photo', file);
          try {
            adopt(await api('POST', `/products/${id}/images`, data));
            toast(`Added ${file.name}.`);
          } catch (err) {
            if (!err.handled) toast(`${file.name}: ${err.message}`, true);
          }
        }
        if (photosBox.isConnected) paintPhotos();
      });
      $$('[data-main]', photosBox).forEach((b) =>
        b.addEventListener('click', () =>
          busy(b, async () => {
            const first = Number(b.dataset.main);
            const ids = [first, ...product.images.map((i) => i.id).filter((x) => x !== first)];
            adopt(await api('PUT', `/products/${id}/images/order`, { ids }));
            paintPhotos();
          })
        )
      );
      $$('[data-delete]', photosBox).forEach((b) =>
        b.addEventListener('click', () => {
          if (!confirm('Delete this photo?')) return;
          busy(b, async () => {
            adopt(await api('DELETE', `/products/${id}/images/${b.dataset.delete}`));
            paintPhotos();
          });
        })
      );
    };
    paintPhotos();
  }

  /* ---------- router ---------- */
  async function route() {
    if (!user) return showLogin();
    const mine = ++renderId;
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const [section, id] = path.split('/');
    const params = new URLSearchParams(query || '');
    bar.hidden = false;
    $('[data-user]').textContent = user.username;
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === (section || 'home')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    // a slow answer for a page the admin has already left must not replace the current one
    const draw = (title, html) => {
      if (mine !== renderId) return;
      document.title = `${title} — Jersey Orbit Admin`;
      view.innerHTML = html;
    };
    const screen =
      section === 'orders' ? (id && /^\d+$/.test(id) ? orderDetail : orders) : section === 'products' ? (id && /^(\d+|new)$/.test(id) ? productEditor : products) : dashboard;
    try {
      await screen(draw, params, id);
    } catch (err) {
      if (!err.handled && mine === renderId) view.innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
    }
  }

  addEventListener('hashchange', () => {
    scrollTo(0, 0);
    route();
  });

  api('GET', '/me')
    .then((me) => {
      user = me;
      route();
    })
    .catch((err) => {
      if (!err.handled) view.innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
    });
})();
