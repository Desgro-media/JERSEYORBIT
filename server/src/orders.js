/* Orders: placing, tracking, and the admin's status changes (which move stock). */
import { record } from './audit.js';
import { AppError, invalid, notFound } from './errors.js';
import { sizeKey } from './sizes.js';
import { shopConfig } from './storefront-data.js';

export const MAX_QTY = 10; // matches JO.cart.MAX_QTY in the storefront

export const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'shipped', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
export const STATUSES = Object.keys(TRANSITIONS);

const rupees = (paise) => paise / 100;

/* ---------- cleaning input ---------- */

/** same rule as the checkout form: digits only, without a leading 91 or 0 */
export const normalizePhone = (raw) => String(raw).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

/** accepts "JO-1001", "jo1001", "#1001" or "1001" */
export function normalizeOrderNumber(raw) {
  const m = /^\s*#?\s*(?:jo\s*-?\s*)?(\d{1,12})\s*$/i.exec(String(raw));
  return m ? `JO-${m[1]}` : null;
}

// control characters have no place in a name or address (newlines are allowed where `lines` is set)
const clean = (s, lines = false) =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(lines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]+/g, ' ')
    .trim();

export function readCustomer(input) {
  const customer = {
    name: clean(input.name),
    phone: normalizePhone(input.phone),
    address: clean(input.address, true),
    city: clean(input.city),
    pincode: clean(input.pincode),
    area: input.area,
    note: clean(input.note, true),
  };
  if (!customer.name) throw invalid('Please enter your name.');
  if (!/^[6-9]\d{9}$/.test(customer.phone)) throw invalid('Enter a 10-digit mobile number.');
  if (!customer.address) throw invalid('Please enter your address.');
  if (!customer.city) throw invalid('Please enter your town or city.');
  if (!/^[1-9]\d{5}$/.test(customer.pincode)) throw invalid('Enter a 6-digit PIN code.');
  return customer;
}

/* ---------- reading ---------- */

const itemOut = (i) => ({
  variantId: i.variant_id,
  title: i.product_title,
  size: i.size,
  quantity: i.quantity,
  price: rupees(i.unit_price_paise),
  lineTotal: rupees(i.unit_price_paise * i.quantity),
});

const itemsOf = async (q, orderId) => (await q.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId])).rows;

export const surpriseTitle = () => `${shopConfig().wildcard?.name || 'Orbit Wildcard'} (surprise jersey)`;

/* The items as the customer may see them. For a wildcard order the jersey stays a surprise: no name,
   no size label of its own (which could narrow it down), and no product id. */
async function customerItems(q, order) {
  const items = (await itemsOf(q, order.id)).map(itemOut);
  if (order.wildcard_date === null) return items;
  return items.map(({ variantId, ...i }) => ({ ...i, title: surpriseTitle(), size: sizeKey(i.size) }));
}

/** what the customer who just placed the order gets back */
export const receipt = async (q, order) => ({
  orderNumber: order.order_number,
  items: await customerItems(q, order),
  subtotal: rupees(order.subtotal_paise),
  shipping: rupees(order.shipping_paise),
  total: rupees(order.total_paise),
});

/* ---------- placing an order ---------- */

/** a repeated submit of the same order gets the first one back. `wildcard` says which kind it must be. */
export async function findRepeat(q, clientRef, phone, wildcard = false) {
  const { rows } = await q.query('SELECT * FROM orders WHERE client_ref = $1', [clientRef]);
  if (!rows[0]) return null;
  // the reference belongs to someone else's order: refuse without revealing anything about it
  if (rows[0].phone !== phone || (rows[0].wildcard_date !== null) !== wildcard) {
    throw new AppError(409, 'DUPLICATE_REFERENCE', 'Please reload the page and try again.');
  }
  return { order: await receipt(q, rows[0]), repeated: true };
}

