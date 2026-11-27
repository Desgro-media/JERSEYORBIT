/* The API the storefront uses. No sign-in, so every input is checked and the writes are rate limited. */
import { placeOrder, trackOrder, MAX_QTY } from '../orders.js';
import { shopConfig } from '../storefront-data.js';

const text = (maxLength) => ({ type: 'string', maxLength });

const orderBody = {
  type: 'object',
  additionalProperties: false,
  required: ['clientRef', 'items', 'name', 'phone', 'address', 'city', 'pincode', 'area'],
  properties: {
    clientRef: { type: 'string', format: 'uuid' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['variantId', 'quantity'],
        properties: {
          variantId: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          quantity: { type: 'integer', minimum: 1, maximum: MAX_QTY },
        },
      },
    },
    name: text(100),
    phone: text(20),
    address: text(500),
    city: text(100),
    pincode: text(6),
    area: { type: 'string', enum: ['kerala', 'india'] },
    note: text(500),
    expectedTotal: { type: 'number', minimum: 0, maximum: 10_000_000 },
  },
};

const trackBody = {
  type: 'object',
  additionalProperties: false,
  required: ['orderNumber', 'phone'],
  properties: { orderNumber: text(30), phone: text(20) },
};

const limit = (max, timeWindow) => ({ rateLimit: { max, timeWindow } });

export default async function publicRoutes(app, { db, catalog }) {
  app.get('/api/health', async (request, reply) => {
    try {
      await db.query('SELECT 1');
      return { ok: true };
    } catch (err) {
      request.log.error({ err }, 'health check failed');
      return reply.code(503).send({ ok: false });
    }
  });

  // Mobile networks put many customers behind one address, so this limit is generous. A blocked
  // customer can still order: the checkout page then sends the order on WhatsApp without saving it.
  app.post('/api/orders', { schema: { body: orderBody }, config: limit(20, '10 minutes') }, async (request, reply) => {
    const { order, repeated } = await placeOrder(db, shopConfig(), request.body);
    if (!repeated) request.log.info({ order: order.orderNumber }, 'order placed');
    return reply.code(repeated ? 200 : 201).send(order);
  });

  // POST, so the phone number never appears in a URL or a server log
  app.post('/api/orders/track', { schema: { body: trackBody }, config: limit(15, '5 minutes') }, async (request) => trackOrder(db, request.body));
}
