/* Admin passwords, sign-in sessions and roles, using only Node's built-in crypto. */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { record } from './audit.js';
import { invalid } from './errors.js';

const scrypt = promisify(crypto.scrypt);
// one of the settings OWASP lists as its minimum for scrypt: 32 MB of memory, 3 passes
const COST = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
export const SESSION_HOURS = 12; // signed out after this long, however busy
export const IDLE_MINUTES = 60; // and after this long without doing anything
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;
export const ROLES = ['owner', 'staff'];

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

/** true for a hash made with older, weaker settings */
const needsRehash = (stored) => stored.split('$').slice(1, 4).join() !== [COST.N, COST.r, COST.p].join();

/** why a new password is not acceptable, or null */
export function passwordProblem(password, username) {
  if (password.length < MIN_PASSWORD) return `Password: at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Password: at most ${MAX_PASSWORD} characters.`;
  if (username && password.toLowerCase().includes(username)) return 'Password: it must not contain the username.';
  if (new Set(password).size < 5) return 'Password: too simple. Use more different characters.';
  return null;
}

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function startSession(q, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q.query('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))', [hashToken(token), adminId, SESSION_HOURS]);
  return token;
}

let decoy; // checked when the username is unknown, so both failures take the same time

/** { ok: true, token, admin } or { ok: false, username } — the username is empty unless it exists */
export async function login(db, username, password) {
  const admin = (await db.query('SELECT * FROM admins WHERE username = $1', [String(username).trim().toLowerCase()])).rows[0];
  decoy ||= hashPassword(crypto.randomBytes(24).toString('base64'));
  const ok = await verifyPassword(password, admin ? admin.password_hash : await decoy);
  if (!admin || !ok) return { ok: false, username: admin?.username || '' };
  if (needsRehash(admin.password_hash)) {
    // this is the only moment the password is known, so older hashes are strengthened here
    await db.query('UPDATE admins SET password_hash = $2 WHERE id = $1', [admin.id, await hashPassword(password)]);
  }
  await db.query('DELETE FROM admin_sessions WHERE expires_at < now() OR last_seen_at < now() - make_interval(mins => $1)', [IDLE_MINUTES]);
  const token = await startSession(db, admin.id);
  return { ok: true, token, admin: { id: admin.id, username: admin.username, role: admin.role } };
}

/** the signed-in admin for this cookie, or null. Each use restarts the idle clock. */
export async function sessionAdmin(db, token) {
  if (!token) return null;
  // the role is read from the database every time, so a change applies at once
  const { rows } = await db.query(
    `UPDATE admin_sessions s SET last_seen_at = now() FROM admins a
      WHERE s.token_hash = $1 AND a.id = s.admin_id
        AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $2)
      RETURNING a.id, a.username, a.role`,
    [hashToken(token), IDLE_MINUTES]
  );
  return rows[0] || null;
}

export const logout = (db, token) => token && db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)]);

/** signs out every other device and returns how many sessions ended */
export async function revokeOtherSessions(db, by, token) {
  return db.tx(async (c) => {
    const { rowCount } = await c.query('DELETE FROM admin_sessions WHERE admin_id = $1 AND token_hash <> $2', [by.id, hashToken(token)]);
    await record(c, by, 'auth.sessions_revoked', { summary: `Signed out ${rowCount} other session(s)` });
    return rowCount;
  });
}

/** checks the current password, sets the new one and replaces every session. Returns the new token. */
export async function changePassword(db, by, currentPassword, newPassword) {
  const admin = (await db.query('SELECT password_hash FROM admins WHERE id = $1', [by.id])).rows[0];
  if (!admin || !(await verifyPassword(currentPassword, admin.password_hash))) throw invalid('Your current password is not correct.');
  const problem = passwordProblem(newPassword, by.username);
  if (problem) throw invalid(problem);
  if (newPassword === currentPassword) throw invalid('Choose a password you are not already using.');
  const hash = await hashPassword(newPassword);
  return db.tx(async (c) => {
    await c.query('UPDATE admins SET password_hash = $2 WHERE id = $1', [by.id, hash]);
    // the cookie in use is replaced too, in case a copy of it was taken
    await c.query('DELETE FROM admin_sessions WHERE admin_id = $1', [by.id]);
    await record(c, by, 'auth.password_changed', { summary: 'Password changed; all sessions replaced' });
    return startSession(c, by.id);
  });
}

/* ---------- command line only: these need the owner database connection ---------- */

const COMMAND_LINE = { username: 'command line' };
const tidyUsername = (username) => String(username).trim().toLowerCase();
const countOwners = async (c) => (await c.query("SELECT count(*) AS n FROM admins WHERE role = 'owner'")).rows[0].n;

/** creates an admin, or sets a new password (and role, if given) for an existing one and signs them out everywhere */
export async function upsertAdmin(db, username, password, role) {
  const name = tidyUsername(username);
  if (!/^[a-z0-9._-]{3,40}$/.test(name)) throw new Error('Username: 3 to 40 characters, using letters, numbers, dot, dash or underscore.');
  const problem = passwordProblem(String(password), name);
  if (problem) throw new Error(problem);
  if (role && !ROLES.includes(role)) throw new Error('Role: owner or staff.');
  const hash = await hashPassword(password);
  return db.tx(async (c) => {
    await c.query('LOCK TABLE admins IN EXCLUSIVE MODE'); // two commands at once must not leave no owner
    const existing = (await c.query('SELECT role FROM admins WHERE username = $1', [name])).rows[0];
    const owners = await countOwners(c);
    // the first account runs the shop; later ones get the smaller role unless told otherwise
    const finalRole = role || existing?.role || (owners ? 'staff' : 'owner');
    if (finalRole !== 'owner' && (existing?.role === 'owner' ? owners === 1 : owners === 0)) {
      throw new Error('The shop needs at least one owner.');
    }
    const { rows } = await c.query(
      `INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role
       RETURNING id, (xmax = 0) AS created`,
      [name, hash, finalRole]
    );
    await c.query('DELETE FROM admin_sessions WHERE admin_id = $1', [rows[0].id]);
    await record(c, COMMAND_LINE, 'admin.saved', {
      target: `admin:${name}`,
      summary: `${rows[0].created ? 'Created' : 'Reset the password of'} ${finalRole} “${name}”`,
    });
    return { id: rows[0].id, username: name, role: finalRole, created: rows[0].created };
  });
}

export async function removeAdmin(db, username) {
  const name = tidyUsername(username);
  return db.tx(async (c) => {
    await c.query('LOCK TABLE admins IN EXCLUSIVE MODE');
    const admin = (await c.query('SELECT id, role FROM admins WHERE username = $1', [name])).rows[0];
    if (!admin) throw new Error(`There is no admin called “${name}”.`);
    if (admin.role === 'owner' && (await countOwners(c)) === 1) throw new Error('The shop needs at least one owner.');
    await c.query('DELETE FROM admins WHERE id = $1', [admin.id]); // their sessions go with them
    await record(c, COMMAND_LINE, 'admin.removed', { target: `admin:${name}`, summary: `Removed ${admin.role} “${name}”` });
    return { username: name, role: admin.role };
  });
}
