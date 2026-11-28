/* The dashboard's numbers. Days are Indian calendar days, wherever the server runs.
   "Paid sales": totals (with shipping) of orders marked paid and not cancelled, on the day placed. */
import { listOrders, ORDER_VIEWS, STATUSES } from './orders.js';
import { LOW_STOCK } from './products.js';
import { bySize, sizeKey } from './sizes.js';
import { candidates, claimedToday, readWildcard } from './wildcard.js';

export const DASHBOARD_DAYS = [7, 30, 90];

const rupees = (paise) => paise / 100;
const DAY = "(o.created_at AT TIME ZONE 'Asia/Kolkata')::date";
const PAID = "o.payment_status = 'paid' AND o.status <> 'cancelled'";
// the last $2 days up to and including today ($1)
const IN_PERIOD = `${DAY} > $1::date - $2::int AND ${DAY} <= $1::date`;

/** right now, whatever the period: work waiting for someone. Counted with the same rules as the lists. */
async function needsAttention(db) {
  return (
    await db.query(`
      SELECT count(*) FILTER (WHERE o.status = 'pending') AS pending,
             floor(extract(epoch FROM now() - min(o.created_at) FILTER (WHERE o.status = 'pending')) / 3600)::int AS "oldestPendingHours",
             count(*) FILTER (WHERE ${ORDER_VIEWS.late}) AS late,
             count(*) FILTER (WHERE ${ORDER_VIEWS.unpaid}) AS unpaid,
             count(*) FILTER (WHERE ${ORDER_VIEWS.refund}) AS refund,
             count(*) FILTER (WHERE ${ORDER_VIEWS.missing}) AS missing
        FROM orders o`)
  ).rows[0];
}

/** the period's headline numbers, with the same number of days before it for comparison */
async function headline(db, today, days) {
  const { rows } = await db.query(
    `WITH o AS (
       SELECT o.status, o.payment_status, o.total_paise, ${DAY} > $1::date - $2::int AS current,
              (SELECT coalesce(sum(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS pieces
         FROM orders o WHERE ${DAY} > $1::date - 2 * $2::int AND ${DAY} <= $1::date)
     SELECT current,
            count(*) FILTER (WHERE status <> 'cancelled') AS orders,
            count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            count(*) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled') AS paid,
            coalesce(sum(total_paise) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0)::bigint AS sales,
            coalesce(sum(pieces) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0)::bigint AS items
       FROM o GROUP BY current`,
    [today, days]
  );
  const period = (current) => {
    const r = rows.find((x) => x.current === current) || { orders: 0, cancelled: 0, paid: 0, sales: 0, items: 0 };
    return {
      sales: rupees(r.sales),
      paidOrders: r.paid,
      averageOrder: r.paid ? Math.round(r.sales / r.paid) / 100 : null,
      items: r.items,
      orders: r.orders,
      cancelled: r.cancelled,
    };
  };
  const now = period(true);
  const before = period(false);
  return Object.fromEntries(Object.keys(now).map((key) => [key, { now: now[key], before: before[key] }]));
}

