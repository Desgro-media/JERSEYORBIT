/* Creates the least-privilege database login for the website:  npm run db:app-role
   Run it with the owner connection (DATABASE_OWNER_URL, or DATABASE_URL before you switch it). */
import crypto from 'node:crypto';
import { createDb } from './db.js';
import { APP_ROLE, setUpAppRole } from './db-roles.js';
import { loadEnv } from './env.js';
import { migrate } from './migrate.js';

const env = loadEnv();
const db = createDb(env.ownerUrl);
const chosen = process.env.APP_DB_PASSWORD;
const password = chosen || crypto.randomBytes(24).toString('base64url');

try {
  await migrate(db, console.log);
  await setUpAppRole(db, { password });
  const url = new URL(env.ownerUrl);
  url.username = APP_ROLE;
  url.password = chosen ? 'YOUR_APP_DB_PASSWORD' : password;
  console.log(`\nThe database login “${APP_ROLE}” is ready. Now set these in server/.env (or your host's settings):\n`);
  console.log(`DATABASE_URL=${url}`);
  console.log('DATABASE_OWNER_URL=<the connection you just used, needed for migrations and admin:create>\n');
  if (!chosen) console.log('This password is shown only now. Running the command again sets a new one.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
