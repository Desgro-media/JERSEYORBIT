/* The home page slideshow and the catalog thumbnails. A photo place holds either nothing
   ("automatic", as the website picks it) or a reference: { kind: 'upload' | 'product', id }.
   References are looked up each time the catalog is built, so a deleted photo, or a hidden
   product, falls back to automatic by itself. */
import { record } from './audit.js';
import { invalid, notFound } from './errors.js';
import { deleteSetting, readSetting, writeSetting } from './settings.js';
import { shopConfig, storefrontCode } from './storefront-data.js';

const LOCK = 727204; // one storefront change at a time, so unused uploads are worked out correctly
export const MAX_SLIDES = 6;
const PHOTO_PAGE = 24;

const keyOf = (ref) => `${ref.kind}:${ref.id}`;
const tidy = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/** the slides written in config.js, used until the admin saves their own */
export const defaultSlides = () =>
  (shopConfig().hero || []).map((h) => ({
    collection: h.key,
    eyebrow: h.eyebrow || '',
    title: h.title,
    text: h.text || '',
    cta: h.cta || 'Shop now',
    visible: true,
    photos: [null, null],
  }));

/** what each reference points at: the photo, or why it cannot be shown */
export async function resolvePhotos(q, refs) {
  const ids = (kind) => refs.filter((r) => r?.kind === kind).map((r) => r.id);
  const found = new Map();
  const photo = (r) => ({ s: r.url_small, l: r.url_large, w: r.width, h: r.height });
  for (const r of (await q.query('SELECT * FROM site_images WHERE id = ANY($1::bigint[])', [ids('upload')])).rows) found.set(`upload:${r.id}`, photo(r));
  const products = await q.query(
    `SELECT i.*, p.handle, p.title, p.is_published FROM product_images i JOIN products p ON p.id = i.product_id WHERE i.id = ANY($1::bigint[])`,
    [ids('product')]
  );
  for (const r of products.rows) {
    found.set(`product:${r.id}`, r.is_published ? { ...photo(r), p: r.handle, t: r.title } : { ...photo(r), problem: 'hidden', t: r.title });
  }
  for (const ref of refs) if (ref && !found.has(keyOf(ref))) found.set(keyOf(ref), { problem: 'gone' });
  return found;
}

const savedRefs = (hero, thumbnails) => [...(hero?.slides || []).flatMap((s) => s.photos), ...Object.values(thumbnails?.images || {})].filter(Boolean);

/* ---------- what the shop receives ---------- */

export async function storefrontFeed(db) {
  const hero = (await readSetting(db, 'hero')).value;
  const thumbnails = (await readSetting(db, 'thumbnails')).value;
  const found = await resolvePhotos(db, savedRefs(hero, thumbnails));
  const shown = (ref) => {
    const photo = ref && found.get(keyOf(ref));
    return photo && !photo.problem ? photo : null;
  };
  const feed = {
    categoryImages: Object.fromEntries(
      Object.entries(thumbnails?.images || {})
        .map(([key, ref]) => [key, shown(ref)])
        .filter(([, photo]) => photo)
    ),
  };
  // without saved slides, the shop uses the ones in config.js
  if (hero) {
    feed.hero = hero.slides
      .filter((s) => s.visible)
      .map((s) => ({ key: s.collection, eyebrow: s.eyebrow, title: s.title, text: s.text, cta: s.cta, photos: s.photos.map(shown) }));
  }
  return feed;
}

/* ---------- what the admin screen shows ---------- */

/* Every category, built-in and the admin's own. `inShop` says whether the shop knows it: the
   built-in ones, and own collections switched on for the menu. A slide button pointing anywhere
   else would silently open "All products". */
async function allCategories(db) {
  const fixed = shopConfig().categories;
  const known = new Set(fixed.map((c) => c.key));
  const own = (await db.query('SELECT key, title, in_menu AS "inShop" FROM collections ORDER BY lower(title), key')).rows.filter((r) => !known.has(r.key));
  return [...fixed.map((c) => ({ key: c.key, title: c.title, inShop: true })), ...own];
}

