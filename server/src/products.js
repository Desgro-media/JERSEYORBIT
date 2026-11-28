/* Admin side of the catalog: products, sizes, prices, stock and photos.
   Every change is recorded in the activity log inside the same transaction. `by` says who made it.
   Lock order everywhere: products first, then sizes, each by id (orders.js does the same), so two
   changes happening at once wait for each other instead of deadlocking. */
import { record } from './audit.js';
import { AppError, invalid, notFound } from './errors.js';

const rupees = (paise) => (paise === null ? null : paise / 100);
const paise = (value) => Math.round(value * 100);
const NEW_ORDER_LOCK = 727202; // held while choosing a web address or a place in the "Featured" order

export const slugify = (title, fallback = 'jersey', length = 80) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, length)
    .replace(/-+$/, '') || fallback;

/** the first of base, base-2, base-3… that is not in `taken` */
export const firstFree = (base, taken) => {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

const HANDLE = /^[a-z0-9]+([_-]+[a-z0-9]+)*$/; // the same rule as the database
export const LOW_STOCK = 2;
export const MAX_IMAGES = 8;

/* ---------- listing ---------- */

const SELLABLE = 'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_available AND (v.stock_qty IS NULL OR v.stock_qty > 0))';
const LOW = `EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_available AND v.stock_qty <= ${LOW_STOCK})`;

const FILTERS = { all: null, published: 'p.is_published', hidden: 'NOT p.is_published', soldout: `NOT ${SELLABLE}`, lowstock: LOW };
// the browser picks a name from this list; its own text never becomes part of the query
const SORTS = {
  featured: 'p.sort_order, p.id',
  newest: 'p.created_at DESC, p.id DESC',
  name: 'lower(p.title), p.id',
  'price-asc': 's.price_min, p.id',
  'price-desc': 's.price_min DESC NULLS LAST, p.id',
  stock: 's.stock_total NULLS LAST, p.id',
};
export const PRODUCT_FILTERS = Object.keys(FILTERS);
export const PRODUCT_SORTS = Object.keys(SORTS);

export async function listProducts(db, { q, filter = 'all', collection, sort = 'featured', page = 1, pageSize = 25 }) {
  const where = [];
  const params = [];
  const add = (value) => `$${params.push(value)}`;
  if (q) where.push(`p.title ILIKE ${add(`%${q.replace(/[\\%_]/g, '\\$&')}%`)}`);
  if (FILTERS[filter]) where.push(FILTERS[filter]);
  if (collection) where.push(`EXISTS (SELECT 1 FROM product_collections pc WHERE pc.product_id = p.id AND pc.collection_key = ${add(collection)})`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT count(*) AS n FROM products p ${clause}`, params)).rows[0].n;
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await db.query(
    `SELECT p.id, p.handle, p.title, p.is_published, ${SELLABLE} AS sellable, ${LOW} AS low,
            s.price_min, s.price_max, s.stock_total, s.sizes, s.sizes_on_sale,
            (SELECT url_small FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) AS image
       FROM products p
      CROSS JOIN LATERAL (
            SELECT min(price_paise) AS price_min, max(price_paise) AS price_max, sum(stock_qty) AS stock_total,
                   count(*) AS sizes, count(*) FILTER (WHERE is_available AND (stock_qty IS NULL OR stock_qty > 0)) AS sizes_on_sale
              FROM product_variants v WHERE v.product_id = p.id) s
      ${clause}
      ORDER BY ${SORTS[sort] || SORTS.featured} LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return {
    total,
    page,
    pageSize,
    products: rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      title: r.title,
      published: r.is_published,
      sellable: r.sellable,
      lowStock: r.low,
      price: rupees(r.price_min),
      priceMax: rupees(r.price_max),
      stock: r.stock_total === null ? null : Number(r.stock_total), // null: no size is counted
      sizes: r.sizes,
      sizesOnSale: r.sizes_on_sale,
      image: r.image,
    })),
  };
}

