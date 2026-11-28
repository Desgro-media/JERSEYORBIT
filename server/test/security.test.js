/* The security checklist in specs/security_and_admin_design.md, one section at a time. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { removeAdmin, upsertAdmin } from '../src/auth.js';
import { createDb } from '../src/db.js';
import { setUpAppRole, TABLE_GRANTS } from '../src/db-roles.js';
import { loadEnv, ROOT } from '../src/env.js';
import { pendingMigrations } from '../src/migrate.js';
import {
  PASSWORD, TEST_URL, asAdmin, caller, catalog, cookieFrom, customer, editBody, jerseys, jpeg, line, multipart, newProduct, ok, onSale, setUp, signIn, uploadPhoto,
} from './helpers.js';

const STAFF_PASSWORD = 'staff-tulip-lantern';
const APP_ROLE = 'jerseyorbit_app_test'; // not the real role name: roles are shared by every database on the server
const STRANGER = 'jerseyorbit_stranger_test';

let shopUnderTest, db, app, uploadDir, call, admin;

const loginAs = (url, user, password) => {
  const next = new URL(url);
  next.username = user;
  next.password = password;
  return next.toString();
};
const dropRole = async (role) => {
  if ((await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount) {
    await db.query(`DROP OWNED BY ${role}`);
    await db.query(`DROP ROLE ${role}`);
  }
};
const sessionHash = (cookie) => crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex');
const lastEntry = async (action) => (await db.query('SELECT * FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1', [action])).rows[0];

/** a staff account with its own session */
async function staff(name = 'helper') {
  await upsertAdmin(db, name, STAFF_PASSWORD);
  const cookie = await signIn(call, name, STAFF_PASSWORD);
  return { cookie, as: asAdmin(call, cookie) };
}

before(async () => {
  shopUnderTest = await setUp();
  ({ db, app, uploadDir, call, admin } = shopUnderTest);
});
after(() => shopUnderTest?.stop());

