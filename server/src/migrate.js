/* Applies the .sql files in server/migrations that have not run yet, in name order. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDb } from './db.js';
import { loadEnv, MIGRATIONS_DIR } from './env.js';

export async function migrate(db, log = () => {}) {
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727201)'); // two deploys must not migrate at once
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const name of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      await c.query(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      log(`applied ${name}`);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb(loadEnv().databaseUrl);
  try {
    await migrate(db, console.log);
    console.log('Database is up to date.');
  } finally {
    await db.close();
  }
}
