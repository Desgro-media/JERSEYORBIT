/* Paths and settings read from environment variables. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(SERVER_DIR, '..'); // the storefront
export const MIGRATIONS_DIR = path.join(SERVER_DIR, 'migrations');
export const ADMIN_DIR = path.join(SERVER_DIR, 'admin');

/* Which proxies may tell us a visitor's real IP address (rate limits depend on it). It must name
   addresses: Fastify ignores a hop count, and "true" would let any visitor fake their address. */
function readTrustProxy(raw = '') {
  const value = raw.trim();
  if (!value || value === '0' || value === 'false') return false;
  if (/^(\d+|true)$/i.test(value)) {
    throw new Error('TRUST_PROXY must list proxy addresses or ranges, for example "loopback,uniquelocal". See server/.env.example.');
  }
  return value;
}

/* The upload folder is served to everyone, so it must not be (or contain) the app's own folders. */
function readUploadDir(raw) {
  const dir = path.resolve(SERVER_DIR, raw || 'uploads');
  const fromUploads = path.relative(dir, SERVER_DIR);
  const holdsTheApp = !fromUploads.startsWith('..') && !path.isAbsolute(fromUploads);
  if (holdsTheApp) throw new Error('UPLOAD_DIR must be a folder of its own for photos, not one that contains the app.');
  return dir;
}

export function loadEnv(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
  // Live mode unless clearly told otherwise: a live server that forgets NODE_ENV must still be safe.
  const production = !['development', 'test'].includes(env.NODE_ENV);
  const ownerUrl = env.DATABASE_OWNER_URL || env.DATABASE_URL;
  if (production && [env.DATABASE_URL, ownerUrl].some((url) => url.includes(':jerseyorbit_local@'))) {
    throw new Error(
      'DATABASE_URL uses the local development password. On your own computer, set NODE_ENV=development in server/.env. On a live server, use your own database.'
    );
  }
  return {
    production,
    databaseUrl: env.DATABASE_URL,
    ownerUrl, // for migrations and the command-line tools
    port: Number(env.PORT) || 4000,
    host: env.HOST || '127.0.0.1',
    trustProxy: readTrustProxy(env.TRUST_PROXY),
    uploadDir: readUploadDir(env.UPLOAD_DIR),
  };
}
