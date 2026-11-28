/* The Orbit Wildcard, the home page slideshow and catalog thumbnails, the dashboard, and the
   logic fixes from the audit. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { upsertAdmin } from '../src/auth.js';
import { ROOT } from '../src/env.js';
import { sizeKey } from '../src/sizes.js';
import { pickJersey } from '../src/wildcard.js';
import {
  asAdmin, catalog, catalogScript, customer, data, editBody, jerseys, jpeg, line, multipart, newProduct, ok, onSale, setUp, shop, signIn, uploadPhoto,
} from './helpers.js';

let shopUnderTest, db, uploadDir, call, admin;
before(async () => {
  shopUnderTest = await setUp();
  ({ db, uploadDir, call, admin } = shopUnderTest);
});
after(() => shopUnderTest?.stop());

const getProduct = (id) => ok(admin('GET', `/products/${id}`));
const lastEntry = async (action) => (await db.query('SELECT * FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1', [action])).rows[0];
const exists = (file) => fs.access(file).then(() => true, () => false);

/** the website's own start-up code, run on the catalog it would receive */
async function website() {
  const window = { addEventListener() {} };
  const context = vm.createContext({ window, localStorage: { getItem: () => null, setItem() {} }, location: { href: 'http://shop.test/' }, URL, setTimeout, clearTimeout });
  vm.runInContext(await fs.readFile(path.join(ROOT, 'assets/js/config.js'), 'utf8'), context);
  vm.runInContext(await catalogScript(call), context);
  vm.runInContext(await fs.readFile(path.join(ROOT, 'assets/js/core.js'), 'utf8'), context);
  return window.JO;
}

/* ---------- the wildcard ---------- */

const wildcard = () => ok(admin('GET', '/wildcard'));
async function setWildcard(over) {
  const { settings } = await wildcard();
  const body = { mode: 'open', price: 499, dailyLimit: 5, pool: 'all', version: settings.version, ...over };
  return ok(admin('PUT', '/wildcard', body));
}
let phoneCounter = 0;
const phone = () => `98${String(10000000 + ++phoneCounter)}`;
const claim = (over = {}) => call('POST', '/api/wildcard/orders', { body: customer({ phone: phone(), size: 'M', ...over }) });
const status = () => ok(call('GET', '/api/wildcard'));
const liveToday = async () => (await db.query("SELECT count(*) AS n FROM orders WHERE wildcard_date = (now() AT TIME ZONE 'Asia/Kolkata')::date AND status <> 'cancelled'")).rows[0].n;
const orderRow = async (number) => (await db.query('SELECT * FROM orders WHERE order_number = $1', [number])).rows[0];
const pickedFor = async (number) =>
  (await db.query('SELECT i.*, v.product_id FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN product_variants v ON v.id = i.variant_id WHERE o.order_number = $1', [number])).rows[0];
const clearWildcardOrders = () => db.query('UPDATE orders SET wildcard_date = wildcard_date - 30 WHERE wildcard_date IS NOT NULL');

describe('Orbit Wildcard: settings', () => {
  test('before the owner saves anything it is "coming soon", as the shop showed before', async () => {
    const { settings } = await wildcard();
    assert.deepEqual([settings.mode, settings.price, settings.dailyLimit, settings.pool, settings.version], ['soon', null, 5, 'all', 0]);
    assert.deepEqual((await catalog(call)).wildcard, { state: 'soon', price: null, dailyLimit: 5 });
    const res = await claim();
    assert.equal(res.json().error, 'WILDCARD_CLOSED');
  });

  test('it cannot take orders without a price, and bad numbers are refused', async () => {
    const bad = [{ price: null }, { price: 0 }, { price: -5 }, { dailyLimit: 0 }, { dailyLimit: 501 }, { dailyLimit: 2.5 }, { pool: 'no-such-collection' }, { mode: 'maybe' }];
    for (const over of bad) {
      const { settings } = await wildcard();
      const res = await admin('PUT', '/wildcard', { mode: 'open', price: 499, dailyLimit: 5, pool: 'all', version: settings.version, ...over });
      assert.equal(res.statusCode, 400, JSON.stringify(over) + res.body);
    }
    assert.equal((await wildcard()).settings.version, 0);
  });

  test('staff can see it but only an owner can change it', async () => {
    await upsertAdmin(db, 'helper', 'staff-tulip-lantern');
    const staff = asAdmin(call, await signIn(call, 'helper', 'staff-tulip-lantern'));
    await ok(staff('GET', '/wildcard'));
    const res = await staff('PUT', '/wildcard', { mode: 'open', price: 1, dailyLimit: 500, pool: 'all', version: 0 });
    assert.equal(res.statusCode, 403);
  });

  test('changes are logged, reach the shop at once, and an out-of-date form is refused', async () => {
    const saved = await setWildcard({ price: 499, dailyLimit: 3 });
    assert.deepEqual([saved.settings.mode, saved.settings.price, saved.settings.dailyLimit], ['open', 499, 3]);
    assert.match((await lastEntry('wildcard.settings')).summary, /taking orders; price not set → ₹499; places per day 5 → 3/);
    assert.deepEqual((await catalog(call)).wildcard, { state: 'open', price: 499, dailyLimit: 3 });
    const stale = await admin('PUT', '/wildcard', { mode: 'off', price: 499, dailyLimit: 3, pool: 'all', version: 0 });
    assert.equal(stale.json().error, 'SETTINGS_CHANGED');
    await setWildcard({ mode: 'off', dailyLimit: 3 });
    assert.deepEqual((await catalog(call)).wildcard, { state: 'off', price: null, dailyLimit: 3 });
    assert.equal((await claim()).json().error, 'WILDCARD_CLOSED');
  });
});

