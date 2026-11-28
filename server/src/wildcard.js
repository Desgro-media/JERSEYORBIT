/* The Orbit Wildcard: one surprise jersey, picked at random by the server, a limited number a day.
   The buyer never learns which jersey from the website (orders.js hides it); the admin sees it. */
import crypto from 'node:crypto';
import { record } from './audit.js';
import { AppError, invalid, notFound } from './errors.js';
import { findRepeat, getOrder, readCustomer, receipt } from './orders.js';
import { readSetting, writeSetting } from './settings.js';
import { bySize, sizeKey } from './sizes.js';
import { shopConfig } from './storefront-data.js';

const LOCK = 727205; // every claim and re-pick takes this, so the daily limit cannot be overrun
export const MODES = ['open', 'soon', 'off'];
export const MAX_DAILY = 500;
const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date"; // the shop's day, wherever the server runs

const name = () => shopConfig().wildcard?.name || 'Orbit Wildcard';
const closed = () => new AppError(409, 'WILDCARD_CLOSED', `The ${name()} isn’t taking orders right now.`);

/** the saved settings over the defaults. Version 0 means the owner has not saved any yet. */
export async function readWildcard(q) {
  const { value, version } = await readSetting(q, 'wildcard');
  const config = shopConfig().wildcard;
  const settings = { mode: 'soon', price: null, dailyLimit: config?.dailyLimit || 5, pool: 'all', ...value, version };
  if (!config) settings.mode = 'off'; // config.js can still hide the section altogether
  else if (settings.mode === 'open' && !settings.price) settings.mode = 'soon';
  return settings;
}

/** what the catalog file tells the shop. No counts here, so the file only changes with the settings. */
export const publicSettings = (s) => ({ state: s.mode, price: s.mode === 'open' ? s.price : null, dailyLimit: s.dailyLimit });

export const claimedToday = async (q) =>
  (await q.query(`SELECT count(*) AS n FROM orders WHERE wildcard_date = ${TODAY} AND status <> 'cancelled'`)).rows[0].n;

const shippingFor = (shop) => (shop.freeShippingJerseys > 0 && shop.freeShippingJerseys <= 1 ? 0 : shop.shippingFee);

/* Every size a surprise jersey could come in right now: published jerseys (never socks) in the pool,
   on sale. A size with counted stock must have more than waiting wildcard orders already hold. */
export async function candidates(q, pool) {
  const { rows } = await q.query(
    `SELECT v.id AS "variantId", v.size, v.stock_qty AS stock, p.id AS "productId", p.title,
            (SELECT count(*) FROM order_items i JOIN orders o ON o.id = i.order_id
              WHERE i.variant_id = v.id AND o.wildcard_date IS NOT NULL AND o.status = 'pending') AS held
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.is_published AND v.is_available AND (v.stock_qty IS NULL OR v.stock_qty > 0)
        AND NOT EXISTS (SELECT 1 FROM product_collections s WHERE s.product_id = p.id AND s.collection_key = 'socks')
        AND ($1 = 'all' OR EXISTS (SELECT 1 FROM product_collections c WHERE c.product_id = p.id AND c.collection_key = $1))
      ORDER BY v.id`,
    [pool]
  );
  return rows.filter((r) => r.stock === null || r.stock > r.held);
}

export const sizesIn = (list) => [...new Set(list.map((c) => sizeKey(c.size)))].sort(bySize);

/** a random jersey in the size, avoiding ones in `used` while others remain; null if there is none */
export function pickJersey(list, size, used = new Set(), random = (n) => crypto.randomInt(n)) {
  const fits = list.filter((c) => sizeKey(c.size) === size);
  const fresh = fits.filter((c) => !used.has(c.productId));
  const from = fresh.length ? fresh : fits;
  return from.length ? from[random(from.length)] : null;
}

const pickedToday = async (q) =>
  new Set(
    (
      await q.query(
        `SELECT v.product_id FROM orders o JOIN order_items i ON i.order_id = o.id JOIN product_variants v ON v.id = i.variant_id
          WHERE o.wildcard_date = ${TODAY} AND o.status <> 'cancelled'`
      )
    ).rows.map((r) => r.product_id)
  );

