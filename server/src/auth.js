/* Admin passwords and sign-in sessions, using only Node's built-in crypto. */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
export const SESSION_HOURS = 12;
export const MIN_PASSWORD = 12;

const derive = (password, salt, { N, r, p }) => scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: 128 * N * r * 2 });

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, key] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const sha256 = (token) => crypto.createHash('sha256').update(token).digest('hex');

let decoy; // checked when the username is unknown, so both failures take the same time

export async function login(db, username, password) {
  const admin = (await db.query('SELECT * FROM admins WHERE username = $1', [String(username).trim().toLowerCase()])).rows[0];
  decoy ||= hashPassword(crypto.randomBytes(24).toString('base64'));
  const ok = await verifyPassword(password, admin ? admin.password_hash : await decoy);
  if (!admin || !ok) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query('DELETE FROM admin_sessions WHERE expires_at < now()');
  await db.query('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))', [sha256(token), admin.id, SESSION_HOURS]);
  return { token, admin: { id: admin.id, username: admin.username } };
}

export async function sessionAdmin(db, token) {
  if (!token) return null;
  const { rows } = await db.query(
    'SELECT a.id, a.username FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [sha256(token)]
  );
  return rows[0] || null;
}

export const logout = (db, token) => token && db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);

/** creates an admin, or sets a new password for an existing one and signs them out everywhere */
export async function upsertAdmin(db, username, password) {
  const name = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(name)) throw new Error('Username: 3 to 40 characters, using letters, numbers, dot, dash or underscore.');
  if (String(password).length < MIN_PASSWORD) throw new Error(`Password: at least ${MIN_PASSWORD} characters.`);
  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash
     RETURNING id, (xmax = 0) AS created`,
    [name, hash]
  );
  await db.query('DELETE FROM admin_sessions WHERE admin_id = $1', [rows[0].id]);
  return { id: rows[0].id, username: name, created: rows[0].created };
}
