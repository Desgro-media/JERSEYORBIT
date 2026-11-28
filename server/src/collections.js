/* Collections (the shop's categories). The ones listed in assets/js/config.js are part of the
   website's design and keep their names from that file. Others are managed in the admin panel and
   reach the shop through the catalog feed. */
import { record } from './audit.js';
import { AppError, invalid, notFound } from './errors.js';
import { firstFree, slugify } from './products.js';
import { forgetThumbnail } from './storefront.js';
import { shopConfig } from './storefront-data.js';

const NAME_LOCK = 727203; // held while checking that a collection name is free
// Keys no new collection may use: the website works the first three out by itself, and every
// JavaScript object already has a "constructor", which would break the product counts.
const WORKED_OUT = ['all', 'full-sleeve', 'half-sleeve', 'constructor'];

const builtIn = () => new Map(shopConfig().categories.map((c) => [c.key, c]));
const tidy = (text) => text.replace(/\s+/g, ' ').trim();

export async function listCollections(db) {
  const fixed = builtIn();
  const { rows } = await db.query(
    `SELECT c.key, c.title, c.blurb, c.in_menu, count(pc.product_id) AS products,
            count(pc.product_id) FILTER (WHERE p.is_published) AS published
       FROM collections c
       LEFT JOIN product_collections pc ON pc.collection_key = c.key
       LEFT JOIN products p ON p.id = pc.product_id
      GROUP BY c.key ORDER BY lower(c.title), c.key`
  );
  const position = new Map([...fixed.keys()].map((key, i) => [key, i]));
  return rows
    .map((r) => {
      const design = fixed.get(r.key);
      return {
        key: r.key,
        title: design?.title || r.title,
        blurb: design ? design.blurb || '' : r.blurb,
        inMenu: design ? true : r.in_menu,
        builtIn: !!design,
        products: r.products,
        published: r.published,
      };
    })
    .sort((a, b) => (position.get(a.key) ?? Infinity) - (position.get(b.key) ?? Infinity));
}

/** the admin's own collections that the shop should list, given how many visible products each has */
export async function menuCollections(db, counts) {
  const fixed = builtIn();
  const { rows } = await db.query('SELECT key, title, blurb FROM collections WHERE in_menu ORDER BY lower(title), key');
  return rows.filter((r) => counts[r.key] && !fixed.has(r.key));
}

async function assertNameFree(c, title, exceptKey) {
  const taken =
    [...builtIn().values()].some((x) => x.title.toLowerCase() === title.toLowerCase()) ||
    (await c.query('SELECT 1 FROM collections WHERE lower(title) = lower($1) AND key IS DISTINCT FROM $2', [title, exceptKey])).rowCount > 0;
  if (taken) throw invalid('A collection with that name already exists.');
}

async function findEditable(c, key) {
  if (builtIn().has(key) || WORKED_OUT.includes(key)) {
    throw new AppError(409, 'BUILT_IN', 'This collection is part of the website’s design. Its name and text are set in assets/js/config.js.');
  }
  const row = (await c.query('SELECT * FROM collections WHERE key = $1 FOR UPDATE', [key])).rows[0];
  if (!row) throw notFound('Collection');
  return row;
}

export async function createCollection(db, input, by) {
  const title = tidy(input.title);
  if (!title) throw invalid('Enter a name for the collection.');
  const blurb = tidy(input.blurb || '');
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [NAME_LOCK]);
    await assertNameFree(c, title, null);
    const used = (await c.query('SELECT key FROM collections')).rows.map((r) => r.key);
    const key = firstFree(slugify(title, 'collection', 36), new Set([...used, ...builtIn().keys(), ...WORKED_OUT]));
    await c.query('INSERT INTO collections (key, title, blurb, in_menu) VALUES ($1, $2, $3, $4)', [key, title, blurb, input.inMenu ?? true]);
    await record(c, by, 'collection.create', { target: `collection:${key}`, summary: `Created the collection “${title}”` });
  });
  return listCollections(db);
}

export async function updateCollection(db, key, input, by) {
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [NAME_LOCK]);
    const row = await findEditable(c, key);
    const title = input.title === undefined ? row.title : tidy(input.title);
    if (!title) throw invalid('Enter a name for the collection.');
    if (title !== row.title) await assertNameFree(c, title, key);
    const blurb = input.blurb === undefined ? row.blurb : tidy(input.blurb);
    const inMenu = input.inMenu ?? row.in_menu;
    const changes = [
      title !== row.title && `renamed from “${row.title}”`,
      blurb !== row.blurb && 'short text changed',
      inMenu !== row.in_menu && (inMenu ? 'added to the shop menu' : 'taken off the shop menu'),
    ].filter(Boolean);
    if (!changes.length) return;
    await c.query('UPDATE collections SET title = $2, blurb = $3, in_menu = $4 WHERE key = $1', [key, title, blurb, inMenu]);
    await record(c, by, 'collection.update', { target: `collection:${key}`, summary: `“${title}”: ${changes.join('; ')}` });
  });
  return listCollections(db);
}

/** removes the collection only; its products stay. Returns the thumbnail files to delete, if any. */
export async function deleteCollection(db, key, by) {
  const removed = await db.tx(async (c) => {
    const row = await findEditable(c, key);
    const files = await forgetThumbnail(c, key);
    // lock the products first (in id order), then move their version on so open editors reload
    const members = (
      await c.query('SELECT id FROM products WHERE id IN (SELECT product_id FROM product_collections WHERE collection_key = $1) ORDER BY id FOR NO KEY UPDATE', [key])
    ).rows.map((r) => r.id);
    await c.query('UPDATE products SET version = version + 1 WHERE id = ANY($1::bigint[])', [members]);
    await c.query('DELETE FROM collections WHERE key = $1', [key]);
    await record(c, by, 'collection.delete', { target: `collection:${key}`, summary: `Deleted the collection “${row.title}” (${members.length} products kept)` });
    return files;
  });
  return { collections: await listCollections(db), removed };
}
