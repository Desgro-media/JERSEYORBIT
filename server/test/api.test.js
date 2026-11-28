/* End-to-end tests of the API against a real PostgreSQL database:  npm test
   They use a separate database whose name ends in "_test", and wipe it every run. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { seed } from '../src/seed.js';
import {
  PASSWORD, catalog as readCatalog, customer, data, editBody, jerseys, line, multipart, onSale, setUp, shop, socks,
} from './helpers.js';

let shopUnderTest, db, uploadDir, cookie, call, admin;

const order = async (over) => {
  const res = await call('POST', '/api/orders', { body: customer(over) });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
};
const orderId = async (number) => (await db.query('SELECT id FROM orders WHERE order_number = $1', [number])).rows[0].id;
const stockOf = async (variantId) => (await db.query('SELECT stock_qty FROM product_variants WHERE id = $1', [variantId])).rows[0].stock_qty;

const catalog = () => readCatalog(call);

async function setStock(productId, variantId, stock) {
  const p = (await admin('GET', `/products/${productId}`)).json();
  const body = editBody(p);
  body.variants.find((v) => v.id === variantId).stock = stock;
  const res = await admin('PUT', `/products/${productId}`, body);
  assert.equal(res.statusCode, 200, res.body);
}

before(async () => {
  shopUnderTest = await setUp();
  ({ db, uploadDir, cookie, call, admin } = shopUnderTest);
});

after(() => shopUnderTest?.stop());

describe('storefront', () => {
  test('the catalog from the database matches the website’s catalog file', async () => {
    const built = await catalog();
    const shape = (p) => ({ ...p, k: [...p.k].sort() });
    assert.deepEqual(built.products.map(shape), data.products.map(shape));
    assert.deepEqual(built.collections, data.collections);
  });

  test('the catalog answers 304 when the browser’s copy is current', async () => {
    const first = await call('GET', '/assets/js/data.js');
    const again = await call('GET', '/assets/js/data.js', { headers: { 'if-none-match': first.headers.etag } });
    assert.equal(again.statusCode, 304);
  });

  test('seeding again adds nothing', async () => {
    assert.equal((await seed(db)).added, 0);
  });

  test('pages and assets are served', async () => {
    for (const url of ['/', '/shop.html', '/product.html?p=x', '/checkout.html', '/assets/css/main.css', '/admin/', '/admin/admin.js', '/api/health']) {
      assert.equal((await call('GET', url)).statusCode, 200, url);
    }
  });

  test('nothing else in the repository can be downloaded', async () => {
    const urls = ['/server/.env', '/.env', '/.git/config', '/server/src/auth.js', '/package.json', '/tools/cache/p1.json', '/README.md',
      '/assets/../server/.env', '/assets/%2e%2e/server/.env', '/assets/..%2fserver%2f.env', '/uploads/..%2f.env', '/admin/..%2f.env', '/assets/..%5cserver%5c.env'];
    for (const url of urls) {
      const res = await call('GET', url);
      assert.ok([403, 404].includes(res.statusCode), `${url} gave ${res.statusCode}`);
      assert.doesNotMatch(res.body, /DATABASE_URL|\[core\]|scrypt/, url);
    }
  });

  test('security headers are set', async () => {
    const res = await call('GET', '/');
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal((await call('GET', '/api/health')).headers['cache-control'], 'no-store');
  });
});

describe('placing an order', () => {
  test('the server works out the total and ignores prices sent by the browser', async () => {
    const [a] = jerseys;
    const v = onSale(a);
    const res = await call('POST', '/api/orders', { body: { ...customer({ items: [{ ...line(v, 2), price: 1 }] }), total: 1, shipping: 0 } });
    assert.equal(res.statusCode, 201, res.body);
    const o = res.json();
    assert.match(o.orderNumber, /^JO-\d+$/);
    assert.equal(o.subtotal, v.p * 2);
    assert.equal(o.shipping, shop.shippingFee);
    assert.equal(o.total, v.p * 2 + shop.shippingFee);
  });

  test('three jerseys ship free, and socks do not count towards them', async () => {
    const three = await order({ items: jerseys.slice(0, 3).map((p) => line(onSale(p))) });
    assert.equal(three.shipping, 0);
    const withSocks = await order({ items: [...jerseys.slice(0, 2).map((p) => line(onSale(p))), line(onSale(socks))] });
    assert.equal(withSocks.shipping, shop.shippingFee);
  });

  test('repeated lines are added together and capped', async () => {
    const v = onSale(jerseys[0]);
    const o = await order({ items: [line(v, 2), line(v, 3)] });
    assert.equal(o.items.length, 1);
    assert.equal(o.items[0].quantity, 5);
    const over = await call('POST', '/api/orders', { body: customer({ items: [line(v, 6), line(v, 5)] }) });
    assert.equal(over.statusCode, 400);
  });

  test('bad details are refused', async () => {
    const v = onSale(jerseys[0]);
    const cases = [
      { phone: '12345' }, { pincode: '012345' }, { name: '   ' }, { address: '' }, { area: 'mars' }, { clientRef: 'nope' },
      { items: [] }, { items: [line(v, 0)] }, { items: [line(v, 11)] }, { items: [{ variantId: '1; DROP TABLE orders', quantity: 1 }] },
      { name: 'x'.repeat(101) },
    ];
    for (const over of cases) {
      const res = await call('POST', '/api/orders', { body: customer({ items: [line(v)], ...over }) });
      assert.equal(res.statusCode, 400, JSON.stringify(over) + ' ' + res.body);
    }
  });

  test('phone numbers are tidied the same way as on the website', async () => {
    const o = await order({ phone: '+91 98765-43210', items: [line(onSale(jerseys[0]))] });
    assert.equal((await db.query('SELECT phone FROM orders WHERE order_number = $1', [o.orderNumber])).rows[0].phone, '9876543210');
  });

  test('sold-out and unknown sizes are refused, with the reason', async () => {
    const sold = data.products.flatMap((p) => p.v).find((v) => !v.a);
    const res = await call('POST', '/api/orders', { body: customer({ items: [line(sold), { variantId: 424242, quantity: 1 }] }) });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, 'ITEMS_UNAVAILABLE');
    assert.deepEqual(res.json().details.map((d) => d.reason), ['sold_out', 'gone']);
  });

  test('an order is not saved when the customer saw a different total', async () => {
    const before = (await db.query('SELECT count(*) AS n FROM orders')).rows[0].n;
    const res = await call('POST', '/api/orders', { body: customer({ items: [line(onSale(jerseys[0]))], expectedTotal: 1 }) });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, 'TOTAL_CHANGED');
    assert.equal((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n, before);
  });

  test('sending the same order twice makes one order, even at the same moment', async () => {
    const body = customer({ items: [line(onSale(jerseys[0]))] });
    const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/api/orders', { body })));
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 200, 200, 200, 201]);
    assert.equal(new Set(results.map((r) => r.json().orderNumber)).size, 1);
    const stranger = await call('POST', '/api/orders', { body: { ...body, phone: '9000000000' } });
    assert.equal(stranger.statusCode, 409);
    assert.equal(stranger.json().orderNumber, undefined);
  });

  test('ordering is rate limited', async () => {
    let last;
    for (let i = 0; i < 21; i++) last = await call('POST', '/api/orders', { body: customer({ items: [] }), ip: '172.16.0.1' });
    assert.equal(last.statusCode, 429);
    assert.equal(last.json().error, 'RATE_LIMITED');
  });
});

describe('tracking', () => {
  test('needs the right phone number and reveals no personal details', async () => {
    const o = await order({ items: [line(onSale(jerseys[0]))] });
    const ok = await call('POST', '/api/orders/track', { body: { orderNumber: o.orderNumber.replace('JO-', '#'), phone: '098765 43210' } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().status, 'pending');
    assert.doesNotMatch(ok.body, /Test Customer|Test Road|9876543210|682001/);

    const wrongPhone = await call('POST', '/api/orders/track', { body: { orderNumber: o.orderNumber, phone: '9000000000' } });
    const noOrder = await call('POST', '/api/orders/track', { body: { orderNumber: 'JO-999999', phone: '9876543210' } });
    assert.equal(wrongPhone.statusCode, 404);
    assert.equal(wrongPhone.body, noOrder.body);
  });
});

describe('admin sign-in', () => {
  const protectedRoutes = [['GET', '/me'], ['GET', '/summary'], ['GET', '/orders'], ['GET', '/orders/1'], ['PATCH', '/orders/1'], ['GET', '/products'], ['GET', '/products/1'], ['POST', '/products'], ['PUT', '/products/1'], ['GET', '/collections'], ['POST', '/products/1/images'], ['DELETE', '/products/1/images/1'], ['PUT', '/products/1/images/order'], ['POST', '/logout']];

  test('every admin address needs a signed-in admin', async () => {
    for (const [method, url] of protectedRoutes) {
      const res = await call(method, '/api/admin' + url, { headers: { 'x-jo-admin': '1', cookie: 'jo_admin=made-up' } });
      assert.equal(res.statusCode, 401, `${method} ${url} gave ${res.statusCode}`);
    }
  });

  test('wrong password and unknown user get the same answer', async () => {
    const tryLogin = (username, password) => call('POST', '/api/admin/login', { body: { username, password }, headers: { 'x-jo-admin': '1' } });
    const wrong = await tryLogin('owner', 'not-the-password');
    const unknown = await tryLogin('nobody', PASSWORD);
    assert.equal(wrong.statusCode, 401);
    assert.equal(wrong.body, unknown.body);
    assert.equal(wrong.headers['set-cookie'], undefined);
  });

  test('the cookie cannot be read by scripts or sent from other sites', async () => {
    const res = await call('POST', '/api/admin/login', { body: { username: 'OWNER', password: PASSWORD }, headers: { 'x-jo-admin': '1' } });
    assert.match(res.headers['set-cookie'], /HttpOnly/);
    assert.match(res.headers['set-cookie'], /SameSite=Strict/);
    assert.match(res.headers['set-cookie'], /Path=\/api\/admin/);
  });

  test('forged cross-site requests are refused', async () => {
    const noHeader = await call('POST', '/api/admin/logout', { headers: { cookie } });
    const otherSite = await call('POST', '/api/admin/logout', { headers: { cookie, 'x-jo-admin': '1', origin: 'https://evil.example', host: 'shop.example' } });
    assert.equal(noHeader.statusCode, 403);
    assert.equal(otherSite.statusCode, 403);
    assert.equal((await admin('GET', '/me')).statusCode, 200);
  });

  test('only hashes are stored, and signing out ends the session', async () => {
    const res = await call('POST', '/api/admin/login', { body: { username: 'owner', password: PASSWORD }, headers: { 'x-jo-admin': '1' } });
    const mine = res.headers['set-cookie'].split(';')[0];
    const token = mine.split('=')[1];
    assert.equal((await db.query('SELECT 1 FROM admin_sessions WHERE token_hash = $1', [token])).rowCount, 0);
    assert.doesNotMatch((await db.query('SELECT password_hash FROM admins')).rows[0].password_hash, new RegExp(PASSWORD));
    await call('POST', '/api/admin/logout', { headers: { cookie: mine, 'x-jo-admin': '1' } });
    assert.equal((await call('GET', '/api/admin/me', { headers: { cookie: mine } })).statusCode, 401);
  });

  test('password guessing is rate limited', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { body: { username: 'owner', password: 'guess' }, headers: { 'x-jo-admin': '1' }, ip: '172.16.0.2' });
    assert.equal(last.statusCode, 429);
  });
});

describe('orders and stock', () => {
  const product = () => jerseys[10];
  const variant = () => onSale(product());

  test('placing an order leaves stock alone; confirming takes it; cancelling returns it', async () => {
    await setStock(product().id, variant().id, 5);
    const o = await order({ items: [line(variant(), 2)] });
    assert.equal(await stockOf(variant().id), 5);
    const id = await orderId(o.orderNumber);
    assert.equal((await admin('PATCH', `/orders/${id}`, { status: 'confirmed' })).statusCode, 200);
    assert.equal(await stockOf(variant().id), 3);
    assert.equal((await admin('PATCH', `/orders/${id}`, { status: 'cancelled' })).statusCode, 200);
    assert.equal(await stockOf(variant().id), 5);
    // cancelled is final, so the stock cannot be returned twice
    assert.equal((await admin('PATCH', `/orders/${id}`, { status: 'cancelled' })).statusCode, 409);
    assert.equal(await stockOf(variant().id), 5);
  });

  test('two orders cannot both take the last jersey', async () => {
    await setStock(product().id, variant().id, 1);
    const first = await orderId((await order({ items: [line(variant())] })).orderNumber);
    const second = await orderId((await order({ items: [line(variant())] })).orderNumber);
    const results = await Promise.all([first, second].map((id) => admin('PATCH', `/orders/${id}`, { status: 'confirmed' })));
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(results.find((r) => r.statusCode === 409).json().error, 'NOT_ENOUGH_STOCK');
    assert.equal(await stockOf(variant().id), 0);

    const shown = (await catalog()).products.find((p) => p.id === product().id).v.find((v) => v.id === variant().id);
    assert.equal(shown.a, false, 'the website shows the size as sold out');
    const late = await call('POST', '/api/orders', { body: customer({ items: [line(variant())] }) });
    assert.equal(late.json().error, 'ITEMS_UNAVAILABLE');
  });

  test('clicking Confirm twice at once takes stock once', async () => {
    await setStock(product().id, variant().id, 5);
    const id = await orderId((await order({ items: [line(variant())] })).orderNumber);
    const results = await Promise.all([1, 2, 3].map(() => admin('PATCH', `/orders/${id}`, { status: 'confirmed' })));
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409, 409]);
    assert.equal(await stockOf(variant().id), 4);
  });

  test('a failed confirm takes nothing at all', async () => {
    const [a, b] = [jerseys[11], jerseys[12]];
    await setStock(a.id, onSale(a).id, 5);
    await setStock(b.id, onSale(b).id, 2);
    const id = await orderId((await order({ items: [line(onSale(a)), line(onSale(b), 2)] })).orderNumber);
    await setStock(b.id, onSale(b).id, 1);
    assert.equal((await admin('PATCH', `/orders/${id}`, { status: 'confirmed' })).statusCode, 409);
    assert.equal(await stockOf(onSale(a).id), 5);
    assert.equal(await stockOf(onSale(b).id), 1);
  });

  test('sizes that are not counted stay not counted', async () => {
    const p = jerseys[13];
    const id = await orderId((await order({ items: [line(onSale(p))] })).orderNumber);
    await admin('PATCH', `/orders/${id}`, { status: 'confirmed' });
    assert.equal(await stockOf(onSale(p).id), null);
    // if counting starts after confirming, cancelling must not invent stock
    await setStock(p.id, onSale(p).id, 3);
    await admin('PATCH', `/orders/${id}`, { status: 'cancelled' });
    assert.equal(await stockOf(onSale(p).id), 3);
  });

  test('steps cannot be skipped, and shipping details reach the customer only once shipped', async () => {
    const o = await order({ items: [line(onSale(jerseys[14]))] });
    const id = await orderId(o.orderNumber);
    assert.equal((await admin('PATCH', `/orders/${id}`, { status: 'delivered' })).statusCode, 409);
    await admin('PATCH', `/orders/${id}`, { status: 'confirmed', paymentStatus: 'paid', courier: 'DTDC', trackingId: 'T123', adminNote: 'secret note' });
    const track = () => call('POST', '/api/orders/track', { body: { orderNumber: o.orderNumber, phone: '9876543210' } });
    assert.equal((await track()).json().trackingId, '');
    const shipped = await admin('PATCH', `/orders/${id}`, { status: 'shipped' });
    assert.equal(shipped.json().paymentStatus, 'paid');
    const seen = await track();
    assert.equal(seen.json().trackingId, 'T123');
    assert.doesNotMatch(seen.body, /secret note|owner/);
    assert.deepEqual(seen.json().history.map((h) => h.status), ['pending', 'confirmed', 'shipped']);
  });

  test('the order list can be searched, and a search for % is not a wildcard', async () => {
    assert.ok((await admin('GET', '/orders?q=Test%20Customer')).json().total > 0);
    assert.equal((await admin('GET', '/orders?q=%25')).json().total, 0);
    assert.equal((await admin('GET', "/orders?q=%27%20OR%201%3D1--")).json().total, 0);
    const s = (await admin('GET', '/summary')).json();
    assert.ok(s.ordersToday > 0 && s.paidThisMonth > 0);
  });

  test('an old order keeps its price after the product changes', async () => {
    const p = jerseys[15];
    const o = await order({ items: [line(onSale(p))] });
    const body = editBody((await admin('GET', `/products/${p.id}`)).json());
    body.variants.forEach((v) => ((v.price += 100), (v.compareAt = null)));
    assert.equal((await admin('PUT', `/products/${p.id}`, body)).statusCode, 200);
    assert.equal((await admin('GET', `/orders/${await orderId(o.orderNumber)}`)).json().items[0].price, onSale(p).p);
    assert.equal((await catalog()).products.find((x) => x.id === p.id).p, Math.min(...body.variants.map((v) => v.price)));
  });
});

describe('product editing', () => {
  test('an edit made on an out-of-date form is refused, so stock is not overwritten', async () => {
    const p = jerseys[20];
    await setStock(p.id, onSale(p).id, 4);
    const stale = editBody((await admin('GET', `/products/${p.id}`)).json());
    const id = await orderId((await order({ items: [line(onSale(p))] })).orderNumber);
    await admin('PATCH', `/orders/${id}`, { status: 'confirmed' });
    const res = await admin('PUT', `/products/${p.id}`, stale);
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, 'PRODUCT_CHANGED');
    assert.equal(await stockOf(onSale(p).id), 3);
  });

  test('wrong prices and duplicate sizes are refused', async () => {
    const good = editBody((await admin('GET', `/products/${jerseys[21].id}`)).json());
    const change = (fn) => {
      const body = structuredClone(good);
      fn(body);
      return admin('PUT', `/products/${jerseys[21].id}`, body);
    };
    for (const fn of [(b) => (b.variants[0].price = 0), (b) => (b.variants[0].price = -5), (b) => (b.variants[0].compareAt = 1), (b) => (b.variants[1].size = b.variants[0].size),
      (b) => (b.variants[0].stock = -1), (b) => (b.variants = []), (b) => (b.collections = ['no-such-collection']), (b) => (b.variants[0].id = onSale(jerseys[22]).id), (b) => (b.title = '  ')]) {
      const res = await change(fn);
      assert.equal(res.statusCode, 400, `${fn} gave ${res.statusCode}: ${res.body}`);
    }
    assert.equal((await change(() => {})).statusCode, 200);
  });

  test('two sizes can swap names in one save', async () => {
    const body = editBody((await admin('GET', `/products/${jerseys[23].id}`)).json());
    [body.variants[0].size, body.variants[1].size] = [body.variants[1].size, body.variants[0].size];
    assert.equal((await admin('PUT', `/products/${jerseys[23].id}`, body)).statusCode, 200);
  });

  test('a new jersey appears on the website only after it has a photo and is switched on', async () => {
    const fields = { title: 'Brand New Test Kit 26/27', details: ['Fit: Regular'], collections: ['new-drops'], variants: [{ size: 'M', price: 399, compareAt: 599, available: true, stock: null }] };
    const made = await admin('POST', '/products', fields);
    assert.equal(made.statusCode, 201, made.body);
    let p = made.json();
    assert.equal(p.published, false);
    assert.equal(p.handle, 'brand-new-test-kit-26-27');
    assert.equal(p.variants[0].stock, null, 'blank stock must stay "not counted", not become 0');
    assert.equal((await admin('POST', '/products', fields)).json().handle, 'brand-new-test-kit-26-27-2');

    const early = await admin('PUT', `/products/${p.id}`, { ...editBody(p), published: true });
    assert.equal(early.statusCode, 400);

    // a sideways phone photo: 1600x1200 pixels marked "rotate 90°"
    const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#14295c' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { headers, payload } = multipart(photo);
    const up = await admin('POST', `/products/${p.id}/images`, undefined, { headers, payload });
    assert.equal(up.statusCode, 201, up.body);
    p = up.json();
    const small = await sharp(await fs.readFile(path.join(uploadDir, path.basename(p.images[0].small)))).metadata();
    assert.deepEqual([small.format, small.width, small.height, small.orientation, small.exif], ['webp', 480, 640, undefined, undefined]);
    assert.equal((await call('GET', '/' + p.images[0].small)).statusCode, 200);

    assert.equal((await admin('PUT', `/products/${p.id}`, { ...editBody(p), published: true })).statusCode, 200);
    const shown = (await catalog()).products;
    assert.equal(shown[0].id, p.id, 'new arrivals come first');
    assert.deepEqual([shown[0].i[0].w, shown[0].i[0].h, shown[0].p, shown[0].c, shown[0].a], [1200, 1600, 399, 599, true]);

    const last = await admin('DELETE', `/products/${p.id}/images/${p.images[0].id}`);
    assert.equal(last.statusCode, 400, 'a live product keeps at least one photo');
  });

  test('deleting an uploaded photo removes its files', async () => {
    const p = (await admin('POST', '/products', { title: 'Photo Delete Test', details: [], collections: [], variants: [{ size: 'M', price: 300, compareAt: null, available: true, stock: 1 }] })).json();
    const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#b4f55f' } }).png().toBuffer();
    const { headers, payload } = multipart(photo, 'a.png', 'image/png');
    const added = (await admin('POST', `/products/${p.id}/images`, undefined, { headers, payload })).json();
    const file = path.join(uploadDir, path.basename(added.images[0].large));
    await fs.access(file);
    assert.equal((await admin('DELETE', `/products/${p.id}/images/${added.images[0].id}`)).statusCode, 200);
    await assert.rejects(fs.access(file));
  });

  test('files that are not photos are refused and leave nothing behind', async () => {
    const before = (await fs.readdir(uploadDir)).length;
    const send = async (buffer, name, type) => {
      const { headers, payload } = multipart(buffer, name, type);
      return admin('POST', `/products/${jerseys[0].id}/images`, undefined, { headers, payload });
    };
    const fake = await send(Buffer.from('<?php echo 1; ?>'), 'evil.jpg', 'image/jpeg');
    const svg = await send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml');
    const huge = await send(Buffer.alloc(11 * 1024 * 1024, 1), 'big.jpg', 'image/jpeg');
    assert.equal(fake.statusCode, 400, fake.body);
    assert.equal(svg.statusCode, 400, svg.body);
    assert.equal(huge.statusCode, 413, huge.body);
    assert.equal((await fs.readdir(uploadDir)).length, before);
  });
});

describe('visitor addresses behind a proxy', () => {
  /** 21 orders arriving from the same proxy; `forwarded(i)` is what the X-Forwarded-For header says */
  async function lastStatus(trustProxy, forwarded) {
    const other = await buildApp({ db, env: { production: false, trustProxy, uploadDir }, logger: false });
    let res;
    for (let i = 0; i < 21; i++) {
      res = await other.inject({ method: 'POST', url: '/api/orders', payload: customer({ items: [] }), remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': forwarded(i) } });
    }
    await other.close();
    return res.statusCode;
  }

  test('with a trusted proxy, each visitor has their own limit', async () => {
    assert.equal(await lastStatus('loopback', (i) => `203.0.113.${i + 1}`), 400);
  });

  test('a visitor cannot dodge the limit by inventing addresses', async () => {
    assert.equal(await lastStatus('loopback', (i) => `198.51.100.${i + 1}, 203.0.113.9`), 429);
  });

  test('with no trusted proxy, the header is ignored', async () => {
    assert.equal(await lastStatus(false, (i) => `203.0.113.${i + 1}`), 429);
  });

  test('settings that would silently fail or allow faking are refused', () => {
    for (const TRUST_PROXY of ['1', '2', 'true']) assert.throws(() => loadEnv({ DATABASE_URL: 'postgres://x/y', TRUST_PROXY }), /TRUST_PROXY/);
    for (const TRUST_PROXY of ['', '0', 'false', undefined]) assert.equal(loadEnv({ DATABASE_URL: 'postgres://x/y', TRUST_PROXY }).trustProxy, false);
    assert.equal(loadEnv({ DATABASE_URL: 'postgres://x/y', TRUST_PROXY: 'loopback,uniquelocal' }).trustProxy, 'loopback,uniquelocal');
  });
});