/** what the shop asks before showing "Buy now" */
export async function wildcardStatus(db, shop) {
  const s = await readWildcard(db);
  if (s.mode !== 'open') return { state: s.mode, price: null, dailyLimit: s.dailyLimit, left: 0, sizes: [], shipping: shippingFor(shop) };
  const left = Math.max(0, s.dailyLimit - (await claimedToday(db)));
  return {
    state: 'open',
    price: s.price,
    dailyLimit: s.dailyLimit,
    left,
    sizes: left ? sizesIn(await candidates(db, s.pool)) : [],
    shipping: shippingFor(shop),
  };
}

export async function placeWildcard(db, shop, input) {
  const customer = readCustomer(input);
  const size = sizeKey(input.size);
  const alreadyToday = () => new AppError(409, 'WILDCARD_ALREADY', 'This phone number already has a wildcard today. It’s one per person per day.');
  try {
    return await db.tx(async (c) => {
      // one claim at a time, so two people cannot both take the last place
      await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
      const repeat = await findRepeat(c, input.clientRef, customer.phone, true);
      if (repeat) return repeat; // the same order sent twice never picks again

      const settings = await readWildcard(c);
      if (settings.mode !== 'open') throw closed();
      if ((await claimedToday(c)) >= settings.dailyLimit) {
        throw new AppError(409, 'WILDCARD_SOLD_OUT', `All ${settings.dailyLimit} of today’s wildcards are gone. Come back tomorrow!`);
      }
      const mine = await c.query(`SELECT 1 FROM orders WHERE wildcard_date = ${TODAY} AND phone = $1 AND status <> 'cancelled'`, [customer.phone]);
      if (mine.rowCount) throw alreadyToday();
      const jersey = pickJersey(await candidates(c, settings.pool), size, await pickedToday(c));
      if (!jersey) throw new AppError(409, 'WILDCARD_NO_SIZE', `There is no surprise jersey in size ${size} right now. Try another size.`);

      const price = Math.round(settings.price * 100);
      const shipping = Math.round(shippingFor(shop) * 100);
      if (input.expectedTotal !== undefined && Math.round(input.expectedTotal * 100) !== price + shipping) {
        throw new AppError(409, 'TOTAL_CHANGED', 'The price has changed. Reload the page to see the new total.', { total: (price + shipping) / 100 });
      }
      const order = (
        await c.query(
          `INSERT INTO orders (client_ref, customer_name, phone, address, city, pincode, delivery_area, customer_note,
                               subtotal_paise, shipping_paise, total_paise, wildcard_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${TODAY}) RETURNING *`,
          [input.clientRef, customer.name, customer.phone, customer.address, customer.city, customer.pincode, customer.area, customer.note, price, shipping, price + shipping]
        )
      ).rows[0];
      await c.query('INSERT INTO order_items (order_id, variant_id, product_title, size, unit_price_paise, quantity) VALUES ($1, $2, $3, $4, $5, 1)', [
        order.id, jersey.variantId, jersey.title, jersey.size, price,
      ]);
      await c.query("INSERT INTO order_events (order_id, status) VALUES ($1, 'pending')", [order.id]);
      return { order: await receipt(c, order), repeated: false };
    });
  } catch (err) {
    // the database's own rules, in case something slips past the checks above
    if (err.code === '23505' && err.constraint === 'orders_wildcard_phone_key') throw alreadyToday();
    if (err.code === '23505' && err.constraint === 'orders_client_ref_key') {
      const repeat = await findRepeat(db, input.clientRef, customer.phone, true);
      if (repeat) return repeat;
    }
    throw err;
  }
}

