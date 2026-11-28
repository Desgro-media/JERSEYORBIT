/* The least-privilege database login for the running website, and its row-level security policies. */

export const APP_ROLE = 'jerseyorbit_app';

/* What the website may do with each table. Anything not listed here is refused by the database.
   Note what is missing: it cannot create or delete admins or change a role, it cannot delete
   orders, and it can only add to the activity log. */
export const TABLE_GRANTS = {
  schema_migrations: 'SELECT',
  collections: 'SELECT, INSERT, UPDATE, DELETE',
  products: 'SELECT, INSERT, UPDATE, DELETE',
  product_variants: 'SELECT, INSERT, UPDATE, DELETE',
  product_images: 'SELECT, INSERT, UPDATE, DELETE',
  product_collections: 'SELECT, INSERT, UPDATE, DELETE',
  retired_products: 'SELECT, INSERT',
  admins: 'SELECT, UPDATE (password_hash)',
  admin_sessions: 'SELECT, INSERT, UPDATE, DELETE',
  orders: 'SELECT, INSERT, UPDATE',
  order_items: 'SELECT, INSERT, UPDATE',
  order_events: 'SELECT, INSERT',
  audit_log: 'SELECT, INSERT',
  settings: 'SELECT, INSERT, UPDATE, DELETE',
  site_images: 'SELECT, INSERT, DELETE',
};
const SEQUENCES = ['order_number_seq'];

const checkName = (role) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('That database role name is not allowed.');
};

export const roleExists = async (q, role) => (await q.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;

/** (re)apply exactly the permissions above. `c` must be connected as the table owner. */
export async function grantAppRole(c, role = APP_ROLE) {
  checkName(role);
  const name = `"${role}"`;
  await c.query(`GRANT USAGE ON SCHEMA public TO ${name}`);
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${name}`);
  await c.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${name}`);
  for (const [table, rights] of Object.entries(TABLE_GRANTS)) {
    await c.query(`GRANT ${rights} ON ${table} TO ${name}`);
    await c.query(`DROP POLICY IF EXISTS app_access ON ${table}`);
    await c.query(`CREATE POLICY app_access ON ${table} TO ${name} USING (true) WITH CHECK (true)`);
  }
  for (const sequence of SEQUENCES) await c.query(`GRANT USAGE ON SEQUENCE ${sequence} TO ${name}`);
}

/** create the login (or give it a new password) and its permissions, all in one transaction */
export async function setUpAppRole(db, { role = APP_ROLE, password }) {
  checkName(role);
  if (!password || password.length < 16) throw new Error('The database password needs at least 16 characters.');
  await db.tx(async (c) => {
    // CREATE ROLE takes no query parameters, so the password is quoted by the driver instead
    const verb = (await roleExists(c, role)) ? 'ALTER' : 'CREATE';
    await c.query(`${verb} ROLE "${role}" WITH LOGIN PASSWORD ${c.escapeLiteral(password)}`);
    const flags = (await c.query('SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = $1', [role])).rows[0];
    if (Object.values(flags).some(Boolean)) {
      throw new Error(`The database role “${role}” already exists with extra powers. Remove them or choose another name.`);
    }
    await grantAppRole(c, role);
  });
}
