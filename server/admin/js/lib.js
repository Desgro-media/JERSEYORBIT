/* Shared helpers for the admin panel. Plain JavaScript modules, no build step.
   Rule for every screen: anything that came from the server goes through esc() before it becomes
   HTML. Order details are typed by strangers. */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const when = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const tag = (value, text = value) => `<span class="tag tag--${esc(value)}">${esc(text)}</span>`;
export const photoSrc = (url) => '/' + url.replace(/^\//, '');
export const view = $('[data-view]');

/* Who is signed in. The server checks every request itself; this only decides what to show. */
export const session = { user: null, lastCall: 0, onSignedOut: () => {} };
export const isOwner = () => session.user?.role === 'owner';

/* A screen sets `dirty` while leaving it would lose typed changes. */
export const unsaved = { dirty: false };
/* admin.js fills this in: draw the current screen again */
export const nav = { reload: () => {} };

export function toast(message, bad) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' toast--bad' : '');
  el.setAttribute('role', bad ? 'alert' : 'status');
  el.textContent = message;
  $('[data-toasts]').appendChild(el);
  setTimeout(() => el.remove(), bad ? 8000 : 4000);
}

export async function api(method, path, body) {
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
  session.lastCall = Date.now();
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const err = new Error((data && data.message) || 'Something went wrong.');
  err.code = data && data.error;
  if (res.status === 401 && path !== '/login') {
    session.onSignedOut();
    err.handled = true;
  }
  throw err;
}

/** run an action from a button: block double clicks and show what went wrong */
export async function busy(button, fn) {
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (err) {
    if (!err.handled) toast(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- lists: filters and pages live in the address, so Back works ---------- */

/** the address of a list with one setting changed. Changing a setting goes back to page 1. */
export const listUrl = (section, params, key, value) => {
  const q = new URLSearchParams(params);
  q.delete('page');
  if (value) q.set(key, value);
  else q.delete(key);
  return `#/${section}${q.toString() ? '?' + q : ''}`;
};

export const pager = (section, data, params) => {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (n, text) => {
    const q = new URLSearchParams(params);
    q.set('page', n);
    return `<a class="btn btn--outline btn--sm" href="#/${section}?${esc(q.toString())}">${text}</a>`;
  };
  return `<div class="pager"><span>${data.page > 1 ? link(data.page - 1, '← Previous') : ''}</span><span class="small muted">Page ${data.page} of ${pages} · ${data.total} in total</span><span>${data.page < pages ? link(data.page + 1, 'Next →') : ''}</span></div>`;
};

/** a page past the end (after deleting the last items, say) moves to the last page. True if it did. */
export function pastLastPage(section, data, params, shown) {
  if (shown || !data.total || data.page <= 1) return false;
  const q = new URLSearchParams(params);
  q.set('page', Math.ceil(data.total / data.pageSize));
  history.replaceState(null, '', `#/${section}?${q}`);
  nav.reload();
  return true;
}

/** wire the search box and any <select data-param="name"> */
export function wireList(section, params) {
  const form = $('form.search', view);
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = listUrl(section, params, 'q', form.q.value.trim());
  });
  $$('select[data-param]', view).forEach((select) =>
    select.addEventListener('change', () => (location.hash = listUrl(section, params, select.dataset.param, select.value)))
  );
}

export const chips = (section, params, key, choices) =>
  `<div class="chips">${choices
    .map(([value, text]) => `<a class="${(params.get(key) || '') === value ? 'is-on' : ''}" href="${esc(listUrl(section, params, key, value))}">${text}</a>`)
    .join('')}</div>`;

export const options = (choices, selected) =>
  choices.map(([value, text]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`).join('');
