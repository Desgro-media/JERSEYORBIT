#!/usr/bin/env node
/**
 * Generates the thin HTML shells for the content pages (the real content is rendered by assets/js/pages.js).
 *   node tools/make-pages.mjs
 * index.html, shop.html and product.html are hand-written because they carry extra scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pages = {
  checkout: ['Checkout — Jersey Orbit', 'Enter your delivery details and send your order on WhatsApp.'],
  cart: ['Your cart — Jersey Orbit', 'Review the jerseys in your cart and send your order on WhatsApp.'],
  about: ['About us — Jersey Orbit', 'Jersey Orbit — the centre of your football universe. Premium jerseys from Kerala, delivered across India.'],
  contact: ['Contact us — Jersey Orbit', 'Questions about a jersey, size or order? Message Jersey Orbit on WhatsApp or email.'],
  faq: ['FAQ — Jersey Orbit', 'Answers about delivery, shipping charges, tracking, returns and sizes.'],
  track: ['Order tracking — Jersey Orbit', 'Track your Jersey Orbit order — we share a tracking ID on WhatsApp or email once it ships.'],
  reviews: ['Customer reviews — Jersey Orbit', 'What football fans say about Jersey Orbit.'],
  policies: ['Policies — Jersey Orbit', 'Shipping and return & refund policies.'],
  '404': ['Page not found — Jersey Orbit', 'This page could not be found.'],
};

const tpl = (key, title, desc) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="assets/img/favicon.png" type="image/png">
<link rel="preload" href="assets/fonts/fjalla-one-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/poppins-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/fonts.css">
<link rel="stylesheet" href="assets/css/main.css">
<script defer src="assets/js/config.js"></script>
<script defer src="assets/js/data.js"></script>
<script defer src="assets/js/content.js"></script>
<script defer src="assets/js/core.js"></script>
<script defer src="assets/js/ui.js"></script>
<script defer src="assets/js/pages.js"></script>
</head>
<body data-page="${key}">
<main id="main"></main>
</body>
</html>
`;

for (const [key, [title, desc]] of Object.entries(pages)) {
  fs.writeFileSync(path.join(ROOT, `${key}.html`), tpl(key, title, desc));
  console.log('wrote', `${key}.html`);
}
