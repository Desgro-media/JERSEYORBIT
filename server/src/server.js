/* Starts the Jersey Orbit server:  npm start */
import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadEnv } from './env.js';
import { migrate } from './migrate.js';

const env = loadEnv();
const db = createDb(env.databaseUrl);

try {
  await migrate(db, (line) => console.log(line));
} catch (err) {
  console.error(`Could not reach or prepare the database: ${err.message || err.code}`);
  console.error('Is it running? For a local database: npm run db:up');
  process.exit(1);
}

const app = await buildApp({ db, env });

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
