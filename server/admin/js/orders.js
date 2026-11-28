import { $, $$, api, busy, capital, chips, esc, isOwner, money, options, pager, pastLastPage, plural, tag, toast, view, when, wireList } from './lib.js';
import { titled } from './help.js';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const ACTIONS = { confirmed: 'Confirm order', packed: 'Mark packed', shipped: 'Mark shipped', delivered: 'Mark delivered', cancelled: 'Cancel order' };
// the special lists the dashboard links to
const VIEWS = {
  late: 'Confirmed over 24 hours ago and not shipped',
  unpaid: 'Confirmed or sent, but not marked paid',
  refund: 'Cancelled but still marked paid: check whether a refund is due',
  missing: 'Waiting, with a jersey or size that is no longer in the catalog',
  wildcard: 'Orbit Wildcard orders',
};

export async function orderList(draw, params) {
  const data = await api('GET', '/orders?' + params);
  if (pastLastPage('orders', data, params, data.orders.length)) return;
  const special = VIEWS[params.get('view')];
  // a status button starts a new list, without the special one
  const plain = new URLSearchParams(params);
  plain.delete('view');
  const drawn = draw(
    'Orders',
    `<div class="head">${titled('h1', 'Orders', 'orders-list')}</div>
    ${chips('orders', plain, 'status', [['', 'All'], ...STATUSES.map((s) => [s, capital(s)])])}
    ${special ? `<p class="note">Showing: <b>${esc(special)}</b>. <a href="#/orders">Show all orders</a></p>` : '<p><a href="#/orders?view=wildcard">Wildcard orders only</a></p>'}
    <form class="search" role="search"><input name="q" type="search" placeholder="Order number, name, phone or tracking ID" aria-label="Search orders" value="${esc(params.get('q') || '')}"><button class="btn">Search</button></form>
    ${
      data.orders.length
        ? `<ul class="list orders">${data.orders
            .map(
              (o) => `<li><a href="#/orders/${o.id}">
                <span><b>${esc(o.orderNumber)}</b><br><span class="small muted">${esc(when(o.createdAt))}</span></span>
                <span><b>${esc(o.name)}</b><br><span class="small muted">${esc(o.city)} · ${esc(plural(o.pieces, 'item'))}</span></span>
                <b class="num">${money(o.total)}</b>
                <span class="tags">${o.wildcard ? tag('wildcard', 'Wildcard') : ''}${tag(o.status)}${tag(o.paymentStatus)}</span></a></li>`
            )
            .join('')}</ul>${pager('orders', data, params)}`
        : `<div class="card muted">${special ? 'Nothing here any more.' : 'No orders here yet.'}</div>`
    }`
  );
  if (drawn) wireList('orders', params);
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

function customerCard(o) {
  if (o.erased) {
    return `<section class="card"><h2>Customer</h2><p class="muted">These details were erased on ${esc(when(o.erasedAt))}. The items and amounts are kept for your records.</p></section>`;
  }
  const wa = `https://wa.me/91${encodeURIComponent(o.phone)}?text=${encodeURIComponent(customerMessage(o))}`;
  const finished = o.status === 'delivered' || o.status === 'cancelled';
  return `<section class="card"><h2>Customer</h2>
    <dl><dt>Name</dt><dd>${esc(o.name)}</dd><dt>Phone</dt><dd>${esc(o.phone)}</dd><dt>Address</dt><dd>${esc(o.address)}</dd><dt>City</dt><dd>${esc(o.city)} – ${esc(o.pincode)}</dd><dt>Area</dt><dd>${o.area === 'kerala' ? 'Kerala' : 'Outside Kerala'}</dd>${o.customerNote ? `<dt>Note</dt><dd>${esc(o.customerNote)}</dd>` : ''}</dl>
    <div class="row"><a class="btn" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp customer</a><a class="btn btn--outline" href="tel:+91${esc(o.phone)}">Call</a></div>
    ${
      finished && isOwner()
        ? `<hr><p class="small muted">If the customer asks you to delete their details:</p>${
            o.eraseBlocked ? `<p class="small error-text">${esc(o.eraseBlocked)}</p>` : '<button class="btn btn--danger btn--sm" type="button" data-erase>Erase customer details</button>'
          }`
        : ''
    }
  </section>`;
}

function itemRow(o, i) {
  const name = i.productId ? `<a href="#/products/${i.productId}">${esc(i.title)}</a>` : esc(i.title);
  const gone = !i.removed
    ? ''
    : o.status === 'pending'
      ? '<br><span class="small error-text">This jersey or size is no longer in the catalog. Confirming takes no stock for it, so check you have it.</span>'
      : '<br><span class="small muted">No longer in the catalog</span>';
  return `<tr><td>${name}${i.stockTaken ? '<br><span class="small muted">Taken from stock</span>' : ''}${gone}</td><td>${esc(i.size)}</td><td class="num">${esc(i.quantity)}</td><td class="num">${money(i.lineTotal)}</td></tr>`;
}

function orderHtml(o) {
  return `<p><a href="#/orders">← All orders</a></p>
    <div class="head"><div><h1>${esc(o.orderNumber)}</h1><span class="muted">Placed ${esc(when(o.createdAt))}</span></div><div class="row">${o.wildcard ? tag('wildcard', 'Wildcard') : ''}${tag(o.status)}${tag(o.paymentStatus)}</div></div>
    <div class="cols">
      <div>
        <section class="card">${titled('h2', 'Items', 'order-items')}
          ${o.wildcard ? '<p class="note">Orbit Wildcard: the customer does not know which jersey this is. Keep it a surprise in your messages.</p>' : ''}
          <div class="table-wrap"><table><thead><tr><th>Jersey</th><th>Size</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
            <tbody>${o.items.map((i) => itemRow(o, i)).join('')}</tbody>
            <tfoot><tr><td colspan="3">Subtotal</td><td class="num">${money(o.subtotal)}</td></tr><tr><td colspan="3">Shipping</td><td class="num">${o.shipping ? money(o.shipping) : 'Free'}</td></tr><tr><td colspan="3">Total</td><td class="num">${money(o.total)}</td></tr></tfoot>
          </table></div>
          ${o.canRepick ? '<div class="row size-actions"><button type="button" class="btn btn--outline btn--sm" data-repick>Pick another jersey</button><span class="small muted">If this one is damaged or you don’t have it. The price stays the same.</span></div>' : ''}
        </section>
        ${
          o.erased
            ? ''
            : `<section class="card"><h2>Update order</h2>
          <form class="stack" data-order-form>
            <div class="two">
              <label class="field">Payment<select name="paymentStatus">${options(['unpaid', 'paid', 'refunded'].map((s) => [s, capital(s)]), o.paymentStatus)}</select></label>
              <label class="field">Courier<input name="courier" maxlength="80" value="${esc(o.courier)}"></label>
            </div>
            <label class="field">Tracking ID (the customer sees this once shipped)<input name="trackingId" maxlength="80" value="${esc(o.trackingId)}"></label>
            <label class="field">Private note (only admins see this)<textarea name="adminNote" maxlength="1000">${esc(o.adminNote)}</textarea></label>
            <div class="row"><button class="btn btn--outline" type="submit">Save details</button></div>
            ${o.status === 'pending' ? '<p class="note">Confirm after the customer’s WhatsApp message and payment arrive. Check the amount here, not in the message, because customers can edit the message. Confirming takes counted stock.</p>' : ''}
            ${o.nextStatuses.length ? `<div class="row">${o.nextStatuses.map((s) => `<button class="btn${s === 'cancelled' ? ' btn--danger' : ''}" type="button" data-to="${s}">${ACTIONS[s]}</button>`).join('')}</div>` : ''}
          </form>
        </section>`
        }
      </div>
      <div>
        ${customerCard(o)}
        <section class="card"><h2>History</h2><ul class="history">${o.history.map((h) => `<li><span>${tag(h.status)} ${h.by ? `<span class="small muted">by ${esc(h.by)}</span>` : ''}</span><span class="small muted">${esc(when(h.at))}</span></li>`).join('')}</ul></section>
      </div>
    </div>`;
}

export async function orderDetail(draw, params, id) {
  let o = await api('GET', '/orders/' + id);
  const paint = () => {
    if (!draw(o.orderNumber, orderHtml(o))) return;
    $('[data-repick]', view)?.addEventListener('click', (e) => {
      if (!confirm(`Pick a different random jersey for ${o.orderNumber}? The current one is “${o.items[0].title}”.`)) return;
      busy(e.currentTarget, async () => {
        o = await api('POST', `/orders/${id}/repick`);
        paint();
        toast(`Picked “${o.items[0].title}”.`);
      });
    });
    $('[data-erase]', view)?.addEventListener('click', (e) => {
      if (!confirm(`Erase the name, phone and address on ${o.orderNumber}? This cannot be undone, and the customer can no longer track the order.`)) return;
      busy(e.currentTarget, async () => {
        o = await api('POST', `/orders/${id}/erase`);
        paint();
        toast('Customer details erased.');
      });
    });
    const form = $('[data-order-form]', view);
    if (!form) return;
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
