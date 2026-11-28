/* The shop's categories. Built-in ones belong to the website's design; the rest are managed here. */
import { $, $$, api, busy, esc, isOwner, plural, tag, toast, view } from './lib.js';
import { titled } from './help.js';

const count = (c) =>
  `<a href="#/products?collection=${encodeURIComponent(c.key)}">${esc(plural(c.products, 'product'))}</a><span class="small muted"> · ${esc(c.published)} on the website</span>`;

const builtInRow = (c) => `<li class="collection">
  <div><b>${esc(c.title)}</b> ${tag('hidden', 'Built in')}${c.blurb ? `<br><span class="small muted">${esc(c.blurb)}</span>` : ''}</div>
  <div>${count(c)}</div>
</li>`;

const ownRow = (c) => `<li class="collection">
  <form class="collection__form" data-key="${esc(c.key)}">
    <label class="field">Name<input name="title" maxlength="60" required value="${esc(c.title)}"></label>
    <label class="field">Short text<input name="blurb" maxlength="120" value="${esc(c.blurb)}"></label>
    <label class="check"><input type="checkbox" name="inMenu"${c.inMenu ? ' checked' : ''}> In shop menu</label>
    <span class="row"><button class="btn btn--outline btn--sm" type="submit">Save</button>${isOwner() ? '<button class="btn btn--danger btn--sm" type="button" data-delete>Delete</button>' : ''}</span>
  </form>
  <div>${count(c)}</div>
</li>`;

export default async function collectionsScreen(draw) {
  let list = await api('GET', '/collections');
  const paint = () => {
    const own = list.filter((c) => !c.builtIn);
    const fixed = list.filter((c) => c.builtIn);
    const drawn = draw(
      'Collections',
      `<div class="head">${titled('h1', 'Collections', 'collections-list')}</div>
      <section class="card"><h2>New collection</h2>
        <form class="stack" data-new>
          <div class="two">
            <label class="field">Name<input name="title" maxlength="60" required></label>
            <label class="field">Short text (optional)<input name="blurb" maxlength="120"></label>
          </div>
          <label class="check"><input type="checkbox" name="inMenu" checked> List it in the shop menu once it has a product on the website</label>
          <div class="row"><button class="btn" type="submit">Add collection</button></div>
        </form>
        <p class="small muted">To put products in a collection, tick it on a product’s page, or select several products and choose “Add to a collection”.</p>
      </section>
      <h2>Your collections</h2>
      ${own.length ? `<ul class="list collections">${own.map(ownRow).join('')}</ul>` : '<div class="card muted">You haven’t added any yet.</div>'}
      <h2 class="gap">Built-in collections</h2>
      <p class="small muted">These are part of the website’s design. Their names and text are in assets/js/config.js.</p>
      <ul class="list collections">${fixed.map(builtInRow).join('')}</ul>`
    );
    if (!drawn) return;

    const send = (button, request, done) =>
      busy(button, async () => {
        list = await request();
        paint();
        toast(done);
      });
    const values = (form) => ({ title: form.elements.title.value, blurb: form.elements.blurb.value, inMenu: form.elements.inMenu.checked });

    const add = $('[data-new]', view);
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      send($('[type=submit]', add), () => api('POST', '/collections', values(add)), 'Collection added.');
    });
    $$('[data-key]', view).forEach((form) => {
      const key = encodeURIComponent(form.dataset.key);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        send($('[type=submit]', form), () => api('PATCH', '/collections/' + key, values(form)), 'Saved. The website is updated.');
      });
      $('[data-delete]', form)?.addEventListener('click', (e) => {
        const c = list.find((x) => x.key === form.dataset.key);
        if (!confirm(`Delete the collection “${c.title}”? Its ${plural(c.products, 'product')} stay in the shop.`)) return;
        send(e.currentTarget, () => api('DELETE', '/collections/' + key), 'Collection deleted.');
      });
    });
  };
  paint();
}