export async function placeOrder(db, shop, input) {
  const customer = readCustomer(input);

  const wanted = new Map(); // variant id -> quantity, with repeated lines added together
  for (const { variantId, quantity } of input.items) wanted.set(variantId, (wanted.get(variantId) || 0) + quantity);
  if ([...wanted.values()].some((n) => n > MAX_QTY)) throw invalid(`You can order up to ${MAX_QTY} of each size.`);

  try {
    return await db.tx(async (c) => {
      const repeat = await findRepeat(c, input.clientRef, customer.phone);
      if (repeat) return repeat;

      const { rows } = await c.query(
        `SELECT v.id, v.size, v.price_paise, v.is_available, v.stock_qty, p.title, p.is_published,
                EXISTS (SELECT 1 FROM product_collections pc WHERE pc.product_id = p.id AND pc.collection_key = 'socks') AS is_socks
           FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE v.id = ANY($1::bigint[])`,
        [[...wanted.keys()]]
      );
      const found = new Map(rows.map((r) => [r.id, r]));

      const problems = [];
      const lines = [];
      for (const [id, quantity] of wanted) {
        const v = found.get(id);
        if (!v || !v.is_published) problems.push({ variantId: id, title: v?.title, size: v?.size, reason: 'gone' });
        else if (!v.is_available || v.stock_qty === 0) problems.push({ variantId: id, title: v.title, size: v.size, reason: 'sold_out' });
        else if (v.stock_qty !== null && v.stock_qty < quantity) problems.push({ variantId: id, title: v.title, size: v.size, reason: 'not_enough', left: v.stock_qty });
        else lines.push({ v, quantity });
      }
      if (problems.length) throw new AppError(409, 'ITEMS_UNAVAILABLE', 'Some items in your order are no longer available.', problems);

      // every amount comes from the database, never from the browser
      const subtotal = lines.reduce((n, l) => n + l.v.price_paise * l.quantity, 0);
      const jerseys = lines.reduce((n, l) => n + (l.v.is_socks ? 0 : l.quantity), 0);
      const free = shop.freeShippingJerseys > 0 && jerseys >= shop.freeShippingJerseys;
      const shipping = free ? 0 : Math.round(shop.shippingFee * 100);
      const total = subtotal + shipping;

      // the customer must never be asked for a different amount from the one they saw
      if (input.expectedTotal !== undefined && Math.round(input.expectedTotal * 100) !== total) {
        throw new AppError(409, 'TOTAL_CHANGED', 'Prices or shipping have changed. Reload the page to see the new total.', { total: rupees(total) });
      }

      const order = (
        await c.query(
          `INSERT INTO orders (client_ref, customer_name, phone, address, city, pincode, delivery_area, customer_note,
                               subtotal_paise, shipping_paise, total_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [input.clientRef, customer.name, customer.phone, customer.address, customer.city, customer.pincode, customer.area, customer.note, subtotal, shipping, total]
        )
      ).rows[0];
      for (const { v, quantity } of lines) {
        await c.query(
          'INSERT INTO order_items (order_id, variant_id, product_title, size, unit_price_paise, quantity) VALUES ($1, $2, $3, $4, $5, $6)',
          [order.id, v.id, v.title, v.size, v.price_paise, quantity]
        );
      }
      await c.query("INSERT INTO order_events (order_id, status) VALUES ($1, 'pending')", [order.id]);
      return { order: await receipt(c, order), repeated: false };
    });
  } catch (err) {
    // two copies of the same submit arrived together: answer the second with the first one's order
    if (err.code === '23505' && err.constraint === 'orders_client_ref_key') {
      const repeat = await findRepeat(db, input.clientRef, customer.phone);
      if (repeat) return repeat;
    }
    throw err;
  }
}

/* ---------- tracking ---------- */

export async function trackOrder(db, { orderNumber, phone }) {
  const number = normalizeOrderNumber(orderNumber);
  const digits = normalizePhone(phone);
  // an erased order has no phone number left, so it can no longer be looked up
  const { rows } = number
    ? await db.query('SELECT * FROM orders WHERE order_number = $1 AND phone = $2 AND erased_at IS NULL', [number, digits])
    : { rows: [] };
  const order = rows[0];
  // one answer for "no such order" and "wrong phone", so order numbers cannot be probed
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'We couldn’t find an order with that number and phone number.');
  const events = (await db.query('SELECT status, created_at FROM order_events WHERE order_id = $1 ORDER BY id', [order.id])).rows;
  const shipped = ['shipped', 'delivered'].includes(order.status);
  // no name, address or admin note here
  return {
    orderNumber: order.order_number,
    status: order.status,
    placedAt: order.created_at,
    courier: shipped ? order.courier : '',
    trackingId: shipped ? order.tracking_id : '',
    items: (await customerItems(db, order)).map(({ title, size, quantity }) => ({ title, size, quantity })),
    total: rupees(order.total_paise),
    history: events.map((e) => ({ status: e.status, at: e.created_at })),
  };
}

/* ---------- admin ---------- */

const summaryOut = (o) => ({
  id: o.id,
  orderNumber: o.order_number,
  status: o.status,
  paymentStatus: o.payment_status,
  name: o.customer_name,
  phone: o.phone,
  city: o.city,
  total: rupees(o.total_paise),
  createdAt: o.created_at,
  erased: o.erased_at !== null,
  wildcard: o.wildcard_date !== null,
});

/* The special lists the dashboard links to. Its counts use these same conditions, so a count and
   its list can never disagree. */
export const ORDER_VIEWS = {
  // the shop promises to dispatch within 24 hours
  late: `o.status IN ('confirmed', 'packed') AND EXISTS (SELECT 1 FROM order_events e
           WHERE e.order_id = o.id AND e.status = 'confirmed' AND e.created_at < now() - interval '24 hours')`,
  unpaid: `o.status IN ('confirmed', 'packed', 'shipped', 'delivered') AND o.payment_status = 'unpaid'`,
  refund: `o.status = 'cancelled' AND o.payment_status = 'paid'`,
  // confirming these would take no stock for the missing line
  missing: `o.status = 'pending' AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.variant_id IS NULL)`,
  wildcard: 'o.wildcard_date IS NOT NULL',
};

/** the digits of a search that looks like a phone number, without +91 or a leading 0; otherwise null */
function phoneSearch(q) {
  const text = q.trim();
  if (!/^\+?[\d\s()-]+$/.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('+91') || (digits.length === 12 && digits.startsWith('91'))) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 5 ? digits : null;
}

export async function listOrders(db, { status, view, q, page = 1, pageSize = 25 }) {
  const where = [];
  const params = [];
  const add = (value) => `$${params.push(value)}`;
  if (status) where.push(`o.status = ${add(status)}`);
  if (view && Object.hasOwn(ORDER_VIEWS, view)) where.push(`(${ORDER_VIEWS[view]})`);
  if (q) {
    const text = add(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const matches = [`o.order_number ILIKE ${text}`, `o.customer_name ILIKE ${text}`, `o.phone LIKE ${text}`, `o.tracking_id ILIKE ${text}`];
    const digits = phoneSearch(q);
    if (digits) matches.push(`o.phone LIKE ${add(`%${digits}%`)}`);
    where.push(`(${matches.join(' OR ')})`);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT count(*) AS n FROM orders o ${filter}`, params)).rows[0].n;
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await db.query(
    `SELECT o.*, (SELECT sum(quantity) FROM order_items i WHERE i.order_id = o.id) AS pieces
       FROM orders o ${filter} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { total, page, pageSize, orders: rows.map((o) => ({ ...summaryOut(o), pieces: o.pieces })) };
}

export async function getOrder(q, id) {
  const o = (await q.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
  if (!o) throw notFound('Order');
  const events = (
    await q.query('SELECT e.status, e.created_at, a.username FROM order_events e LEFT JOIN admins a ON a.id = e.admin_id WHERE e.order_id = $1 ORDER BY e.id', [id])
  ).rows;
  return {
    ...summaryOut(o),
    address: o.address,
    pincode: o.pincode,
    area: o.delivery_area,
    customerNote: o.customer_note,
    adminNote: o.admin_note,
    courier: o.courier,
    trackingId: o.tracking_id,
    erasedAt: o.erased_at,
    subtotal: rupees(o.subtotal_paise),
    shipping: rupees(o.shipping_paise),
    // the admin always sees the real jersey, wildcard or not: it has to be packed
    items: (
      await q.query('SELECT i.*, v.product_id FROM order_items i LEFT JOIN product_variants v ON v.id = i.variant_id WHERE i.order_id = $1 ORDER BY i.id', [id])
    ).rows.map((i) => ({ ...itemOut(i), stockTaken: i.stock_taken, productId: i.product_id, removed: i.variant_id === null })),
    history: events.map((e) => ({ status: e.status, at: e.created_at, by: e.username })),
    nextStatuses: TRANSITIONS[o.status],
    canRepick: o.wildcard_date !== null && o.status === 'pending' && o.erased_at === null,
    eraseBlocked: paymentUnsettled(o.status, o.payment_status),
  };
}

/* Lock order: products first, then sizes, each by id. The product editor follows the same order,
   so two changes happening at once wait for each other instead of deadlocking. */
async function lockStock(c, variantIds) {
  await c.query(
    'SELECT id FROM products WHERE id IN (SELECT product_id FROM product_variants WHERE id = ANY($1::bigint[])) ORDER BY id FOR NO KEY UPDATE',
    [variantIds]
  );
  const { rows } = await c.query('SELECT id, product_id, stock_qty FROM product_variants WHERE id = ANY($1::bigint[]) ORDER BY id FOR NO KEY UPDATE', [variantIds]);
  return new Map(rows.map((r) => [r.id, r]));
}

const bumpProducts = (c, ids) => ids.size && c.query('UPDATE products SET version = version + 1 WHERE id = ANY($1::bigint[])', [[...ids]]);

/** take counted stock for every line, or nothing at all */
async function takeStock(c, orderId) {
  const items = (await itemsOf(c, orderId)).filter((i) => i.variant_id !== null && !i.stock_taken);
  if (!items.length) return false;
  const stock = await lockStock(c, items.map((i) => i.variant_id));
  const counted = items.filter((i) => stock.get(i.variant_id)?.stock_qty != null);
  const short = counted
    .filter((i) => stock.get(i.variant_id).stock_qty < i.quantity)
    .map((i) => ({ title: i.product_title, size: i.size, wanted: i.quantity, left: stock.get(i.variant_id).stock_qty }));
  if (short.length) {
    const text = short.map((s) => `${s.title} (${s.size}): ${s.left} left, ${s.wanted} wanted`).join('; ');
    throw new AppError(409, 'NOT_ENOUGH_STOCK', `Not enough stock to confirm. ${text}`, short);
  }
  const touched = new Set();
  for (const i of counted) {
    await c.query('UPDATE product_variants SET stock_qty = stock_qty - $2 WHERE id = $1', [i.variant_id, i.quantity]);
    await c.query('UPDATE order_items SET stock_taken = true WHERE id = $1', [i.id]);
    touched.add(stock.get(i.variant_id).product_id);
  }
  await bumpProducts(c, touched);
  return counted.length > 0;
}

/** give back exactly what takeStock took */
async function returnStock(c, orderId) {
  const items = (await itemsOf(c, orderId)).filter((i) => i.stock_taken && i.variant_id !== null);
  if (!items.length) return false;
  const stock = await lockStock(c, items.map((i) => i.variant_id));
  const touched = new Set();
  for (const i of items) {
    // if the owner has since stopped counting this size, there is no number to add back to
    if (stock.get(i.variant_id)?.stock_qty != null) {
      await c.query('UPDATE product_variants SET stock_qty = stock_qty + $2 WHERE id = $1', [i.variant_id, i.quantity]);
      touched.add(stock.get(i.variant_id).product_id);
    }
    await c.query('UPDATE order_items SET stock_taken = false WHERE id = $1', [i.id]);
  }
  await bumpProducts(c, touched);
  return true;
}

const EDITABLE = { paymentStatus: 'payment_status', courier: 'courier', trackingId: 'tracking_id', adminNote: 'admin_note' };
// what the activity log says about each field; the private note's text is not copied into it
const DESCRIBE = {
  paymentStatus: (from, to) => `payment ${from} → ${to}`,
  courier: () => 'courier changed',
  trackingId: () => 'tracking ID changed',
  adminNote: () => 'private note changed',
};

export async function updateOrder(db, id, changes, by) {
  return db.tx(async (c) => {
    // the row lock makes two clicks on "Confirm" take stock only once
    const order = (await c.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!order) throw notFound('Order');
    // after erasing, nothing may write customer details back onto the order
    if (order.erased_at) throw new AppError(409, 'ORDER_ERASED', 'This order’s customer details were erased, so it can no longer be changed.');

    const sets = [];
    const params = [id];
    const done = [];
    for (const [key, column] of Object.entries(EDITABLE)) {
      if (changes[key] === undefined) continue;
      const value = key === 'paymentStatus' ? changes[key] : clean(changes[key], key === 'adminNote');
      sets.push(`${column} = $${params.push(value)}`);
      if (value !== order[column]) done.push(DESCRIBE[key](order[column], value));
    }

    let stockMoved = false;
    const next = changes.status;
    if (next !== undefined) {
      if (!TRANSITIONS[order.status].includes(next)) {
        throw new AppError(409, 'INVALID_STATUS_CHANGE', `An order that is ${order.status} cannot be changed to ${next}. Reload to see its latest status.`);
      }
      if (next === 'confirmed') stockMoved = await takeStock(c, id);
      if (next === 'cancelled') stockMoved = await returnStock(c, id);
      sets.push(`status = $${params.push(next)}`);
      await c.query('INSERT INTO order_events (order_id, status, admin_id) VALUES ($1, $2, $3)', [id, next, by.id]);
      done.unshift(`status ${order.status} → ${next}`);
    }

    if (sets.length) await c.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $1`, params);
    if (done.length) {
      await record(c, by, 'order.update', { target: `order:${order.order_number}`, summary: `${order.order_number}: ${done.join('; ')}` });
    }
    return { order: await getOrder(c, id), stockMoved };
  });
}

