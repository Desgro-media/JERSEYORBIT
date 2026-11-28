/* The activity log (owners only). The database lets it be added to, never edited. */
import { api, chips, esc, pager, pastLastPage, when } from './lib.js';
import { titled } from './help.js';

const AREAS = [['', 'All'], ['auth', 'Sign-ins'], ['product', 'Products'], ['photo', 'Photos'], ['collection', 'Collections'], ['order', 'Orders'], ['storefront', 'Storefront'], ['wildcard', 'Wildcard'], ['admin', 'Accounts']];

/** a link to what an entry is about, when there is a screen for it */
function link(entry) {
  const [kind, id] = entry.target.split(':');
  if (kind === 'product' && /^\d+$/.test(id) && entry.action !== 'product.delete') return ` <a href="#/products/${id}">Open</a>`;
  if (kind === 'order') return ` <a href="#/orders?q=${encodeURIComponent(id)}">Open</a>`;
  return '';
}

export default async function activity(draw, params) {
  const data = await api('GET', '/audit?' + params);
  if (pastLastPage('activity', data, params, data.entries.length)) return;
  draw(
    'Activity',
    `<div class="head">${titled('h1', 'Activity', 'activity-log')}</div>
    <p class="muted">Who did what, and when. Entries cannot be edited or removed here.</p>
    ${chips('activity', params, 'area', AREAS)}
    ${
      data.entries.length
        ? `<div class="card table-wrap"><table class="activity">
            <thead><tr><th>When</th><th>Who</th><th>What happened</th><th>From</th></tr></thead>
            <tbody>${data.entries
              .map(
                (e) => `<tr${/failed|denied/.test(e.action) ? ' class="is-warning"' : ''}><td>${esc(when(e.at))}</td><td>${esc(e.actor || 'Not signed in')}</td><td>${esc(e.summary)}${link(e)}</td><td class="small muted">${esc(e.ip)}</td></tr>`
              )
              .join('')}</tbody>
          </table></div>${pager('activity', data, params)}`
        : '<div class="card muted">Nothing here yet.</div>'
    }`
  );
}
