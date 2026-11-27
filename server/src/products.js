/* Admin side of the catalog: products, sizes, prices, stock and photos. */
import { AppError, invalid, notFound } from './errors.js';

const rupees = (paise) => (paise === null ? null : paise / 100);
const paise = (value) => Math.round(value * 100);

const slugify = (title) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '') || 'jersey';

export const listCollections = async (db) => (await db.query('SELECT key, title FROM collections ORDER BY title')).rows;

export async function listProducts(db, { q, filter = 'all', page = 1, pageSize = 25 }) {
  const where = [];
  const params = [];
  const add = (value) => `$${params.push(value)}`;
  const sellable = 'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_available AND (v.stock_qty IS NULL OR v.stock_qty > 0))';
  if (q) where.push(`p.title ILIKE ${add(`%${q.replace(/[\\%_]/g, '\\$&')}%`)}`);
  if (filter === 'published') where.push('p.is_published');
  if (filter === 'hidden') where.push('NOT p.is_published');
  if (filter === 'soldout') where.push(`NOT ${sellable}`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT count(*) AS n FROM products p ${clause}`, params)).rows[0].n;
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  const { rows } = await db.query(
    `SELECT p.id, p.title, p.is_published, ${sellable} AS sellable,
            (SELECT min(price_paise) FROM product_variants v WHERE v.product_id = p.id) AS price_paise,
            (SELECT url_small FROM product_images i WHERE i.product_id = p.id ORDER BY position, id LIMIT 1) AS image
       FROM products p ${clause}
      ORDER BY p.sort_order, p.id LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return {
    total,
    page,
    pageSize,
    products: rows.map((r) => ({ id: r.id, title: r.title, published: r.is_published, sellable: r.sellable, price: rupees(r.price_paise), image: r.image })),
  };
}

export async function getProduct(q, id) {
  const p = (await q.query('SELECT * FROM products WHERE id = $1', [id])).rows[0];
  if (!p) throw notFound('Product');
  const variants = (await q.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY position, id', [id])).rows;
  const images = (await q.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY position, id', [id])).rows;
  const collections = (await q.query('SELECT collection_key FROM product_collections WHERE product_id = $1', [id])).rows;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    details: p.details,
    published: p.is_published,
    version: p.version,
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size,
      price: rupees(v.price_paise),
      compareAt: rupees(v.compare_at_paise),
      available: v.is_available,
      stock: v.stock_qty,
    })),
    images: images.map((i) => ({ id: i.id, small: i.url_small, large: i.url_large })),
    collections: collections.map((c) => c.collection_key),
  };
}

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

