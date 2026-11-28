/* Jersey Orbit admin: sign-in and screen switching. Each screen is a file in js/. */
import { $, $$, api, busy, esc, isOwner, nav, session, toast, unsaved, view } from './js/lib.js';
import { hideInfo } from './js/help.js';
import account from './js/account.js';
import activity from './js/activity.js';
import collections from './js/collections.js';
import dashboard from './js/dashboard.js';
import { orderDetail, orderList } from './js/orders.js';
import productEditor from './js/product-editor.js';
import productList from './js/products.js';
import storefront from './js/storefront.js';
import wildcard from './js/wildcard.js';

const bar = $('[data-bar]');
const gate = $('[data-gate]');
let renderId = 0;
let shownHash = ''; // the address of the screen now showing
let shownFor = ''; // who it was drawn for

function pickScreen(section, id) {
  if (section === 'orders') return /^\d+$/.test(id || '') ? orderDetail : orderList;
  if (section === 'products') return /^(\d+|new)$/.test(id || '') ? productEditor : productList;
  if (section === 'collections') return collections;
  if (section === 'storefront') return storefront;
  if (section === 'wildcard') return wildcard;
  if (section === 'activity' && isOwner()) return activity;
  if (section === 'account') return account;
  return dashboard;
}

function showChrome(section) {
  gate.hidden = true;
  gate.textContent = '';
  view.hidden = false;
  bar.hidden = false;
  $('[data-user]').textContent = session.user.username;
  $$('[data-owner-only]').forEach((el) => (el.hidden = !isOwner()));
  $$('[data-nav]').forEach((a) => {
    if (a.dataset.nav === (section || 'home')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function route() {
  if (!session.user) return showSignIn();
  const mine = ++renderId;
  shownHash = location.hash;
  unsaved.dirty = false;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const [section, id] = path.split('/');
  showChrome(section);
  shownFor = session.user.username;
  /* a slow answer for a screen the admin has already left must not replace the current one.
     Screens stop when this returns false, so they never wire up another screen's buttons. */
  const draw = (title, html) => {
    if (mine !== renderId) return false;
    hideInfo(); // its button is about to be replaced
    document.title = `${title} — Jersey Orbit Admin`;
    view.innerHTML = html;
    return true;
  };
  try {
    await pickScreen(section, id)(draw, new URLSearchParams(query || ''), id);
  } catch (err) {
    if (!err.handled && mine === renderId) view.innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
  }
}
nav.reload = route;

/* ---------- sign in ---------- */

/* The screen underneath is hidden, not thrown away: if the session ends while something is half
   typed, signing in again brings it back. */
function showSignIn(message) {
  $$('dialog[open]').forEach((d) => d.close()); // a pop-up would sit on top of the sign-in form
  hideInfo();
  bar.hidden = true;
  view.hidden = true;
  gate.hidden = false;
  document.title = 'Sign in — Jersey Orbit Admin';
  gate.innerHTML = `<form class="card login stack">
    <h1>Jersey Orbit Admin</h1>
    ${message ? `<p class="note">${esc(message)}</p>` : ''}
    <label class="field">Username<input name="username" autocomplete="username" autocapitalize="off" required></label>
    <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
    <p class="error" role="alert" hidden></p>
    <button class="btn" type="submit">Sign in</button>
  </form>`;
  const form = $('form', gate);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('button', form), async () => {
      try {
        session.user = await api('POST', '/login', { username: form.username.value, password: form.password.value });
      } catch (err) {
        const box = $('.error', form);
        box.hidden = false;
        box.textContent = err.message;
        return;
      }
      if (unsaved.dirty && shownFor === session.user.username) {
        showChrome(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]);
        toast('Signed in again. Your changes are still here: press Save.');
      } else route();
    });
  });
  form.username.focus();
}

session.onSignedOut = () => {
  if (!gate.hidden && gate.childElementCount) return; // already asking
  const wasSignedIn = !!session.user;
  session.user = null;
  renderId++;
  showSignIn(wasSignedIn ? 'You were signed out. Sign in again to carry on.' : '');
};

$('[data-logout]').addEventListener('click', (e) => {
  if (unsaved.dirty && !confirm('Sign out? Your changes are not saved.')) return;
  busy(e.currentTarget, async () => {
    await api('POST', '/logout');
    session.user = null;
    unsaved.dirty = false;
    renderId++;
    view.textContent = ''; // nothing from this session stays on the page
    history.replaceState(null, '', '#/');
    showSignIn();
  });
});

/* ---------- keeping and losing work ---------- */

addEventListener('hashchange', () => {
  if (!session.user) return; // the sign-in form is showing; the new address is drawn after signing in
  if (unsaved.dirty && !confirm('Leave this page? Your changes are not saved.')) {
    history.replaceState(null, '', shownHash || '#/');
    return;
  }
  // changing the dashboard's period keeps your place; moving to another screen starts at the top
  const onDashboard = (hash) => /^(#\/?)?(\?.*)?$/.test(hash);
  if (!(onDashboard(shownHash) && onDashboard(location.hash))) scrollTo(0, 0);
  route();
});
addEventListener('beforeunload', (e) => {
  if (!unsaved.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

// the server signs an admin out after an hour without requests, so tell it while someone is still working
const PING_AFTER = 5 * 60_000;
const stillHere = () => {
  if (!session.user || Date.now() - session.lastCall < PING_AFTER) return;
  session.lastCall = Date.now();
  api('GET', '/me').catch(() => {});
};
addEventListener('keydown', stillHere);
addEventListener('pointerdown', stillHere);

// a photo dropped just outside the drop area must not make the browser open it and leave the page
for (const type of ['dragover', 'drop']) {
  addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
}

api('GET', '/me')
  .then((me) => {
    session.user = me;
    route();
  })
  .catch((err) => {
    if (!err.handled) view.innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
  });
