#!/usr/bin/env node
/**
 * Makes the site standalone: copies every product photo into assets/img/p/ (480px and 1200px wide, WebP or JPEG)
 * and rewrites assets/js/data.js to use the local files.
 *
 *   node tools/localize-images.mjs
 *
 * Safe to re-run: files that already exist are skipped. Needed only after tools/sync-products.mjs,
 * and only while the old store's image server is still reachable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'assets', 'js', 'data.js');
const OUT_DIR = path.join(ROOT, 'assets', 'img', 'p');
const SIZES = [480, 1200];
const CONCURRENCY = 6;

const raw = fs.readFileSync(DATA_FILE, 'utf8');
const data = JSON.parse(raw.slice(raw.indexOf('window.JO_DATA=') + 'window.JO_DATA='.length).trim().replace(/;$/, ''));
if (!data.cdn) {
  console.log('data.js already uses local images — nothing to do.');
  process.exit(0);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jobs = [];
const planned = [];
for (const p of data.products) {
  p.i.forEach((im, n) => {
    const base = `${p.id}-${n}`;
    const pair = SIZES.map((w) => ({ url: `${data.cdn}${im.u}${im.u.includes('?') ? '&' : '?'}width=${w}`, name: `${base}-${w}`, saved: '' }));
    jobs.push(...pair);
    planned.push({ im, pair });
  });
}

let done = 0;
const failed = [];
async function fetchOne(job) {
  for (const ext of ['webp', 'jpg']) {
    const f = path.join(OUT_DIR, `${job.name}.${ext}`);
    if (fs.existsSync(f) && fs.statSync(f).size > 0) return void (job.saved = `assets/img/p/${job.name}.${ext}`);
  }
  let why = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(job.url, { headers: { accept: 'image/webp' } });
      const type = res.headers.get('content-type') || '';
      const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : '';
      if (res.ok && ext) {
        fs.writeFileSync(path.join(OUT_DIR, `${job.name}.${ext}`), Buffer.from(await res.arrayBuffer()));
        job.saved = `assets/img/p/${job.name}.${ext}`;
        return;
      }
      why = `HTTP ${res.status} ${type}`;
    } catch (e) {
      why = e.message;
    }
    await sleep(attempt * 2500);
  }
  failed.push(`${job.url} -> ${why}`);
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      await fetchOne(queue.shift());
      if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
    }
  })
);

if (failed.length) {
  console.error(`${failed.length} downloads failed; data.js left unchanged. Run again to retry.`);
  console.error(failed.slice(0, 10).join('\n'));
  process.exit(1);
}

// s = small (480px) file, l = large (1200px) file
for (const { im, pair } of planned) {
  im.s = pair[0].saved;
  im.l = pair[1].saved;
  delete im.u;
}
data.cdn = '';
fs.writeFileSync(DATA_FILE, '/* AUTO-GENERATED catalog — see tools/ */\nwindow.JO_DATA=' + JSON.stringify(data) + ';\n');
const bytes = fs.readdirSync(OUT_DIR).reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(`Localized ${planned.length} photos (${jobs.length} files, ${(bytes / 1048576).toFixed(1)} MB) and updated data.js`);