describe('Orbit Wildcard: the daily limit', () => {
  before(async () => {
    await clearWildcardOrders();
    await setWildcard({ dailyLimit: 5 });
  });

  test('fifteen people at once: exactly five get a place', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => claim()));
    const codes = results.map((r) => r.statusCode).sort();
    assert.deepEqual(codes, [...Array(5).fill(201), ...Array(10).fill(409)]);
    assert.ok(results.filter((r) => r.statusCode === 409).every((r) => r.json().error === 'WILDCARD_SOLD_OUT'));
    assert.equal(await liveToday(), 5);
    assert.deepEqual([(await status()).left, (await status()).sizes], [0, []]);
  });

  test('cancelling frees a place, and lowering or raising the limit applies at once', async () => {
    const one = (await db.query("SELECT id FROM orders WHERE wildcard_date IS NOT NULL AND status = 'pending' AND wildcard_date = (now() AT TIME ZONE 'Asia/Kolkata')::date LIMIT 1")).rows[0];
    await ok(admin('PATCH', `/orders/${one.id}`, { status: 'cancelled' }));
    assert.equal((await status()).left, 1);
    await ok(claim(), 201);
    await setWildcard({ dailyLimit: 2 });
    assert.equal((await status()).left, 0, 'never below zero');
    assert.equal((await claim()).json().error, 'WILDCARD_SOLD_OUT');
    await setWildcard({ dailyLimit: 7 });
    assert.equal((await status()).left, 2);
  });

  test('yesterday’s orders do not count against today', async () => {
    await clearWildcardOrders();
    await setWildcard({ dailyLimit: 1 });
    await ok(claim(), 201);
    assert.equal((await claim()).statusCode, 409);
    await db.query("UPDATE orders SET wildcard_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE wildcard_date = (now() AT TIME ZONE 'Asia/Kolkata')::date");
    assert.equal((await status()).left, 1);
    await ok(claim(), 201);
  });

  test('one per phone number per day, however it is typed, even all at once', async () => {
    await clearWildcardOrders();
    await setWildcard({ dailyLimit: 10 });
    const mine = '9876500001';
    const tries = await Promise.all(['9876500001', '+91 98765 00001', '098765-00001', '919876500001'].map((p) => claim({ phone: p })));
    assert.deepEqual(tries.map((r) => r.statusCode).sort(), [201, 409, 409, 409]);
    assert.ok(tries.filter((r) => r.statusCode === 409).every((r) => r.json().error === 'WILDCARD_ALREADY'));
    const first = tries.find((r) => r.statusCode === 201).json();
    await ok(admin('PATCH', `/orders/${(await orderRow(first.orderNumber)).id}`, { status: 'cancelled' }));
    await ok(claim({ phone: mine }), 201);
  });

  test('the same order sent again gets the first one back and picks nothing new', async () => {
    await clearWildcardOrders();
    await setWildcard({ dailyLimit: 2 });
    const body = customer({ phone: phone(), size: 'M' });
    const send = () => call('POST', '/api/wildcard/orders', { body });
    const results = await Promise.all([send(), send(), send()]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 200, 201]);
    assert.equal(new Set(results.map((r) => r.json().orderNumber)).size, 1);
    assert.equal(await liveToday(), 1);
    const number = results[0].json().orderNumber;
    const picked = await pickedFor(number);
    await send();
    assert.deepEqual(await pickedFor(number), picked);
    // a wildcard reference cannot be reused for an ordinary order, or the other way round
    const cross = await call('POST', '/api/orders', { body: { ...customer({ clientRef: body.clientRef, phone: body.phone }), items: [line(onSale(jerseys[0]))] } });
    assert.equal(cross.json().error, 'DUPLICATE_REFERENCE');
  });

  test('claims are rate limited', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await call('POST', '/api/wildcard/orders', { body: customer({ size: 'M', phone: '123' }), ip: '172.16.7.7' });
    assert.equal(last.statusCode, 429);
  });
});

