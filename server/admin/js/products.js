/* The product list: find, sort, reorder, and change many products at once. */
import { $, $$, api, busy, chips, esc, isOwner, listUrl, money, nav, options, pager, pastLastPage, photoSrc, plural, tag, toast, view, wireList } from './lib.js';
import { titled } from './help.js';

const FILTERS = [['', 'All'], ['published', 'On website'], ['hidden', 'Hidden'], ['soldout', 'Sold out'], ['lowstock', 'Low stock']];
const SORTS = [
  ['', 'Featured order'],
  ['newest', 'Newest first'],
  ['name', 'Name A–Z'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
  ['stock', 'Lowest stock first'],
];
const PAGE_SIZES = [['', '25 per page'], ['50', '50 per page'], ['100', '100 per page']];

/* `args` names the extra boxes an action needs. `ask` is the question to confirm first. */
const BULK = {
  publish: { label: 'Show on website' },
  hide: { label: 'Hide from website', ask: (n) => `Hide ${n} from the website?` },
  feature: { label: 'Move to the top of Featured' },
  'set-price': {
    label: 'Set price',
    args: 'price',
    ask: (n, a) => `Set every size of ${n} to ${money(a.price)}, ${a.compareAt ? `was ${money(a.compareAt)}` : 'with no “was” price'}?`,
  },
  discount: { label: 'Take a % off', args: 'percent', ask: (n, a) => `Take ${a.percent}% off every size of ${n}? The old price will show struck through.` },
  'end-sale': { label: 'End sale (back to “was” price)', ask: (n) => `Put every size of ${n} back to its “was” price? Those prices go UP.` },
  'sizes-off': { label: 'Mark all sizes sold out', ask: (n) => `Mark every size of ${n} as sold out?` },
  'sizes-on': { label: 'Put all sizes on sale', ask: (n) => `Put every size of ${n} on sale? Sizes with a stock count of 0 stay sold out.` },
  'add-collection': { label: 'Add to a collection', args: 'collection' },
  'remove-collection': { label: 'Remove from a collection', args: 'collection', ask: (n) => `Remove ${n} from that collection?` },
  delete: { label: 'Delete for good', ownerOnly: true, ask: (n) => `Delete ${n} for good? Their sizes and uploaded photos are removed. This cannot be undone.` },
};

const argFields = (kind, collections) =>
  ({
    price: '<label class="field">Price ₹<input data-arg="price" type="number" min="1" step="0.01"></label><label class="field">Was ₹ (optional)<input data-arg="compareAt" type="number" min="0" step="0.01" placeholder="none"></label>',
    percent: '<label class="field">Percent off<input data-arg="percent" type="number" min="1" max="90" step="1"></label>',
    collection: `<label class="field">Collection<select data-arg="collection">${options([['', 'Choose…'], ...collections.map((c) => [c.key, c.title])])}</select></label>`,
  })[kind] || '';

function readArgs(kind, box) {
  const value = (name) => $(`[data-arg="${name}"]`, box).value.trim();
  if (kind === 'price') {
    const price = Number(value('price'));
    if (!(price > 0)) throw new Error('Enter the new price.');
    return { price, compareAt: value('compareAt') ? Number(value('compareAt')) : null };
  }
  if (kind === 'percent') {
    const percent = Number(value('percent'));
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw new Error('Enter a whole number from 1 to 90.');
    return { percent };
  }
  if (kind === 'collection') {
    if (!value('collection')) throw new Error('Choose a collection.');
    return { collection: value('collection') };
  }
  return {};
}

const priceText = (p) => (p.price === p.priceMax ? money(p.price) : `${money(p.price)} – ${money(p.priceMax)}`);

const productRow = (p, movable) => `<li class="product-row">
  <label class="pick"><input type="checkbox" data-pick value="${p.id}" aria-label="Select ${esc(p.title)}"></label>
  <a href="#/products/${p.id}">
    ${p.image ? `<img src="${esc(photoSrc(p.image))}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
    <span><b>${esc(p.title)}</b><br><span class="small muted">${esc(p.sizesOnSale)} of ${esc(plural(p.sizes, 'size'))} on sale · ${p.stock === null ? 'stock not counted' : `${esc(p.stock)} in stock`}</span></span>
    <span class="num">${priceText(p)}</span>
    <span class="tags">${p.published ? '' : tag('hidden', 'Hidden')}${p.sellable ? '' : tag('soldout', 'Sold out')}${p.sellable && p.lowStock ? tag('pending', 'Low stock') : ''}</span>
  </a>
  ${
    movable
      ? `<span class="movers"><button type="button" class="btn btn--outline btn--xs" data-move="up" data-id="${p.id}" aria-label="Move ${esc(p.title)} up">▲</button><button type="button" class="btn btn--outline btn--xs" data-move="down" data-id="${p.id}" aria-label="Move ${esc(p.title)} down">▼</button></span>`
      : ''
  }
</li>`;

export default async function productList(draw, params) {
  const [collections, data] = await Promise.all([api('GET', '/collections'), api('GET', '/products?' + params)]);
  if (pastLastPage('products', data, params, data.products.length)) return;
  // the arrows only make sense when the list shows the Featured order itself, with nothing left out
  const movable = !['sort', 'q', 'filter', 'collection'].some((k) => params.get(k));
  const actions = Object.entries(BULK).filter(([, a]) => !a.ownerOnly || isOwner());
  const drawn = draw(
    'Products',
    `<div class="head">${titled('h1', 'Products', 'products-list')}<a class="btn" href="#/products/new">Add product</a></div>
    ${chips('products', params, 'filter', FILTERS)}
    <div class="toolbar">
      <form class="search" role="search"><input name="q" type="search" placeholder="Search by name" aria-label="Search products" value="${esc(params.get('q') || '')}"><button class="btn">Search</button></form>
      <select data-param="collection" aria-label="Collection">${options([['', 'All collections'], ...collections.map((c) => [c.key, c.title])], params.get('collection') || '')}</select>
      <select data-param="sort" aria-label="Sort by">${options(SORTS, params.get('sort') || '')}</select>
      <select data-param="pageSize" aria-label="How many to show">${options(PAGE_SIZES, params.get('pageSize') || '')}</select>
    </div>
    ${
      data.products.length
        ? `<div class="bulk" data-bulk>
            <label class="check"><input type="checkbox" data-pick-all> Select all shown</label>
            <span class="small muted" data-picked role="status">Select products to change several at once.</span>
            <div class="bulk__controls" data-bulk-controls hidden>
              <select data-action aria-label="What to do with the selected products">${options([['', 'Choose an action…'], ...actions.map(([key, a]) => [key, a.label])])}</select>
              <span class="bulk__args" data-args></span>
              <button type="button" class="btn btn--sm" data-apply>Apply</button>
            </div>
          </div>
          <ul class="list products">${data.products.map((p) => productRow(p, movable)).join('')}</ul>${pager('products', data, params)}
          ${movable ? '<p class="small muted">The arrows set the shop’s “Featured” order. Sold-out jerseys are still listed after the others there.</p>' : ''}`
        : `<div class="card muted">No products match. ${params.size ? `<a href="${esc(listUrl('products', new URLSearchParams()))}">Show all products</a>` : ''}</div>`
    }`
  );
  if (!drawn) return;
  wireList('products', params);
  if (!data.products.length) return;

  const box = $('[data-bulk]', view);
  const picks = $$('[data-pick]', view);
  const all = $('[data-pick-all]', box);
  const action = $('[data-action]', box);
  const args = $('[data-args]', box);
  const picked = () => picks.filter((c) => c.checked).map((c) => Number(c.value));

  const refresh = () => {
    const n = picked().length;
    $('[data-bulk-controls]', box).hidden = !n;
    $('[data-picked]', box).textContent = n ? `${n} selected` : 'Select products to change several at once.';
    all.checked = n === picks.length;
    all.indeterminate = n > 0 && n < picks.length;
  };
  all.addEventListener('change', () => {
    picks.forEach((c) => (c.checked = all.checked));
    refresh();
  });
  picks.forEach((c) => c.addEventListener('change', refresh));
  action.addEventListener('change', () => (args.innerHTML = argFields(BULK[action.value]?.args, collections)));

  $('[data-apply]', box).addEventListener('click', (e) =>
    busy(e.currentTarget, async () => {
      const chosen = BULK[action.value];
      if (!chosen) throw new Error('Choose what to do with them.');
      const ids = picked();
      const extra = readArgs(chosen.args, args);
      if (chosen.ask && !confirm(chosen.ask(plural(ids.length, 'product'), extra))) return;
      const result = await api('POST', '/products/bulk', { ids, action: action.value, ...extra });
      if (result.changed) toast(`Done: ${plural(result.changed, 'product')} changed.`);
      else if (!result.skipped.length) toast('Nothing needed to change.');
      if (result.skipped.length) {
        const some = result.skipped.slice(0, 3).map((s) => `${s.title} (${s.reason})`).join(', ');
        toast(`Skipped ${result.skipped.length}: ${some}${result.skipped.length > 3 ? '…' : ''}`, true);
      }
      if (result.missing) toast(`${plural(result.missing, 'product')} no longer exist.`, true);
      nav.reload();
    })
  );

  $$('[data-move]', view).forEach((b) =>
    b.addEventListener('click', () =>
      busy(b, async () => {
        await api('POST', `/products/${b.dataset.id}/move`, { to: b.dataset.move });
        await nav.reload();
        $(`[data-move="${b.dataset.move}"][data-id="${b.dataset.id}"]`, view)?.focus(); // keep a keyboard user's place
      })
    )
  );
}
