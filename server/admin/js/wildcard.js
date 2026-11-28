/* The Orbit Wildcard: whether it takes orders, its price, places per day and which jerseys it
   picks from. Only an owner can change these. */
import { $, api, busy, esc, isOwner, options, plural, tag, toast, unsaved, view } from './lib.js';
import { applyWidths, barList, meter } from './charts.js';
import { titled } from './help.js';

const MODES = [
  ['open', 'Taking orders', 'Customers can buy it, until today’s places are gone.'],
  ['soon', 'Coming soon', 'Shown on the home page; the button says ordering opens soon.'],
  ['off', 'Hidden', 'Not shown on the home page at all.'],
];

function page(w, canEdit) {
  const s = w.settings;
  const locked = canEdit ? '' : ' disabled';
  return `<div class="head"><h1>Orbit Wildcard</h1><a class="btn btn--outline" href="/index.html" target="_blank" rel="noopener">View home page</a></div>
  ${w.hiddenByConfig ? '<p class="note">The wildcard section is switched off in assets/js/config.js (wildcard: null), so it stays hidden whatever is chosen here.</p>' : ''}
  <div class="dash-cols dash-cols--even">
    <section class="card">${titled('h2', 'Today', 'wildcard-today')}
      <p><span class="kpi__value">${esc(w.claimed)}</span> of ${esc(s.dailyLimit)} places taken · <b>${esc(w.left)}</b> left</p>
      ${meter(w.claimed, s.dailyLimit, `${w.claimed} of ${s.dailyLimit} places taken today`)}
      <p class="small muted">A new day starts at midnight, Indian time. Cancelling a wildcard order frees its place.</p>
    </section>
    <section class="card">${titled('h2', 'Jerseys it can pick from now', 'wildcard-pool')}
      ${
        !w.pool.exists
          ? '<p class="error">The chosen collection no longer exists, so nothing can be picked. Choose another below.</p>'
          : w.pool.jerseys
            ? `<p>${esc(plural(w.pool.jerseys, 'jersey'))} on sale. Each bar shows how many come in that size; longer means more to pick from.</p>${barList(w.pool.sizes.map((x) => ({ name: x.size, value: x.jerseys, text: String(x.jerseys) })))}`
            : '<p class="error">No jersey in this pool is on sale, so customers can’t order.</p>'
      }
    </section>
  </div>
  <section class="card"><h2>Settings</h2>
    ${canEdit ? '' : '<p class="note">Only an owner can change these.</p>'}
    <form class="stack" data-wildcard novalidate>
      <fieldset class="radios"><legend>On the website</legend>${MODES.map(
        ([value, label, hint]) => `<label class="check"><input type="radio" name="mode" value="${value}"${s.mode === value ? ' checked' : ''}${locked}> <span><b>${label}</b><br><span class="small muted">${hint}</span></span></label>`
      ).join('')}</fieldset>
      <div class="two">
        <label class="field">Price ₹ (shipping is added at checkout)<input name="price" type="number" min="1" max="100000" step="1" placeholder="Set a price to take orders" value="${esc(s.price ?? '')}"${locked}></label>
        <label class="field">Places per day (people per day)<input name="dailyLimit" type="number" min="1" max="${w.maxDaily}" step="1" value="${esc(s.dailyLimit)}"${locked}></label>
      </div>
      <label class="field">Pick jerseys from<select name="pool"${locked}>${options(
        [['all', 'All jerseys on sale (never socks)'], ...w.collections.filter((c) => c.key !== 'socks').map((c) => [c.key, `Only “${c.title}”`])],
        s.pool
      )}</select></label>
      <p class="small muted">To choose exactly which jerseys can be picked, make a collection (for example “Wildcard pool”), add jerseys to it, and choose it here. Every jersey sells at the wildcard price.</p>
      ${canEdit ? '<div class="row"><button class="btn" type="submit">Save</button></div>' : ''}
    </form>
  </section>
  <section class="card">${titled('h2', 'Today’s wildcard orders', 'wildcard-orders')}
    ${
      w.today.length
        ? `<p class="small muted">Only admins see which jersey was picked.</p><table><thead><tr><th>Order and customer</th><th>Jersey picked</th><th>Status</th></tr></thead><tbody>${w.today
            .map(
              (o) => `<tr><td><a class="nowrap" href="#/orders/${o.id}">${esc(o.orderNumber)}</a> ${esc(o.name)}<br><span class="small muted">Size ${esc(o.size)}</span></td><td>${esc(o.jersey)}</td><td>${tag(o.status)}</td></tr>`
            )
            .join('')}</tbody></table>`
        : '<p class="muted">None yet today.</p>'
    }
    <p><a href="#/orders?view=wildcard">All wildcard orders</a></p>
  </section>
  <section class="card"><h2>How it works</h2>
    <ul class="small">
      <li>The server picks the jersey at random in the customer’s size, and skips jerseys already picked today while others are left.</li>
      <li>The customer never sees which jersey it is: not at checkout, in the WhatsApp message or on Order Tracking.</li>
      <li>One per phone number per day.</li>
      <li>The website takes no payment, so someone could take places with made-up numbers. Cancel a fake order and its place is free again.</li>
    </ul>
  </section>`;
}

export default async function wildcardScreen(draw) {
  let w = await api('GET', '/wildcard');
  const paint = () => {
    if (!draw('Orbit Wildcard', page(w, isOwner()))) return;
    applyWidths(view);
    const form = $('[data-wildcard]', view);
    form.addEventListener('input', () => (unsaved.dirty = true));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('[type=submit]', form), async () => {
        const price = form.elements.price.value.trim();
        const limit = Number(form.elements.dailyLimit.value);
        if (!Number.isInteger(limit) || limit < 1 || limit > w.maxDaily) throw new Error(`Places per day: a whole number from 1 to ${w.maxDaily}. To stop orders, choose “Coming soon” or “Hidden”.`);
        if (price !== '' && !(Number(price) >= 1)) throw new Error('The price must be ₹1 or more, or left empty.');
        const mode = form.elements.mode.value;
        if (mode === 'open' && price === '') throw new Error('Set a price before taking orders.');
        w = await api('PUT', '/wildcard', { mode, price: price === '' ? null : Number(price), dailyLimit: limit, pool: form.elements.pool.value, version: w.settings.version });
        unsaved.dirty = false;
        paint();
        toast(mode === 'open' ? 'Saved. The wildcard is taking orders.' : 'Saved. The website is updated.');
      });
    });
  };
  paint();
}
