/* One product: add it, or change anything about it. */
import { $, $$, api, busy, esc, isOwner, nav, photoSrc, plural, toast, unsaved, view } from './lib.js';
import { dropHtml, MAX_PHOTOS, photoProblem, photosHtml, wireDrop, wirePhotos } from './photos.js';
import { titled } from './help.js';

const blank = () => ({
  title: '',
  details: [],
  collections: ['new-drops'],
  published: false,
  images: [],
  variants: ['S', 'M', 'L', 'XL', '2XL'].map((size) => ({ size, price: '', compareAt: '', stock: '', available: true })),
});

const sizeRow = (v) => `<div class="size-row" data-size-row data-id="${esc(v.id || '')}">
  <label class="field">Size<input data-f="size" maxlength="20" required value="${esc(v.size)}"></label>
  <label class="field">Price ₹<input data-f="price" type="number" min="1" step="0.01" required value="${esc(v.price)}"></label>
  <label class="field">Was ₹<input data-f="compareAt" type="number" min="0" step="0.01" placeholder="none" value="${esc(v.compareAt)}"></label>
  <label class="field">Stock<input data-f="stock" type="number" min="0" step="1" placeholder="not counted" value="${esc(v.stock)}"></label>
  <label class="check"><input data-f="available" type="checkbox"${v.available ? ' checked' : ''}> On sale</label>
  <span class="size-row__tools">
    <button class="btn btn--outline btn--xs" type="button" data-size-move="up" aria-label="Move size ${esc(v.size)} up">▲</button>
    <button class="btn btn--outline btn--xs" type="button" data-size-move="down" aria-label="Move size ${esc(v.size)} down">▼</button>
    <button class="btn btn--danger btn--xs" type="button" data-drop-size aria-label="Remove size ${esc(v.size)}">Remove</button>
  </span>
</div>`;

function readSizes() {
  return $$('[data-size-row]', view).map((row) => {
    const f = (name) => $(`[data-f="${name}"]`, row);
    // a number box that holds something unreadable reports an empty value; don't take that as "blank"
    for (const name of ['compareAt', 'stock']) if (f(name).validity.badInput) throw new Error('Check the numbers in the size list.');
    const v = {
      size: f('size').value,
      price: Number(f('price').value),
      compareAt: f('compareAt').value === '' ? null : Number(f('compareAt').value),
      stock: f('stock').value === '' ? null : Number(f('stock').value),
      available: f('available').checked,
    };
    if (row.dataset.id) v.id = Number(row.dataset.id);
    return v;
  });
}

/** a saved product, in the shape the server takes back */
const editBody = (p) => ({
  title: p.title,
  details: p.details,
  collections: p.collections,
  published: p.published,
  version: p.version,
  variants: p.variants.map(({ id, size, price, compareAt, available, stock }) => ({ id, size, price, compareAt, available, stock })),
});