/** new products start hidden, because the website needs a photo before it can show them */
export async function createProduct(db, input) {
  const data = readProduct({ ...input, published: false });
  return db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727202)'); // so two new products cannot pick the same address
    const base = slugify(data.title);
    const taken = new Set((await c.query("SELECT handle FROM products WHERE handle = $1 OR handle LIKE $1 || '-%'", [base])).rows.map((r) => r.handle));
    let handle = base;
    for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`;
    // new arrivals go to the front of the "Featured" order
    const id = (
      await c.query(
        `INSERT INTO products (handle, title, details, is_published, sort_order)
         VALUES ($1, $2, $3, false, (SELECT coalesce(min(sort_order), 1) - 1 FROM products)) RETURNING id`,
        [handle, data.title, data.details]
      )
    ).rows[0].id;
    for (const [i, v] of data.variants.entries()) await insertVariant(c, id, v, i);
    await setCollections(c, id, data.collections);
    return getProduct(c, id);
  });
}

/** replaces the product with what the editor shows. `version` must match what the editor loaded. */
export async function updateProduct(db, id, input) {
  const data = readProduct(input);
  return db.tx(async (c) => {
    const current = (await c.query('SELECT version FROM products WHERE id = $1 FOR NO KEY UPDATE', [id])).rows[0];
    if (!current) throw notFound('Product');
    if (current.version !== input.version) {
      // e.g. an order was confirmed and took stock while this form was open
      throw new AppError(409, 'PRODUCT_CHANGED', 'This product changed while you were editing it. Reload it, then make your changes again.');
    }
    if (data.published) {
      const photos = (await c.query('SELECT count(*) AS n FROM product_images WHERE product_id = $1', [id])).rows[0].n;
      if (!photos) throw invalid('Add at least one photo before showing this product on the website.');
    }

    const existing = new Set((await c.query('SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id FOR NO KEY UPDATE', [id])).rows.map((r) => r.id));
    const kept = new Set(data.variants.filter((v) => v.id).map((v) => v.id));
    if ([...kept].some((vid) => !existing.has(vid))) throw invalid('One of these sizes does not belong to this product.');
    await c.query('DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::bigint[]))', [id, [...kept]]);
    for (const [i, v] of data.variants.entries()) {
      if (v.id) {
        await c.query(
          'UPDATE product_variants SET size = $2, price_paise = $3, compare_at_paise = $4, is_available = $5, stock_qty = $6, position = $7 WHERE id = $1',
          [v.id, v.size, v.price, v.compareAt, v.available, v.stock, i]
        );
      } else await insertVariant(c, id, v, i);
    }

    await c.query('UPDATE products SET title = $2, details = $3, is_published = $4, version = version + 1 WHERE id = $1', [id, data.title, data.details, data.published]);
    await setCollections(c, id, data.collections);
    return getProduct(c, id);
  });
}

/* ---------- photos ---------- */

export const MAX_IMAGES = 8;

async function lockProduct(c, id) {
  const p = (await c.query('SELECT is_published FROM products WHERE id = $1 FOR NO KEY UPDATE', [id])).rows[0];
  if (!p) throw notFound('Product');
  return p;
}

const bump = (c, id) => c.query('UPDATE products SET version = version + 1 WHERE id = $1', [id]);

export async function addImage(db, productId, image) {
  return db.tx(async (c) => {
    await lockProduct(c, productId);
    const { n, next } = (
      await c.query('SELECT count(*) AS n, coalesce(max(position), -1) + 1 AS next FROM product_images WHERE product_id = $1', [productId])
    ).rows[0];
    if (n >= MAX_IMAGES) throw invalid(`A product can have up to ${MAX_IMAGES} photos.`);
    await c.query('INSERT INTO product_images (product_id, position, width, height, url_small, url_large) VALUES ($1, $2, $3, $4, $5, $6)', [
      productId, next, image.width, image.height, image.small, image.large,
    ]);
    await bump(c, productId);
    return getProduct(c, productId);
  });
}

export async function removeImage(db, productId, imageId) {
  return db.tx(async (c) => {
    const product = await lockProduct(c, productId);
    const images = (await c.query('SELECT * FROM product_images WHERE product_id = $1', [productId])).rows;
    const target = images.find((i) => i.id === imageId);
    if (!target) throw notFound('Photo');
    if (product.is_published && images.length === 1) throw invalid('A product on the website needs a photo. Add another first, or hide the product.');
    await c.query('DELETE FROM product_images WHERE id = $1', [imageId]);
    await bump(c, productId);
    return { product: await getProduct(c, productId), removed: [target.url_small, target.url_large] };
  });
}

export async function orderImages(db, productId, ids) {
  return db.tx(async (c) => {
    await lockProduct(c, productId);
    const have = (await c.query('SELECT id FROM product_images WHERE product_id = $1', [productId])).rows.map((r) => r.id);
    if (have.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => have.includes(id))) {
      throw invalid('The photo list is out of date. Reload and try again.');
    }
    for (const [position, id] of ids.entries()) await c.query('UPDATE product_images SET position = $2 WHERE id = $1', [id, position]);
    await bump(c, productId);
    return getProduct(c, productId);
  });
}