describe('Orbit Wildcard: the surprise', () => {
  before(async () => {
    await clearWildcardOrders();
    await setWildcard({ dailyLimit: 50 });
  });

  test('the buyer never learns the jersey from the reply or the tracking page; the admin does', async () => {
    const body = customer({ phone: phone(), size: 'L' });
    const res = await call('POST', '/api/wildcard/orders', { body });
    assert.equal(res.statusCode, 201, res.body);
    const reply = res.json();
    const picked = await pickedFor(reply.orderNumber);
    const track = await call('POST', '/api/orders/track', { body: { orderNumber: reply.orderNumber, phone: body.phone } });
    for (const text of [res.body, track.body]) {
      assert.ok(!text.includes(picked.product_title), 'the jersey name');
      assert.ok(!text.includes(String(picked.variant_id)) && !text.includes(String(picked.product_id)), 'its ids');
    }
    assert.deepEqual(reply.items, [{ title: 'Orbit Wildcard (surprise jersey)', size: 'L', quantity: 1, price: 499, lineTotal: 499 }]);
    assert.deepEqual(track.json().items, [{ title: 'Orbit Wildcard (surprise jersey)', size: 'L', quantity: 1 }]);
    assert.deepEqual([reply.subtotal, reply.shipping, reply.total], [499, shop.shippingFee, 499 + shop.shippingFee]);

    const seen = await ok(admin('GET', `/orders/${(await orderRow(reply.orderNumber)).id}`));
    assert.deepEqual([seen.wildcard, seen.canRepick, seen.items[0].title, seen.items[0].productId], [true, true, picked.product_title, picked.product_id]);
  });

  test('only jerseys on sale in that size are picked, never socks, and today’s are not repeated', async () => {
    await clearWildcardOrders();
    const numbers = [];
    for (let i = 0; i < 20; i++) numbers.push((await ok(claim({ size: i % 2 ? '2XL' : 'S' }), 201)).orderNumber);
    const picks = await Promise.all(numbers.map(pickedFor));
    assert.equal(new Set(picks.map((p) => p.product_id)).size, 20, 'twenty different jerseys');
    for (const [i, pick] of picks.entries()) {
      assert.equal(sizeKey(pick.size), i % 2 ? '2XL' : 'S');
      const product = await getProduct(pick.product_id);
      assert.ok(product.published && !product.collections.includes('socks'));
      assert.ok(product.variants.find((v) => v.id === pick.variant_id).available);
    }
    assert.equal((await claim({ size: '5XL' })).json().error, 'WILDCARD_NO_SIZE');
    assert.equal((await claim({ size: 'One Size' })).json().error, 'WILDCARD_NO_SIZE');
  });

  test('the pick is spread over the whole pool, using the secure random source', () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ productId: i, size: i % 2 ? 'XXL' : '2XL', variantId: i }));
    const counts = new Map();
    for (let i = 0; i < 4000; i++) {
      const pick = pickJersey(pool, '2XL');
      counts.set(pick.productId, (counts.get(pick.productId) || 0) + 1);
    }
    assert.equal(counts.size, 10);
    assert.ok([...counts.values()].every((n) => n > 280 && n < 520), `uneven: ${[...counts.values()]}`);
    assert.equal(pickJersey(pool, '2XL', new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])).productId, 9);
    assert.ok(pickJersey(pool, '2XL', new Set(pool.map((p) => p.productId))), 'repeats only once everything was picked today');
    assert.equal(pickJersey(pool, 'S'), null);
  });

  test('a chosen collection limits the pool, and a size held by a waiting wildcard is not given twice', async () => {
    await clearWildcardOrders();
    await ok(admin('POST', '/collections', { title: 'Wildcard Pool', inMenu: false }), 201);
    const one = await ok(admin('POST', '/products', newProduct({ title: 'Only One Left', collections: ['wildcard-pool'], variants: [{ size: 'XXL', price: 399, compareAt: null, available: true, stock: 1 }] })), 201);
    await uploadPhoto(admin, one.id);
    const ready = await getProduct(one.id);
    await ok(admin('PUT', `/products/${one.id}`, { ...editBody(ready), published: true }));
    const saved = await setWildcard({ pool: 'wildcard-pool', dailyLimit: 50 });
    assert.deepEqual([saved.pool.jerseys, saved.pool.sizes], [1, [{ size: '2XL', jerseys: 1 }]]);

    const first = await ok(claim({ size: '2XL' }), 201);
    assert.equal((await pickedFor(first.orderNumber)).product_title, 'Only One Left');
    assert.equal(first.items[0].size, '2XL', 'shown as the size the buyer chose, not the jersey’s own “XXL” label');
    assert.equal((await claim({ size: '2XL' })).json().error, 'WILDCARD_NO_SIZE', 'the last one is already promised');
    assert.deepEqual((await status()).sizes, []);

    // confirming takes the stock, as for any order
    await ok(admin('PATCH', `/orders/${(await orderRow(first.orderNumber)).id}`, { status: 'confirmed' }));
    assert.equal((await getProduct(one.id)).variants[0].stock, 0);
    await setWildcard({ pool: 'all', dailyLimit: 50 });
  });

  test('a waiting wildcard can be given another jersey, which is logged', async () => {
    const made = await ok(claim({ size: 'M' }), 201);
    const id = (await orderRow(made.orderNumber)).id;
    const before = await pickedFor(made.orderNumber);
    const after = await ok(admin('POST', `/orders/${id}/repick`));
    assert.notEqual(after.items[0].productId, before.product_id);
    assert.equal(sizeKey(after.items[0].size), 'M');
    assert.equal(after.total, made.total, 'the price does not change');
    assert.match((await lastEntry('wildcard.repick')).summary, new RegExp(`${made.orderNumber}: picked another jersey`));

    await ok(admin('PATCH', `/orders/${id}`, { status: 'confirmed' }));
    assert.equal((await admin('POST', `/orders/${id}/repick`)).json().error, 'NOT_REPICKABLE');
    const ordinary = await ok(call('POST', '/api/orders', { body: customer({ items: [line(onSale(jerseys[1]))] }) }), 201);
    assert.equal((await admin('POST', `/orders/${(await orderRow(ordinary.orderNumber)).id}/repick`)).json().error, 'NOT_REPICKABLE');
  });

  test('a price changed while the buyer was filling in the form is not charged silently', async () => {
    const res = await claim({ expectedTotal: 1 });
    assert.equal(res.json().error, 'TOTAL_CHANGED');
    assert.equal(res.json().details.total, 499 + shop.shippingFee);
  });

  test('erasing a finished wildcard order works, and it stays untraceable', async () => {
    const mine = phone();
    const made = await ok(claim({ phone: mine }), 201);
    const id = (await orderRow(made.orderNumber)).id;
    await ok(admin('PATCH', `/orders/${id}`, { status: 'cancelled' }));
    await ok(admin('POST', `/orders/${id}/erase`));
    assert.equal((await call('POST', '/api/orders/track', { body: { orderNumber: made.orderNumber, phone: mine } })).statusCode, 404);
  });
});

