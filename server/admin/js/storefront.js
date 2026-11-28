/* The home page: its slideshow, and the thumbnail of every catalog category. */
import { $, $$, api, busy, esc, options, photoSrc, tag, toast, unsaved, view } from './lib.js';
import { pickProductPhoto, uploadSitePhoto } from './picker.js';

const PROBLEMS = { hidden: 'That product is hidden, so the automatic photo shows instead.', gone: 'That photo was deleted, so the automatic photo shows instead.' };
const source = (ref) => (!ref ? tag('hidden', 'Automatic') : tag('confirmed', ref.kind === 'upload' ? 'Your upload' : 'From a product'));
const picture = (place, alt) =>
  place.preview
    ? `<img src="${esc(photoSrc(place.preview))}" alt="${esc(alt)}" loading="lazy">`
    : `<span class="slot__empty">${place.ref ? 'No preview' : 'Picked automatically after saving'}</span>`;
const tools = (place, kind) => `<span class="row">
  <button type="button" class="btn btn--outline btn--xs" data-${kind}="upload">Upload</button>
  <button type="button" class="btn btn--outline btn--xs" data-${kind}="pick">Choose from products</button>
  ${place.ref ? `<button type="button" class="btn btn--outline btn--xs" data-${kind}="auto">Automatic</button>` : ''}
</span>`;
const problem = (place) => (place.problem ? `<span class="small error-text">${PROBLEMS[place.problem]}</span>` : '');

/** asks for the new photo. Returns { ref, preview, from }, or null if the admin changed their mind. */
async function choosePhoto(action, button) {
  if (action === 'pick') {
    const photo = await pickProductPhoto();
    return photo && { ref: { kind: 'product', id: photo.id }, preview: photo.small, from: photo.title };
  }
  const photo = await uploadSitePhoto(() => (button.textContent = 'Uploading…'));
  return photo && { ref: { kind: 'upload', id: photo.id }, preview: photo.small, from: null };
}