/** `catalog` is the shop's catalog without any of these choices, to work out the automatic photos */
export async function storefrontState(db, catalog) {
  const hero = await readSetting(db, 'hero');
  const thumbnails = await readSetting(db, 'thumbnails');
  const slides = hero.value?.slides || defaultSlides();
  const found = await resolvePhotos(db, savedRefs({ slides }, thumbnails.value));
  const categories = await allCategories(db);
  const targets = new Set(categories.filter((c) => c.inShop).map((c) => c.key));
  // the website's own code picks the automatic photos, so the preview matches the shop
  const site = storefrontCode(catalog);
  const small = (img) => (img ? img.s : null);

  const usable = (ref) => {
    const photo = ref && found.get(keyOf(ref));
    return photo && !photo.problem ? photo : null;
  };
  const place = (ref, automatic) => ({
    ref: ref || null,
    preview: usable(ref)?.s || automatic,
    automatic,
    problem: ref && !usable(ref) ? found.get(keyOf(ref)).problem : null,
    from: usable(ref)?.t || null,
  });
  /** what an empty place `i` would show, given the photo chosen for the other one */
  const automaticFor = (slide, i) => {
    const photos = slide.photos.map((ref, n) => (n === i ? null : usable(ref)));
    return small(site.heroPhotos({ key: slide.collection, title: slide.title, photos })[i]?.img);
  };

  return {
    hero: {
      version: hero.version,
      custom: !!hero.value,
      slides: slides.map((s) => ({
        ...s,
        photos: [0, 1].map((i) => place(s.photos[i], automaticFor(s, i))),
        // the collection was deleted, or taken out of the shop menu, since the slide was saved
        targetLost: !targets.has(s.collection),
      })),
    },
    thumbnails: categories.map((c) => {
      const ref = thumbnails.value?.images?.[c.key] || null;
      const listed = site.cfg.categories.some((x) => x.key === c.key);
      return { key: c.key, title: c.title, ...place(ref, listed ? small(site.catImage(c.key)) : null) };
    }),
    categories,
    maxSlides: MAX_SLIDES,
  };
}

