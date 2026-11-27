/* Reads the storefront's own data files, so the server and the website never disagree.
   Only files from this repository are ever evaluated here. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './env.js';

function readWindowGlobal(file, name) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file, timeout: 1000 });
  // copy out of the sandbox so the arrays and objects behave like ordinary ones
  return JSON.parse(JSON.stringify(sandbox.window[name]));
}

const CONFIG_FILE = path.join(ROOT, 'assets', 'js', 'config.js');
let cached = null;

/** assets/js/config.js, re-read whenever the file changes, so fees on screen and on orders stay equal. */
export function shopConfig() {
  const mtime = fs.statSync(CONFIG_FILE).mtimeMs;
  if (!cached || cached.mtime !== mtime) cached = { mtime, value: readWindowGlobal(CONFIG_FILE, 'JO_CONFIG') };
  return cached.value;
}

/** The catalog committed with the website (used once, to fill the database). */
export const staticCatalog = () => readWindowGlobal(path.join(ROOT, 'assets', 'js', 'data.js'), 'JO_DATA');
