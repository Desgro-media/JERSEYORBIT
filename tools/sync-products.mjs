#!/usr/bin/env node
/**
 * Jersey Orbit — catalog sync
 *
 * Builds assets/js/data.js (window.JO_DATA) from the Shopify store's public JSON.
 *
 *   node tools/sync-products.mjs            # pull fresh data from the live store
 *   node tools/sync-products.mjs --cache    # rebuild from tools/cache/*.json (no network)
 *
 * Nothing here needs an API key: products.json and collections/<handle>/products.json
 * are public storefront endpoints. The script is polite (delays + retry on HTTP 429).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', 'cache');
const OUT = path.join(ROOT, 'assets', 'js', 'data.js');
const SHOP = 'https://jerseyorbit.com';
const USE_CACHE = process.argv.includes('--cache');

// Store collections we mirror (handle -> display title). Titles are tidied vs. the store
// ("Fivesleev" is a typo on the live site, "World cup collections" is shortened).
const STORE_COLLECTIONS = {
  embroidery: 'Embroidery',
  'retro-jerseys': 'Five Sleeve',
  socks: 'Socks',
  'world-cup-collections': 'World Cup 2026',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function getJSON(url, cacheName) {
  const file = path.join(CACHE, cacheName);
  if (USE_CACHE) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (res.status === 429) {
      const wait = (Number(res.headers.get('retry-after')) || 30) * 1000;
      console.log(`  429 from store, waiting ${wait / 1000}s (attempt ${attempt}/5)…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const text = await res.text();
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, text);
    await sleep(2500);
    return JSON.parse(text);
  }
  throw new Error(`Gave up on ${url} (rate limited)`);
}

/* ---------- title / text helpers ---------- */
const ACRONYMS = { fc: 'FC', ac: 'AC', psg: 'PSG', usa: 'USA', ucl: 'UCL', afc: 'AFC', rb: 'RB', ipl: 'IPL', vs: 'vs' };
function tidyTitle(raw) {
  let t = String(raw).replace(/\s+/g, ' ').trim().replace(/[\s,.;:]+$/g, '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (letters.length > 6 && upper / letters.length > 0.8) {
    t = t.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  t = t
    .replace(/\b(fivesleeve|fivesleev|five sleeve)\b/gi, 'Five Sleeve')
    .replace(/\b(longesleev|longsleeve|long sleeve)\b/gi, 'Long Sleeve')
    .replace(/\b([A-Za-z]{2,4})\b/g, (m) => ACRONYMS[m.toLowerCase()] || m)
    .replace(/\bWith The Number\b/gi, 'with the number')
    .replace(/\bEmbroidey\b/gi, 'Embroidery');
  return t;
}

const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** body_html -> array of plain-text lines (bullets / paragraphs) */
function bodyLines(html) {
  if (!html) return [];
  const t = decodeEntities(
    html
      .replace(/<\/(li|p|div|h\d|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
  return t
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim().replace(/^[•·.\-–*]+\s*/, '').replace(/^o\s+(?=[A-Za-z])/, '').trim())
    // drop the per-product delivery line: its timings can contradict the shipping policy,
    // so the storefront shows the policy timings instead
    .filter((l) => l && !/delivered within/i.test(l))
    .map(tidyLine)
    .filter((l, i, a) => a.indexOf(l) === i);
}

/** "Fit : full sleev" -> "Fit: Full sleeve", "important quality" -> "Imported quality" … */
function tidyLine(l) {
  l = l
    .replace(/^([A-Za-z ]{2,18})\s*:\s*/, (m, k) => k.trim() + ': ')
    .replace(/\bfive\s?sleev(e)?\b/gi, 'Five sleeve')
    .replace(/\bfull\s?sleev(e)?\b/gi, 'Full sleeve')
    .replace(/\blong\s?sleev(e)?\b/gi, 'Long sleeve')
    .replace(/\bimportant quality\b/gi, 'Imported quality')
    .replace(/\bdot\s?k?nit\b/gi, 'Dot knit')
    .replace(/\blongesleev(e)?\b/gi, 'Long sleeve')
    .replace(/^L(?=Fit:)/, '')
    .replace(/(sublimation|embroidery|embroidered)\s?quality(\s+quality)?/gi, (m, a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase() + ' quality')
    .replace(/^MATERIAL:/, 'Material:')
    .replace(/^Fit: Regular fit$/i, 'Fit: Regular');
  const i = l.indexOf(': ');
  if (i > 0) l = l.slice(0, i + 2) + l.charAt(i + 2).toUpperCase() + l.slice(i + 3);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL'];
const sizeRank = (s) => {
  const i = SIZE_ORDER.indexOf(String(s).toUpperCase());
  return i === -1 ? 99 : i;
};

const seasonStartYear = (title) => {
  const m = title.match(/\b((?:19|20)\d\d)\s*[-/]\s*(?:\d{2,4})\b/) || title.match(/\b((?:19|20)\d\d)\b/);
  return m ? Number(m[1]) : null;
};

/* ---------- main ---------- */
console.log(USE_CACHE ? 'Using cached JSON…' : 'Pulling live data from ' + SHOP);
const all = (await getJSON(`${SHOP}/products.json?limit=250&page=1`, 'p1.json')).products;
const memberships = {};
for (const h of Object.keys(STORE_COLLECTIONS)) {
  const c = await getJSON(`${SHOP}/collections/${h}/products.json?limit=250`, `c_${h}.json`);
  memberships[h] = new Set(c.products.map((p) => p.id));
  console.log(`  collection ${h}: ${c.products.length}`);
}

const newest = [...all].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 24);
const newestIds = new Set(newest.map((p) => p.id));

const products = all.map((p, idx) => {
  const title = tidyTitle(p.title);
  const lc = title.toLowerCase();
  const yr = seasonStartYear(title);
  const variants = p.variants
    .map((v) => ({
      id: v.id,
      s: v.option1 === 'Default Title' ? 'One Size' : String(v.option1),
      a: !!v.available,
      p: Number(v.price),
      c: v.compare_at_price ? Number(v.compare_at_price) : 0,
    }))
    .sort((a, b) => sizeRank(a.s) - sizeRank(b.s));
  const price = Math.min(...variants.map((v) => v.p));
  const compare = Math.max(0, ...variants.map((v) => v.c));

  const cols = ['all'];
  for (const h of Object.keys(STORE_COLLECTIONS)) if (memberships[h].has(p.id)) cols.push(h);
  if (/(^|\D)(2026[-/ ]?27|26[-/]27)(\D|$)/.test(title)) cols.push('2026-27');
  if (newestIds.has(p.id)) cols.push('new-drops');
  if (/\bretro\b|\bvintage\b/.test(lc) || (yr && yr <= 2018)) cols.push('retro');
  if (/\bimported\b/.test(lc)) cols.push('imported');
  if (/long sleeve|full sleeve|five sleeve/.test(lc)) cols.push('long-sleeve');
  if (/\bcollar\b|\bpolo\b/.test(lc)) cols.push('collar');
  if (/\bembroidery\b/.test(lc) && !cols.includes('embroidery')) cols.push('embroidery');
  if (p.variants.length === 1 && p.variants[0].option1 === 'Default Title' && /sock/.test(lc) && !cols.includes('socks')) cols.push('socks');

  const images = p.images.map((i) => ({ u: i.src.replace(/^https?:\/\/[^/]+/, ''), w: i.width, h: i.height }));
  return {
    id: p.id,
    h: p.handle,
    t: title,
    p: price,
    c: compare > price ? compare : 0,
    a: variants.some((v) => v.a),
    v: variants,
    i: images,
    d: bodyLines(p.body_html),
    ts: Math.floor(new Date(p.created_at).getTime() / 1000),
    o: idx,
    k: [...new Set(cols)],
  };
});

// real data only: drop products with no images (cannot be shown)
const clean = products.filter((p) => p.i.length);

const counts = {};
for (const p of clean) for (const k of p.k) counts[k] = (counts[k] || 0) + 1;

const data = {
  generated: new Date().toISOString(),
  cdn: 'https://cdn.shopify.com',
  collections: counts,
  products: clean,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '/* AUTO-GENERATED by tools/sync-products.mjs — do not edit by hand */\nwindow.JO_DATA=' + JSON.stringify(data) + ';\n');
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${clean.length} products, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log('Collection sizes:', counts);