/** why a finished order's payment still needs doing before its details can go, or null */
export const paymentUnsettled = (status, payment) =>
  status === 'cancelled' && payment === 'paid'
    ? 'This cancelled order is still marked paid. Send the refund and mark it Refunded first: erasing removes the phone number you need for it.'
    : status === 'delivered' && payment === 'unpaid'
      ? 'This delivered order is not marked paid yet. Update the payment first.'
      : null;

/* Removes who a finished order was for, and keeps what was sold for the shop's records. */
export async function eraseOrder(db, id, by) {
  return db.tx(async (c) => {
    const order = (await c.query('SELECT order_number, status, payment_status, erased_at FROM orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!order) throw notFound('Order');
    if (order.erased_at) throw new AppError(409, 'ORDER_ERASED', 'These details have already been erased.');
    if (!['delivered', 'cancelled'].includes(order.status)) {
      throw new AppError(409, 'ORDER_NOT_FINISHED', 'Only delivered or cancelled orders can be erased. Open orders still need the address.');
    }
    // an erased order can't be edited again, and a refund needs the phone number
    const unsettled = paymentUnsettled(order.status, order.payment_status);
    if (unsettled) throw new AppError(409, 'PAYMENT_UNSETTLED', unsettled);
    await c.query(
      `UPDATE orders SET customer_name = '[erased]', phone = '', address = '[erased]', city = '[erased]', pincode = '',
              customer_note = '', admin_note = '', courier = '', tracking_id = '', erased_at = now()
        WHERE id = $1`,
      [id]
    );
    await record(c, by, 'order.erase', { target: `order:${order.order_number}`, summary: `${order.order_number}: customer details erased` });
    return getOrder(c, id);
  });
}
