/* The admin API. Everything here except sign-in needs a signed-in admin. */
import multipart from '@fastify/multipart';
import { login, logout, sessionAdmin, SESSION_HOURS } from '../auth.js';
import { AppError, invalid } from '../errors.js';
import { removeImageFiles, saveImage } from '../images.js';
import { getOrder, listOrders, summary, updateOrder, STATUSES } from '../orders.js';
import { addImage, createProduct, getProduct, listCollections, listProducts, orderImages, removeImage, updateProduct } from '../products.js';

const COOKIE = 'jo_admin';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const text = (maxLength) => ({ type: 'string', maxLength });
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const page = { type: 'integer', minimum: 1, maximum: 10_000, default: 1 };
const body = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const idParams = body({ id }, ['id']);

const money = { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000, multipleOf: 0.01 };
const productFields = {
  title: text(200),
  details: { type: 'array', maxItems: 20, items: text(200) },
  collections: { type: 'array', maxItems: 20, items: text(40) },
  variants: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    items: body(
      {
        id,
        size: text(20),
        price: money,
        compareAt: { type: ['number', 'null'], minimum: 0, maximum: 1_000_000 },
        available: { type: 'boolean' },
        stock: { type: ['integer', 'null'], minimum: 0, maximum: 100_000 },
      },
      ['size', 'price', 'compareAt', 'available', 'stock']
    ),
  },
};

export default async function adminRoutes(app, { db, env, catalog }) {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 } });

  const cookieOptions = { path: '/api/admin', httpOnly: true, sameSite: 'strict', secure: env.production };

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

  app.decorateRequest('admin', null);
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.config.open) return;
    request.admin = await sessionAdmin(db, request.cookies[COOKIE]);
    if (!request.admin) throw new AppError(401, 'NOT_SIGNED_IN', 'Please sign in.');
  });

  const audit = (request, what, extra) => request.log.info({ admin: request.admin.username, ...extra }, what);

  /* ---------- session ---------- */
  app.post(
    '/login',
    { config: { open: true, rateLimit: { max: 8, timeWindow: '15 minutes' } }, schema: { body: body({ username: text(40), password: text(200) }, ['username', 'password']) } },
    async (request, reply) => {
      const session = await login(db, request.body.username, request.body.password);
      if (!session) {
        request.log.warn({ ip: request.ip }, 'failed admin sign-in');
        throw new AppError(401, 'BAD_LOGIN', 'Wrong username or password.');
      }
      request.log.info({ admin: session.admin.username }, 'admin signed in');
      reply.setCookie(COOKIE, session.token, { ...cookieOptions, maxAge: SESSION_HOURS * 3600 });
      return { username: session.admin.username };
    }
  );

  app.post('/logout', async (request, reply) => {
    await logout(db, request.cookies[COOKIE]);
    reply.clearCookie(COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get('/me', async (request) => ({ username: request.admin.username }));
  app.get('/summary', async () => summary(db));

  /* ---------- orders ---------- */
  app.get(
    '/orders',
    { schema: { querystring: body({ status: { type: 'string', enum: STATUSES }, q: text(80), page }) } },
    async (request) => listOrders(db, request.query)
  );

  app.get('/orders/:id', { schema: { params: idParams } }, async (request) => getOrder(db, request.params.id));

  app.patch(
    '/orders/:id',
    {
      schema: {
        params: idParams,
        body: {
          ...body({
            status: { type: 'string', enum: STATUSES },
            paymentStatus: { type: 'string', enum: ['unpaid', 'paid', 'refunded'] },
            courier: text(80),
            trackingId: text(80),
            adminNote: text(1000),
          }),
          minProperties: 1,
        },
      },
    },
    async (request) => {
      const { order, stockMoved } = await updateOrder(db, request.params.id, request.body, request.admin.id);
      if (stockMoved) catalog.invalidate();
      audit(request, 'order updated', { order: order.orderNumber, fields: Object.keys(request.body), status: order.status });
      return order;
    }
  );

  /* ---------- products ---------- */
  app.get('/collections', async () => listCollections(db));

  app.get(
    '/products',
    { schema: { querystring: body({ q: text(80), filter: { type: 'string', enum: ['all', 'published', 'hidden', 'soldout'] }, page }) } },
    async (request) => listProducts(db, request.query)
  );

  app.get('/products/:id', { schema: { params: idParams } }, async (request) => getProduct(db, request.params.id));

  app.post('/products', { schema: { body: body(productFields, ['title', 'details', 'collections', 'variants']) } }, async (request, reply) => {
    const product = await createProduct(db, request.body);
    catalog.invalidate();
    audit(request, 'product created', { productId: product.id });
    return reply.code(201).send(product);
  });

  app.put(
    '/products/:id',
    {
      schema: {
        params: idParams,
        body: body({ ...productFields, version: id, published: { type: 'boolean' } }, ['title', 'details', 'collections', 'variants', 'version', 'published']),
      },
    },
    async (request) => {
      const product = await updateProduct(db, request.params.id, request.body);
      catalog.invalidate();
      audit(request, 'product updated', { productId: product.id });
      return product;
    }
  );

  /* ---------- photos ---------- */
  app.post('/products/:id/images', { schema: { params: idParams } }, async (request, reply) => {
    await getProduct(db, request.params.id); // fail before doing any image work
    if (!request.isMultipart()) throw invalid('Choose a photo to upload.');
    const part = await request.file();
    if (!part) throw invalid('Choose a photo to upload.');
    const image = await saveImage(await part.toBuffer(), env.uploadDir);
    let product;
    try {
      product = await addImage(db, request.params.id, image);
    } catch (err) {
      await removeImageFiles([image.small, image.large], env.uploadDir);
      throw err;
    }
    catalog.invalidate();
    audit(request, 'photo added', { productId: product.id });
    return reply.code(201).send(product);
  });

  app.put(
    '/products/:id/images/order',
    { schema: { params: idParams, body: body({ ids: { type: 'array', minItems: 1, maxItems: 20, items: id } }, ['ids']) } },
    async (request) => {
      const product = await orderImages(db, request.params.id, request.body.ids);
      catalog.invalidate();
      return product;
    }
  );

  app.delete('/products/:id/images/:imageId', { schema: { params: body({ id, imageId: id }, ['id', 'imageId']) } }, async (request) => {
    const { product, removed } = await removeImage(db, request.params.id, request.params.imageId);
    catalog.invalidate();
    await removeImageFiles(removed, env.uploadDir);
    audit(request, 'photo removed', { productId: product.id });
    return product;
  });
}