describe('row-level security and the website’s own database login', () => {
  const password = 'role-password-for-tests-only';
  let appDb, locked, lockedCall;

  before(async () => {
    await setUpAppRole(db, { role: APP_ROLE, password });
    appDb = createDb(loginAs(TEST_URL, APP_ROLE, password));
    locked = await buildApp({ db: appDb, env: { production: false, trustProxy: false, uploadDir }, logger: false });
    lockedCall = caller(locked);
  });
  after(async () => {
    await locked?.close();
    await appDb?.close();
    await dropRole(APP_ROLE);
    await dropRole(STRANGER);
  });

  test('row-level security is on for every table, and each one has its permissions listed', async () => {
    const { rows } = await db.query(
      "SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'"
    );
    assert.deepEqual(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname), [], 'new tables need ENABLE ROW LEVEL SECURITY');
    assert.deepEqual(rows.map((r) => r.relname).sort(), Object.keys(TABLE_GRANTS).sort(), 'new tables need an entry in db-roles.js');
  });

  test('a login without a policy sees nothing, even when it may read the tables', async () => {
    await dropRole(STRANGER);
    await db.query(`CREATE ROLE ${STRANGER} LOGIN PASSWORD '${password}'`);
    await db.query(`GRANT USAGE ON SCHEMA public TO ${STRANGER}`);
    await db.query(`GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${STRANGER}`);
    const stranger = createDb(loginAs(TEST_URL, STRANGER, password));
    try {
      for (const table of Object.keys(TABLE_GRANTS)) {
        assert.equal((await stranger.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n, 0, table);
      }
      await assert.rejects(stranger.query("INSERT INTO collections (key, title) VALUES ('sneaky', 'Sneaky')"), /row-level security/);
    } finally {
      await stranger.close();
    }
  });

  test('the whole shop works with the least-privilege login', async () => {
    assert.deepEqual(await pendingMigrations(appDb), [], 'the server can start without any right to change the database');
    await upsertAdmin(db, 'limited', STAFF_PASSWORD, 'owner');
    let cookie = await signIn(lockedCall, 'limited', STAFF_PASSWORD);
    let as = asAdmin(lockedCall, cookie);

    const shown = await catalog(lockedCall);
    assert.ok(shown.products.length > 200);
    const jersey = shown.products.find((p) => p.id === jerseys[0].id);
    const placed = await ok(lockedCall('POST', '/api/orders', { body: customer({ items: [line(onSale(jersey))] }) }), 201);
    const orderId = (await ok(as('GET', `/orders?q=${placed.orderNumber}`))).orders[0].id;
    await ok(as('PATCH', `/orders/${orderId}`, { status: 'confirmed', paymentStatus: 'paid' }));
    await ok(as('PATCH', `/orders/${orderId}`, { status: 'cancelled' }));
    await ok(lockedCall('POST', '/api/orders/track', { body: { orderNumber: placed.orderNumber, phone: '9876543210' } }));
    await ok(as('PATCH', `/orders/${orderId}`, { paymentStatus: 'refunded' }));
    await ok(as('POST', `/orders/${orderId}/erase`));
    await ok(as('GET', '/summary'));

    await ok(as('POST', '/collections', { title: 'Limited Login Picks' }), 201);
    await ok(as('PATCH', '/collections/limited-login-picks', { blurb: 'Short' }));
    let product = await ok(as('POST', '/products', newProduct({ collections: ['limited-login-picks'] })), 201);
    product = await uploadPhoto(as, product.id);
    product = await uploadPhoto(as, product.id);
    await ok(as('PUT', `/products/${product.id}/images/order`, { ids: product.images.map((i) => i.id).reverse() }));
    await ok(as('DELETE', `/products/${product.id}/images/${product.images[0].id}`));
    product = await ok(as('GET', `/products/${product.id}`));
    await ok(as('PUT', `/products/${product.id}`, { ...editBody(product), published: true }));
    await ok(as('GET', '/products?sort=stock&filter=lowstock'));
    const copy = await ok(as('POST', `/products/${product.id}/duplicate`), 201);
    await ok(as('POST', `/products/${copy.id}/move`, { to: 'down' }));
    await ok(as('POST', '/products/bulk', { ids: [copy.id, product.id], action: 'discount', percent: 10 }));
    await ok(as('POST', '/products/bulk', { ids: [copy.id], action: 'feature' }));
    await ok(as('POST', '/products/bulk', { ids: [copy.id], action: 'delete' }));
    await ok(as('DELETE', '/collections/limited-login-picks'));
    await ok(as('DELETE', `/products/${product.id}`));
    await ok(as('GET', '/audit'));

    // home page: slideshow, thumbnails and uploads
    let front = await ok(as('GET', '/storefront'));
    const { headers, payload } = multipart(await jpeg());
    const upload = await ok(as('POST', '/site-images', undefined, { headers, payload }), 201);
    const slides = front.hero.slides.map(({ photos, collectionMissing, ...s }) => ({ ...s, photos: [null, null] }));
    slides[0].photos[0] = { kind: 'upload', id: upload.id };
    front = await ok(as('PUT', '/storefront/hero', { version: front.hero.version, slides }));
    await ok(as('PUT', '/storefront/thumbnails/retro', { photo: { kind: 'upload', id: upload.id } }));
    await ok(as('GET', '/photos?q=real'));
    await ok(as('PUT', '/storefront/thumbnails/retro', { photo: null }));
    await ok(as('DELETE', `/storefront/hero?version=${front.hero.version}`));

    // the wildcard
    const settings = (await ok(as('GET', '/wildcard'))).settings;
    await ok(as('PUT', '/wildcard', { mode: 'open', price: 499, dailyLimit: 5, pool: 'all', version: settings.version }));
    const status = await ok(lockedCall('GET', '/api/wildcard'));
    const surprise = await ok(lockedCall('POST', '/api/wildcard/orders', { body: customer({ phone: '9812300000', size: status.sizes[0] }) }), 201);
    const surpriseId = (await ok(as('GET', `/orders?q=${surprise.orderNumber}`))).orders[0].id;
    await ok(as('POST', `/orders/${surpriseId}/repick`));
    await ok(as('PATCH', `/orders/${surpriseId}`, { status: 'cancelled' }));
    await ok(as('GET', '/summary?days=7'));
    await catalog(lockedCall);

    const changed = await as('POST', '/password', { currentPassword: STAFF_PASSWORD, newPassword: 'another-quiet-harbour' });
    assert.equal(changed.statusCode, 200, changed.body);
    cookie = cookieFrom(changed);
    as = asAdmin(lockedCall, cookie);
    await ok(as('POST', '/sessions/revoke-others'));
    await ok(as('POST', '/logout'));
    await removeAdmin(db, 'limited');
  });

  test('it cannot do what the website never needs', async () => {
    const refused = [
      "INSERT INTO admins (username, password_hash, role) VALUES ('intruder', 'x', 'owner')",
      "UPDATE admins SET role = 'owner'",
      "UPDATE admins SET username = 'someone-else'",
      'DELETE FROM admins',
      "UPDATE audit_log SET actor = 'nobody'",
      'DELETE FROM audit_log',
      'TRUNCATE audit_log',
      'DELETE FROM orders',
      'DELETE FROM retired_products',
      'CREATE TABLE sneaky (id int)',
      'DROP TABLE products',
      'ALTER TABLE audit_log DISABLE TRIGGER ALL',
      'ALTER TABLE orders DISABLE ROW LEVEL SECURITY',
      "UPDATE schema_migrations SET name = 'x'",
    ];
    for (const statement of refused) await assert.rejects(appDb.query(statement), { code: '42501' }, statement);
  });

  test('even the owner connection cannot quietly edit the activity log', async () => {
    for (const statement of ["UPDATE audit_log SET actor = 'nobody'", 'DELETE FROM audit_log', 'TRUNCATE audit_log']) {
      await assert.rejects(db.query(statement), /only be added to/, statement);
    }
  });
});