/* ---------- the home page ---------- */

const storefront = () => ok(admin('GET', '/storefront'));
const asSlides = (state) => state.hero.slides.map(({ photos, targetLost, ...s }) => ({ ...s, photos: photos.map((p) => p.ref) }));
const saveHero = (slides, version) => admin('PUT', '/storefront/hero', { version, slides });
async function upload(colour = '#b3123f') {
  const { headers, payload } = multipart(await jpeg(900, 1200, colour));
  return ok(admin('POST', '/site-images', undefined, { headers, payload }), 201);
}
const productPhoto = async (productId) => (await getProduct(productId)).images[0];
const file = (url) => path.join(uploadDir, path.basename(url));

describe('home page slideshow', () => {
  test('starts with the slides from config.js, previewing exactly the photos the shop shows', async () => {
    const state = await storefront();
    assert.deepEqual([state.hero.custom, state.hero.version], [false, 0]);
    const site = await website();
    // arrays made inside the sandbox are copied out, or they never count as equal
    assert.deepEqual(state.hero.slides.map((s) => s.title), Array.from(site.cfg.hero, (h) => h.title));
    for (const [i, slide] of state.hero.slides.entries()) {
      const shown = Array.from(site.heroPhotos(site.cfg.hero[i]), (p) => p.img.s);
      assert.deepEqual(slide.photos.map((p) => p.preview), shown, slide.title);
    }
    assert.equal((await catalog(call)).hero, undefined, 'nothing saved yet, so the shop uses config.js');
  });

  test('saving the defaults unchanged works', async () => {
    const state = await storefront();
    await ok(saveHero(asSlides(state), state.hero.version));
    assert.equal((await catalog(call)).hero.length, 3);
  });

  test('own photos, product photos, texts, order and visibility reach the shop', async () => {
    const state = await storefront();
    const slides = asSlides(state);
    const mine = await upload();
    const target = jerseys[40];
    const chosen = await productPhoto(target.id);
    slides[1] = { ...slides[1], title: 'Legends, restocked', photos: [{ kind: 'upload', id: mine.id }, { kind: 'product', id: chosen.id }] };
    slides[2] = { ...slides[2], visible: false };
    await ok(saveHero([slides[1], slides[0], slides[2]], state.hero.version));

    const feed = (await catalog(call)).hero;
    assert.deepEqual(feed.map((s) => s.title), ['Legends, restocked', slides[0].title]);
    assert.equal(feed[0].photos[0].s, mine.small);
    assert.deepEqual([feed[0].photos[1].s, feed[0].photos[1].p], [chosen.small, (await getProduct(target.id)).handle]);
    const site = await website();
    const pictures = Array.from(site.heroPhotos(site.data.hero[0]), (p) => [p.img.s, p.href]);
    assert.deepEqual(pictures[0], [mine.small, `shop.html?c=${slides[1].collection}`]);
    assert.equal(pictures[1][1], `product.html?p=${(await getProduct(target.id)).handle}`);
    assert.match((await lastEntry('storefront.slideshow')).summary, /2 of 3 slide/);
  });

  test('a hidden or deleted product falls back to automatic, and the admin is told why', async () => {
    const target = jerseys[40];
    const product = await getProduct(target.id);
    await ok(admin('PUT', `/products/${target.id}`, { ...editBody(product), published: false }));
    assert.equal((await catalog(call)).hero[0].photos[1], null);
    const state = await storefront();
    assert.equal(state.hero.slides[0].photos[1].problem, 'hidden');
    assert.ok(state.hero.slides[0].photos[1].preview, 'the automatic photo is previewed instead');
    const shown = await website();
    assert.equal(shown.heroPhotos(shown.data.hero[0])[1].img.s, state.hero.slides[0].photos[1].preview);

    await ok(admin('DELETE', `/products/${target.id}`));
    assert.equal((await storefront()).hero.slides[0].photos[1].problem, 'gone');
    const after = await storefront();
    const res = await saveHero(asSlides(after), after.hero.version);
    assert.equal(res.statusCode, 400, 'a photo that is gone must be chosen again');
    assert.match(res.json().message, /no longer exists/);
  });

  test('bad slides are refused and change nothing', async () => {
    const state = await storefront();
    const good = asSlides(state).map((s) => ({ ...s, photos: [null, null] }));
    const cases = [
      good.map((s) => ({ ...s, visible: false })),
      good.map((s, i) => (i ? s : { ...s, title: '   ' })),
      good.map((s, i) => (i ? s : { ...s, collection: 'no-such' })),
      good.map((s, i) => (i ? s : { ...s, photos: [{ kind: 'upload', id: 424242 }, null] })),
      good.map((s, i) => (i ? s : { ...s, photos: [{ kind: 'url', id: 1 }, null] })),
      good.map((s, i) => (i ? s : { ...s, photos: [null] })),
      [...good, ...good, ...good],
      [],
    ];
    for (const slides of cases) {
      const res = await saveHero(slides, state.hero.version);
      assert.equal(res.statusCode, 400, res.body);
    }
    assert.equal((await storefront()).hero.version, state.hero.version);
    assert.equal((await saveHero(good, state.hero.version - 1)).json().error, 'SETTINGS_CHANGED');
  });

  test('a slide button can only open a collection the shop knows, and a lost one is pointed out', async () => {
    await ok(admin('POST', '/collections', { title: 'Hidden Picks', inMenu: false }), 201);
    let state = await storefront();
    const slides = asSlides(state).map((s) => ({ ...s, photos: [null, null] }));
    const refused = await saveHero(slides.map((s, i) => (i ? s : { ...s, collection: 'hidden-picks' })), state.hero.version);
    assert.equal(refused.statusCode, 400);
    assert.match(refused.json().message, /shop menu/);

    await ok(admin('PATCH', '/collections/hidden-picks', { inMenu: true }));
    state = await ok(saveHero(slides.map((s, i) => (i ? s : { ...s, collection: 'hidden-picks' })), state.hero.version));
    assert.equal(state.hero.slides[0].targetLost, false);
    await ok(admin('DELETE', '/collections/hidden-picks'));
    state = await storefront();
    assert.equal(state.hero.slides[0].targetLost, true);
    await ok(admin('DELETE', `/storefront/hero?version=${state.hero.version}`));
  });

  test('uploads that nothing uses any more are deleted; defaults can be restored', async () => {
    let state = await storefront();
    const first = await upload('#14295c');
    const slides = asSlides(state).map((s) => ({ ...s, photos: [null, null] }));
    slides[0].photos[0] = { kind: 'upload', id: first.id };
    state = await ok(saveHero(slides, state.hero.version));
    assert.ok(await exists(file(first.small)));

    const second = await upload('#b4f55f');
    slides[0].photos[0] = { kind: 'upload', id: second.id };
    state = await ok(saveHero(slides, state.hero.version));
    assert.ok(!(await exists(file(first.small))), 'the replaced upload is removed');
    assert.ok(await exists(file(second.small)));

    state = await ok(admin('DELETE', `/storefront/hero?version=${state.hero.version}`));
    assert.deepEqual([state.hero.custom, state.hero.version], [false, 0]);
    assert.ok(!(await exists(file(second.small))));
    assert.equal((await catalog(call)).hero, undefined);
  });

  test('an upload waiting to be saved is kept, and an abandoned one goes after a day', async () => {
    const waiting = await upload('#222222');
    await ok(admin('PUT', '/storefront/thumbnails/socks', { photo: null }));
    assert.ok(await exists(file(waiting.small)));
    await db.query("UPDATE site_images SET created_at = now() - interval '25 hours' WHERE id = $1", [waiting.id]);
    await ok(admin('PUT', '/storefront/thumbnails/socks', { photo: null }));
    assert.ok(!(await exists(file(waiting.small))));
  });

  test('what is typed into a slide cannot run as code in the shop', async () => {
    const state = await storefront();
    const hostile = '<img src=x onerror=alert(1)>';
    const slides = asSlides(state).map((s) => ({ ...s, eyebrow: hostile.slice(0, 40), title: hostile, text: hostile, cta: hostile.slice(0, 30), photos: [null, null] }));
    await ok(saveHero(slides, state.hero.version));
    const feed = await catalogScript(call);
    assert.ok(feed.includes(JSON.stringify(hostile)), 'stored as text; the shop escapes it when drawing');
    const home = await fs.readFile(path.join(ROOT, 'assets/js/home.js'), 'utf8');
    for (const field of ['s.h.eyebrow', 's.h.title', 's.h.text', 's.h.cta']) assert.ok(home.includes(`esc(${field})`), field);
    await ok(admin('DELETE', `/storefront/hero?version=${(await storefront()).hero.version}`));
  });
});

