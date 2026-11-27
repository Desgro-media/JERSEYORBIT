/* Serves the storefront and the admin screens. Only the listed pages and folders are reachable:
   the repository folder itself is never served, so .env, .git and the server code stay private. */
import fs from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { ADMIN_DIR, ROOT } from '../env.js';

const PAGES = ['index', 'shop', 'product', 'cart', 'checkout', 'about', 'contact', 'faq', 'track', 'reviews', 'policies', '404'];

export default async function siteRoutes(app, { env, catalog }) {
  await fs.mkdir(env.uploadDir, { recursive: true });

  const ASSETS = path.join(ROOT, 'assets');
  await app.register(fastifyStatic, {
    root: ASSETS,
    prefix: '/assets/',
    index: false,
    cacheControl: false,
    setHeaders(reply, file) {
      // photos and fonts rarely change; styles and scripts must be checked after each deploy
      reply.header('cache-control', /\.(webp|jpe?g|png|woff2)$/i.test(file) ? 'public, max-age=604800' : 'no-cache');
    },
  });
  // uploaded photos get a new random name each time, so a browser may keep them for good
  await app.register(fastifyStatic, { root: env.uploadDir, prefix: '/uploads/', index: false, decorateReply: false, maxAge: '365d', immutable: true });
  await app.register(fastifyStatic, { root: ADMIN_DIR, prefix: '/admin/', decorateReply: false, cacheControl: false });
  app.get('/admin', (request, reply) => reply.redirect('/admin/'));

  // the catalog comes from the database; this route wins over the static file of the same name
  app.get('/assets/js/data.js', async (request, reply) => {
    let feed;
    try {
      feed = await catalog.get();
    } catch (err) {
      request.log.error({ err }, 'catalog unavailable');
      return reply.code(503).type('text/plain').send('The catalog is temporarily unavailable.');
    }
    reply.header('etag', feed.etag).header('cache-control', 'no-cache');
    if (request.headers['if-none-match'] === feed.etag) return reply.code(304).send();
    return reply.type('application/javascript; charset=utf-8').send(feed.body);
  });

  const sendPage = (reply, name) => reply.header('cache-control', 'no-cache').sendFile(`${name}.html`, ROOT, { cacheControl: false });
  app.get('/', (request, reply) => sendPage(reply, 'index'));
  for (const name of PAGES) app.get(`/${name}.html`, (request, reply) => sendPage(reply, name));

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'NOT_FOUND', message: 'There is nothing at this address.' });
    // <base> keeps the page's relative links working at any depth
    const html = (await fs.readFile(path.join(ROOT, '404.html'), 'utf8')).replace('<head>', '<head>\n<base href="/">');
    return reply.code(404).type('text/html; charset=utf-8').send(html);
  });
}