export async function getProduct(q, id) {
  const p = (await q.query('SELECT * FROM products WHERE id = $1', [id])).rows[0];
  if (!p) throw notFound('Product');
  const variants = (
    await q.query(
      `SELECT v.*, (SELECT count(DISTINCT o.id) FROM order_items i JOIN orders o ON o.id = i.order_id
                     WHERE i.variant_id = v.id AND o.status = 'pending') AS waiting
         FROM product_variants v WHERE v.product_id = $1 ORDER BY v.position, v.id`,
      [id]
    )
  ).rows;
  const images = (await q.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY position, id', [id])).rows;
  const collections = (await q.query('SELECT collection_key FROM product_collections WHERE product_id = $1 ORDER BY collection_key', [id])).rows;
  const openOrders = (
    await q.query(
      `SELECT count(DISTINCT o.id) AS n FROM orders o
         JOIN order_items i ON i.order_id = o.id JOIN product_variants v ON v.id = i.variant_id
        WHERE v.product_id = $1 AND o.status IN ('pending', 'confirmed', 'packed')`,
      [id]
    )
  ).rows[0].n;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    details: p.details,
    published: p.is_published,
    version: p.version,
    createdAt: p.created_at,
    openOrders,
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size,
      price: rupees(v.price_paise),
      compareAt: rupees(v.compare_at_paise),
      available: v.is_available,
      stock: v.stock_qty,
      // waiting orders that include this size: confirming them takes no stock if the size is removed
      waiting: v.waiting,
    })),
    images: images.map((i) => ({ id: i.id, small: i.url_small, large: i.url_large })),
    collections: collections.map((c) => c.collection_key),
  };
}

/* ---------- creating and editing ---------- */

/** check and tidy what the editor sent */
function readProduct(input) {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (!title) throw invalid('Enter a product name.');
  const details = input.details.map((d) => d.trim()).filter(Boolean);
  const seen = new Set();
  const variants = input.variants.map((v) => {
    const size = v.size.trim();
    if (!size) throw invalid('Every size needs a name.');
    if (seen.has(size.toLowerCase())) throw invalid(`The size “${size}” is listed twice.`);
    seen.add(size.toLowerCase());
    const price = paise(v.price);
    const compareAt = v.compareAt ? paise(v.compareAt) : null;
    if (price <= 0) throw invalid(`Size ${size} needs a price above zero.`);
    if (compareAt !== null && compareAt <= price) throw invalid(`Size ${size}: the “was” price must be higher than the price, or left empty.`);
    return { id: v.id, size, price, compareAt, available: v.available, stock: v.stock };
  });
  return { title, details, variants, collections: [...new Set(input.collections)], published: input.published };
}

function readHandle(raw) {
  const handle = raw.trim().toLowerCase();
  if (handle.length > 150 || !HANDLE.test(handle)) {
    throw invalid('Web address: use lower-case letters, numbers and dashes, for example real-madrid-home-26-27.');
  }
  return handle;
}

/** short sentences describing what an edit changed, for the activity log */
function describeChanges(before, after) {
  const out = [];
  const was = (value, none) => (value === null ? none : value);
  if (before.title !== after.title) out.push(`renamed from “${before.title}”`);
  if (before.handle !== after.handle) out.push(`web address ${before.handle} → ${after.handle}`);
  if (before.details.join('\n') !== after.details.join('\n')) out.push('details edited');
  if (before.published !== after.published) out.push(after.published ? 'shown on the website' : 'hidden from the website');
  const old = new Map(before.variants.map((v) => [v.id, v]));
  for (const v of after.variants) {
    const o = old.get(v.id);
    if (!o) {
      out.push(`added size ${v.size} at ₹${v.price}`);
      continue;
    }
    if (o.size !== v.size) out.push(`size ${o.size} renamed to ${v.size}`);
    if (o.price !== v.price) out.push(`size ${v.size} price ₹${o.price} → ₹${v.price}`);
    if (o.compareAt !== v.compareAt) out.push(`size ${v.size} “was” price ${was(o.compareAt, 'none')} → ${was(v.compareAt, 'none')}`);
    if (o.stock !== v.stock) out.push(`size ${v.size} stock ${was(o.stock, 'not counted')} → ${was(v.stock, 'not counted')}`);
    if (o.available !== v.available) out.push(`size ${v.size} ${v.available ? 'put on sale' : 'marked sold out'}`);
  }
  const stillThere = new Set(after.variants.map((v) => v.id));
  for (const o of before.variants) if (!stillThere.has(o.id)) out.push(`removed size ${o.size}`);
  const sameSizes = (list) => list.map((v) => v.id).filter((id) => old.has(id) && stillThere.has(id)).join();
  if (sameSizes(before.variants) !== sameSizes(after.variants)) out.push('sizes reordered');
  const added = after.collections.filter((k) => !before.collections.includes(k));
  const removed = before.collections.filter((k) => !after.collections.includes(k));
  if (added.length) out.push(`added to ${added.join(', ')}`);
  if (removed.length) out.push(`removed from ${removed.join(', ')}`);
  return out;
}

