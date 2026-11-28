/* The admin API. Everything here except sign-in needs a signed-in admin.
   A route marked `config: { owner: true }` also needs the owner role. */
import multipart from '@fastify/multipart';
import { AUDIT_AREAS, listAudit, record } from '../audit.js';
import { changePassword, login, logout, revokeOtherSessions, sessionAdmin, MAX_PASSWORD, SESSION_HOURS } from '../auth.js';
import { buildCatalog } from '../catalog.js';
import { createCollection, deleteCollection, listCollections, updateCollection } from '../collections.js';
import { dashboard, DASHBOARD_DAYS } from '../dashboard.js';
import { AppError, invalid } from '../errors.js';
import { removeImageFiles, saveImage } from '../images.js';
import { eraseOrder, getOrder, listOrders, updateOrder, ORDER_VIEWS, STATUSES } from '../orders.js';
import {
  addImage, bulkProducts, createProduct, deleteProduct, duplicateProduct, getProduct, listProducts, moveProduct,
  orderImages, removeImage, updateProduct, BULK_ACTIONS, PRODUCT_FILTERS, PRODUCT_MOVES, PRODUCT_SORTS,
} from '../products.js';
import { addSiteImage, listProductPhotos, resetHero, saveHero, saveThumbnail, storefrontState, MAX_SLIDES } from '../storefront.js';
import { repickJersey, saveWildcard, wildcardAdmin, MAX_DAILY, MODES } from '../wildcard.js';

const COOKIE = 'jo_admin';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/* Every body and query is described here. Fields that are not listed are dropped before the code
   sees them, so a request cannot set anything the screen does not offer. */