export default async function storefront(draw) {
  let data = await api('GET', '/storefront');
  let slides = [];
  const reset = () => (slides = data.hero.slides.map(({ targetLost, ...s }) => ({ ...s, photos: s.photos.map((p) => ({ ...p })) })));
  reset();
  /** what a slide button may open: collections the shop knows, plus the slide's current choice if lost */
  const targetsFor = (key) => {
    const inShop = data.categories.filter((c) => c.inShop).map((c) => [c.key, c.title]);
    if (inShop.some(([k]) => k === key)) return inShop;
    const lost = data.categories.find((c) => c.key === key);
    return [[key, lost ? `${lost.title} (not in the shop menu)` : `${key} (deleted)`], ...inShop];
  };
  const isLost = (key) => !data.categories.some((c) => c.key === key && c.inShop);

  const slideHtml = (s, i) => `<fieldset class="slide" data-slide="${i}">
    <legend class="sr-only">Slide ${i + 1}</legend>
    <div class="slide__head"><h3>Slide ${i + 1}${s.visible ? '' : ' (hidden)'}</h3>
      <span class="row"><label class="check"><input type="checkbox" data-f="visible"${s.visible ? ' checked' : ''}> Show this slide</label>
      <button type="button" class="btn btn--outline btn--xs" data-move="-1" aria-label="Move slide ${i + 1} earlier"${i ? '' : ' disabled'}>▲</button>
      <button type="button" class="btn btn--outline btn--xs" data-move="1" aria-label="Move slide ${i + 1} later"${i < slides.length - 1 ? '' : ' disabled'}>▼</button>
      <button type="button" class="btn btn--danger btn--xs" data-remove aria-label="Remove slide ${i + 1}">Remove</button></span>
    </div>
    ${isLost(s.collection) ? '<p class="note">This slide’s button points to a collection that was deleted or taken out of the shop menu. Choose another one before saving.</p>' : ''}
    <div class="slide__body">
      <div class="slide__photos">${s.photos
        .map(
          (p, n) => `<figure class="slot" data-place="${n}">${picture(p, `Slide ${i + 1}, photo ${n + 1}`)}
            <figcaption><span class="row">${source(p.ref)}<span class="small muted">Photo ${n + 1}</span></span>${p.from ? `<span class="small muted">${esc(p.from)}</span>` : ''}${problem(p)}${tools(p, 'photo')}</figcaption></figure>`
        )
        .join('')}</div>
      <div class="stack">
        <label class="field">Headline<input data-f="title" maxlength="60" value="${esc(s.title)}"></label>
        <label class="field">Small line above<input data-f="eyebrow" maxlength="40" value="${esc(s.eyebrow)}"></label>
        <label class="field">Text<textarea data-f="text" maxlength="160">${esc(s.text)}</textarea></label>
        <div class="two">
          <label class="field">Button text<input data-f="cta" maxlength="30" value="${esc(s.cta)}"></label>
          <label class="field">Button opens<select data-f="collection">${options(targetsFor(s.collection), s.collection)}</select></label>
        </div>
      </div>
    </div>
  </fieldset>`;

  const thumbHtml = (t) => `<figure class="thumb-tile" data-key="${esc(t.key)}">
    ${t.preview ? `<img src="${esc(photoSrc(t.preview))}" alt="" loading="lazy">` : '<span class="slot__empty">Not in the shop menu yet</span>'}
    <figcaption><b>${esc(t.title)}</b>${source(t.ref)}${problem(t)}${tools(t, 'thumb')}</figcaption>
  </figure>`;

  const drawn = draw(
    'Storefront',
    `<div class="head"><h1>Storefront</h1><a class="btn btn--outline" href="/index.html" target="_blank" rel="noopener">View home page</a></div>
    <section class="card"><h2>Home page slideshow</h2>
      <p class="small muted">Each slide shows two photos. “Automatic” picks jerseys on sale from the slide’s collection. Tall photos (about 3 by 4) fit best; wide ones are cropped.</p>
      <div data-slides></div>
      <div class="row"><button type="button" class="btn btn--outline btn--sm" data-add-slide>Add a slide</button></div>
    </section>
    <div class="savebar">
      <button type="button" class="btn btn--outline btn--sm" data-defaults>Use the website’s defaults</button>
      <span class="small muted" role="status" data-status></span>
      <button type="button" class="btn" data-save>Save slideshow</button>
    </div>
    <section class="card"><h2>Catalog thumbnails</h2>
      <p class="small muted">The picture for each category in the Catalog menu and on the home page. Changes here save at once.</p>
      <div class="thumbs" data-thumbs></div>
    </section>`
  );
  if (!drawn) return;

  const list = $('[data-slides]', view);
  const thumbs = $('[data-thumbs]', view);
  const status = $('[data-status]', view);
  const defaultsButton = $('[data-defaults]', view);
  const addButton = $('[data-add-slide]', view);

  const paintSlides = () => {
    list.innerHTML = slides.map(slideHtml).join('');
    addButton.disabled = slides.length >= data.maxSlides;
    defaultsButton.hidden = !data.hero.custom;
  };
  const paintThumbs = () => (thumbs.innerHTML = data.thumbnails.map(thumbHtml).join(''));
  const touch = () => {
    unsaved.dirty = true;
    status.textContent = 'Unsaved changes to the slideshow';
  };
  paintSlides();
  paintThumbs();

  const onField = (e) => {
    const field = e.target.dataset.f;
    if (!field) return;
    const i = Number(e.target.closest('[data-slide]').dataset.slide);
    slides[i][field] = field === 'visible' ? e.target.checked : e.target.value;
    if (field === 'collection') {
      // the automatic photos come from the collection, so they are only known after saving
      for (const p of slides[i].photos) {
        p.automatic = null;
        if (!p.ref) p.preview = null;
      }
    }
    if (field === 'visible' || field === 'collection') paintSlides();
    touch();
  };
  list.addEventListener('input', onField); // text boxes, the checkbox and the drop-down all send this

  list.addEventListener('click', (e) => {
    const slide = e.target.closest('[data-slide]');
    if (!slide) return;
    const i = Number(slide.dataset.slide);
    const move = e.target.closest('[data-move]');
    const button = e.target.closest('[data-photo]');
    if (move) {
      const to = i + Number(move.dataset.move);
      [slides[i], slides[to]] = [slides[to], slides[i]];
      paintSlides();
      touch();
    } else if (e.target.closest('[data-remove]')) {
      if (slides.length === 1) return toast('The slideshow needs at least one slide.', true);
      slides.splice(i, 1);
      paintSlides();
      touch();
    } else if (button) {
      const n = Number(button.closest('[data-place]').dataset.place);
      const target = slides[i];
      const set = (photo) => {
        Object.assign(target.photos[n], photo, { problem: null });
        paintSlides();
        touch();
      };
      if (button.dataset.photo === 'auto') return set({ ref: null, preview: target.photos[n].automatic, from: null });
      const label = button.textContent;
      busy(button, async () => {
        const photo = await choosePhoto(button.dataset.photo, button);
        button.textContent = label;
        if (photo && list.isConnected) set(photo);
      }).finally(() => (button.textContent = label));
    }
  });

  addButton.addEventListener('click', () => {
    const first = data.categories.find((c) => c.key === 'new-drops') || data.categories.find((c) => c.inShop);
    const blank = { ref: null, preview: null, automatic: null, problem: null, from: null };
    slides.push({ collection: first.key, eyebrow: '', title: '', text: '', cta: 'Shop now', visible: true, photos: [{ ...blank }, { ...blank }] });
    paintSlides();
    touch();
    $('[data-slide]:last-child [data-f=title]', list).focus();
  });

  /** show what the server now has */
  const accept = (next, message) => {
    data = next;
    reset();
    unsaved.dirty = false;
    status.textContent = '';
    paintSlides();
    paintThumbs();
    toast(message);
  };

  $('[data-save]', view).addEventListener('click', (e) =>
    busy(e.currentTarget, async () => {
      const body = {
        version: data.hero.version,
        slides: slides.map(({ collection, eyebrow, title, text, cta, visible, photos }) => ({ collection, eyebrow, title, text, cta, visible, photos: photos.map((p) => p.ref) })),
      };
      accept(await api('PUT', '/storefront/hero', body), 'Slideshow saved. The home page is updated.');
    })
  );
  defaultsButton.addEventListener('click', (e) => {
    if (!confirm('Go back to the slides written in the website’s files? Your saved slideshow and its uploaded photos are removed.')) return;
    busy(e.currentTarget, async () => accept(await api('DELETE', `/storefront/hero?version=${data.hero.version}`), 'The slideshow is back to the defaults.'));
  });

  thumbs.addEventListener('click', (e) => {
    const button = e.target.closest('[data-thumb]');
    if (!button) return;
    const key = button.closest('[data-key]').dataset.key;
    const label = button.textContent;
    busy(button, async () => {
      let ref = null;
      if (button.dataset.thumb !== 'auto') {
        const photo = await choosePhoto(button.dataset.thumb, button);
        if (!photo) return;
        ref = photo.ref;
      }
      const next = await api('PUT', `/storefront/thumbnails/${encodeURIComponent(key)}`, { photo: ref });
      // only the thumbnails are redrawn, so half-typed slide changes stay
      data = { ...data, thumbnails: next.thumbnails };
      paintThumbs();
      toast('Thumbnail saved. The website is updated.');
      $$('[data-key]', thumbs)
        .find((t) => t.dataset.key === key)
        ?.querySelector('button')
        ?.focus();
    }).finally(() => (button.textContent = label));
  });
}
