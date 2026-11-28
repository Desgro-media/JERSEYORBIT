/* The photo grid and drop area, used both for saved photos and for ones not uploaded yet. */
import { esc, tag } from './lib.js';

export const MAX_PHOTOS = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DRAG = 'text/x-jo-photo';

/** why a chosen file cannot be uploaded, or null. The server checks again, by opening the image. */
export const photoProblem = (file) => (!TYPES.includes(file.type) ? 'is not a JPG, PNG or WebP image' : file.size > 10 * 1024 * 1024 ? 'is larger than 10 MB' : null);

export const dropHtml = `<label class="dropzone" data-drop>
  <b>Add photos</b>
  <span class="small muted">Drop them here or choose files. JPG, PNG or WebP, up to 10 MB each, ${MAX_PHOTOS} at most.</span>
  <input type="file" accept="${TYPES.join(',')}" multiple>
</label>`;

export function wireDrop(zone, onFiles) {
  const input = zone.querySelector('input[type=file]');
  input.addEventListener('change', () => {
    const files = Array.from(input.files);
    input.value = ''; // so the same file can be chosen again
    onFiles(files);
  });
  zone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('is-over');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    onFiles(Array.from(e.dataTransfer.files));
  });
}

/** items: [{ key, src }] in order; the first is the main photo */
export const photosHtml = (items) =>
  items
    .map(
      (p, i) => `<div class="photo" draggable="true" data-key="${esc(p.key)}">
        <img src="${esc(p.src)}" alt="Photo ${i + 1}" draggable="false">
        <div class="photo__tools">
          ${i ? '<button class="btn btn--outline btn--xs" type="button" data-photo="main">Make main</button>' : tag('paid', 'Main')}
          <button class="btn btn--outline btn--xs" type="button" data-photo="left" aria-label="Move photo ${i + 1} earlier"${i ? '' : ' disabled'}>◀</button>
          <button class="btn btn--outline btn--xs" type="button" data-photo="right" aria-label="Move photo ${i + 1} later"${i < items.length - 1 ? '' : ' disabled'}>▶</button>
          <button class="btn btn--danger btn--xs" type="button" data-photo="remove" aria-label="Delete photo ${i + 1}">Delete</button>
        </div>
      </div>`
    )
    .join('');

/* One set of listeners on the grid, which survives every redraw of what is inside it.
   keys() gives the current order; reorder(keys, button) and remove(key, button) make the change. */
export function wirePhotos(grid, { keys, reorder, remove }) {
  const moved = (key, to) => {
    const next = keys().filter((k) => k !== key);
    next.splice(to, 0, key);
    return next;
  };
  grid.addEventListener('click', (e) => {
    const button = e.target.closest('[data-photo]');
    if (!button) return;
    const key = button.closest('[data-key]').dataset.key;
    const at = keys().indexOf(key);
    if (button.dataset.photo === 'remove') return remove(key, button);
    reorder(moved(key, { main: 0, left: at - 1, right: at + 1 }[button.dataset.photo]), button);
  });
  grid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-key]');
    if (!card) return;
    e.dataTransfer.setData(DRAG, card.dataset.key);
    e.dataTransfer.effectAllowed = 'move';
  });
  grid.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes(DRAG) && e.target.closest('[data-key]')) e.preventDefault();
  });
  grid.addEventListener('drop', (e) => {
    const card = e.target.closest('[data-key]');
    const key = e.dataTransfer.getData(DRAG);
    if (!card || !key || key === card.dataset.key) return;
    e.preventDefault();
    reorder(moved(key, keys().indexOf(card.dataset.key)));
  });
}