const text = (maxLength) => ({ type: 'string', maxLength });
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const page = { type: 'integer', minimum: 1, maximum: 10_000, default: 1 };
const choice = (values) => ({ type: 'string', enum: values });
const body = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const idParams = body({ id }, ['id']);
const keyParams = body({ key: { type: 'string', maxLength: 40, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' } }, ['key']);

const money = { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 };
const wasPrice = { type: ['number', 'null'], minimum: 0, maximum: 1_000_000 };
const productFields = {
  title: text(200),
  details: { type: 'array', maxItems: 20, items: text(200) },
  collections: { type: 'array', maxItems: 30, items: text(40) },
  variants: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    items: body(
      {
        id,
        size: text(20),
        price: money,
        compareAt: wasPrice,
        available: { type: 'boolean' },
        stock: { type: ['integer', 'null'], minimum: 0, maximum: 100_000 },
      },
      ['size', 'price', 'compareAt', 'available', 'stock']
    ),
  },
};
const collectionFields = { title: text(60), blurb: text(120), inMenu: { type: 'boolean' } };
const version = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
// a photo place: a reference to an uploaded or product photo, or null for "automatic"
const photoRef = { ...body({ kind: choice(['upload', 'product']), id }, ['kind', 'id']), type: ['object', 'null'] };
const slide = body(
  {
    collection: text(40),
    eyebrow: text(40),
    title: text(60),
    text: text(160),
    cta: text(30),
    visible: { type: 'boolean' },
    photos: { type: 'array', minItems: 2, maxItems: 2, items: photoRef },
  },
  ['collection', 'title', 'visible', 'photos']
);

export default async function adminRoutes(app, { db, env, catalog }) {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 } });

  const cookieOptions = { path: '/api/admin', httpOnly: true, sameSite: 'strict', secure: env.production };
  const setSessionCookie = (reply, token) => reply.setCookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_HOURS * 3600 });

  /* Cross-site protection on top of the SameSite cookie: another website cannot add this header
     without permission this server never gives, and a browser reports where a request came from. */
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD') return;
    const origin = request.headers.origin;
    let sameOrigin = true;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === request.headers.host;
      } catch {
        sameOrigin = false;
      }
    }
    if (request.headers['x-jo-admin'] !== '1' || !sameOrigin) throw new AppError(403, 'FORBIDDEN', 'This request was not allowed.');
  });

  /** who is acting, for the activity log */
  const by = (request) => ({ id: request.admin.id, username: request.admin.username, ip: request.ip });

  async function requireOwner(request) {
    if (request.admin.role === 'owner') return;
    await record(db, by(request), 'auth.denied', { summary: `Refused an owner-only action: ${request.method} ${request.routeOptions.url}` });
    throw new AppError(403, 'OWNER_ONLY', 'Only an owner can do this.');
  }

  app.decorateRequest('admin', null);
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config.open) return;
    request.admin = await sessionAdmin(db, request.cookies[COOKIE]);
    if (!request.admin) throw new AppError(401, 'NOT_SIGNED_IN', 'Please sign in.');
    if (request.routeOptions.config.owner) await requireOwner(request);
  });

  /** the website's catalog must be rebuilt after a product or collection changes */
  const changed = (value) => {
    catalog.invalidate();
    return value;
  };

  /* ---------- sign in and your own account ---------- */
  app.post(
    '/login',
    { config: { open: true, rateLimit: { max: 8, timeWindow: '15 minutes' } }, schema: { body: body({ username: text(40), password: text(MAX_PASSWORD) }, ['username', 'password']) } },
    async (request, reply) => {
      const result = await login(db, request.body.username, request.body.password);
      if (!result.ok) {
        request.log.warn({ ip: request.ip }, 'failed admin sign-in');
        // an unknown name is not stored: people sometimes type their password into the name box
        await record(db, { ip: request.ip }, 'auth.signin_failed', {
          target: result.username ? `admin:${result.username}` : '',
          summary: result.username ? `Wrong password for “${result.username}”` : 'Sign-in with an unknown username',
        });
        throw new AppError(401, 'BAD_LOGIN', 'Wrong username or password.');
      }
      const { username, role } = result.admin;
      await record(db, { username, ip: request.ip }, 'auth.signin', { summary: 'Signed in' });
      request.log.info({ admin: username }, 'admin signed in');
      setSessionCookie(reply, result.token);
      return { username, role };
    }
  );

  app.post('/logout', async (request, reply) => {
    await logout(db, request.cookies[COOKIE]);
    await record(db, by(request), 'auth.signout', { summary: 'Signed out' });
    reply.clearCookie(COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get('/me', async (request) => ({ username: request.admin.username, role: request.admin.role }));

  app.post(
    '/password',
    {
      config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
      schema: { body: body({ currentPassword: text(MAX_PASSWORD), newPassword: text(MAX_PASSWORD) }, ['currentPassword', 'newPassword']) },
    },
    async (request, reply) => {
      try {
        setSessionCookie(reply, await changePassword(db, by(request), request.body.currentPassword, request.body.newPassword));
      } catch (err) {
        if (err instanceof AppError) await record(db, by(request), 'auth.password_change_failed', { summary: err.message });
        throw err;
      }
      return { ok: true };
    }
  );

  app.post('/sessions/revoke-others', async (request) => ({ ended: await revokeOtherSessions(db, by(request), request.cookies[COOKIE]) }));

  /* ---------- dashboard and activity ---------- */
  app.get('/summary', { schema: { querystring: body({ days: { type: 'integer', enum: DASHBOARD_DAYS } }) } }, async (request) =>
    dashboard(db, request.query)
  );

  app.get('/audit', { config: { owner: true }, schema: { querystring: body({ area: choice(AUDIT_AREAS), page }) } }, async (request) =>
    listAudit(db, request.query)
  );

  /* ---------- orders ---------- */
  app.get('/orders', { schema: { querystring: body({ status: choice(STATUSES), view: choice(Object.keys(ORDER_VIEWS)), q: text(80), page }) } }, async (request) =>
    listOrders(db, request.query)
  );

  app.get('/orders/:id', { schema: { params: idParams } }, async (request) => getOrder(db, request.params.id));

  app.patch(
    '/orders/:id',
    {
      schema: {
        params: idParams,
        body: {
          ...body({
            status: choice(STATUSES),
            paymentStatus: choice(['unpaid', 'paid', 'refunded']),
            courier: text(80),
            trackingId: text(80),
            adminNote: text(1000),
          }),
          minProperties: 1,
        },
      },
    },
    async (request) => {
      const { order, stockMoved } = await updateOrder(db, request.params.id, request.body, by(request));
      if (stockMoved) catalog.invalidate();
      return order;
    }
  );

  app.post('/orders/:id/erase', { config: { owner: true }, schema: { params: idParams } }, async (request) => eraseOrder(db, request.params.id, by(request)));

  app.post('/orders/:id/repick', { schema: { params: idParams } }, async (request) => repickJersey(db, request.params.id, by(request)));

  /* ---------- home page: slideshow and catalog thumbnails ---------- */
  const storefront = async () => storefrontState(db, await buildCatalog(db, { extras: false }));
  /** save, delete uploads nothing uses any more, and rebuild the shop's catalog */
  const afterStorefront = async ({ removed }) => {
    catalog.invalidate();
    await removeImageFiles(removed, env.uploadDir);
    return storefront();
  };

  app.get('/storefront', async () => storefront());

  app.put(
    '/storefront/hero',
    { schema: { body: body({ version, slides: { type: 'array', minItems: 1, maxItems: MAX_SLIDES, items: slide } }, ['version', 'slides']) } },
    async (request) => afterStorefront(await saveHero(db, request.body, by(request)))
  );

  app.delete('/storefront/hero', { schema: { querystring: body({ version }, ['version']) } }, async (request) =>
    afterStorefront(await resetHero(db, request.query.version, by(request)))
  );

  app.put('/storefront/thumbnails/:key', { schema: { params: keyParams, body: body({ photo: photoRef }, ['photo']) } }, async (request) =>
    afterStorefront(await saveThumbnail(db, request.params.key, request.body.photo, by(request)))
  );

  app.get('/photos', { schema: { querystring: body({ q: text(80), page }) } }, async (request) => listProductPhotos(db, request.query));

  /* ---------- Orbit Wildcard ---------- */
  app.get('/wildcard', async () => wildcardAdmin(db));

  app.put(
    '/wildcard',
    {
      config: { owner: true },
      schema: {
        body: body(
          {
            mode: choice(MODES),
            price: { type: ['number', 'null'], minimum: 1, maximum: 100_000 },
            dailyLimit: { type: 'integer', minimum: 1, maximum: MAX_DAILY },
            pool: text(40),
            version,
          },
          ['mode', 'price', 'dailyLimit', 'pool', 'version']
        ),
      },
    },
    async (request) => {
      await saveWildcard(db, request.body, by(request));
      catalog.invalidate();
      return wildcardAdmin(db);
    }
  );

  /* ---------- collections ---------- */
  app.get('/collections', async () => listCollections(db));

  app.post('/collections', { schema: { body: body(collectionFields, ['title']) } }, async (request, reply) =>
    reply.code(201).send(changed(await createCollection(db, request.body, by(request))))
  );

  app.patch('/collections/:key', { schema: { params: keyParams, body: { ...body(collectionFields), minProperties: 1 } } }, async (request) =>
    changed(await updateCollection(db, request.params.key, request.body, by(request)))
  );

  app.delete('/collections/:key', { config: { owner: true }, schema: { params: keyParams } }, async (request) => {
    const { collections, removed } = changed(await deleteCollection(db, request.params.key, by(request)));
    await removeImageFiles(removed, env.uploadDir);
    return collections;
  });

  /* ---------- products ---------- */
  app.get(
    '/products',
    {
      schema: {
        querystring: body({
          q: text(80),
          filter: choice(PRODUCT_FILTERS),
          collection: text(40),
          sort: choice(PRODUCT_SORTS),
          page,
          pageSize: { type: 'integer', enum: [25, 50, 100] },
        }),
      },
    },
    async (request) => listProducts(db, request.query)
  );

  app.get('/products/:id', { schema: { params: idParams } }, async (request) => getProduct(db, request.params.id));

  app.post('/products', { schema: { body: body(productFields, ['title', 'details', 'collections', 'variants']) } }, async (request, reply) =>
    reply.code(201).send(changed(await createProduct(db, request.body, by(request))))
  );

  app.put(
    '/products/:id',
    {
      schema: {
        params: idParams,
        body: body({ ...productFields, version: id, published: { type: 'boolean' }, handle: text(255) }, ['title', 'details', 'collections', 'variants', 'version', 'published']),
      },
    },
    async (request) => changed(await updateProduct(db, request.params.id, request.body, by(request)))
  );

  app.post('/products/:id/duplicate', { schema: { params: idParams } }, async (request, reply) =>
    reply.code(201).send(changed(await duplicateProduct(db, request.params.id, by(request))))
  );

  app.post('/products/:id/move', { schema: { params: idParams, body: body({ to: choice(PRODUCT_MOVES) }, ['to']) } }, async (request) =>
    changed(await moveProduct(db, request.params.id, request.body.to, by(request)))
  );

  app.delete('/products/:id', { config: { owner: true }, schema: { params: idParams } }, async (request) => {
    const { removed } = changed(await deleteProduct(db, request.params.id, by(request)));
    await removeImageFiles(removed, env.uploadDir); // only after the deletion is saved
    return { ok: true };
  });

  app.post(
    '/products/bulk',
    {
      schema: {
        body: body(
          {
            ids: { type: 'array', minItems: 1, maxItems: 100, items: id },
            action: choice(BULK_ACTIONS),
            price: money,
            compareAt: wasPrice,
            percent: { type: 'integer', minimum: 1, maximum: 90 },
            collection: text(40),
          },
          ['ids', 'action']
        ),
      },
    },
    async (request) => {
      // deleting needs the owner, whichever way it is asked for
      if (request.body.action === 'delete') await requireOwner(request);
      const { removed, ...result } = changed(await bulkProducts(db, request.body, by(request)));
      await removeImageFiles(removed, env.uploadDir);
      return result;
    }
  );

  /* ---------- photos ---------- */
  /** checks and stores the uploaded photo, then `keep`s it; the files go if that fails */
  async function receivePhoto(request, keep) {
    if (!request.isMultipart()) throw invalid('Choose a photo to upload.');
    const part = await request.file();
    if (!part) throw invalid('Choose a photo to upload.');
    const image = await saveImage(await part.toBuffer(), env.uploadDir);
    try {
      return await keep(image);
    } catch (err) {
      await removeImageFiles([image.small, image.large], env.uploadDir);
      throw err;
    }
  }

  app.post('/products/:id/images', { schema: { params: idParams } }, async (request, reply) => {
    await getProduct(db, request.params.id); // fail before doing any image work
    const product = await receivePhoto(request, (image) => addImage(db, request.params.id, image, by(request)));
    return reply.code(201).send(changed(product));
  });

  // a photo for the slideshow or a catalog thumbnail; it is used once a setting points at it
  app.post('/site-images', async (request, reply) => reply.code(201).send(await receivePhoto(request, (image) => addSiteImage(db, image))));

  app.put(
    '/products/:id/images/order',
    { schema: { params: idParams, body: body({ ids: { type: 'array', minItems: 1, maxItems: 20, items: id } }, ['ids']) } },
    async (request) => changed(await orderImages(db, request.params.id, request.body.ids, by(request)))
  );

  app.delete('/products/:id/images/:imageId', { schema: { params: body({ id, imageId: id }, ['id', 'imageId']) } }, async (request) => {
    const { product, removed } = await removeImage(db, request.params.id, request.params.imageId, by(request));
    catalog.invalidate();
    await removeImageFiles(removed, env.uploadDir);
    return product;
  });
}
