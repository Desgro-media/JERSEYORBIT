/* The signed-in admin's own password and sessions. */
import { $, api, busy, capital, esc, isOwner, plural, session, tag, toast, view } from './lib.js';

export default async function account(draw) {
  const { username, role } = session.user;
  const drawn = draw(
    'Account',
    `<div class="head"><h1>Your account</h1></div>
    <section class="card"><h2>Signed in as</h2>
      <p><b>${esc(username)}</b> ${tag('confirmed', capital(role))}</p>
      <p class="small muted">${
        isOwner()
          ? 'Owners can do everything.'
          : 'Staff manage orders and products. Deleting products or collections, erasing customer details and the activity log need an owner.'
      }</p>
    </section>
    <section class="card"><h2>Change your password</h2>
      <form class="stack narrow" data-password>
        <input type="text" autocomplete="username" value="${esc(username)}" hidden>
        <label class="field">Current password<input name="current" type="password" autocomplete="current-password" maxlength="200" required></label>
        <label class="field">New password (at least 12 characters)<input name="next" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
        <label class="field">New password again<input name="again" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
        <div class="row"><button class="btn" type="submit">Change password</button></div>
        <p class="small muted">This also signs you out on every other device.</p>
      </form>
    </section>
    <section class="card"><h2>Other devices</h2>
      <p class="small muted">Use this if you lost a phone, or stayed signed in on a shared computer. You are signed out automatically after an hour without use.</p>
      <button class="btn btn--outline" type="button" data-revoke>Sign out other devices</button>
    </section>
    <section class="card"><h2>Adding and removing admins</h2>
      <p class="small muted">For safety this is only possible on the server, not from this website: <code>npm run admin:create</code> and <code>npm run admin:remove -- username</code></p>
    </section>`
  );
  if (!drawn) return;

  const form = $('[data-password]', view);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('[type=submit]', form), async () => {
      if (form.elements.next.value !== form.elements.again.value) throw new Error('The two new passwords do not match.');
      await api('POST', '/password', { currentPassword: form.elements.current.value, newPassword: form.elements.next.value });
      form.reset();
      toast('Password changed. Other devices have been signed out.');
    });
  });
  $('[data-revoke]', view).addEventListener('click', (e) =>
    busy(e.currentTarget, async () => {
      const { ended } = await api('POST', '/sessions/revoke-others');
      toast(ended ? `Signed out ${plural(ended, 'other session')}.` : 'No other devices were signed in.');
    })
  );
}