async function performance(db, today, days) {
  const daily = await db.query(
    `SELECT d::date::text AS day,
            count(o.id) FILTER (WHERE o.status <> 'cancelled') AS orders,
            coalesce(sum(o.total_paise) FILTER (WHERE ${PAID}), 0)::bigint AS sales
       FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') d
       LEFT JOIN orders o ON ${DAY} = d::date
      GROUP BY d ORDER BY d`,
    [today, days]
  );
  const top = await db.query(
    `SELECT i.product_title AS title, sum(i.quantity) AS units, sum(i.unit_price_paise * i.quantity)::bigint AS sales, max(v.product_id) AS "productId"
       FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN product_variants v ON v.id = i.variant_id
      WHERE ${PAID} AND ${IN_PERIOD}
      GROUP BY i.product_title ORDER BY units DESC, sales DESC, title LIMIT 5`,
    [today, days]
  );
  const sizeRows = await db.query(
    `SELECT i.size, sum(i.quantity) AS units FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${PAID} AND ${IN_PERIOD} GROUP BY i.size`,
    [today, days]
  );
  const sizes = new Map();
  for (const r of sizeRows.rows) sizes.set(sizeKey(r.size), (sizes.get(sizeKey(r.size)) || 0) + Number(r.units));
  const areaRows = await db.query(
    `SELECT o.delivery_area AS area, count(*) AS orders, coalesce(sum(o.total_paise), 0)::bigint AS sales
       FROM orders o WHERE ${PAID} AND ${IN_PERIOD} GROUP BY o.delivery_area`,
    [today, days]
  );
  return {
    days,
    totals: await headline(db, today, days),
    daily: daily.rows.map((r) => ({ day: r.day, orders: r.orders, sales: rupees(r.sales) })),
    topProducts: top.rows.map((r) => ({ title: r.title, units: Number(r.units), sales: rupees(r.sales), productId: r.productId })),
    sizes: [...sizes.keys()].sort(bySize).map((size) => ({ size, units: sizes.get(size) })),
    areas: ['kerala', 'india'].map((area) => {
      const r = areaRows.rows.find((x) => x.area === area);
      return { area, orders: r?.orders || 0, sales: rupees(r?.sales || 0) };
    }),
  };
}

async function catalogHealth(db) {
  const products = (
    await db.query(`
      SELECT count(*) AS total, count(*) FILTER (WHERE is_published) AS published, count(*) FILTER (WHERE NOT is_published) AS hidden,
             count(*) FILTER (WHERE NOT sellable) AS "soldOut", count(*) FILTER (WHERE is_published AND NOT sellable) AS "soldOutOnWebsite"
        FROM (SELECT is_published, EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id
                       AND v.is_available AND (v.stock_qty IS NULL OR v.stock_qty > 0)) AS sellable FROM products p) x`)
  ).rows[0];
  const stock = (await db.query('SELECT count(*) AS sizes, count(stock_qty) AS counted FROM product_variants')).rows[0];
  const low = await db.query(
    `SELECT p.id AS "productId", p.title, v.size, v.stock_qty AS stock, count(*) OVER () AS total
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.is_published AND v.is_available AND v.stock_qty <= $1
      ORDER BY v.stock_qty, p.title, v.position LIMIT 8`,
    [LOW_STOCK]
  );
  return {
    products,
    stock,
    lowStock: low.rows.map(({ total, ...r }) => r),
    lowStockCount: low.rows[0]?.total || 0,
  };
}

async function wildcardToday(db) {
  const s = await readWildcard(db);
  return {
    mode: s.mode,
    price: s.price,
    dailyLimit: s.dailyLimit,
    claimed: await claimedToday(db),
    jerseys: s.mode === 'open' ? new Set((await candidates(db, s.pool)).map((c) => c.productId)).size : null,
  };
}

export async function dashboard(db, { days = 30 } = {}) {
  const today = (await db.query("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).rows[0].day;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of (await db.query('SELECT status, count(*) AS n FROM orders GROUP BY status')).rows) byStatus[r.status] = r.n;
  const money = (
    await db.query(
      `SELECT count(*) FILTER (WHERE ${DAY} = $1::date AND o.status <> 'cancelled') AS orders_today,
              coalesce(sum(o.total_paise) FILTER (WHERE ${PAID} AND ${DAY} >= date_trunc('month', $1::date)::date), 0)::bigint AS paid_month
         FROM orders o`,
      [today]
    )
  ).rows[0];
  return {
    today,
    byStatus,
    ordersToday: money.orders_today,
    paidThisMonth: rupees(money.paid_month),
    attention: await needsAttention(db),
    recentOrders: (await listOrders(db, { pageSize: 8 })).orders,
    ...(await catalogHealth(db)),
    wildcard: await wildcardToday(db),
    performance: await performance(db, today, days),
  };
}
