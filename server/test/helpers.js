/* Shared test setup. The tests use a separate database whose name ends in "_test", and each test
   file wipes it before it starts (they run one file at a time). */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { upsertAdmin } from '../src/auth.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { shopConfig, staticCatalog } from '../src/storefront-data.js';

const base = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://jerseyorbit:jerseyorbit_local@127.0.0.1:5438/jerseyorbit');
if (!process.env.TEST_DATABASE_URL) base.pathname = `${base.pathname}_test`;
export const TEST_URL = base.toString();
const TEST_NAME = base.pathname.slice(1);

export const PASSWORD = 'correct-horse-battery';
export const data = staticCatalog();
export const shop = shopConfig();

let ipCounter = 0;

/** each call comes from a new address unless one is given, so rate limits don't interfere between tests */
export const caller =
  (app) =>
  (method, url, { body, headers = {}, ip, payload } = {}) =>
    app.inject({ method, url, headers, payload: payload ?? body, remoteAddress: ip || `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${++ipCounter & 255}` });

export async function signIn(call, username, password = PASSWORD) {
  const res = await call('POST', '/api/admin/login', { body: { username, password }, headers: { 'x-jo-admin': '1' } });
  assert.equal(res.statusCode, 200, res.body);
  return cookieFrom(res);
}
export const cookieFrom = (res) => res.headers['set-cookie'].split(';')[0];

export const asAdmin =
  (call, cookie) =>
  (method, url, body, extra = {}) =>
    call(method, '/api/admin' + url, { body, ...extra, headers: { cookie, 'x-jo-admin': '1', ...extra.headers } });

/** a fresh database with the catalog and one owner, and the app running on it */
export async function setUp() {
  assert.match(TEST_NAME, /^[a-z0-9_]+_test$/, 'refusing to wipe a database whose name does not end in _test');
  const server = new URL(TEST_URL);
  server.pathname = '/postgres';
  const client = new pg.Client({ connectionString: server.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_NAME]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE ${TEST_NAME}`);
  await client.end();

  const db = createDb(TEST_URL);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate(db);
  await seed(db);
  await upsertAdmin(db, 'owner', PASSWORD);
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jo-uploads-'));
  const app = await buildApp({ db, env: { production: false, trustProxy: false, uploadDir }, logger: false });
  const call = caller(app);
  const cookie = await signIn(call, 'owner');
  return {
    db,
    app,
    uploadDir,
    call,
    cookie,
    admin: asAdmin(call, cookie),
    async stop() {
      await app.close();
      await db.close();
      await fs.rm(uploadDir, { recursive: true, force: true });
    },
  };
}

/* ---------- requests ---------- */

export const customer = (over = {}) => ({
  clientRef: crypto.randomUUID(),
  name: 'Test Customer',
  phone: '9876543210',
  address: '12 Test Road',
  city: 'Kochi',
  pincode: '682001',
  area: 'kerala',
  note: '',
  ...over,
});

const isSock = (p) => p.k.includes('socks');
/** products with at least one size on sale, so tests don't depend on particular ids */
export const jerseys = data.products.filter((p) => !isSock(p) && p.v.some((v) => v.a));
export const socks = data.products.find((p) => isSock(p) && p.v.some((v) => v.a));
export const onSale = (p) => p.v.find((v) => v.a);
export const line = (v, quantity = 1) => ({ variantId: v.id, quantity });

/** the editor's request body for a product, as the admin screen would send it */
export const editBody = (p) => ({
  title: p.title,
  details: p.details,
  collections: p.collections,
  published: p.published,
  version: p.version,
  variants: p.variants.map(({ id, size, price, compareAt, available, stock }) => ({ id, size, price, compareAt, available, stock })),
});

export const newProduct = (over = {}) => ({
  title: 'Test Kit',
  details: [],
  collections: [],
  variants: [{ size: 'M', price: 399, compareAt: null, available: true, stock: null }],
  ...over,
});

export const multipart = (buffer, filename = 'photo.jpg', type = 'image/jpeg') => {
  const boundary = 'test-boundary-123';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
};

export const jpeg = (width = 600, height = 800, background = '#14295c') => sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();

export async function uploadPhoto(admin, productId) {
  const { headers, payload } = multipart(await jpeg());
  const res = await admin('POST', `/products/${productId}/images`, undefined, { headers, payload });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

/** the catalog exactly as the website receives it */
export async function catalogScript(call) {
  const res = await call('GET', '/assets/js/data.js');
  assert.equal(res.statusCode, 200);
  return res.body;
}
export async function catalog(call) {
  const window = {};
  new Function('window', await catalogScript(call))(window);
  return window.JO_DATA;
}

/** run a request that must succeed, and return its JSON */
export async function ok(pending, status = 200) {
  const res = await pending;
  assert.equal(res.statusCode, status, res.body);
  return res.json();
}
