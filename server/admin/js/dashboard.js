/* The dashboard: what needs doing now, then how the shop is doing over a period. */
import { $, api, chips, esc, isOwner, money, plural, tag, view, when } from './lib.js';
import { applyWidths, barList, columnChart, meter } from './charts.js';
import { info, titled } from './help.js';

const PERIODS = [['7', 'Last 7 days'], ['', 'Last 30 days'], ['90', 'Last 90 days']];

const dayName = (day, options) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...options });
const shortDay = (day) => dayName(day, { day: 'numeric', month: 'short' });
const age = (hours) => (hours < 48 ? plural(hours, 'hour') : plural(Math.floor(hours / 24), 'day'));
// in full under ten thousand, then thousands and lakhs
const shortMoney = (n) => (n >= 100000 ? `₹${+(n / 100000).toFixed(1)}L` : n >= 10000 ? `₹${+(n / 1000).toFixed(1)}K` : money(n));

/** work waiting right now. Each one links to a list that shows exactly those. */
function attention(s) {
  const a = s.attention;
  const items = [];
  const add = (count, text, href, urgent = false) => count && items.push({ text, href, urgent });
  add(a.refund, `${plural(a.refund, 'cancelled order')} still marked paid: check whether a refund is due`, '#/orders?view=refund', true);
  add(a.late, `${plural(a.late, 'order')} confirmed over 24 hours ago and not shipped (the shop promises dispatch within 24 hours)`, '#/orders?view=late', true);
  add(a.missing, `${plural(a.missing, 'waiting order')} with a jersey or size that is no longer in the catalog`, '#/orders?view=missing', true);
  add(a.pending, `${plural(a.pending, 'order')} waiting to be confirmed${a.oldestPendingHours >= 1 ? `; the oldest has waited ${age(a.oldestPendingHours)}` : ''}`, '#/orders?status=pending');
  add(a.unpaid, `${plural(a.unpaid, 'order')} confirmed or sent but not marked paid`, '#/orders?view=unpaid');
  if (s.wildcard.mode === 'open' && !s.wildcard.jerseys) add(1, 'The Orbit Wildcard is open, but no jersey can be picked from its pool', '#/wildcard', true);

  return `<section class="card">${titled('h2', 'Needs your attention', 'attention')}${
    items.length
      ? `<ul class="todo">${items
          .map(
            (i) => `<li class="${i.urgent ? 'is-urgent' : ''}"><span class="todo__mark" aria-hidden="true">${i.urgent ? '!' : '•'}</span><span>${i.urgent ? '<b>Urgent:</b> ' : ''}${esc(i.text)}</span><a class="btn btn--outline btn--xs" href="${i.href}">View</a></li>`
          )
          .join('')}</ul>`
      : '<p class="all-clear"><span aria-hidden="true">✓</span> Nothing is waiting for you.</p>'
  }</section>`;
}

// the "i" sits beside the tile, not inside it: a button cannot go inside a link
const tile = (label, value, href, help) =>
  `<div class="stat-box">${href ? `<a class="stat" href="${href}"><b>${esc(value)}</b>${label}</a>` : `<div class="stat"><b>${esc(value)}</b>${label}</div>`}${info(help, label)}</div>`;

const head = (title, href, link, help) => `<div class="card__head">${titled('h2', title, help)}${href ? `<a href="${href}">${link}</a>` : ''}</div>`;

