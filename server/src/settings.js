/* Settings the admin panel changes: one JSON row each, with a version number so two edits cannot
   silently overwrite each other. Version 0 means nothing has been saved yet. */
import { AppError } from './errors.js';

export async function readSetting(q, key, { lock = false } = {}) {
  const row = (await q.query(`SELECT value, version FROM settings WHERE key = $1${lock ? ' FOR UPDATE' : ''}`, [key])).rows[0];
  return row ? { value: row.value, version: row.version } : { value: null, version: 0 };
}

const changedElsewhere = () =>
  new AppError(409, 'SETTINGS_CHANGED', 'These settings were changed somewhere else while you were editing. Reload the page, then make your changes again.');

/** save, if nobody else has saved since `version` was read. Returns the new version. */
export async function writeSetting(c, key, value, version) {
  const result = version
    ? await c.query('UPDATE settings SET value = $2, version = version + 1 WHERE key = $1 AND version = $3 RETURNING version', [key, JSON.stringify(value), version])
    : await c.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING version', [key, JSON.stringify(value)]);
  if (!result.rowCount) throw changedElsewhere();
  return result.rows[0].version;
}

export async function deleteSetting(c, key, version) {
  if (!version) return;
  const { rowCount } = await c.query('DELETE FROM settings WHERE key = $1 AND version = $2', [key, version]);
  if (!rowCount) throw changedElsewhere();
}