describe('catalog thumbnails', () => {
  const thumbnail = async (key) => (await storefront()).thumbnails.find((t) => t.key === key);
  const set = (key, photo) => admin('PUT', `/storefront/thumbnails/${key}`, { photo });

  test('automatic previews match the shop, and a chosen photo replaces it everywhere', async () => {
    const state = await storefront();
    const site = await website();
    for (const t of state.thumbnails.filter((t) => t.preview)) assert.equal(site.catImage(t.key).s, t.preview, t.key);
    assert.ok(state.thumbnails.some((t) => t.key === 'full-sleeve'), 'built-in ones worked out by the website are included');

    const mine = await upload('#ff88cc');
    await ok(set('retro', { kind: 'upload', id: mine.id }));
    await ok(set('full-sleeve', { kind: 'product', id: (await productPhoto(jerseys[50].id)).id }));
    const after = await website();
    assert.equal(after.catImage('retro').s, mine.small);
    assert.equal(after.catImage('full-sleeve').s, (await productPhoto(jerseys[50].id)).small);
    assert.equal(after.catImage('2026-27').s, site.catImage('2026-27').s, 'other categories do not change');

    await ok(set('retro', null));
    assert.equal((await website()).catImage('retro').s, site.catImage('retro').s);
    assert.ok(!(await exists(file(mine.small))));
    assert.equal((await thumbnail('retro')).ref, null);
    assert.match((await lastEntry('storefront.thumbnail')).summary, /“Retro”: back to automatic/);
  });

  test('unknown categories and photos are refused', async () => {
    assert.equal((await set('no-such', null)).statusCode, 404);
    assert.equal((await set('retro', { kind: 'upload', id: 999999 })).statusCode, 400);
    assert.equal((await set('retro', { kind: 'upload' })).statusCode, 400);
    assert.equal((await admin('PUT', '/storefront/thumbnails/retro', {})).statusCode, 400);
  });

  test('deleting your own collection also forgets its thumbnail and removes the upload', async () => {
    await ok(admin('POST', '/collections', { title: 'Thumbnail Test' }), 201);
    const mine = await upload('#00aa66');
    await ok(set('thumbnail-test', { kind: 'upload', id: mine.id }));
    await ok(admin('DELETE', '/collections/thumbnail-test'));
    assert.ok(!(await exists(file(mine.small))));
    assert.ok(!(await storefront()).thumbnails.some((t) => t.key === 'thumbnail-test'));
  });

  test('the photo picker lists only photos of products on the website', async () => {
    const hidden = await ok(admin('POST', '/products', newProduct({ title: 'Picker Hidden Kit' })), 201);
    await uploadPhoto(admin, hidden.id);
    assert.equal((await ok(admin('GET', '/photos?q=Picker%20Hidden'))).total, 0);
    const found = await ok(admin('GET', '/photos?q=retro'));
    assert.ok(found.photos.length > 0 && found.photos.length <= 24);
    assert.ok(found.photos.every((p) => /retro/i.test(p.title)));
  });
});