describe('who may do what (privilege escalation)', () => {
  /** the server's own route list, so a route added later is covered without editing this test */
  const adminRoutes = () => app.routeList.filter((r) => r.url.startsWith('/api/admin') && !r.config.open);
  const address = (url) => url.replace(':imageId', '1').replace(':id', '1').replace(':key', 'something');

  test('every admin route refuses a visitor who is not signed in', async () => {
    const routes = adminRoutes();
    assert.ok(routes.length > 25, `only ${routes.length} routes found`);
    for (const route of routes) {
      const res = await call(route.method, address(route.url), { headers: { 'x-jo-admin': '1', cookie: 'jo_admin=made-up' } });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} gave ${res.statusCode}`);
    }
    assert.deepEqual(app.routeList.filter((r) => r.config.open).map((r) => r.url), ['/api/admin/login'], 'only sign-in is open');
  });

  test('every owner-only route refuses staff, and the refusal is logged', async () => {
    const { as } = await staff();
    const owned = adminRoutes().filter((r) => r.config.owner && r.method !== 'HEAD');
    assert.deepEqual(
      owned.map((r) => `${r.method} ${r.url}`).sort(),
      ['DELETE /api/admin/collections/:key', 'DELETE /api/admin/products/:id', 'GET /api/admin/audit', 'POST /api/admin/orders/:id/erase', 'PUT /api/admin/wildcard']
    );
    for (const route of owned) {
      const res = await as(route.method, address(route.url).replace('/api/admin', ''));
      assert.equal(res.statusCode, 403, `${route.method} ${route.url} gave ${res.statusCode}`);
      assert.equal(res.json().error, 'OWNER_ONLY');
    }
    const bulk = await as('POST', '/products/bulk', { ids: [jerseys[0].id], action: 'delete' });
    assert.equal(bulk.statusCode, 403, bulk.body);
    assert.equal((await db.query('SELECT 1 FROM products WHERE id = $1', [jerseys[0].id])).rowCount, 1);
    const entry = await lastEntry('auth.denied');
    assert.equal(entry.actor, 'helper');
    assert.match(entry.summary, /bulk/);
  });

  test('staff can do the daily work', async () => {
    const { as } = await staff();
    assert.deepEqual(await ok(as('GET', '/me')), { username: 'helper', role: 'staff' });
    for (const url of ['/summary', '/orders', '/products', '/collections']) await ok(as('GET', url));
    await ok(as('POST', '/products', newProduct({ title: 'Staff Kit' })), 201);
    await ok(as('POST', '/products/bulk', { ids: [jerseys[1].id], action: 'sizes-off' }));
  });

  test('losing the owner role applies at once, to sessions already open', async () => {
    await upsertAdmin(db, 'second', STAFF_PASSWORD, 'owner');
    const as = asAdmin(call, await signIn(call, 'second', STAFF_PASSWORD));
    await ok(as('GET', '/audit'));
    await db.query("UPDATE admins SET role = 'staff' WHERE username = 'second'");
    assert.equal((await as('GET', '/audit')).statusCode, 403);
  });

  test('there is always an owner, and removing an admin signs them out', async () => {
    await assert.rejects(upsertAdmin(db, 'owner', PASSWORD, 'staff'), /at least one owner/);
    await assert.rejects(removeAdmin(db, 'owner'), /at least one owner/);
    await assert.rejects(upsertAdmin(db, 'boss', STAFF_PASSWORD, 'superuser'), /owner or staff/);
    const { as } = await staff('leaver');
    await ok(as('GET', '/me'));
    await removeAdmin(db, 'leaver');
    assert.equal((await as('GET', '/me')).statusCode, 401);
  });
});

describe('passwords and sessions (weak hashing, token expiry)', () => {
  const storedHash = async (name) => (await db.query('SELECT password_hash FROM admins WHERE username = $1', [name])).rows[0].password_hash;

  test('passwords are hashed with an OWASP minimum scrypt setting: N=2^15, r=8, p=3', async () => {
    assert.match(await storedHash('owner'), /^scrypt\$32768\$8\$3\$/);
  });

  test('a hash made with the older, weaker setting still works and is upgraded at sign-in', async () => {
    await upsertAdmin(db, 'veteran', STAFF_PASSWORD);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(STAFF_PASSWORD, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    await db.query("UPDATE admins SET password_hash = $1 WHERE username = 'veteran'", [`scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`]);
    await signIn(call, 'veteran', STAFF_PASSWORD);
    assert.match(await storedHash('veteran'), /^scrypt\$32768\$8\$3\$/);
    await signIn(call, 'veteran', STAFF_PASSWORD);
  });

  test('weak passwords are refused', async () => {
    for (const [password, why] of [['short', /at least 12/], ['aaaaaaaaaaaaaaaa', /too simple/], ['my-newbie-password', /username/], ['x'.repeat(201), /at most/]]) {
      await assert.rejects(upsertAdmin(db, 'newbie', password), why, password);
    }
  });

  const setSession = (cookie, column, interval) =>
    db.query(`UPDATE admin_sessions SET ${column} = now() + $2::interval WHERE token_hash = $1`, [sessionHash(cookie), interval]);

  test('a session ends after an idle hour, and after 12 hours however busy', async () => {
    const idle = await signIn(call, 'owner');
    await setSession(idle, 'last_seen_at', '-61 minutes');
    assert.equal((await asAdmin(call, idle)('GET', '/me')).statusCode, 401);
    const old = await signIn(call, 'owner');
    await setSession(old, 'expires_at', '-1 minute');
    assert.equal((await asAdmin(call, old)('GET', '/me')).statusCode, 401);
  });

  test('using the admin panel restarts the idle clock', async () => {
    const cookie = await signIn(call, 'owner');
    await setSession(cookie, 'last_seen_at', '-59 minutes');
    await ok(asAdmin(call, cookie)('GET', '/me'));
    const { rows } = await db.query("SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM admin_sessions WHERE token_hash = $1", [sessionHash(cookie)]);
    assert.equal(rows[0].fresh, true);
  });

  test('changing the password replaces every session, including the one making the change', async () => {
    await upsertAdmin(db, 'changer', STAFF_PASSWORD);
    const first = await signIn(call, 'changer', STAFF_PASSWORD);
    const second = await signIn(call, 'changer', STAFF_PASSWORD);
    const change = (currentPassword, newPassword) => asAdmin(call, first)('POST', '/password', { currentPassword, newPassword });

    assert.equal((await change('not-the-password', 'bright-meadow-signal')).statusCode, 400);
    assert.equal((await change(STAFF_PASSWORD, 'short')).statusCode, 400);
    assert.equal((await change(STAFF_PASSWORD, STAFF_PASSWORD)).statusCode, 400);
    await ok(asAdmin(call, first)('GET', '/me')); // a wrong try does not sign you out

    const res = await change(STAFF_PASSWORD, 'bright-meadow-signal');
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.headers['set-cookie'], /HttpOnly.*SameSite=Strict|SameSite=Strict.*HttpOnly/);
    for (const stale of [first, second]) assert.equal((await asAdmin(call, stale)('GET', '/me')).statusCode, 401);
    await ok(asAdmin(call, cookieFrom(res))('GET', '/me'));
    await signIn(call, 'changer', 'bright-meadow-signal');
  });

  test('signing out other devices keeps this one', async () => {
    await upsertAdmin(db, 'traveller', STAFF_PASSWORD);
    const here = await signIn(call, 'traveller', STAFF_PASSWORD);
    const lost = await signIn(call, 'traveller', STAFF_PASSWORD);
    assert.deepEqual(await ok(asAdmin(call, here)('POST', '/sessions/revoke-others')), { ended: 1 });
    await ok(asAdmin(call, here)('GET', '/me'));
    assert.equal((await asAdmin(call, lost)('GET', '/me')).statusCode, 401);
  });

  test('guessing the current password is rate limited', async () => {
    const { cookie } = await staff('guessed');
    let last;
    for (let i = 0; i < 9; i++) {
      last = await asAdmin(call, cookie)('POST', '/password', { currentPassword: `wrong-${i}`, newPassword: 'bright-meadow-signal' }, { ip: '172.16.9.9' });
    }
    assert.equal(last.statusCode, 429);
  });
});

describe('the activity log (audit logging)', () => {
  test('sign-ins are recorded, without passwords or unknown usernames', async () => {
    const attempt = (username, password) => call('POST', '/api/admin/login', { body: { username, password }, headers: { 'x-jo-admin': '1' } });
    await attempt('owner', 'wrong-password-here');
    assert.match((await lastEntry('auth.signin_failed')).summary, /Wrong password for “owner”/);
    await attempt('my-secret-passphrase', 'x');
    const unknown = await lastEntry('auth.signin_failed');
    assert.equal(unknown.summary, 'Sign-in with an unknown username');
    assert.equal(unknown.target, '');
    await signIn(call, 'owner');
    assert.equal((await lastEntry('auth.signin')).actor, 'owner');
    const everything = JSON.stringify((await db.query('SELECT * FROM audit_log')).rows);
    for (const secret of [PASSWORD, STAFF_PASSWORD, 'wrong-password-here', 'my-secret-passphrase']) assert.ok(!everything.includes(secret), secret);
  });

  test('owners can read it, filtered by area and a page at a time', async () => {
    const all = await ok(admin('GET', '/audit'));
    assert.ok(all.total > 0 && all.entries.length <= 50);
    const signIns = await ok(admin('GET', '/audit?area=auth'));
    assert.ok(signIns.entries.length > 0 && signIns.entries.every((e) => e.action.startsWith('auth.')));
    assert.equal((await admin('GET', '/audit?area=%25')).statusCode, 400);
  });
});

describe('what a request can change (mass assignment, injection, deserialization)', () => {
  test('extra fields cannot set things the screens do not offer', async () => {
    const id = jerseys[2].id;
    const row = async () => (await db.query('SELECT id, sort_order, created_at, version FROM products WHERE id = $1', [id])).rows[0];
    const was = await row();
    const body = { ...editBody(await ok(admin('GET', `/products/${id}`))), sort_order: -999, sortOrder: -999, created_at: '2000-01-01', createdAt: '2000-01-01', openOrders: 5 };
    body.variants[0] = { ...body.variants[0], product_id: jerseys[3].id, price_paise: 1 };
    await ok(admin('PUT', `/products/${id}`, body));
    const now = await row();
    assert.deepEqual([now.id, now.sort_order, now.created_at, now.version], [was.id, was.sort_order, was.created_at, was.version + 1]);

    const placed = await ok(call('POST', '/api/orders', { body: { ...customer({ items: [line(onSale(jerseys[4]))] }), status: 'delivered', paymentStatus: 'paid', payment_status: 'paid', admin_note: 'x' } }), 201);
    const order = (await db.query('SELECT * FROM orders WHERE order_number = $1', [placed.orderNumber])).rows[0];
    assert.deepEqual([order.status, order.payment_status, order.admin_note], ['pending', 'unpaid', '']);
    // every field here is dropped, so the request succeeds and changes nothing
    await ok(admin('PATCH', `/orders/${order.id}`, { total_paise: 1, total: 1, phone: '9000000000', orderNumber: 'JO-1', erased_at: '2000-01-01' }));
    const after = (await db.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0];
    assert.deepEqual(after, order);

    const signedIn = await call('POST', '/api/admin/login', { body: { username: 'owner', password: PASSWORD, role: 'staff', admin: { role: 'x' } }, headers: { 'x-jo-admin': '1' } });
    assert.equal(signedIn.json().role, 'owner');
  });

  test('searches and sort names cannot change a database query', async () => {
    const count = async () => (await db.query('SELECT count(*) AS n FROM products')).rows[0].n;
    const before = await count();
    const hostile = ["' OR '1'='1", "'; DROP TABLE products; --", '1) UNION SELECT password_hash FROM admins --'];
    for (const text of hostile) {
      const found = await ok(admin('GET', `/products?q=${encodeURIComponent(text)}`));
      assert.equal(found.total, 0, text);
      const inCollection = await ok(admin('GET', `/products?collection=${encodeURIComponent(text.slice(0, 40))}`));
      assert.equal(inCollection.total, 0, text);
    }
    for (const url of ['/products?sort=id%3BDROP%20TABLE%20products', '/products?filter=1%3D1', '/products?pageSize=100000', `/collections/${encodeURIComponent("x' OR 1=1")}`]) {
      const res = await admin(url.startsWith('/collections') ? 'DELETE' : 'GET', url);
      assert.equal(res.statusCode, 400, `${url} gave ${res.statusCode}`);
    }
    const created = await ok(admin('POST', '/products', newProduct({ title: "Robert'); DROP TABLE orders;--" })), 201);
    assert.equal(created.title, "Robert'); DROP TABLE orders;--");
    assert.equal(await count(), before + 1);
  });

  test('prototype-pollution payloads are refused', async () => {
    for (const payload of ['{"__proto__":{"polluted":true},"orderNumber":"JO-1","phone":"9876543210"}', '{"constructor":{"prototype":{"polluted":true}},"orderNumber":"JO-1","phone":"9876543210"}']) {
      const res = await call('POST', '/api/orders/track', { payload, headers: { 'content-type': 'application/json' } });
      assert.equal(res.statusCode, 400, res.body);
    }
    assert.equal({}.polluted, undefined);
  });
});

describe('what errors and redirects give away (stack traces, open redirects)', () => {
  const INSIDES = /\bat \S+ \(|\.js:\d|node_modules|FST_|stack|SELECT |postgres|secret-internal/i;

  test('errors never describe the inside of the server', async () => {
    const broken = await buildApp({
      db: { query: async () => { throw new Error('secret-internal: password authentication failed at /srv/app/db.js:42'); }, tx: async () => { throw new Error('secret-internal'); } },
      env: { production: true, trustProxy: false, uploadDir },
      logger: false,
    });
    const json = { 'content-type': 'application/json' };
    const answers = [
      await broken.inject({ method: 'POST', url: '/api/orders/track', payload: { orderNumber: 'JO-1001', phone: '9876543210' } }),
      await broken.inject({ method: 'GET', url: '/api/health' }),
      await broken.inject({ method: 'GET', url: '/assets/js/data.js' }),
      await call('GET', '/%'),
      await call('GET', '/api/%zz'),
      await call('POST', '/api/orders', { payload: '{"broken', headers: json }),
      await call('POST', '/api/orders', { payload: 'x', headers: { 'content-type': 'application/x-unknown' } }),
      await call('POST', '/api/orders', { payload: JSON.stringify({ note: 'x'.repeat(80_000) }), headers: json }),
      await call('GET', '/api/no-such-thing'),
      await call('GET', '/uploads/'),
    ];
    for (const res of answers) {
      assert.ok(res.statusCode >= 400, `${res.statusCode} ${res.body}`);
      assert.doesNotMatch(res.body, INSIDES);
    }
    assert.deepEqual(answers[0].json(), { error: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
    await broken.close();
  });

  test('no address makes the server redirect to another website', async () => {
    const urls = ['/admin', '//evil.example', '//evil.example/', '/admin//evil.example', '//evil.example/%2f..', '/assets', '//evil.example/assets/..', '/uploads', '/%2F%2Fevil.example', '/\\evil.example',
      '/admin?next=https://evil.example', '/?redirect=//evil.example', '/api/admin/login?returnTo=https://evil.example'];
    for (const url of urls) {
      const res = await call('GET', url);
      const to = res.headers.location;
      if (to !== undefined) assert.match(to, /^\/(?![/\\])/, `${url} redirects to ${to}`);
    }
  });
});

describe('browser protections (CSP, clickjacking)', () => {
  const directives = (res) => Object.fromEntries(res.headers['content-security-policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));

  test('the shop’s policy allows only its own scripts and style blocks, and no framing', async () => {
    const res = await call('GET', '/');
    const csp = directives(res);
    assert.equal(csp['script-src'], "'self'");
    assert.equal(csp['script-src-attr'], "'none'");
    assert.equal(csp['style-src-elem'], "'self'");
    assert.equal(csp['frame-ancestors'], "'none'");
    assert.equal(csp['object-src'], "'none'");
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.match(res.headers['permissions-policy'], /camera=\(\).*geolocation=\(\)/);
  });

  test('the admin panel is allowed even less, and its files are always rechecked', async () => {
    for (const url of ['/admin/', '/admin/admin.js', '/admin/js/lib.js', '/admin/admin.css']) {
      const res = await call('GET', url);
      assert.equal(res.statusCode, 200, url);
      assert.equal(directives(res)['default-src'], "'none'", url);
      assert.doesNotMatch(res.headers['content-security-policy'], /unsafe-/, url);
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['cache-control'], 'no-cache', url);
    }
  });

  test('live mode adds HTTPS rules, and the sign-in cookie is HTTPS-only', async () => {
    const live = await buildApp({ db, env: { production: true, trustProxy: false, uploadDir }, logger: false });
    const page = await live.inject({ method: 'GET', url: '/' });
    assert.match(page.headers['strict-transport-security'], /max-age=\d{7,}/);
    assert.match(page.headers['content-security-policy'], /upgrade-insecure-requests/);
    assert.match((await live.inject({ method: 'GET', url: '/admin/' })).headers['content-security-policy'], /upgrade-insecure-requests/);
    const res = await caller(live)('POST', '/api/admin/login', { body: { username: 'owner', password: PASSWORD }, headers: { 'x-jo-admin': '1' } });
    assert.match(res.headers['set-cookie'], /; Secure/);
    await live.close();
  });

  const pages = async () => (await fs.readdir(ROOT)).filter((f) => f.endsWith('.html'));

  test('every shop page carries the policy too, for hosts that cannot send headers', async () => {
    const found = new Set();
    for (const name of await pages()) {
      const html = await fs.readFile(path.join(ROOT, name), 'utf8');
      const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
      assert.ok(policy, `${name} has no policy`);
      assert.match(policy, /default-src 'self'/);
      assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), `${name}: the policy must come before anything it should cover`);
      found.add(policy);
    }
    assert.equal(found.size, 1, 'all pages must carry the same policy');
  });

  test('no page has inline scripts or handlers, and the admin has no inline styles', async () => {
    const adminFiles = ['server/admin/index.html', 'server/admin/admin.js', ...(await fs.readdir(path.join(ROOT, 'server/admin/js'))).map((f) => `server/admin/js/${f}`)];
    for (const name of [...(await pages()), 'server/admin/index.html']) {
      const html = await fs.readFile(path.join(ROOT, name), 'utf8');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name} has an inline script`);
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name} has an inline handler`);
    }
    for (const name of adminFiles) assert.doesNotMatch(await fs.readFile(path.join(ROOT, name), 'utf8'), /\sstyle=|<style/i, name);
  });
});

describe('files and settings (public bucket, debug mode)', () => {
  test('the upload folder gives out only the photos the server made', async () => {
    const product = await uploadPhoto(admin, jerseys[5].id);
    const photo = product.images.at(-1);
    assert.equal((await call('GET', `/${photo.small}`)).statusCode, 200);
    const strays = ['notes.txt', '.env', 'backup.sql', 'holiday.webp', `${crypto.randomUUID()}-480.webp.bak`];
    for (const name of strays) await fs.writeFile(path.join(uploadDir, name), 'private');
    for (const name of strays) {
      const res = await call('GET', `/uploads/${name}`);
      assert.ok([403, 404].includes(res.statusCode), `${name} gave ${res.statusCode}`);
      assert.doesNotMatch(res.body, /^private$/);
    }
  });

  const settings = { DATABASE_URL: 'postgres://shop:a-real-password@db.example/shop' };

  test('an upload folder that contains the app is refused', () => {
    for (const UPLOAD_DIR of ['.', '..', '../..', ROOT, path.parse(ROOT).root]) {
      assert.throws(() => loadEnv({ ...settings, UPLOAD_DIR }), /UPLOAD_DIR/, UPLOAD_DIR);
    }
    for (const UPLOAD_DIR of ['uploads', './photos', '../shop-photos']) assert.ok(loadEnv({ ...settings, UPLOAD_DIR }).uploadDir);
  });

  test('live mode is the default: development mode has to be asked for', () => {
    for (const NODE_ENV of [undefined, '', 'production', 'prod', 'Development', 'staging']) {
      assert.equal(loadEnv({ ...settings, NODE_ENV }).production, true, String(NODE_ENV));
    }
    for (const NODE_ENV of ['development', 'test']) assert.equal(loadEnv({ ...settings, NODE_ENV }).production, false);
  });

  test('live mode refuses the local development password (hardcoded secrets)', () => {
    const local = 'postgres://jerseyorbit:jerseyorbit_local@127.0.0.1:5438/jerseyorbit';
    assert.throws(() => loadEnv({ DATABASE_URL: local }), /local development password/);
    assert.throws(() => loadEnv({ ...settings, DATABASE_OWNER_URL: local }), /local development password/);
    assert.equal(loadEnv({ DATABASE_URL: local, NODE_ENV: 'development' }).production, false);
  });
});

describe('the code base (secrets, command injection, packages, SRI)', () => {
  const SKIP = new Set(['.git', 'node_modules', 'uploads', 'cache', 'img', 'fonts']);
  async function files(dir) {
    const out = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) out.push(...(await files(full)));
      } else if (!/^\.env(\.(?!example$)[\w.]+)?$/.test(entry.name)) out.push(full); // .env itself is private and ignored by Git
    }
    return out;
  }
  const read = (file) => fs.readFile(file, 'utf8');

  test('no keys, tokens or database passwords are written in the files', async () => {
    const patterns = [
      /AKIA[0-9A-Z]{16}/,
      /\b(sk|rk)_live_[0-9a-zA-Z]{20,}/,
      /\brzp_live_[0-9a-zA-Z]{12,}/,
      /\bgh[pousr]_[0-9A-Za-z]{36}/,
      /AIza[0-9A-Za-z_-]{35}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\bxox[baprs]-[0-9A-Za-z-]{10,}/,
      /\bshpat_[a-f0-9]{32}/,
      /\bsk-(ant|proj)-[A-Za-z0-9_-]{20,}/,
      // a database address with a password, pointing anywhere but this computer
      /postgres(ql)?:\/\/[^\s:'"`/]+:[^\s@'"`$<{]+@(?!127\.0\.0\.1|localhost|db\.example|h\/|x\/)[\w.-]+/,
    ];
    for (const file of await files(ROOT)) {
      const text = await read(file);
      for (const pattern of patterns) assert.ok(!pattern.test(text), `${path.relative(ROOT, file)} matches ${pattern}`);
    }
  });

  test('no script runs shell commands or builds code out of text', async () => {
    const folders = ['server/src', 'server/admin', 'assets/js'];
    for (const folder of folders) {
      for (const file of (await files(path.join(ROOT, folder))).filter((f) => /\.m?js$/.test(f) && !/(data|content)\.js$/.test(f))) {
        const text = await read(file);
        assert.doesNotMatch(text, /child_process|\beval\s*\(|new Function\b/, path.relative(ROOT, file));
        // vm runs the shop's own config.js and data.js, and nothing a visitor or admin sends
        if (!file.endsWith('storefront-data.js')) assert.doesNotMatch(text, /from 'node:vm'|require\('vm'\)/, path.relative(ROOT, file));
      }
    }
  });

  test('only the expected packages, all from the npm registry with integrity hashes (slopsquatting)', async () => {
    const pkg = JSON.parse(await read(path.join(ROOT, 'server', 'package.json')));
    const approved = ['@fastify/compress', '@fastify/cookie', '@fastify/helmet', '@fastify/multipart', '@fastify/rate-limit', '@fastify/static', 'fastify', 'pg', 'sharp'];
    assert.deepEqual(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort(), approved,
      'A package was added or removed. Before listing a new one here, check on npmjs.com that it is the real one: its publisher, source repository, age and downloads.');
    const lock = JSON.parse(await read(path.join(ROOT, 'server', 'package-lock.json')));
    for (const [name, entry] of Object.entries(lock.packages)) {
      if (!name) continue;
      assert.ok(entry.resolved?.startsWith('https://registry.npmjs.org/'), `${name} does not come from the npm registry`);
      assert.match(entry.integrity || '', /^sha512-/, `${name} has no integrity hash`);
    }
    assert.match(await read(path.join(ROOT, 'server', '.npmrc')), /^ignore-scripts=true$/m);
  });

  test('no page loads a script or stylesheet from another site without an integrity hash (SRI)', async () => {
    for (const file of (await files(ROOT)).filter((f) => f.endsWith('.html'))) {
      for (const tag of (await read(file)).match(/<(script|link)\b[^>]*>/gi) || []) {
        const external = /\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(tag) && (/^<script/i.test(tag) || /rel\s*=\s*["']?(stylesheet|preload|modulepreload)/i.test(tag));
        if (external) assert.match(tag, /integrity=["']sha(256|384|512)-.+crossorigin/i, `${path.relative(ROOT, file)}: ${tag}`);
      }
    }
    for (const file of (await files(path.join(ROOT, 'assets', 'js'))).filter((f) => !/(data|content)\.js$/.test(f))) {
      assert.doesNotMatch(await read(file), /createElement\(\s*['"]script['"]\s*\)[\s\S]{0,200}?\.src\s*=\s*['"`](https?:)?\/\//, path.relative(ROOT, file));
    }
  });
});