/** published products' photos, for "Choose from products" */
export async function listProductPhotos(db, { q, page = 1 }) {
  const params = [];
  const add = (value) => `$${params.push(value)}`;
  const search = q ? `AND p.title ILIKE ${add(`%${q.replace(/[\\%_]/g, '\\$&')}%`)}` : '';
  const from = `FROM product_images i JOIN products p ON p.id = i.product_id WHERE p.is_published ${search}`;
  const total = (await db.query(`SELECT count(*) AS n ${from}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT i.id, i.url_small, p.title ${from} ORDER BY p.sort_order, p.id, i.position, i.id LIMIT ${add(PHOTO_PAGE)} OFFSET ${add((page - 1) * PHOTO_PAGE)}`,
    params
  );
  return { total, page, pageSize: PHOTO_PAGE, photos: rows.map((r) => ({ id: r.id, small: r.url_small, title: r.title })) };
}

/* ---------- changing things ---------- */

export async function addSiteImage(db, image) {
  const { rows } = await db.query('INSERT INTO site_images (width, height, url_small, url_large) VALUES ($1, $2, $3, $4) RETURNING id', [
    image.width, image.height, image.small, image.large,
  ]);
  return { id: rows[0].id, small: image.small };
}

const usedUploads = async (c) => {
  const hero = (await readSetting(c, 'hero')).value;
  const thumbnails = (await readSetting(c, 'thumbnails')).value;
  return new Set(savedRefs(hero, thumbnails).filter((r) => r.kind === 'upload').map((r) => r.id));
};

/* Runs `change`, then deletes uploads it stopped using, and uploads never saved for a day.
   Returns the files to delete once the transaction is saved. */
export async function cleaningUploads(c, change) {
  await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
  const before = await usedUploads(c);
  await change();
  const after = await usedUploads(c);
  const dropped = [...before].filter((id) => !after.has(id));
  const { rows } = await c.query(
    `DELETE FROM site_images WHERE id = ANY($1::bigint[]) OR (created_at < now() - interval '1 day' AND NOT (id = ANY($2::bigint[])))
     RETURNING url_small, url_large`,
    [dropped, [...after]]
  );
  return rows.flatMap((r) => [r.url_small, r.url_large]);
}

async function assertPhotosExist(c, refs) {
  const found = await resolvePhotos(c, refs);
  if (refs.some((ref) => ref && found.get(keyOf(ref)).problem === 'gone')) {
    throw invalid('One of the chosen photos no longer exists. Choose it again.');
  }
}

export async function saveHero(db, input, by) {
  const targets = new Set((await allCategories(db)).filter((c) => c.inShop).map((c) => c.key));
  const slides = input.slides.map((s, i) => {
    const slide = {
      collection: s.collection,
      eyebrow: tidy(s.eyebrow),
      title: tidy(s.title),
      text: tidy(s.text),
      cta: tidy(s.cta) || 'Shop now',
      visible: s.visible,
      photos: [0, 1].map((n) => (s.photos[n] ? { kind: s.photos[n].kind, id: s.photos[n].id } : null)),
    };
    if (!slide.title) throw invalid(`Slide ${i + 1} needs a headline.`);
    if (!targets.has(slide.collection)) {
      throw invalid(`Slide ${i + 1}: its button must open a collection that is in the shop menu. Choose another, or switch on “In shop menu” in Collections.`);
    }
    return slide;
  });
  if (!slides.some((s) => s.visible)) throw invalid('Keep at least one slide visible.');

  const removed = await db.tx((c) =>
    cleaningUploads(c, async () => {
      await assertPhotosExist(c, slides.flatMap((s) => s.photos));
      await writeSetting(c, 'hero', { slides }, input.version);
      await record(c, by, 'storefront.slideshow', { summary: `Saved the slideshow: ${slides.filter((s) => s.visible).length} of ${slides.length} slide(s) shown` });
    })
  );
  return { removed };
}

/** back to the slides in config.js */
export async function resetHero(db, version, by) {
  const removed = await db.tx((c) =>
    cleaningUploads(c, async () => {
      await deleteSetting(c, 'hero', version);
      await record(c, by, 'storefront.slideshow', { summary: 'Put the slideshow back to the website’s defaults' });
    })
  );
  return { removed };
}

async function setThumbnail(c, key, photo) {
  const { value, version } = await readSetting(c, 'thumbnails', { lock: true });
  const images = { ...(value?.images || {}) };
  if (photo) images[key] = { kind: photo.kind, id: photo.id };
  else delete images[key];
  await writeSetting(c, 'thumbnails', { images }, version);
}

export async function saveThumbnail(db, key, photo, by) {
  const category = (await allCategories(db)).find((c) => c.key === key);
  if (!category) throw notFound('Category');
  const removed = await db.tx((c) =>
    cleaningUploads(c, async () => {
      if (photo) await assertPhotosExist(c, [photo]);
      await setThumbnail(c, key, photo);
      await record(c, by, 'storefront.thumbnail', {
        target: `collection:${key}`,
        summary: `Category thumbnail for “${category.title}”: ${photo ? 'new photo chosen' : 'back to automatic'}`,
      });
    })
  );
  return { removed };
}

/** drop the thumbnail of a collection being deleted. Call inside its transaction. */
export const forgetThumbnail = (c, key) =>
  cleaningUploads(c, async () => {
    if ((await readSetting(c, 'thumbnails')).value?.images?.[key]) await setThumbnail(c, key, null);
  });