/* ---------- the dashboard ---------- */

describe('dashboard numbers', () => {
  before(async () => {
    await db.query('DELETE FROM orders');
  });

  const place = async (items) => (await orderRow((await ok(call('POST', '/api/orders', { body: customer({ items }) }), 201)).orderNumber)).id;
  const patch = (id, changes) => ok(admin('PATCH', `/orders/${id}`, changes));
  const moveBack = (id, days) => db.query("UPDATE orders SET created_at = created_at - make_interval(days => $2) WHERE id = $1", [id, days]);
  const dashboard = (days = 7) => ok(admin('GET', `/summary?days=${days}`));

  test('sales, orders and comparisons add up as defined', async () => {
    const [a, b, c] = [jerseys[60], jerseys[61], jerseys[62]];
    const price = (p) => onSale(p).p;
    const paidNow = await place([line(onSale(a), 2)]);
    await patch(paidNow, { paymentStatus: 'paid', status: 'confirmed' });
    const paidNow2 = await place([line(onSale(b))]);
    await patch(paidNow2, { paymentStatus: 'paid' });
    await place([line(onSale(c))]); // placed, not paid
    const cancelledPaid = await place([line(onSale(c))]);
    await patch(cancelledPaid, { paymentStatus: 'paid', status: 'cancelled' });
    const earlier = await place([line(onSale(c), 3)]);
    await patch(earlier, { paymentStatus: 'paid' });
    await moveBack(earlier, 10); // in the 7 days before this week
    const long = await place([line(onSale(c))]);
    await patch(long, { paymentStatus: 'paid' });
    await moveBack(long, 60); // outside both

    const { performance: p } = await dashboard(7);
    const totalOf = async (id) => (await db.query('SELECT total_paise FROM orders WHERE id = $1', [id])).rows[0].total_paise / 100;
    const sales = price(a) * 2 + shop.shippingFee + price(b) + shop.shippingFee;
    assert.equal(p.totals.sales.now, sales);
    assert.equal(p.totals.sales.before, await totalOf(earlier));
    assert.deepEqual(p.totals.paidOrders, { now: 2, before: 1 });
    assert.equal(p.totals.averageOrder.now, Math.round((sales * 100) / 2) / 100);
    assert.deepEqual(p.totals.items, { now: 3, before: 3 });
    assert.deepEqual(p.totals.orders, { now: 3, before: 1 }, 'cancelled orders are counted separately');
    assert.deepEqual(p.totals.cancelled, { now: 1, before: 0 });
    assert.equal(p.daily.length, 7);
    assert.equal(p.daily.reduce((n, d) => n + d.sales, 0), sales);
    assert.equal(p.daily.reduce((n, d) => n + d.orders, 0), 3);
    assert.equal(p.daily.at(-1).day, (await dashboard()).today);
    assert.deepEqual(p.topProducts.map((t) => [t.title, t.units]), [[a.t, 2], [b.t, 1]]);
    assert.equal(p.sizes.reduce((n, s) => n + s.units, 0), 3);
    assert.deepEqual(p.areas, [{ area: 'kerala', orders: 2, sales }, { area: 'india', orders: 0, sales: 0 }]);
    assert.equal((await dashboard(30)).performance.totals.paidOrders.now, 3);
    assert.equal((await dashboard(90)).performance.totals.paidOrders.now, 4);
    assert.equal((await admin('GET', '/summary?days=5')).statusCode, 400);
  });

  test('"needs your attention" counts match the lists they link to', async () => {
    await db.query('DELETE FROM orders');
    const waiting = await place([line(onSale(jerseys[63]))]);
    await db.query("UPDATE orders SET created_at = now() - interval '30 hours' WHERE id = $1", [waiting]);
    const late = await place([line(onSale(jerseys[64]))]);
    await patch(late, { status: 'confirmed', paymentStatus: 'paid' });
    await db.query("UPDATE order_events SET created_at = now() - interval '25 hours' WHERE order_id = $1 AND status = 'confirmed'", [late]);
    const unpaid = await place([line(onSale(jerseys[65]))]);
    await patch(unpaid, { status: 'confirmed' });
    const refund = await place([line(onSale(jerseys[66]))]);
    await patch(refund, { paymentStatus: 'paid', status: 'cancelled' });
    const broken = await place([line(onSale(jerseys[67]))]);
    await ok(admin('DELETE', `/products/${jerseys[67].id}`));

    const { attention, recentOrders } = await dashboard();
    assert.deepEqual(attention, { pending: 2, oldestPendingHours: 30, late: 1, unpaid: 1, refund: 1, missing: 1 });
    for (const [view, id] of [['late', late], ['unpaid', unpaid], ['refund', refund], ['missing', broken]]) {
      const list = await ok(admin('GET', `/orders?view=${view}`));
      assert.deepEqual(list.orders.map((o) => o.id), [id], view);
    }
    assert.equal(recentOrders.length, 5);
    const detail = await ok(admin('GET', `/orders/${broken}`));
    assert.deepEqual([detail.items[0].removed, detail.items[0].productId], [true, null]);
    assert.equal((await admin('GET', '/orders?view=secrets')).statusCode, 400);
  });

  test('catalog health, stock watching and the wildcard are summed up', async () => {
    const s = await dashboard();
    assert.equal(s.products.total, s.products.published + s.products.hidden);
    assert.ok(s.products.soldOutOnWebsite <= s.products.soldOut);
    assert.ok(s.stock.sizes > 1000 && s.stock.counted >= 0);
    assert.ok(s.lowStockCount >= s.lowStock.length);
    assert.ok(['open', 'soon', 'off'].includes(s.wildcard.mode));
    assert.equal(s.wildcard.claimed, await liveToday());
  });
});