/** give a waiting wildcard order a different random jersey, e.g. when the first one turns out damaged */
export async function repickJersey(db, orderId, by) {
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    const order = (await c.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
    if (!order) throw notFound('Order');
    if (order.wildcard_date === null || order.status !== 'pending' || order.erased_at) {
      throw new AppError(409, 'NOT_REPICKABLE', 'Only a wildcard order that is still waiting to be confirmed can get another jersey.');
    }
    const item = (
      await c.query('SELECT i.*, v.product_id FROM order_items i LEFT JOIN product_variants v ON v.id = i.variant_id WHERE i.order_id = $1', [orderId])
    ).rows[0];
    const settings = await readWildcard(c);
    const size = sizeKey(item.size);
    // never the same jersey again
    const others = (await candidates(c, settings.pool)).filter((x) => x.productId !== item.product_id && x.title !== item.product_title);
    const jersey = pickJersey(others, size, await pickedToday(c));
    if (!jersey) throw new AppError(409, 'NO_OTHER_JERSEY', `No other jersey in size ${size} can be picked from the wildcard pool right now.`);
    await c.query('UPDATE order_items SET variant_id = $2, product_title = $3, size = $4 WHERE id = $1', [item.id, jersey.variantId, jersey.title, jersey.size]);
    await record(c, by, 'wildcard.repick', {
      target: `order:${order.order_number}`,
      summary: `${order.order_number}: picked another jersey (was “${item.product_title}”, now “${jersey.title}”)`,
    });
    return getOrder(c, orderId);
  });
}

/* ---------- admin ---------- */

export async function wildcardAdmin(db) {
  const settings = await readWildcard(db);
  const claimed = await claimedToday(db);
  const collections = (await db.query('SELECT key, title FROM collections ORDER BY lower(title), key')).rows;
  const poolExists = settings.pool === 'all' || collections.some((c) => c.key === settings.pool);
  const list = poolExists ? await candidates(db, settings.pool) : [];
  const today = await db.query(
    `SELECT o.id, o.order_number, o.status, o.customer_name, i.product_title, i.size
       FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.wildcard_date = ${TODAY} ORDER BY o.created_at DESC, o.id DESC LIMIT 100`
  );
  return {
    settings,
    maxDaily: MAX_DAILY,
    hiddenByConfig: !shopConfig().wildcard,
    claimed,
    left: Math.max(0, settings.dailyLimit - claimed),
    pool: {
      exists: poolExists,
      jerseys: new Set(list.map((c) => c.productId)).size,
      sizes: sizesIn(list).map((size) => ({ size, jerseys: new Set(list.filter((c) => sizeKey(c.size) === size).map((c) => c.productId)).size })),
    },
    collections,
    today: today.rows.map((r) => ({ id: r.id, orderNumber: r.order_number, status: r.status, name: r.customer_name, jersey: r.product_title, size: r.size })),
  };
}

export async function saveWildcard(db, input, by) {
  const price = input.price === null ? null : Math.round(input.price * 100) / 100;
  if (input.mode === 'open' && !(price > 0)) throw invalid('Set a price before taking wildcard orders.');
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]); // not while an order is being placed
    if (input.pool !== 'all' && !(await c.query('SELECT 1 FROM collections WHERE key = $1', [input.pool])).rowCount) {
      throw invalid('That collection does not exist. Choose which jerseys can be picked.');
    }
    const before = await readWildcard(c);
    const next = { mode: input.mode, price, dailyLimit: input.dailyLimit, pool: input.pool };
    await writeSetting(c, 'wildcard', next, input.version);
    const words = { open: 'taking orders', soon: 'shown as coming soon', off: 'hidden' };
    const changes = [
      before.mode !== next.mode && words[next.mode],
      before.price !== next.price && `price ${before.price ? `₹${before.price}` : 'not set'} → ${next.price ? `₹${next.price}` : 'not set'}`,
      before.dailyLimit !== next.dailyLimit && `places per day ${before.dailyLimit} → ${next.dailyLimit}`,
      before.pool !== next.pool && `picked from ${next.pool === 'all' ? 'all jerseys' : next.pool}`,
    ].filter(Boolean);
    await record(c, by, 'wildcard.settings', { summary: `Wildcard: ${changes.join('; ') || 'saved without changes'}` });
  });
}
