/* Builds the web application. server.js starts it; the tests call it directly. */
import Fastify from 'fastify';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createCatalog } from './catalog.js';
import { AppError } from './errors.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import siteRoutes from './routes/site.js';

export async function buildApp({ db, env, logger = true }) {
  const app = Fastify({
    logger: logger && {
      level: 'info',
      // query strings can hold a customer's name or phone (order search), so they are never logged
      serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0], ip: r.ip }) },
    },
    trustProxy: env.trustProxy || false,
    bodyLimit: 64 * 1024,
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code, message: err.message, details: err.details });
    if (err.validation) {
      const fields = [...new Set(err.validation.map((v) => v.instancePath || v.params?.missingProperty).filter(Boolean))];
      return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Some details are missing or not valid.', fields });
    }
    if (err.statusCode === 429) return reply.code(429).send({ error: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' });
    if (err.statusCode === 413) return reply.code(413).send({ error: 'TOO_LARGE', message: 'That file or request is too large (photos up to 10 MB).' });
    if (err.statusCode >= 400 && err.statusCode < 500) return reply.code(err.statusCode).send({ error: 'BAD_REQUEST', message: 'The request could not be read.' });
    // the details go to the log only; callers learn nothing about the inside of the server
    request.log.error({ err }, 'request failed');
    return reply.code(500).send({ error: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // the storefront uses style="" attributes
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(env.production ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: env.production ? { maxAge: 15552000 } : false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // checkout opens WhatsApp in a new tab
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await app.register(compress, { threshold: 1024 });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // API answers can hold customer details: no browser or proxy may keep a copy
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  // if a proxy is in front but not trusted, every visitor looks like the same one and shares the rate limits
  let warned = false;
  app.addHook('onRequest', async (request) => {
    if (warned || !request.headers['x-forwarded-for'] || request.ip !== request.socket.remoteAddress) return;
    warned = true;
    request.log.warn({ proxyAddress: request.socket.remoteAddress }, 'untrusted proxy: if this address is your proxy, add it to TRUST_PROXY');
  });

  const catalog = createCatalog(db, app.log);
  await app.register(publicRoutes, { db, catalog });
  await app.register(adminRoutes, { prefix: '/api/admin', db, env, catalog });
  await app.register(siteRoutes, { env, catalog });

  return app;
}
