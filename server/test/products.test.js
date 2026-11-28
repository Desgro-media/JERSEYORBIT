/* Full product management: list, copy, reorder, bulk changes, delete, collections, and erasing
   customer details. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../src/env.js';
import { seed } from '../src/seed.js';
import {
  asAdmin, catalog, catalogScript, customer, data, editBody, jerseys, line, newProduct, ok, onSale, setUp, signIn, uploadPhoto,
} from './helpers.js';

let shopUnderTest, db, uploadDir, call, admin;
before(async () => {
  shopUnderTest = await setUp();
  ({ db, uploadDir, call, admin } = shopUnderTest);
});
after(() => shopUnderTest?.stop());

const getProduct = (id) => ok(admin('GET', `/products/${id}`));
const create = (over) => ok(admin('POST', '/products', newProduct(over)), 201);
const shownOrder = async () => (await catalog(call)).products.map((p) => p.id);
const shown = async (id) => (await catalog(call)).products.find((p) => p.id === id);
const bulk = (ids, action, extra) => admin('POST', '/products/bulk', { ids, action, ...extra });
const bulkOk = (ids, action, extra) => ok(bulk(ids, action, extra));
const lastEntry = async (action) => (await db.query('SELECT * FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1', [action])).rows[0];
const entries = async () => (await db.query('SELECT count(*) AS n FROM audit_log')).rows[0].n;
const exists = (file) => fs.access(file).then(() => true, () => false);

describe('finding products', () => {
  test('filter, sort, page size and collection filter', async () => {
    const byName = await ok(admin('GET', '/products?sort=name&pageSize=100'));
    assert.equal(byName.products.length, 100);
    const titles = byName.products.map((p) => p.title.toLowerCase());
    assert.deepEqual(titles, [...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

    const cheap = (await ok(admin('GET', '/products?sort=price-asc'))).products.map((p) => p.price);
    assert.deepEqual(cheap, [...cheap].sort((a, b) => a - b));
    const dear = (await ok(admin('GET', '/products?sort=price-desc'))).products.map((p) => p.price);
    assert.deepEqual(dear, [...dear].sort((a, b) => b - a));

    const retro = await ok(admin('GET', '/products?collection=retro'));
    assert.equal(retro.total, data.products.filter((p) => p.k.includes('retro')).length);

    const target = await create({ title: 'Almost Gone Kit', variants: [{ size: 'M', price: 300, compareAt: null, available: true, stock: 1 }] });
    const low = await ok(admin('GET', '/products?filter=lowstock'));
    assert.deepEqual(low.products.map((p) => p.id), [target.id]);
    assert.deepEqual([low.products[0].stock, low.products[0].sizes, low.products[0].sizesOnSale], [1, 1, 1]);
    assert.equal((await ok(admin('GET', '/products?sort=stock'))).products[0].id, target.id);
    assert.equal((await ok(admin('GET', '/products?sort=newest'))).products[0].id, target.id);

    const summary = await ok(admin('GET', '/summary'));
    assert.equal(summary.products.total, data.products.length + 1);
    assert.equal(summary.products.published + summary.products.hidden, summary.products.total);
  });

  test('a price with paise is accepted', async () => {
    // an earlier "multiple of 0.01" rule refused prices such as 109.32 because of floating-point rounding
    for (const price of [109.32, 0.29, 399.99]) {
      const p = await create({ title: `Paise ${price}`, variants: [{ size: 'M', price: Math.max(1, price), compareAt: null, available: true, stock: null }] });
      assert.equal(p.variants[0].price, Math.max(1, price));
    }
  });
});

describe('copying, reordering and web addresses', () => {
  test('a copy is hidden, has no photos, and does not copy stock counts', async () => {
    const source = jerseys[3];
    const body = editBody(await getProduct(source.id));
    body.variants[0].stock = 7;
    body.variants[1].stock = null;
    await ok(admin('PUT', `/products/${source.id}`, body));
    const original = await getProduct(source.id);
    const copy = await ok(admin('POST', `/products/${source.id}/duplicate`), 201);
    assert.equal(copy.title, `${original.title} (copy)`);
    assert.notEqual(copy.handle, original.handle);
    assert.equal(copy.published, false);
    assert.deepEqual(copy.images, []);
    assert.deepEqual(copy.collections, original.collections);
    assert.deepEqual(copy.variants.map((v) => [v.size, v.price, v.compareAt]), original.variants.map((v) => [v.size, v.price, v.compareAt]));
    assert.deepEqual(copy.variants.slice(0, 2).map((v) => v.stock), [0, null]);
    assert.ok((await getProduct(source.id)).images.length > 0, 'the original keeps its photos');
    assert.ok(!(await shownOrder()).includes(copy.id));
  });

  test('moving a product changes the order in the admin list and in the shop', async () => {
    const id = jerseys[8].id;
    const move = (to) => ok(admin('POST', `/products/${id}/move`, { to }));
    // the admin's Featured list includes hidden products, so "up" and "down" step past those too
    const listed = async () => (await ok(admin('GET', '/products?pageSize=100'))).products.map((p) => p.id);
    assert.deepEqual(await move('top'), { moved: true });
    assert.equal((await shownOrder())[0], id);
    assert.deepEqual(await move('up'), { moved: false });
    const before = await listed();
    await move('down');
    assert.deepEqual((await listed()).slice(0, 2), [before[1], id]);
    await move('up');
    assert.deepEqual(await listed(), before);
    await move('bottom');
    assert.equal((await shownOrder()).at(-1), id);
    assert.equal((await admin('POST', `/products/${id}/move`, { to: 'sideways' })).statusCode, 400);
    assert.equal((await admin('POST', '/products/424242/move', { to: 'top' })).statusCode, 404);
    assert.match((await lastEntry('product.move')).summary, /bottom/);
  });

  test('the web address can be changed, but not to one that is taken or not allowed', async () => {
    const id = jerseys[9].id;
    const save = async (handle) => admin('PUT', `/products/${id}`, { ...editBody(await getProduct(id)), handle });
    assert.equal((await save('  Fresh-Address-2027 ')).statusCode, 200);
    assert.equal((await shown(id)).h, 'fresh-address-2027');
    const taken = await save(jerseys[10].h);
    assert.equal(taken.statusCode, 400);
    assert.match(taken.json().message, /already uses/);
    for (const bad of ['', '../secrets', 'two words', 'ends-', '"><script>', 'x'.repeat(151)]) {
      assert.equal((await save(bad)).statusCode, 400, JSON.stringify(bad));
    }
    assert.equal((await getProduct(id)).handle, 'fresh-address-2027');
    assert.match((await lastEntry('product.update')).summary, /web address .* → fresh-address-2027/);
  });
});

describe('changing several products at once', () => {
  const three = () => [jerseys[20].id, jerseys[21].id, jerseys[22].id];
  const sizesOf = async (ids) => (await Promise.all(ids.map(getProduct))).flatMap((p) => p.variants);

  test('set price, take a percentage off, and end the sale', async () => {
    assert.equal((await bulkOk(three(), 'set-price', { price: 500, compareAt: null })).changed, 3);
    assert.ok((await sizesOf(three())).every((v) => v.price === 500 && v.compareAt === null));

    await bulkOk(three(), 'discount', { percent: 15 });
    assert.ok((await sizesOf(three())).every((v) => v.price === 425 && v.compareAt === 500));
    await bulkOk(three(), 'discount', { percent: 10 }); // from the current price; "was" does not go down
    assert.ok((await sizesOf(three())).every((v) => v.price === 383 && v.compareAt === 500), 'whole rupees, rounded');
    assert.equal((await shown(three()[0])).c, 500);

    await bulkOk(three(), 'end-sale');
    assert.ok((await sizesOf(three())).every((v) => v.price === 500 && v.compareAt === null));
    assert.deepEqual(await bulkOk(three(), 'end-sale'), { changed: 0, skipped: [], missing: 0 });
  });

  test('a discount never lowers a higher “was” price, and never reaches zero', async () => {
    const p = await create({ title: 'Penny Kit', variants: [{ size: 'M', price: 1, compareAt: 9, available: true, stock: null }, { size: 'L', price: 200, compareAt: 900, available: true, stock: null }] });
    await bulkOk([p.id], 'discount', { percent: 90 });
    assert.deepEqual((await getProduct(p.id)).variants.map((v) => [v.price, v.compareAt]), [[1, 9], [20, 900]]);
  });

  test('sold out, back on sale, hide, publish and collections', async () => {
    await bulkOk(three(), 'sizes-off');
    assert.equal((await shown(three()[0])).a, false);
    await bulkOk(three(), 'sizes-on');
    assert.equal((await shown(three()[0])).a, true);

    await bulkOk(three(), 'hide');
    assert.ok(!(await shownOrder()).includes(three()[0]));
    const bare = await create({ title: 'No Photo Kit' });
    const published = await bulkOk([...three(), bare.id], 'publish');
    assert.equal(published.changed, 3);
    assert.deepEqual(published.skipped, [{ id: bare.id, title: 'No Photo Kit', reason: 'has no photo' }]);
    assert.equal((await getProduct(bare.id)).published, false);

    await bulkOk(three(), 'add-collection', { collection: 'imported' });
    assert.ok((await shown(three()[1])).k.includes('imported'));
    assert.equal((await bulkOk(three(), 'add-collection', { collection: 'imported' })).changed, 0);
    await bulkOk(three(), 'remove-collection', { collection: 'imported' });
    assert.ok(!(await shown(three()[1])).k.includes('imported'));
  });

  test('moving several to the top keeps their order among themselves', async () => {
    const order = await shownOrder();
    const picked = [order[30], order[10], order[20]];
    await bulkOk(picked, 'feature');
    assert.deepEqual((await shownOrder()).slice(0, 3), [order[10], order[20], order[30]]);
  });

  test('an editor that was open before a bulk change cannot overwrite it', async () => {
    const stale = editBody(await getProduct(three()[0]));
    await bulkOk([three()[0]], 'set-price', { price: 450, compareAt: 700 });
    const res = await admin('PUT', `/products/${three()[0]}`, stale);
    assert.equal(res.json().error, 'PRODUCT_CHANGED');
    assert.ok((await getProduct(three()[0])).variants.every((v) => v.price === 450));
  });

  test('a bad request changes nothing', async () => {
    const before = await sizesOf(three());
    const logged = await entries();
    const bad = [
      bulk(three(), 'set-price'), bulk(three(), 'set-price', { price: 500, compareAt: 400 }), bulk(three(), 'set-price', { price: -1 }),
      bulk(three(), 'discount'), bulk(three(), 'discount', { percent: 95 }), bulk(three(), 'discount', { percent: 0 }),
      bulk(three(), 'add-collection'), bulk(three(), 'add-collection', { collection: 'no-such' }), bulk(three(), 'explode'),
      bulk([], 'hide'), bulk(Array.from({ length: 101 }, (_, i) => i + 1), 'hide'),
    ];
    for (const res of await Promise.all(bad)) assert.equal(res.statusCode, 400, res.body);
    assert.deepEqual(await sizesOf(three()), before);
    assert.equal(await entries(), logged, 'nothing is logged for a change that did not happen');
  });

  test('ids that no longer exist are reported, and bulk delete removes uploaded photos', async () => {
    const a = await create({ title: 'Bulk Delete A' });
    const b = await create({ title: 'Bulk Delete B' });
    const withPhoto = await uploadPhoto(admin, a.id);
    const file = path.join(uploadDir, path.basename(withPhoto.images[0].large));
    assert.ok(await exists(file));
    assert.deepEqual(await bulkOk([a.id, b.id, 424242], 'delete'), { changed: 2, skipped: [], missing: 1 });
    assert.ok(!(await exists(file)));
    assert.equal((await admin('GET', `/products/${a.id}`)).statusCode, 404);
    assert.match((await lastEntry('product.delete')).summary, /Bulk Delete A, Bulk Delete B/);
  });
});

describe('deleting a product', () => {
  test('removes it and its uploads, keeps past orders, and a re-import does not bring it back', async () => {
    const imported = jerseys[30];
    const placed = await ok(call('POST', '/api/orders', { body: customer({ items: [line(onSale(imported))] }) }), 201);
    const orderId = (await ok(admin('GET', `/orders?q=${placed.orderNumber}`))).orders[0].id;
    assert.equal((await getProduct(imported.id)).openOrders, 1);
    const product = await uploadPhoto(admin, imported.id);
    const upload = path.join(uploadDir, path.basename(product.images.at(-1).small));
    const committed = path.join(ROOT, product.images[0].small);
    assert.ok((await exists(upload)) && (await exists(committed)));

    assert.deepEqual(await ok(admin('DELETE', `/products/${imported.id}`)), { ok: true });
    assert.ok(!(await exists(upload)), 'uploaded photos are removed');
    assert.ok(await exists(committed), 'photos that belong to the website’s files are left alone');
    assert.equal(await shown(imported.id), undefined);
    assert.equal((await admin('DELETE', `/products/${imported.id}`)).statusCode, 404);

    const order = await ok(admin('GET', `/orders/${orderId}`));
    assert.equal(order.items[0].title, imported.t);
    assert.equal(order.items[0].price, onSale(imported).p);
    await ok(admin('PATCH', `/orders/${orderId}`, { status: 'confirmed' }));
    await ok(admin('PATCH', `/orders/${orderId}`, { status: 'cancelled' }));

    assert.equal((await seed(db)).added, 0);
    assert.equal((await admin('GET', `/products/${imported.id}`)).statusCode, 404);
  });
});

describe('collections', () => {
  const list = () => ok(admin('GET', '/collections'));
  const find = async (key) => (await list()).find((c) => c.key === key);

  /** run the website's own start-up code on the catalog it would receive */
  async function storefront() {
    const window = { addEventListener() {} };
    const context = vm.createContext({ window, localStorage: { getItem: () => null, setItem() {} }, location: { href: 'http://shop.test/' }, URL, setTimeout, clearTimeout });
    vm.runInContext(await fs.readFile(path.join(ROOT, 'assets/js/config.js'), 'utf8'), context);
    vm.runInContext(await catalogScript(call), context);
    vm.runInContext(await fs.readFile(path.join(ROOT, 'assets/js/core.js'), 'utf8'), context);
    return window.JO;
  }

  test('a new collection reaches the shop once it is listed and has a visible product', async () => {
    const made = await ok(admin('POST', '/collections', { title: '  Club  Legends ', blurb: 'Icons only' }), 201);
    assert.deepEqual(made.find((c) => c.key === 'club-legends'), { key: 'club-legends', title: 'Club Legends', blurb: 'Icons only', inMenu: true, builtIn: false, products: 0, published: 0 });
    assert.deepEqual((await catalog(call)).categories, [], 'empty: not listed yet');

    await bulkOk([jerseys[40].id, jerseys[41].id], 'add-collection', { collection: 'club-legends' });
    assert.deepEqual((await catalog(call)).categories, [{ key: 'club-legends', title: 'Club Legends', blurb: 'Icons only' }]);

    const site = await storefront();
    const keys = Array.from(site.cfg.categories, (c) => c.key);
    assert.equal(keys.indexOf('club-legends'), keys.indexOf('all') - 1, 'listed just before “All Collection”');
    assert.equal(site.catTitle('club-legends'), 'Club Legends');
    assert.equal(site.col('club-legends').length, 2);
    assert.equal(site.catCount('club-legends'), 2);

    await ok(admin('PATCH', '/collections/club-legends', { title: 'Legends', inMenu: false }));
    assert.deepEqual((await catalog(call)).categories, []);
    await ok(admin('PATCH', '/collections/club-legends', { inMenu: true }));
    assert.equal((await catalog(call)).categories[0].title, 'Legends');
  });

  test('names are checked and keys never collide with ones the website uses', async () => {
    for (const title of ['  ', 'Retro', 'retro', 'x'.repeat(61)]) {
      assert.equal((await admin('POST', '/collections', { title })).statusCode, 400, title);
    }
    await ok(admin('POST', '/collections', { title: 'Full-Sleeve!' }), 201);
    assert.ok(await find('full-sleeve-2'), 'full-sleeve is worked out by the website');
    await ok(admin('POST', '/collections', { title: 'മലയാളം' }), 201);
    assert.ok(await find('collection'));
    assert.equal((await admin('PATCH', '/collections/collection', { title: 'Retro' })).statusCode, 400);

    // "constructor" exists on every JavaScript object, so as a key it would corrupt the counts
    await ok(admin('POST', '/collections', { title: 'Constructor' }), 201);
    assert.ok(await find('constructor-2'));
    await bulkOk([jerseys[42].id], 'add-collection', { collection: 'constructor-2' });
    const feed = await catalog(call);
    assert.equal(feed.collections['constructor-2'], 1);
    assert.ok(feed.categories.some((c) => c.key === 'constructor-2'), 'listed in the shop menu');
    await ok(admin('DELETE', '/collections/constructor-2'));
  });

  test('built-in collections are protected and keep their names from config.js', async () => {
    const retro = await find('retro');
    assert.deepEqual([retro.title, retro.builtIn, retro.inMenu], ['Retro', true, true]);
    for (const res of [await admin('PATCH', '/collections/retro', { title: 'Old' }), await admin('DELETE', '/collections/retro')]) {
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error, 'BUILT_IN');
    }
    assert.equal((await admin('DELETE', '/collections/no-such')).statusCode, 404);
  });

  test('deleting a collection keeps its products and makes open editors reload', async () => {
    const id = jerseys[40].id;
    const stale = editBody(await getProduct(id));
    await ok(admin('DELETE', '/collections/club-legends'));
    assert.ok(!(await getProduct(id)).collections.includes('club-legends'));
    assert.ok(await shown(id));
    assert.equal((await admin('PUT', `/products/${id}`, stale)).json().error, 'PRODUCT_CHANGED');
  });
});