/* ---------- other fixes from the audit ---------- */

describe('audit fixes', () => {
  test('details cannot be erased while a refund or a payment is still outstanding', async () => {
    const finish = async (changes) => {
      const made = await ok(call('POST', '/api/orders', { body: customer({ items: [line(onSale(jerseys[72]))] }) }), 201);
      const id = (await orderRow(made.orderNumber)).id;
      for (const change of changes) await ok(admin('PATCH', `/orders/${id}`, change));
      return id;
    };
    const refundDue = await finish([{ paymentStatus: 'paid' }, { status: 'cancelled' }]);
    const unpaid = await finish([{ status: 'confirmed' }, { status: 'shipped' }, { status: 'delivered' }]);
    for (const [id, why, settle] of [[refundDue, /refund/, 'refunded'], [unpaid, /not marked paid/, 'paid']]) {
      const refused = await admin('POST', `/orders/${id}/erase`);
      assert.equal(refused.json().error, 'PAYMENT_UNSETTLED');
      assert.match(refused.json().message, why);
      assert.match((await ok(admin('GET', `/orders/${id}`))).eraseBlocked, why);
      await ok(admin('PATCH', `/orders/${id}`, { paymentStatus: settle }));
      await ok(admin('POST', `/orders/${id}/erase`));
    }
    for (const view of ['refund', 'unpaid']) {
      const stuck = (await ok(admin('GET', `/orders?view=${view}`))).orders.filter((o) => o.id === refundDue || o.id === unpaid);
      assert.deepEqual(stuck, [], `nothing is left stuck under “${view}”`);
    }
  });

  test('an order search finds a phone however it is typed', async () => {
    const made = await ok(call('POST', '/api/orders', { body: customer({ phone: '9445566778', items: [line(onSale(jerseys[70]))] }) }), 201);
    for (const q of ['+91 94455 66778', '094455-66778', '919445566778', '94455 667', '+91 94455', made.orderNumber]) {
      const found = await ok(admin('GET', `/orders?q=${encodeURIComponent(q)}`));
      assert.ok(found.orders.some((o) => o.orderNumber === made.orderNumber), q);
    }
    assert.equal((await ok(admin('GET', `/orders?q=${encodeURIComponent('+91 00000 11111')}`))).total, 0);
  });

  test('a product says which sizes waiting orders include', async () => {
    const p = jerseys[71];
    const v = onSale(p);
    await ok(call('POST', '/api/orders', { body: customer({ items: [line(v)] }) }), 201);
    const product = await getProduct(p.id);
    assert.equal(product.variants.find((x) => x.id === v.id).waiting, 1);
    assert.ok(product.variants.filter((x) => x.id !== v.id).every((x) => x.waiting === 0));
  });

  test('XXL counts as 2XL, the same in the shop and on the server', async () => {
    const site = await website();
    for (const label of ['XXL', 'xxl', ' 2XL ', 'XXXL', '3XL', 'M', 'One Size']) assert.equal(site.sizeKey(label), sizeKey(label), label);
    assert.equal(sizeKey('XXL'), '2XL');
    const xxlOnly = data.products.filter((p) => p.v.some((v) => v.a && v.s === 'XXL'));
    assert.ok(xxlOnly.length > 0, 'the imported catalog has XXL jerseys');
    // the shop's size filter is checked in a real browser; here, that it uses this rule
    const shopCode = await fs.readFile(path.join(ROOT, 'assets/js/shop.js'), 'utf8');
    assert.match(shopCode, /state\.sizes\.includes\(JO\.sizeKey\(v\.s\)\)/);
  });
});
