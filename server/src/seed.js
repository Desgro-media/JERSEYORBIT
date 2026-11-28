/* Copies the website's catalog (assets/js/data.js) into the database.
   Safe to run again: it only adds products that are missing, never overwrites an admin's edits,
   and never brings back a product that was deleted in the admin panel. */
import { pathToFileURL } from 'node:url';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { shopConfig, staticCatalog } from './storefront-data.js';

const EXTRA_TITLES = { 'long-sleeve': 'Long Sleeve (imported list)' };
const paise = (rupees) => Math.round(rupees * 100);

export async function seed(db, data = staticCatalog()) {
  const titles = Object.fromEntries(shopConfig().categories.map((c) => [c.key, c.title]));
  // 'all' means every product, and full/half sleeve are worked out in the browser, so none of them is stored
  const keys = [...new Set(data.products.flatMap((p) => p.k))].filter((k) => k !== 'all');
  const alwaysOffered = ['2026-27', 'new-drops', 'world-cup-collections', 'retro', 'embroidery', 'retro-jerseys', 'collar', 'imported', 'socks'];

  return db.tx(async (c) => {
    for (const key of new Set([...alwaysOffered, ...keys])) {
      await c.query('INSERT INTO collections (key, title) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, titles[key] || EXTRA_TITLES[key] || key]);
    }
    const retired = new Set((await c.query('SELECT id FROM retired_products')).rows.map((r) => r.id));
    let added = 0;
    for (const p of data.products) {
      if (retired.has(p.id)) continue;
      const res = await c.query(
        `INSERT INTO products (id, handle, title, details, is_published, sort_order, created_at)
         VALUES ($1, $2, $3, $4, true, $5, to_timestamp($6))
         ON CONFLICT DO NOTHING`,
        [p.id, p.h, p.t, p.d, p.o, p.ts]
      );
      if (!res.rowCount) continue;
      added++;
      for (const [i, v] of p.v.entries()) {
        await c.query(
          `INSERT INTO product_variants (id, product_id, size, price_paise, compare_at_paise, is_available, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [v.id, p.id, v.s, paise(v.p), v.c ? paise(v.c) : null, v.a, i]
        );
      }
      for (const [i, im] of p.i.entries()) {
        await c.query('INSERT INTO product_images (product_id, position, width, height, url_small, url_large) VALUES ($1, $2, $3, $4, $5, $6)', [p.id, i, im.w, im.h, im.s, im.l]);
      }
      for (const key of p.k.filter((k) => k !== 'all')) {
        await c.query('INSERT INTO product_collections (product_id, collection_key) VALUES ($1, $2)', [p.id, key]);
      }
    }
    return { added, total: data.products.length };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb(loadEnv().ownerUrl);
  try {
    const { added, total } = await seed(db);
    console.log(`Catalog: added ${added} of ${total} products (the others are already there or were deleted).`);
  } finally {
    await db.close();
  }
}
