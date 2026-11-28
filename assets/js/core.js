/* Jersey Orbit — core: utilities, catalog index, search, cart store. No DOM building here (see ui.js). */
(function () {
  'use strict';
  const CFG = window.JO_CONFIG;
  const DATA = window.JO_DATA || { products: [], collections: {} };
  const JO = (window.JO = { cfg: CFG, data: DATA });

  /* Collections made in the admin panel arrive with the catalog (the built-in ones are in config.js).
     They are listed just before "All Collection". */
  (DATA.categories || []).forEach((c) => {
    if (CFG.categories.some((x) => x.key === c.key)) return;
    CFG.categories.splice(Math.max(0, CFG.categories.findIndex((x) => x.key === 'all')), 0, c);
  });

  /* ---------- tiny helpers ---------- */
  JO.$ = (s, r = document) => r.querySelector(s);
  JO.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  JO.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  JO.money = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  JO.debounce = (fn, ms = 120) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  JO.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  const bus = {};
  JO.on = (ev, fn) => ((bus[ev] = bus[ev] || []).push(fn), fn);
  JO.emit = (ev, d) => (bus[ev] || []).forEach((fn) => fn(d));

  /* ---------- order server ----------
     Resolves to { ok, status, data } when the order server answers. Resolves to null when there is no
     server (plain static hosting) or it can't be reached, so the page can fall back to WhatsApp. */
  JO.api = async (path, body, ms = 8000) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ms);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: stop.signal });
      const data = await res.json();
      if (res.ok) return { ok: true, status: res.status, data };
      return res.status < 500 && data && data.error && data.error !== 'NOT_FOUND' ? { ok: false, status: res.status, data } : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  /** reads from the order server. Resolves to null when there is none, or it can't answer. */
  JO.getJson = async (path, ms = 8000) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ms);
    try {
      const res = await fetch(path, { signal: stop.signal, cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  /** a random id (crypto.randomUUID only exists on https and localhost) */
  JO.uuid = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
  /** digits only, without a leading 91 or 0 */
  JO.normPhone = (s) => String(s).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

  /* ---------- urls ---------- */
  JO.url = {
    product: (p) => 'product.html?p=' + encodeURIComponent(p.h),
    shop: (key) => (key && key !== 'all' ? 'shop.html?c=' + encodeURIComponent(key) : 'shop.html'),
  };
  JO.wa = (text) => `https://wa.me/${CFG.contact.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  JO.absUrl = (rel) => new URL(rel, location.href).href;

  /* sizes as shoppers think of them: some jerseys are labelled XXL, others 2XL (same as server/src/sizes.js) */
  const SAME_SIZE = { XXL: '2XL', XXXL: '3XL' };
  JO.sizeKey = (s) => {
    const k = String(s).trim().toUpperCase();
    return SAME_SIZE[k] || k;
  };

  /* ---------- images (local files: s = 480px wide, l = 1200px wide) ---------- */
  JO.img = (im, w) => (w <= 520 ? im.s : im.l);
  JO.imgTag = (im, o = {}) => {
    const thumb = Math.max(...(o.widths || [960])) <= 520; // thumbnails never need the large file
    const ar = im.w && im.h ? ` width="${Math.round(im.w / 6)}" height="${Math.round(im.h / 6)}"` : '';
    const set = thumb ? '' : ` srcset="${im.s} 480w, ${im.l} 1200w" sizes="${o.sizes || '50vw'}"`;
    return `<img class="${o.cls || ''}" src="${im.s}"${set} alt="${JO.esc(o.alt || '')}"${ar} ${o.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  };

  /* ---------- catalog ---------- */
  const products = DATA.products;
  JO.products = products;

  /* ---------- sleeve length ----------
     The catalog has no sleeve field, so it is read from the title and the "Fit:" line:
     "long sleeve" or "full sleeve" -> full-sleeve; "five sleeve" -> neither (it has its own category);
     every other jersey -> half-sleeve. Socks are skipped. */
  const SLEEVE_KEYS = ['full-sleeve', 'half-sleeve'];
  SLEEVE_KEYS.forEach((k) => (DATA.collections[k] = 0));
  products.forEach((p) => {
    if (p.k.includes('socks')) return;
    const text = [p.t, ...p.d.filter((l) => /^fit:/i.test(l))].join(' | ');
    if (/five[\s-]*sleeve/i.test(text)) return;
    const key = /(long|full)[\s-]*sleeve/i.test(text) ? 'full-sleeve' : 'half-sleeve';
    p.k.push(key);
    DATA.collections[key]++;
  });

  const byId = new Map(),
    byHandle = new Map(),
    byVid = new Map();
  products.forEach((p) => {
    byId.set(p.id, p);
    byHandle.set(p.h, p);
    p.v.forEach((v) => byVid.set(v.id, { v, p }));
  });
  JO.byId = (id) => byId.get(Number(id));
  JO.byHandle = (h) => byHandle.get(h);
  JO.byVid = (id) => byVid.get(Number(id));
  JO.col = (key) => (!key || key === 'all' ? products : products.filter((p) => p.k.includes(key)));
  JO.cat = (key) => CFG.categories.find((c) => c.key === key);
  JO.catTitle = (key) => (JO.cat(key) || {}).title || 'Category';
  JO.catCount = (key) => (key === 'all' ? products.length : DATA.collections[key] || 0);
  JO.pct = (p) => (p.c && p.c > p.p ? Math.round((1 - p.p / p.c) * 100) : 0);
  JO.dataAge = () => new Date(DATA.generated || Date.now()).getTime();
  JO.isNew = (p) => p.ts * 1000 > JO.dataAge() - 14 * 864e5;
  JO.availableSizes = (p) => p.v.filter((v) => v.a);

  const catImgCache = {};
  /** a good-looking, DISTINCT representative image for each category (first in-stock portrait product not used yet),
      unless a thumbnail was chosen for it in the admin panel */
  JO.catImage = (key) => {
    const chosen = DATA.categoryImages;
    if (chosen && Object.prototype.hasOwnProperty.call(chosen, key)) return chosen[key];
    if (!Object.keys(catImgCache).length) {
      const used = new Set();
      const portrait = (p) => p.i[0] && p.i[0].w / p.i[0].h > 0.72 && p.i[0].w / p.i[0].h < 0.8;
      CFG.categories.forEach((c) => {
        const list = JO.col(c.key);
        const pick = list.find((p) => p.a && portrait(p) && !used.has(p.id)) || list.find((p) => p.a && !used.has(p.id)) || list.find((p) => !used.has(p.id)) || list[0];
        if (pick) {
          used.add(pick.id);
          catImgCache[c.key] = pick.i[0];
        }
      });
    }
    return catImgCache[key] || (products[0] && products[0].i[0]) || null;
  };
  JO.catProducts = (key, n) => JO.col(key).filter((p) => p.a).slice(0, n);

  /* The two photos on a home page slide: the ones chosen in the admin panel, and automatic picks
     (portrait jerseys on sale from the slide's collection) in any empty place. Returns two places;
     one stays empty (null) if there is nothing to show. The admin preview runs this same code. */
  JO.heroPhotos = (slide) => {
    const chosen = slide.photos || [];
    const used = new Set(chosen.filter(Boolean).map((c) => c.p));
    const auto = JO.catProducts(slide.key, 12).filter((p) => p.i[0].w / p.i[0].h < 0.8 && !used.has(p.h));
    return [0, 1].map((place) => {
      const c = chosen[place];
      if (c) return { img: c, href: c.p ? JO.url.product({ h: c.p }) : JO.url.shop(slide.key), alt: c.t || slide.title };
      const p = auto.shift();
      return p ? { img: p.i[0], href: JO.url.product(p), alt: p.t } : null;
    });
  };

  const STOP = new Set('kit jersey home away third season edition embroidery premium retro fan with the of and fc ac special imported collar five sleeve long full 2026 2025 2024'.split(' '));
  JO.similar = (p, n = 10) => {
    const toks = (t) => norm(t).split(' ').filter((x) => x.length > 2 && !STOP.has(x) && !/^s\d{4}$/.test(x) && !/^\d+$/.test(x));
    const mine = new Set(toks(p.t));
    return products
      .filter((q) => q.id !== p.id)
      .map((q) => {
        let s = 0;
        toks(q.t).forEach((x) => mine.has(x) && (s += 3));
        q.k.forEach((k) => p.k.includes(k) && k !== 'all' && k !== 'new-drops' && !SLEEVE_KEYS.includes(k) && (s += 0.6));
        if (q.a) s += 0.5;
        return { q, s };
      })
      .filter((x) => x.s > 1)
      .sort((a, b) => b.s - a.s || a.q.o - b.q.o)
      .slice(0, n)
      .map((x) => x.q);
  };

  /* ---------- search ---------- */
  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .replace(/(?:19|20)?(\d\d)\s*[\/\-–]\s*(?:19|20)?(\d\d)\b/g, ' s$1$2 ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  JO.norm = norm;
  products.forEach((p) => (p._n = norm(p.t)) && (p._t = p._n.split(' ')));
  JO.search = (q, limit = 500) => {
    const qt = norm(q).split(' ').filter(Boolean);
    if (!qt.length) return [];
    const syn = CFG.synonyms || {};
    const has = (toks, t) => toks.some((x) => x.startsWith(t));
    const out = [];
    for (const p of products) {
      let score = 0,
        ok = true;
      for (const t of qt) {
        if (p._t.includes(t)) score += 3;
        else if (has(p._t, t)) score += 2;
        else if (syn[t] && syn[t].length && syn[t].every((s) => has(p._t, s))) score += 1;
        else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (p._n.startsWith(qt[0])) score += 2;
      if (p.a) score += 0.5;
      out.push({ p, score });
    }
    out.sort((a, b) => b.score - a.score || a.p.o - b.p.o);
    return out.slice(0, limit).map((x) => x.p);
  };

  /* ---------- shipping fee (lines = cart lines or "buy it now" lines) ---------- */
  JO.jerseyCount = (lines) => lines.reduce((n, l) => n + (l.p.k.includes('socks') ? 0 : l.qty), 0);
  JO.freeShip = (lines) => CFG.freeShippingJerseys > 0 && JO.jerseyCount(lines) >= CFG.freeShippingJerseys;
  JO.shippingFee = (lines) => (JO.freeShip(lines) ? 0 : CFG.shippingFee);

  /* ---------- delivery estimate (business days, Mon–Sat) ---------- */
  JO.addBizDays = (from, n) => {
    const d = new Date(from);
    while (n > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) n--;
    }
    return d;
  };
  JO.fmtDay = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  /* ---------- cart ---------- */
  const KEY = 'jo_cart_v1';
  const MAX_QTY = 10;
  let state = JO.store.get(KEY, { items: [], note: '' });
  if (!state || !Array.isArray(state.items)) state = { items: [], note: '' };
  state.items = state.items.filter((i) => byVid.has(i.v));
  const save = () => JO.store.set(KEY, state);

  const cart = (JO.cart = {
    lines() {
      return state.items
        .map((i) => {
          const r = byVid.get(i.v);
          if (!r) return null;
          const { v, p } = r;
          return { vid: v.id, p, v, qty: i.q, price: v.p, compare: v.c > v.p ? v.c : 0, size: v.s, img: p.i[0], oos: !v.a };
        })
        .filter(Boolean);
    },
    count: () => state.items.reduce((n, i) => n + i.q, 0),
    subtotal() {
      return this.lines().reduce((n, l) => n + l.price * l.qty, 0);
    },
    savings() {
      return this.lines().reduce((n, l) => n + (l.compare ? (l.compare - l.price) * l.qty : 0), 0);
    },
    get note() {
      return state.note || '';
    },
    add(vid, qty = 1) {
      const r = byVid.get(Number(vid));
      if (!r || !r.v.a) return false;
      const it = state.items.find((i) => i.v === r.v.id);
      if (it) it.q = Math.min(MAX_QTY, it.q + qty);
      else state.items.push({ v: r.v.id, q: Math.min(MAX_QTY, qty) });
      save();
      JO.emit('cart', { added: r.v.id });
      return true;
    },
    set(vid, qty) {
      const it = state.items.find((i) => i.v === Number(vid));
      if (!it) return;
      if (qty <= 0) return this.remove(vid);
      it.q = Math.min(MAX_QTY, qty);
      save();
      JO.emit('cart', {});
    },
    remove(vid) {
      state.items = state.items.filter((i) => i.v !== Number(vid));
      save();
      JO.emit('cart', {});
    },
    clear() {
      state.items = [];
      save();
      JO.emit('cart', {});
    },
    setNote(t) {
      state.note = String(t || '').slice(0, 500);
      save();
    },
    MAX_QTY,
    /** our own checkout page; pass [{ v, q }] for "Buy it now" so the cart is left alone */
    checkoutUrl(items) {
      return items && items.length ? `checkout.html?buy=${items[0].v}:${items[0].q}` : 'checkout.html';
    },
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = JO.store.get(KEY, { items: [], note: '' });
    JO.emit('cart', { external: true });
  });

  /* ---------- recently viewed ---------- */
  JO.recent = {
    get: () => JO.store.get('jo_recent_v1', []).map(JO.byId).filter(Boolean),
    push(id) {
      const l = JO.store.get('jo_recent_v1', []).filter((x) => x !== id);
      l.unshift(id);
      JO.store.set('jo_recent_v1', l.slice(0, 12));
    },
  };
})();