describe('erasing a customer’s details', () => {
  test('only finished orders, once, and nothing about the customer remains', async () => {
    const details = { name: 'Private Person', phone: '9123456780', address: '7 Hidden Lane', city: 'Thrissur', pincode: '680001', note: 'ring twice' };
    const placed = await ok(call('POST', '/api/orders', { body: customer({ ...details, items: [line(onSale(jerseys[50]))] }) }), 201);
    const id = (await ok(admin('GET', `/orders?q=${placed.orderNumber}`))).orders[0].id;
    await ok(admin('PATCH', `/orders/${id}`, { adminNote: 'Private Person called about size', courier: 'DTDC', trackingId: 'TRK-9' }));

    const early = await admin('POST', `/orders/${id}/erase`);
    assert.equal(early.json().error, 'ORDER_NOT_FINISHED');
    await ok(admin('PATCH', `/orders/${id}`, { status: 'cancelled' }));

    const erased = await ok(admin('POST', `/orders/${id}/erase`));
    assert.deepEqual([erased.name, erased.phone, erased.address, erased.city, erased.pincode, erased.customerNote, erased.adminNote, erased.trackingId, erased.erased], [
      '[erased]', '', '[erased]', '[erased]', '', '', '', '', true,
    ]);
    assert.equal(erased.total, placed.total, 'what was sold is kept');
    assert.equal(erased.items.length, 1);

    const stored = JSON.stringify([
      (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows,
      (await db.query('SELECT * FROM audit_log')).rows,
    ]);
    for (const value of ['Private Person', '9123456780', 'Hidden Lane', 'Thrissur', '680001', 'ring twice']) assert.ok(!stored.includes(value), value);

    for (const phone of [details.phone, '', '0']) {
      assert.equal((await call('POST', '/api/orders/track', { body: { orderNumber: placed.orderNumber, phone } })).statusCode, 404, JSON.stringify(phone));
    }
    assert.equal((await admin('POST', `/orders/${id}/erase`)).json().error, 'ORDER_ERASED');
    assert.equal((await admin('PATCH', `/orders/${id}`, { adminNote: 'Private Person again' })).json().error, 'ORDER_ERASED');
  });
});

describe('every change is written to the activity log', () => {
  test('with who did it and what changed, in the same step as the change', async () => {
    const product = await create({ title: 'Logged Kit', variants: [{ size: 'M', price: 399, compareAt: null, available: true, stock: 4 }] });
    assert.deepEqual([(await lastEntry('product.create')).actor, (await lastEntry('product.create')).target], ['owner', `product:${product.id}`]);

    const withPhotos = await uploadPhoto(admin, (await uploadPhoto(admin, product.id)).id);
    await ok(admin('PUT', `/products/${product.id}/images/order`, { ids: withPhotos.images.map((i) => i.id).reverse() }));
    await ok(admin('DELETE', `/products/${product.id}/images/${withPhotos.images[0].id}`));
    for (const action of ['photo.add', 'photo.reorder', 'photo.remove']) assert.match((await lastEntry(action)).summary, /Logged Kit/, action);

    const body = editBody(await getProduct(product.id));
    body.title = 'Logged Kit II';
    body.variants[0] = { ...body.variants[0], price: 449, stock: 2, available: false };
    body.variants.push({ size: 'L', price: 459, compareAt: null, available: true, stock: null });
    await ok(admin('PUT', `/products/${product.id}`, body));
    const entry = await lastEntry('product.update');
    for (const change of [/renamed from “Logged Kit”/, /size M price ₹399 → ₹449/, /size M stock 4 → 2/, /size M marked sold out/, /added size L at ₹459/]) {
      assert.match(entry.summary, change);
    }
    assert.ok(entry.details.changes.length >= 5);
    assert.ok(entry.ip);

    const logged = await entries();
    await ok(admin('PUT', `/products/${product.id}`, editBody(await getProduct(product.id))));
    assert.equal(await entries(), logged, 'saving without a change adds no entry');
    assert.equal((await admin('PUT', `/products/${product.id}`, { ...editBody(await getProduct(product.id)), collections: ['no-such'] })).statusCode, 400);
    assert.equal(await entries(), logged, 'a refused change adds no entry');

    for (const action of ['product.bulk', 'collection.create', 'collection.update', 'collection.delete', 'order.update', 'order.erase', 'admin.saved']) {
      assert.ok(await lastEntry(action), `no ${action} entry`);
    }
  });

  test('if the log cannot be written, the change is not made', async () => {
    await db.query("ALTER TABLE audit_log ADD CONSTRAINT test_block CHECK (action <> 'product.update') NOT VALID");
    try {
      const id = jerseys[60].id;
      const before = await getProduct(id);
      const res = await admin('PUT', `/products/${id}`, { ...editBody(before), title: 'Must Not Be Saved' });
      assert.equal(res.statusCode, 500);
      assert.deepEqual(await getProduct(id), before);
    } finally {
      await db.query('ALTER TABLE audit_log DROP CONSTRAINT test_block');
    }
  });

  test('an owner and a staff member are told apart', async () => {
    const { upsertAdmin } = await import('../src/auth.js');
    await upsertAdmin(db, 'packer', 'staff-tulip-lantern');
    const packer = asAdmin(call, await signIn(call, 'packer', 'staff-tulip-lantern'));
    await ok(packer('POST', '/products', newProduct({ title: 'Packed By Staff' })), 201);
    assert.equal((await lastEntry('product.create')).actor, 'packer');
  });
});
