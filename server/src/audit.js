/* The activity log. The database only lets rows be added to it.
   Never put passwords, session tokens or customer details in an entry. */

const PAGE_SIZE = 50;
export const AUDIT_AREAS = ['auth', 'product', 'photo', 'collection', 'order', 'storefront', 'wildcard', 'admin'];

const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Write one entry. Pass the transaction's client as `q`, so that a change and its record are saved
 * together or not at all. `by` says who: { username, ip }.
 */
export const record = (q, by, action, { target = '', summary = '', details = {} } = {}) =>
  q.query('INSERT INTO audit_log (actor, action, target, summary, details, ip) VALUES ($1, $2, $3, $4, $5, $6)', [
    by?.username || '',
    action,
    target,
    short(summary, 600),
    JSON.stringify(details),
    by?.ip || '',
  ]);

export async function listAudit(db, { area, page = 1 }) {
  const params = [];
  let clause = '';
  if (area) {
    params.push(`${area}.%`);
    clause = 'WHERE action LIKE $1';
  }
  const total = (await db.query(`SELECT count(*) AS n FROM audit_log ${clause}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT id, created_at, actor, action, target, summary, ip FROM audit_log ${clause}
      ORDER BY id DESC LIMIT $${params.push(PAGE_SIZE)} OFFSET $${params.push((page - 1) * PAGE_SIZE)}`,
    params
  );
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    entries: rows.map((r) => ({ id: r.id, at: r.created_at, actor: r.actor, action: r.action, target: r.target, summary: r.summary, ip: r.ip })),
  };
}