function pageHtml(p, collections, isNew) {
  return `<p><a href="#/products">← All products</a></p>
  <div class="head">
    <div><h1>${isNew ? 'Add product' : 'Edit product'}</h1>${isNew ? '' : `<span class="muted">${p.published ? 'On the website' : 'Hidden from the website'}</span>`}</div>
    ${
      isNew
        ? ''
        : `<div class="row">${p.published ? `<a class="btn btn--outline" href="/product.html?p=${encodeURIComponent(p.handle)}" target="_blank" rel="noopener">View on website</a>` : ''}<button class="btn btn--outline" type="button" data-duplicate>Duplicate</button></div>`
    }
  </div>
  <form data-product-form>
    <div class="error stale" role="alert" data-stale hidden><span>This product changed while you were editing it (an order may have taken stock).</span> <button class="btn btn--outline btn--sm" type="button" data-latest>Load the latest</button></div>
    <section class="card stack">
      <label class="field">Name<input name="title" maxlength="200" required value="${esc(p.title)}"></label>
      <label class="field">Details, one per line (for example “Material: Dot knit”)<textarea name="details">${esc(p.details.join('\n'))}</textarea></label>
    </section>
    <section class="card">${titled('h2', 'Sizes, prices and stock', 'editor-sizes')}
      <p class="small muted">Leave Stock empty if you don’t count it. A size shows as sold out when “On sale” is off or its stock is 0.</p>
      <div class="sizes" data-sizes>${p.variants.map(sizeRow).join('')}</div>
      <div class="row size-actions">
        <button class="btn btn--outline btn--sm" type="button" data-add-size>Add a size</button>
        <button class="btn btn--outline btn--sm" type="button" data-copy-price>Copy first price to all sizes</button>
        <button class="btn btn--outline btn--sm" type="button" data-all-sale="on">All on sale</button>
        <button class="btn btn--outline btn--sm" type="button" data-all-sale="off">All sold out</button>
      </div>
    </section>
    <section class="card"><h2>Collections</h2>
      <div class="checks">${collections.map((c) => `<label class="check"><input type="checkbox" name="collection" value="${esc(c.key)}"${p.collections.includes(c.key) ? ' checked' : ''}> ${esc(c.title)}</label>`).join('')}</div>
      <p class="small muted">Full Sleeve and Half Sleeve are worked out from the name and the “Fit:” line. <a href="#/collections">Add or rename collections</a></p>
    </section>
    ${
      isNew
        ? `<section class="card"><h2>Photos</h2><p class="small muted">The first photo is the main one. They upload when you create the product.</p><div class="photos" data-photo-grid></div>${dropHtml}</section>`
        : `<details class="card"><summary>Web address</summary>
            <label class="field">Address<input name="handle" maxlength="255" value="${esc(p.handle)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
            <p class="note">The page is product.html?p=<b>your address</b>. Changing it breaks links that people have already saved or shared.</p>
          </details>`
    }
    <div class="savebar">
      <label class="check"><input type="checkbox" name="published"${p.published ? ' checked' : ''}> Show on website${isNew ? ' (needs a photo)' : ''}</label>
      <span class="small muted" role="status" data-status></span>
      <button class="btn" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
    </div>
  </form>
  ${
    isNew
      ? ''
      : `<section class="card"><h2>Photos</h2>
          <p class="small muted">Drag to reorder, or use the arrows. The first photo is the main one. Photo changes save at once.</p>
          <div class="photos" data-photo-grid></div>${dropHtml}
        </section>
        <section class="card"><h2>Place in the shop</h2>
          <p class="small muted">“Featured” is the shop’s default order. Sold-out jerseys are listed after the others.</p>
          <div class="row"><button class="btn btn--outline btn--sm" type="button" data-place="top">Move to the top</button><button class="btn btn--outline btn--sm" type="button" data-place="bottom">Move to the bottom</button></div>
        </section>
        ${
          isOwner()
            ? `<section class="card card--danger"><h2>Delete this product</h2>
                <p class="small muted">Removes it, its sizes and its uploaded photos for good. Past orders keep their own copy. To only take it off the website, untick “Show on website” instead.</p>
                <button class="btn btn--danger" type="button" data-delete-product>Delete product</button>
              </section>`
            : ''
        }`
  }`;
}

