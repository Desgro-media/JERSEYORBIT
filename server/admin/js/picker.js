/* Choosing a photo: from the catalog in a pop-up, or uploaded from the computer. */
import { $, api, esc, photoSrc, toast } from './lib.js';
import { photoProblem } from './photos.js';

/** resolves to { id, small, title } for the chosen product photo, or null if the pop-up is closed */
export function pickProductPhoto() {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'picker';
    dialog.setAttribute('aria-label', 'Choose a product photo');
    dialog.innerHTML = `<div class="picker__head"><h2>Choose a product photo</h2><button type="button" class="btn btn--outline btn--sm" data-close>Close</button></div>
      <form class="search" role="search"><input type="search" name="q" placeholder="Search by product name" aria-label="Search product photos"><button class="btn btn--sm">Search</button></form>
      <p class="small muted" data-count role="status"></p>
      <div class="picker__grid" data-grid></div>
      <div class="row picker__more"><button type="button" class="btn btn--outline btn--sm" data-more hidden>Show more</button></div>`;
    document.body.appendChild(dialog);
    const grid = $('[data-grid]', dialog);
    const more = $('[data-more]', dialog);
    let query = '';
    let page = 1;
    let run = 0;

    async function load(replace) {
      const mine = ++run;
      try {
        const data = await api('GET', `/photos?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
        if (mine !== run) return; // a newer search has started
        if (replace) grid.textContent = '';
        grid.insertAdjacentHTML(
          'beforeend',
          data.photos
            .map((p) => `<button type="button" class="picker__photo" data-id="${p.id}" data-small="${esc(p.small)}" data-title="${esc(p.title)}"><img src="${esc(photoSrc(p.small))}" alt="" loading="lazy"><span>${esc(p.title)}</span></button>`)
            .join('')
        );
        $('[data-count]', dialog).textContent = data.total ? `${data.total} photos of products on the website` : 'No photos match.';
        more.hidden = page * data.pageSize >= data.total;
      } catch (err) {
        if (!err.handled) toast(err.message, true);
      }
    }

    $('form', dialog).addEventListener('submit', (e) => {
      e.preventDefault();
      query = e.target.q.value.trim();
      page = 1;
      load(true);
    });
    more.addEventListener('click', () => {
      page++;
      load(false);
    });
    dialog.addEventListener('click', (e) => {
      const photo = e.target.closest('.picker__photo');
      if (photo) {
        resolve({ id: Number(photo.dataset.id), small: photo.dataset.small, title: photo.dataset.title });
        dialog.close();
      } else if (e.target.closest('[data-close]')) dialog.close();
    });
    // closing in any way (button, Escape, signing out) ends the choice; a second resolve is ignored
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(null);
    });
    dialog.showModal();
    load(true);
  });
}

/** opens the computer's file chooser and uploads one photo. Resolves to { id, small } or null. */
export function uploadSitePhoto(onStart) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const problem = photoProblem(file);
      if (problem) return reject(new Error(`${file.name} ${problem}.`));
      onStart?.();
      const data = new FormData();
      data.append('photo', file);
      try {
        resolve(await api('POST', '/site-images', data));
      } catch (err) {
        reject(err);
      }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
