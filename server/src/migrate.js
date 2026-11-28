/* Applies the .sql files in server/migrations that have not run yet, in name order. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDb } from './db.js';
import { APP_ROLE, grantAppRole, roleExists } from './db-roles.js';
import { loadEnv, MIGRATIONS_DIR } from './env.js';

const files = () => fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

/** the migrations still to run. Only reads, so the least-privilege login can ask. */
export async function pendingMigrations(db) {
  if (!(await db.query("SELECT to_regclass('schema_migrations') AS t")).rows[0].t) return files();
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  return files().filter((name) => !done.has(name));
}

export async function migrate(db, log = () => {}) {
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727201)'); // two deploys must not migrate at once
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    let applied = 0;
    for (const name of files()) {
      if (done.has(name)) continue;
      await c.query(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      applied++;
      log(`applied ${name}`);
    }
    // new tables need permissions for the website's own login, if that login is in use
    if (applied && (await roleExists(c, APP_ROLE))) await grantAppRole(c);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDb(loadEnv().ownerUrl);
  try {
    await migrate(db, console.log);
    console.log('Database is up to date.');
  } finally {
    await db.close();
  }
}
