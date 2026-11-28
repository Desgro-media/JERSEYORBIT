/* Starts the Jersey Orbit server:  npm start */
import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { migrate, pendingMigrations } from './migrate.js';

const env = loadEnv();
const db = createDb(env.databaseUrl);

try {
  // the least-privilege login can check this, but only the owner can apply a migration
  if ((await pendingMigrations(db)).length) await migrate(db, (line) => console.log(line));
} catch (err) {
  console.error(`Could not reach or prepare the database: ${err.message || err.code}`);
  if (err.code === '42501') console.error('This login may not change the database. Run "npm run db:migrate" with DATABASE_OWNER_URL set.');
  else console.error('Is it running? For a local database: npm run db:up');
  process.exit(1);
}

const app = await buildApp({ db, env });

if (!env.production) app.log.warn('DEVELOPMENT MODE: for your own computer only. A live shop must run with NODE_ENV=production.');

const { products, admins } = (
  await db.query('SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM admins) AS admins')
).rows[0];
if (!products) app.log.warn('The catalog is empty. Fill it with: npm run db:seed');
if (!admins) app.log.warn('There is no admin account yet. Create one with: npm run admin:create');

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await db.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