export default async function productEditor(draw, params, id) {
  const isNew = id === 'new';
  const [collections, loaded] = await Promise.all([api('GET', '/collections'), isNew ? blank() : api('GET', '/products/' + id)]);
  let product = loaded;
  if (!draw(isNew ? 'Add product' : product.title, pageHtml(product, collections, isNew))) return;

  const form = $('[data-product-form]', view);
  const status = $('[data-status]', form);
  const sizesBox = $('[data-sizes]', form);
  const grid = $('[data-photo-grid]', view);
  const zone = $('[data-drop]', view);

  const touch = () => {
    unsaved.dirty = true;
    status.textContent = 'Unsaved changes';
  };
  form.addEventListener('input', touch);
  form.addEventListener('change', touch);

  /* ---------- sizes ---------- */
  const rows = () => $$('[data-size-row]', sizesBox);
  $('[data-add-size]', form).addEventListener('click', () => {
    const first = rows()[0];
    const copy = (name) => (first ? $(`[data-f="${name}"]`, first).value : '');
    sizesBox.insertAdjacentHTML('beforeend', sizeRow({ size: '', price: copy('price'), compareAt: copy('compareAt'), stock: '', available: true }));
    $('[data-f="size"]', sizesBox.lastElementChild).focus();
    touch();
  });
  $('[data-copy-price]', form).addEventListener('click', () => {
    for (const name of ['price', 'compareAt']) {
      const value = $(`[data-f="${name}"]`, rows()[0]).value;
      rows().forEach((r) => ($(`[data-f="${name}"]`, r).value = value));
    }
    touch();
  });
  $$('[data-all-sale]', form).forEach((b) =>
    b.addEventListener('click', () => {
      rows().forEach((r) => ($('[data-f="available"]', r).checked = b.dataset.allSale === 'on'));
      touch();
    })
  );
  sizesBox.addEventListener('click', (e) => {
    const row = e.target.closest('[data-size-row]');
    const move = e.target.closest('[data-size-move]');
    if (move) {
      const up = move.dataset.sizeMove === 'up';
      const other = up ? row.previousElementSibling : row.nextElementSibling;
      if (!other) return;
      if (up) other.before(row);
      else other.after(row);
      move.focus();
      touch();
    } else if (e.target.closest('[data-drop-size]')) {
      if (rows().length === 1) return toast('A product needs at least one size.', true);
      row.remove();
      touch();
    }
  });

  /* ---------- saving ---------- */
  const fields = () => ({
    title: form.elements.title.value,
    details: form.elements.details.value.split('\n').map((l) => l.trim()).filter(Boolean),
    collections: $$('input[name=collection]:checked', form).map((c) => c.value),
    variants: readSizes(),
  });

  const upload = async (productId, file) => {
    const data = new FormData();
    data.append('photo', file);
    return api('POST', `/products/${productId}/images`, data);
  };

  /** keep only usable files, saying what was left out */
  const usable = (files, room) => {
    const good = files.filter((file) => {
      const problem = photoProblem(file);
      if (problem) toast(`${file.name} ${problem}.`, true);
      return !problem;
    });
    if (good.length > room) toast(`A product can have up to ${MAX_PHOTOS} photos, so ${plural(good.length - room, 'photo')} left out.`, true);
    return good.slice(0, Math.max(0, room));
  };

  /* photos chosen for a product that does not exist yet */
  let waiting = [];
  let nextKey = 0;

  async function create(publish) {
    const created = await api('POST', '/products', fields());
    // the product now exists: whatever happens next, go to it, so pressing the button again can't make a second one
    unsaved.dirty = false;
    try {
      let added = 0;
      for (const [i, photo] of waiting.entries()) {
        status.textContent = `Uploading photo ${i + 1} of ${waiting.length}…`;
        try {
          await upload(created.id, photo.file);
          added++;
        } catch (err) {
          if (err.handled) throw err;
          toast(`${photo.file.name}: ${err.message}`, true);
        }
        URL.revokeObjectURL(photo.src);
      }
      if (publish && added) {
        const latest = await api('GET', '/products/' + created.id);
        await api('PUT', '/products/' + created.id, { ...editBody(latest), published: true });
        toast('Created, and showing on the website.');
      } else if (publish) toast('Created but hidden: it needs a photo before it can show on the website.', true);
      else toast(added ? 'Product created. It stays hidden until you switch it on.' : 'Product created. Now add its photos.');
    } catch (err) {
      if (!err.handled) toast(`The product was created, but: ${err.message}`, true);
    }
    // not if the admin has moved to another screen while the photos uploaded
    if (form.isConnected) location.hash = '#/products/' + created.id;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('[type=submit]', form), async () => {
      const publish = form.elements.published.checked;
      if (isNew) return create(publish);
      const next = fields();
      // removing a size that is in a waiting order means confirming that order takes no stock for it
      const kept = new Set(next.variants.map((v) => v.id));
      const lost = product.variants.filter((v) => v.waiting && !kept.has(v.id));
      if (lost.length) {
        const which = lost.map((v) => `Size ${v.size} is in ${plural(v.waiting, 'waiting order')}.`).join(' ');
        if (!confirm(`${which} If you remove it, confirming those orders takes no stock for it. Save anyway?`)) return;
      }
      try {
        await api('PUT', '/products/' + id, { ...next, handle: form.elements.handle.value, version: product.version, published: publish });
      } catch (err) {
        if (err.code !== 'PRODUCT_CHANGED') throw err;
        const stale = $('[data-stale]', form);
        stale.hidden = false;
        stale.scrollIntoView({ block: 'center' });
        return;
      }
      unsaved.dirty = false;
      toast('Saved. The website is updated.');
      if (form.isConnected) await nav.reload();
    });
  });

  if (isNew) {
    const paint = () => (grid.innerHTML = photosHtml(waiting));
    wireDrop(zone, (files) => {
      for (const file of usable(files, MAX_PHOTOS - waiting.length)) waiting.push({ key: String(++nextKey), file, src: URL.createObjectURL(file) });
      paint();
      touch();
    });
    wirePhotos(grid, {
      keys: () => waiting.map((p) => p.key),
      reorder(keys) {
        waiting = keys.map((k) => waiting.find((p) => p.key === k));
        paint();
        touch();
      },
      remove(key) {
        URL.revokeObjectURL(waiting.find((p) => p.key === key).src);
        waiting = waiting.filter((p) => p.key !== key);
        paint();
        touch();
      },
    });
    return;
  }

  /* ---------- saved photos ---------- */
  /* A photo change moves the product on by one version. If it moved further, something else changed it
     (an order taking stock, say): keep the old version so Save is refused and nothing is overwritten. */
  const adopt = (updated) => {
    const onlyThis = updated.version === product.version + 1;
    product = { ...product, images: updated.images, version: onlyThis ? updated.version : product.version };
    if (!onlyThis) $('[data-stale]', form).hidden = false;
  };
  const paint = () =>
    (grid.innerHTML = product.images.length
      ? photosHtml(product.images.map((im) => ({ key: String(im.id), src: photoSrc(im.small) })))
      : '<p class="muted">No photos yet.</p>');
  wirePhotos(grid, {
    keys: () => product.images.map((im) => String(im.id)),
    reorder: (keys, button) =>
      busy(button, async () => {
        adopt(await api('PUT', `/products/${id}/images/order`, { ids: keys.map(Number) }));
        paint();
      }),
    remove(key, button) {
      if (!confirm('Delete this photo?')) return;
      busy(button, async () => {
        adopt(await api('DELETE', `/products/${id}/images/${key}`));
        paint();
      });
    },
  });
  wireDrop(zone, async (files) => {
    zone.classList.add('is-busy');
    for (const file of usable(files, MAX_PHOTOS - product.images.length)) {
      try {
        adopt(await upload(id, file));
        toast(`Added ${file.name}.`);
        paint();
      } catch (err) {
        if (err.handled) break;
        toast(`${file.name}: ${err.message}`, true);
      }
    }
    zone.classList.remove('is-busy');
  });
  paint();

  /* ---------- the rest ---------- */
  $('[data-latest]', form).addEventListener('click', () => {
    if (unsaved.dirty && !confirm('Load the latest version? Your unsaved changes will be replaced.')) return;
    unsaved.dirty = false;
    nav.reload();
  });
  $('[data-duplicate]', view).addEventListener('click', (e) => {
    if (unsaved.dirty && !confirm('You have unsaved changes. The copy is made from the last saved version. Continue?')) return;
    busy(e.currentTarget, async () => {
      const copy = await api('POST', `/products/${id}/duplicate`);
      unsaved.dirty = false;
      toast('Copied. The copy is hidden until you add photos and switch it on.');
      location.hash = '#/products/' + copy.id;
    });
  });
  $$('[data-place]', view).forEach((b) =>
    b.addEventListener('click', () =>
      busy(b, async () => {
        const { moved } = await api('POST', `/products/${id}/move`, { to: b.dataset.place });
        toast(moved ? `Moved to the ${b.dataset.place} of the Featured order.` : `It is already at the ${b.dataset.place}.`);
      })
    )
  );
  $('[data-delete-product]', view)?.addEventListener('click', (e) => {
    const open = product.openOrders
      ? `\n\n${plural(product.openOrders, 'open order')} include it. Confirming such an order will no longer take its stock.`
      : '';
    if (!confirm(`Delete “${product.title}” for good? This cannot be undone.${open}`)) return;
    busy(e.currentTarget, async () => {
      await api('DELETE', '/products/' + id);
      unsaved.dirty = false;
      toast('Product deleted.');
      location.hash = '#/products';
    });
  });
}