function latestOrders(orders) {
  return `<section class="card">${head('Latest orders', '#/orders', 'All orders', 'latest-orders')}${
    orders.length
      ? `<table><thead><tr><th>Order and customer</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${orders
          .map(
            (o) => `<tr><td><a class="nowrap" href="#/orders/${o.id}">${esc(o.orderNumber)}</a> ${esc(o.name)}${o.wildcard ? ` ${tag('wildcard', 'Wildcard')}` : ''}<br><span class="small muted">${esc(when(o.createdAt))}</span></td>
              <td class="num">${money(o.total)}</td><td><span class="tags tags--start">${tag(o.status)}${tag(o.paymentStatus)}</span></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p class="muted">No orders yet. They appear here as soon as a customer checks out.</p>'
  }</section>`;
}

function wildcardCard(w) {
  const body =
    w.mode === 'open'
      ? `<p><b>Taking orders</b> at ${money(w.price)}</p>${meter(w.claimed, w.dailyLimit, `${w.claimed} of ${w.dailyLimit} places taken today`)}
         <p class="small">${esc(w.claimed)} of ${esc(w.dailyLimit)} places taken today · ${esc(plural(w.jerseys, 'jersey'))} can be picked</p>`
      : w.mode === 'soon'
        ? '<p><b>Coming soon.</b> <span class="muted">The home page shows it, but takes no orders. Set a price and open it in Wildcard.</span></p>'
        : '<p><b>Hidden</b> <span class="muted">from the home page.</span></p>';
  return `<section class="card">${head('Orbit Wildcard', '#/wildcard', 'Settings', 'wildcard-card')}${body}</section>`;
}

function catalogCard(s) {
  const p = s.products;
  const row = (label, href, help, value) => `<dt><a href="${href}">${label}</a>${info(help, label)}</dt><dd>${value}</dd>`;
  return `<section class="card"><div class="card__head"><div class="title-row"><h2>Catalog</h2></div><a href="#/products">All products</a></div>
    <dl class="pairs">
      ${row('All products', '#/products', 'all-products', esc(p.total))}
      ${row('On the website', '#/products?filter=published', 'on-website', esc(p.published))}
      ${row('Hidden', '#/products?filter=hidden', 'hidden-products', esc(p.hidden))}
      ${row('Sold out', '#/products?filter=soldout', 'sold-out', `${esc(p.soldOut)}${p.soldOutOnWebsite !== p.soldOut ? ` <span class="small muted">(${esc(p.soldOutOnWebsite)} on the website)</span>` : ''}`)}
    </dl>
    <p class="small muted">You count stock for ${esc(s.stock.counted)} of ${esc(s.stock.sizes)} sizes. Only those can show as running low.</p>
  </section>`;
}

function lowStock(s) {
  return `<section class="card">${head('Low stock', s.lowStockCount ? '#/products?filter=lowstock' : '', 'Show in Products', 'low-stock')}${
    s.lowStock.length
      ? `<div class="table-wrap"><table><thead><tr><th>Jersey</th><th>Size</th><th class="num">Left</th></tr></thead><tbody>${s.lowStock
          .map((r) => `<tr><td><a href="#/products/${r.productId}">${esc(r.title)}</a></td><td>${esc(r.size)}</td><td class="num">${r.stock === 0 ? tag('soldout', 'None') : esc(r.stock)}</td></tr>`)
          .join('')}</tbody></table></div>${s.lowStockCount > s.lowStock.length ? `<p class="small muted">And ${esc(s.lowStockCount - s.lowStock.length)} more sizes.</p>` : ''}`
      : '<p class="muted">Nothing is running low.</p>'
  }</section>`;
}

/** the change from the same number of days before. `upIsGood` is false for cancellations. */
function change(total, days, upIsGood = true) {
  const { now, before } = total;
  if (now === null) return '<span class="delta muted">No paid orders yet</span>';
  if (!before) return `<span class="delta muted">${now ? `None in the ${days} days before` : `Same as the ${days} days before`}</span>`;
  const percent = Math.round(((now - before) / before) * 100);
  if (!percent) return `<span class="delta muted">About the same as the ${days} days before</span>`;
  const up = percent > 0;
  return `<span class="delta ${up === upIsGood ? 'delta--good' : 'delta--bad'}">${up ? '▲' : '▼'} ${Math.abs(percent)}% <span class="muted">on the ${days} days before</span></span>`;
}

function sales(p) {
  const t = p.totals;
  const kpi = (label, value, delta, help, hero) =>
    `<div class="kpi${hero ? ' kpi--hero' : ''}"><span class="kpi__label">${label}${info(help, label)}</span><b class="kpi__value">${value}</b>${delta}</div>`;
  const total = p.daily.reduce((n, d) => n + d.sales, 0);
  const areaName = { kerala: 'Kerala', india: 'Outside Kerala' };
  const note = (text) => `<p class="small muted chart-note">${text}</p>`;
  const chart = (title, help, text, name) => `<section class="card">${titled('h2', title, help)}${note(text)}<div data-chart="${name}"></div></section>`;
  const breakdown = (title, help, body) => `<section class="card">${titled('h2', title, help)}${body}</section>`;
  const none = '<p class="muted">No paid orders in this period.</p>';
  return `<div class="kpis">
      ${kpi('Paid sales', money(t.sales.now), change(t.sales, p.days), 'paid-sales', true)}
      ${kpi('Paid orders', esc(t.paidOrders.now), change(t.paidOrders, p.days), 'paid-orders')}
      ${kpi('Average paid order', t.averageOrder.now === null ? '—' : money(t.averageOrder.now), change(t.averageOrder, p.days), 'average-order')}
      ${kpi('Items sold', esc(t.items.now), change(t.items, p.days), 'items-sold')}
      ${kpi('Orders placed', esc(t.orders.now), change(t.orders, p.days), 'orders-placed')}
      ${kpi('Cancelled', esc(t.cancelled.now), change(t.cancelled, p.days, false), 'cancelled')}
    </div>
    ${note(`▲ up and ▼ down compare with the ${p.days} days just before. Green is good news, red is not. Tap an <b>i</b> to see what a number means.`)}
    <div class="dash-cols dash-cols--even">
      ${chart('Paid sales per day', 'chart-sales', 'Each bar is one day, oldest on the left. A taller bar means more money. Point at or tap a bar for the amount.', 'sales')}
      ${chart('Orders placed per day', 'chart-orders', 'Each bar is one day, oldest on the left. A taller bar means more orders. Point at or tap a bar for the number.', 'orders')}
    </div>
    <details class="card"><summary>Daily figures as a table</summary>${note('The same figures as the two charts, newest day first.')}<div class="table-wrap"><table><thead><tr><th>Day</th><th class="num">Paid sales</th><th class="num">Orders placed</th></tr></thead><tbody>${[...p.daily]
      .reverse()
      .map((d) => `<tr><td>${esc(dayName(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td class="num">${money(d.sales)}</td><td class="num">${esc(d.orders)}</td></tr>`)
      .join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${money(total)}</td><td class="num">${esc(t.orders.now)}</td></tr></tfoot></table></div></details>
    <div class="dash-cols dash-cols--three">
      ${breakdown(
        'Top jerseys',
        'top-jerseys',
        p.topProducts.length
          ? `<table><thead><tr><th>Jersey</th><th class="num">Sold</th><th class="num">Value</th></tr></thead><tbody>${p.topProducts
              .map((r) => `<tr><td>${r.productId ? `<a href="#/products/${r.productId}">${esc(r.title)}</a>` : esc(r.title)}</td><td class="num">${esc(r.units)}</td><td class="num">${money(r.sales)}</td></tr>`)
              .join('')}</tbody></table>`
          : none
      )}
      ${breakdown('Sizes sold', 'sizes-sold', p.sizes.length ? note('A longer bar means more pieces sold.') + barList(p.sizes.map((s) => ({ name: s.size, value: s.units, text: String(s.units) }))) : none)}
      ${breakdown(
        'Delivery areas',
        'delivery-areas',
        p.areas.some((a) => a.orders)
          ? note('A longer bar means more money.') + barList(p.areas.map((a) => ({ name: areaName[a.area], value: a.sales, text: `${money(a.sales)} · ${plural(a.orders, 'order')}` })))
          : none
      )}
    </div>`;
}

const activityCard = (entries) =>
  `<section class="card">${head('Latest activity', '#/activity', 'All activity', 'latest-activity')}<ul class="history">${entries
    .map((e) => `<li><span>${esc(e.summary)} <span class="small muted">by ${esc(e.actor || 'someone not signed in')}</span></span><span class="small muted">${esc(when(e.at))}</span></li>`)
    .join('')}</ul></section>`;

export default async function dashboard(draw, params) {
  const days = ['7', '90'].includes(params.get('days')) ? params.get('days') : '';
  const [s, log] = await Promise.all([api('GET', `/summary${days ? `?days=${days}` : ''}`), isOwner() ? api('GET', '/audit') : null]);
  const drawn = draw(
    'Dashboard',
    `<div class="head"><div><h1>Dashboard</h1><span class="muted">${esc(dayName(s.today, { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div><a class="btn" href="#/products/new">Add product</a></div>
    ${attention(s)}
    ${titled('h2', 'Orders', 'orders-now')}
    <div class="stats">
      ${tile('To confirm', s.byStatus.pending, '#/orders?status=pending', 'to-confirm')}
      ${tile('To pack', s.byStatus.confirmed, '#/orders?status=confirmed', 'to-pack')}
      ${tile('To ship', s.byStatus.packed, '#/orders?status=packed', 'to-ship')}
      ${tile('On the way', s.byStatus.shipped, '#/orders?status=shipped', 'on-the-way')}
      ${tile('Placed today', s.ordersToday, null, 'placed-today')}
      ${tile('Paid sales this month', money(s.paidThisMonth), null, 'paid-month')}
    </div>
    <div class="dash-cols">
      ${latestOrders(s.recentOrders)}
      <div>${wildcardCard(s.wildcard)}${catalogCard(s)}</div>
    </div>
    ${lowStock(s)}
    ${titled('h2', 'Sales', 'sales-section', 'gap')}
    ${chips('', params, 'days', PERIODS)}
    <div data-sales>${sales(s.performance)}</div>
    ${log ? activityCard(log.entries.slice(0, 8)) : ''}`
  );
  if (!drawn) return;
  applyWidths(view);
  const points = (key) => s.performance.daily.map((d) => ({ label: shortDay(d.day), name: dayName(d.day, { weekday: 'short', day: 'numeric', month: 'short' }), value: d[key] }));
  columnChart($('[data-chart="sales"]', view), { title: 'Paid sales per day', points: points('sales'), valueText: money, tickText: shortMoney });
  columnChart($('[data-chart="orders"]', view), { title: 'Orders placed per day', points: points('orders'), valueText: (n) => plural(n, 'order'), tickText: String, whole: true });
}
