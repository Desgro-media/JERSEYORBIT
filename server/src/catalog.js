/* Builds the storefront catalog (window.JO_DATA) from the database, in the same shape as the static
   assets/js/data.js, so the website's catalog code works with either one. */
import crypto from 'node:crypto';

// short, so that a second server instance or a change made directly in the database also shows up soon
const MAX_AGE_MS = 15_000;
const DAY_MS = 864e5;

const SQL = `
  SELECT p.id, p.handle, p.title, p.details, p.sort_order,
         floor(extract(epoch FROM p.created_at))::bigint AS ts,
         (SELECT json_agg(json_build_object(
                    'id', v.id, 's', v.size,
                    'a', v.is_available AND (v.stock_qty IS NULL OR v.stock_qty > 0),
                    'p', v.price_paise, 'c', coalesce(v.compare_at_paise, 0)) ORDER BY v.position, v.id)
            FROM product_variants v WHERE v.product_id = p.id) AS variants,
         (SELECT json_agg(json_build_object('w', i.width, 'h', i.height, 's', i.url_small, 'l', i.url_large)
                    ORDER BY i.position, i.id)
            FROM product_images i WHERE i.product_id = p.id) AS images,
         ARRAY(SELECT collection_key FROM product_collections pc WHERE pc.product_id = p.id ORDER BY collection_key) AS keys
    FROM products p
   WHERE p.is_published
   ORDER BY p.sort_order, p.id`;

export async function buildCatalog(db, now = Date.now()) {
  const { rows } = await db.query(SQL);
  const collections = { all: 0 };
  const products = [];
  for (const row of rows) {
    // the storefront needs at least one size and one photo to show a product
    if (!row.variants || !row.images) continue;
    const variants = row.variants.map((v) => ({ ...v, p: v.p / 100, c: v.c / 100 }));
    const price = Math.min(...variants.map((v) => v.p));
    const compare = Math.max(0, ...variants.map((v) => v.c));
    const keys = ['all', ...row.keys];
    for (const k of keys) collections[k] = (collections[k] || 0) + 1;
    products.push({
      id: row.id,
      h: row.handle,
      t: row.title,
      p: price,
      c: compare > price ? compare : 0,
      a: variants.some((v) => v.a),
      v: variants,
      i: row.images,
      d: row.details,
      ts: row.ts,
      o: row.sort_order,
      k: keys,
    });
  }
  // rounded to the day so the file (and its ETag) only changes when the catalog does, or once a day
  return { generated: new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString(), cdn: '', collections, products };
}

export function createCatalog(db, log) {
  let cache = null;
  let building = null;
  let revision = 0;

  async function rebuild() {
    const builtFor = revision;
    const data = await buildCatalog(db);
    const body = `/* Generated from the Jersey Orbit database */\nwindow.JO_DATA=${JSON.stringify(data)};\n`;
    cache = { body, etag: `W/"${crypto.createHash('sha1').update(body).digest('base64url')}"`, at: Date.now(), revision: builtFor };
    return cache;
  }

  return {
    /** call after anything that changes products, prices or stock */
    invalidate() {
      revision++;
    },
    async get() {
      if (cache && cache.revision === revision && Date.now() - cache.at < MAX_AGE_MS) return cache;
      try {
        // one rebuild at a time; if the catalog changed while it ran, go round once more
        let result;
        do {
          building ||= rebuild().finally(() => (building = null));
          result = await building;
        } while (result.revision !== revision);
        return result;
      } catch (err) {
        if (!cache) throw err;
        log?.error({ err }, 'catalog rebuild failed; serving the last good copy');
        return cache;
      }
    },
  };
}
