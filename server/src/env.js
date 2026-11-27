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

export function loadEnv(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
  const production = env.NODE_ENV === 'production';
  return {
    production,
    databaseUrl: env.DATABASE_URL,
    port: Number(env.PORT) || 4000,
    host: env.HOST || '127.0.0.1',
    trustProxy: readTrustProxy(env.TRUST_PROXY),
    uploadDir: path.resolve(SERVER_DIR, env.UPLOAD_DIR || 'uploads'),
  };
}