async function setCollections(c, productId, keys) {
  const known = (await c.query('SELECT key FROM collections WHERE key = ANY($1::text[])', [keys])).rowCount;
  if (known !== keys.length) throw invalid('One of the chosen collections does not exist.');
  await c.query('DELETE FROM product_collections WHERE product_id = $1', [productId]);
  if (keys.length) await c.query('INSERT INTO product_collections (product_id, collection_key) SELECT $1, unnest($2::text[])', [productId, keys]);
}

const insertVariant = (c, productId, v, position) =>
  c.query(
    'INSERT INTO product_variants (product_id, size, price_paise, compare_at_paise, is_available, stock_qty, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [productId, v.size, v.price, v.compareAt, v.available, v.stock, position]
  );

/** a new, hidden product at the front of the "Featured" order. The caller holds NEW_ORDER_LOCK. */
async function insertProduct(c, data) {
  const base = slugify(data.title);
  const taken = new Set((await c.query("SELECT handle FROM products WHERE handle = $1 OR handle LIKE $1 || '-%'", [base])).rows.map((r) => r.handle));
  const id = (
    await c.query(
      `INSERT INTO products (handle, title, details, is_published, sort_order)
       VALUES ($1, $2, $3, false, (SELECT coalesce(min(sort_order), 1) - 1 FROM products)) RETURNING id`,
      [firstFree(base, taken), data.title, data.details]
    )
  ).rows[0].id;
  for (const [i, v] of data.variants.entries()) await insertVariant(c, id, v, i);
  await setCollections(c, id, data.collections);
  return id;
}

/** new products start hidden, because the website needs a photo before it can show them */
export async function createProduct(db, input, by) {
  const data = readProduct({ ...input, published: false });
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [NEW_ORDER_LOCK]); // so two new products cannot pick the same address
    const id = await insertProduct(c, data);
    await record(c, by, 'product.create', { target: `product:${id}`, summary: `Created “${data.title}”` });
    return getProduct(c, id);
  });
}

/** a hidden copy: same details, sizes, prices and collections. Photos and stock numbers are not copied. */
export async function duplicateProduct(db, id, by) {
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [NEW_ORDER_LOCK]);
    const source = await getProduct(c, id);
    const suffix = ' (copy)';
    const copy = await insertProduct(c, {
      title: source.title.slice(0, 200 - suffix.length) + suffix,
      details: source.details,
      collections: source.collections,
      variants: source.variants.map((v) => ({
        size: v.size,
        price: paise(v.price),
        compareAt: v.compareAt === null ? null : paise(v.compareAt),
        available: v.available,
        // copying a count would invent stock, so a counted size starts at 0
        stock: v.stock === null ? null : 0,
      })),
    });
    await record(c, by, 'product.duplicate', { target: `product:${copy}`, summary: `Copied “${source.title}”` });
    return getProduct(c, copy);
  });
}

/** replaces the product with what the editor shows. `version` must match what the editor loaded. */
export async function updateProduct(db, id, input, by) {
  const data = readProduct(input);
  return db.tx(async (c) => {
    const current = (await c.query('SELECT version, handle FROM products WHERE id = $1 FOR NO KEY UPDATE', [id])).rows[0];
    if (!current) throw notFound('Product');
    if (current.version !== input.version) {
      // e.g. an order was confirmed and took stock while this form was open
      throw new AppError(409, 'PRODUCT_CHANGED', 'This product changed while you were editing it. Reload it, then make your changes again.');
    }
    if (data.published) {
      const photos = (await c.query('SELECT count(*) AS n FROM product_images WHERE product_id = $1', [id])).rows[0].n;
      if (!photos) throw invalid('Add at least one photo before showing this product on the website.');
    }
    const handle = input.handle === undefined || input.handle === current.handle ? current.handle : readHandle(input.handle);

    const existing = new Set((await c.query('SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id FOR NO KEY UPDATE', [id])).rows.map((r) => r.id));
    const kept = new Set(data.variants.filter((v) => v.id).map((v) => v.id));
    if ([...kept].some((vid) => !existing.has(vid))) throw invalid('One of these sizes does not belong to this product.');
    const before = await getProduct(c, id);

    await c.query('DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::bigint[]))', [id, [...kept]]);
    for (const [i, v] of data.variants.entries()) {
      if (v.id) {
        await c.query(
          'UPDATE product_variants SET size = $2, price_paise = $3, compare_at_paise = $4, is_available = $5, stock_qty = $6, position = $7 WHERE id = $1',
          [v.id, v.size, v.price, v.compareAt, v.available, v.stock, i]
        );
      } else await insertVariant(c, id, v, i);
    }

    try {
      await c.query('UPDATE products SET title = $2, details = $3, is_published = $4, handle = $5, version = version + 1 WHERE id = $1', [
        id, data.title, data.details, data.published, handle,
      ]);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'products_handle_key') throw invalid('Another product already uses that web address.');
      throw err;
    }
    await setCollections(c, id, data.collections);

    const after = await getProduct(c, id);
    const changes = describeChanges(before, after);
    if (changes.length) {
      await record(c, by, 'product.update', { target: `product:${id}`, summary: `“${after.title}”: ${changes.join('; ')}`, details: { changes } });
    }
    return after;
  });
}

/* ---------- the "Featured" order ---------- */

/** rewrite the order. `arrange` gets every id in the current order and returns them in the new one */
async function reorder(c, arrange) {
  const rows = (await c.query('SELECT id, sort_order FROM products ORDER BY id FOR NO KEY UPDATE')).rows;
  const current = rows.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((r) => r.id);
  await c.query(
    `UPDATE products p SET sort_order = n.position FROM unnest($1::bigint[]) WITH ORDINALITY AS n(id, position)
      WHERE p.id = n.id AND p.sort_order <> n.position`,
    [arrange(current)]
  );
}

const MOVES = { top: () => 0, up: (i) => i - 1, down: (i) => i + 1, bottom: (i, last) => last };
export const PRODUCT_MOVES = Object.keys(MOVES);

export async function moveProduct(db, id, to, by) {
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [NEW_ORDER_LOCK]);
    let moved = false;
    await reorder(c, (ids) => {
      const from = ids.indexOf(id);
      if (from < 0) throw notFound('Product');
      const target = Math.min(ids.length - 1, Math.max(0, MOVES[to](from, ids.length - 1)));
      moved = target !== from;
      const next = ids.filter((x) => x !== id);
      next.splice(target, 0, id);
      return next;
    });
    const { title } = (await c.query('SELECT title FROM products WHERE id = $1', [id])).rows[0];
    if (moved) await record(c, by, 'product.move', { target: `product:${id}`, summary: `Moved “${title}” (${to}) in the Featured order` });
    return { moved };
  });
}

/* ---------- deleting ---------- */

/** delete locked products for good. Returns the photo files to remove once the transaction is saved. */
async function destroy(c, ids) {
  const images = (await c.query('SELECT url_small, url_large FROM product_images WHERE product_id = ANY($1::bigint[])', [ids])).rows;
  await c.query('INSERT INTO retired_products (id, handle) SELECT id, handle FROM products WHERE id = ANY($1::bigint[]) ON CONFLICT (id) DO NOTHING', [ids]);
  // sizes, photos and collection links go with the product; past order lines keep their own copy
  await c.query('DELETE FROM products WHERE id = ANY($1::bigint[])', [ids]);
  return images.flatMap((i) => [i.url_small, i.url_large]);
}

export async function deleteProduct(db, id, by) {
  return db.tx(async (c) => {
    const product = (await c.query('SELECT title, handle FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!product) throw notFound('Product');
    const removed = await destroy(c, [id]);
    await record(c, by, 'product.delete', { target: `product:${id}`, summary: `Deleted “${product.title}”`, details: { handle: product.handle } });
    return { removed };
  });
}

/* ---------- changing several at once ---------- */

const bumpAll = (c, ids) => ids.length && c.query('UPDATE products SET version = version + 1 WHERE id = ANY($1::bigint[])', [ids]);
const distinct = (rows) => [...new Set(rows.map((r) => r.product_id))];

/* Each action changes the locked products and returns the ids it really changed.
   `sizes` actions also lock the size rows first. */
const BULK = {
  publish: {
    label: 'Shown on the website',
    async run(c, ids, _, skipped, titles) {
      const ready = new Set(distinct((await c.query('SELECT product_id FROM product_images WHERE product_id = ANY($1::bigint[])', [ids])).rows));
      for (const id of ids) if (!ready.has(id)) skipped.push({ id, title: titles.get(id), reason: 'has no photo' });
      return (await c.query('UPDATE products SET is_published = true WHERE id = ANY($1::bigint[]) AND NOT is_published RETURNING id AS product_id', [[...ready]])).rows;
    },
  },
  hide: {
    label: 'Hidden from the website',
    run: async (c, ids) => (await c.query('UPDATE products SET is_published = false WHERE id = ANY($1::bigint[]) AND is_published RETURNING id AS product_id', [ids])).rows,
  },
  'add-collection': {
    label: 'Added to a collection',
    needs: 'collection',
    async run(c, ids, { collection }) {
      if (!(await c.query('SELECT 1 FROM collections WHERE key = $1', [collection])).rowCount) throw invalid('That collection does not exist.');
      return (await c.query('INSERT INTO product_collections (product_id, collection_key) SELECT unnest($1::bigint[]), $2 ON CONFLICT DO NOTHING RETURNING product_id', [ids, collection])).rows;
    },
  },
  'remove-collection': {
    label: 'Removed from a collection',
    needs: 'collection',
    run: async (c, ids, { collection }) => (await c.query('DELETE FROM product_collections WHERE product_id = ANY($1::bigint[]) AND collection_key = $2 RETURNING product_id', [ids, collection])).rows,
  },
  'set-price': {
    label: 'Price set',
    needs: 'price',
    sizes: true,
    async run(c, ids, { price, compareAt }) {
      const next = paise(price);
      const old = compareAt ? paise(compareAt) : null;
      if (old !== null && old <= next) throw invalid('The “was” price must be higher than the price, or left empty.');
      return (
        await c.query(
          `UPDATE product_variants SET price_paise = $2::int, compare_at_paise = $3::int
            WHERE product_id = ANY($1::bigint[]) AND (price_paise IS DISTINCT FROM $2::int OR compare_at_paise IS DISTINCT FROM $3::int)
            RETURNING product_id`,
          [ids, next, old]
        )
      ).rows;
    },
  },
  discount: {
    label: 'Discounted',
    needs: 'percent',
    sizes: true,
    // takes the percentage off the current price, in whole rupees. The "was" price never goes down.
    run: async (c, ids, { percent }) =>
      (
        await c.query(
          `UPDATE product_variants
              SET compare_at_paise = greatest(coalesce(compare_at_paise, 0), price_paise),
                  price_paise = (round(price_paise::numeric * $2::int / 10000) * 100)::int
            WHERE product_id = ANY($1::bigint[]) AND round(price_paise::numeric * $2::int / 10000) * 100 BETWEEN 100 AND price_paise - 1
            RETURNING product_id`,
          [ids, 100 - percent]
        )
      ).rows,
  },
  'end-sale': {
    label: 'Sale ended',
    sizes: true,
    run: async (c, ids) =>
      (await c.query('UPDATE product_variants SET price_paise = compare_at_paise, compare_at_paise = NULL WHERE product_id = ANY($1::bigint[]) AND compare_at_paise > price_paise RETURNING product_id', [ids])).rows,
  },
  'sizes-on': {
    label: 'All sizes put on sale',
    sizes: true,
    run: async (c, ids) => (await c.query('UPDATE product_variants SET is_available = true WHERE product_id = ANY($1::bigint[]) AND NOT is_available RETURNING product_id', [ids])).rows,
  },
  'sizes-off': {
    label: 'All sizes marked sold out',
    sizes: true,
    run: async (c, ids) => (await c.query('UPDATE product_variants SET is_available = false WHERE product_id = ANY($1::bigint[]) AND is_available RETURNING product_id', [ids])).rows,
  },
};
export const BULK_ACTIONS = [...Object.keys(BULK), 'feature', 'delete'];
const NEEDS = { collection: 'Choose a collection.', price: 'Enter the new price.', percent: 'Enter the discount, from 1 to 90 percent.' };

/** one change to many products: all of it happens, or none of it */
export async function bulkProducts(db, input, by) {
  const { action } = input;
  const wanted = [...new Set(input.ids)].sort((a, b) => a - b);
  const needs = BULK[action]?.needs;
  if (needs && !input[needs]) throw invalid(NEEDS[needs]);

  return db.tx(async (c) => {
    const skipped = [];
    let removed = [];
    let changed;
    let label;
    let found;
    const lookUp = async (lock) => (await c.query(`SELECT id, title FROM products WHERE id = ANY($1::bigint[]) ORDER BY id ${lock}`, [wanted])).rows;

    if (action === 'feature') {
      await c.query('SELECT pg_advisory_xact_lock($1)', [NEW_ORDER_LOCK]);
      // reorder() takes the locks itself, over every product, so none is taken before it
      await reorder(c, (ids) => {
        const chosen = new Set(wanted);
        return [...ids.filter((id) => chosen.has(id)), ...ids.filter((id) => !chosen.has(id))];
      });
      found = await lookUp('');
      changed = found.map((p) => p.id);
      label = 'Moved to the top of the Featured order';
    } else if (action === 'delete') {
      found = await lookUp('FOR UPDATE');
      changed = found.map((p) => p.id);
      removed = await destroy(c, changed);
      label = 'Deleted';
    } else {
      found = await lookUp('FOR NO KEY UPDATE');
      const ids = found.map((p) => p.id);
      const step = BULK[action];
      if (step.sizes) await c.query('SELECT id FROM product_variants WHERE product_id = ANY($1::bigint[]) ORDER BY id FOR NO KEY UPDATE', [ids]);
      changed = distinct(await step.run(c, ids, input, skipped, new Map(found.map((p) => [p.id, p.title]))));
      await bumpAll(c, changed); // an editor still open on one of these must reload before saving
      label = step.label;
      if (input.collection && needs === 'collection') label += ` (${input.collection})`;
      if (action === 'set-price') label += ` to ₹${input.price}`;
      if (action === 'discount') label += ` by ${input.percent}%`;
    }

    if (changed.length) {
      const titles = new Map(found.map((p) => [p.id, p.title]));
      const names = changed.map((id) => titles.get(id));
      await record(c, by, action === 'delete' ? 'product.delete' : 'product.bulk', {
        target: 'products',
        summary: `${label}: ${changed.length} product(s): ${names.join(', ')}`,
        details: { action, ids: changed, titles: names },
      });
    }
    return { changed: changed.length, skipped, missing: wanted.length - found.length, removed };
  });
}

/* ---------- photos ---------- */

async function lockProduct(c, id) {
  const p = (await c.query('SELECT title, is_published FROM products WHERE id = $1 FOR NO KEY UPDATE', [id])).rows[0];
  if (!p) throw notFound('Product');
  return p;
}

const bump = (c, id) => c.query('UPDATE products SET version = version + 1 WHERE id = $1', [id]);
const photoRecord = (c, by, action, productId, summary) => record(c, by, action, { target: `product:${productId}`, summary });

export async function addImage(db, productId, image, by) {
  return db.tx(async (c) => {
    const product = await lockProduct(c, productId);
    const { n, next } = (
      await c.query('SELECT count(*) AS n, coalesce(max(position), -1) + 1 AS next FROM product_images WHERE product_id = $1', [productId])
    ).rows[0];
    if (n >= MAX_IMAGES) throw invalid(`A product can have up to ${MAX_IMAGES} photos.`);
    await c.query('INSERT INTO product_images (product_id, position, width, height, url_small, url_large) VALUES ($1, $2, $3, $4, $5, $6)', [
      productId, next, image.width, image.height, image.small, image.large,
    ]);
    await bump(c, productId);
    await photoRecord(c, by, 'photo.add', productId, `Added a photo to “${product.title}”`);
    return getProduct(c, productId);
  });
}

export async function removeImage(db, productId, imageId, by) {
  return db.tx(async (c) => {
    const product = await lockProduct(c, productId);
    const images = (await c.query('SELECT * FROM product_images WHERE product_id = $1', [productId])).rows;
    const target = images.find((i) => i.id === imageId);
    if (!target) throw notFound('Photo');
    if (product.is_published && images.length === 1) throw invalid('A product on the website needs a photo. Add another first, or hide the product.');
    await c.query('DELETE FROM product_images WHERE id = $1', [imageId]);
    await bump(c, productId);
    await photoRecord(c, by, 'photo.remove', productId, `Removed a photo from “${product.title}”`);
    return { product: await getProduct(c, productId), removed: [target.url_small, target.url_large] };
  });
}

export async function orderImages(db, productId, ids, by) {
  return db.tx(async (c) => {
    const product = await lockProduct(c, productId);
    const have = (await c.query('SELECT id FROM product_images WHERE product_id = $1', [productId])).rows.map((r) => r.id);
    if (have.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => have.includes(id))) {
      throw invalid('The photo list is out of date. Reload and try again.');
    }
    for (const [position, id] of ids.entries()) await c.query('UPDATE product_images SET position = $2 WHERE id = $1', [id, position]);
    await bump(c, productId);
    await photoRecord(c, by, 'photo.reorder', productId, `Reordered the photos of “${product.title}”`);
    return getProduct(c, productId);
  });
}
