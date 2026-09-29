// The app's one JS component. Its look is the <app-shell> template from
// ui.html; this class adds state and behaviour. It binds ui.html's components
// as <rl--…> itself (a module-private import), so the page only has to import
// this file.
import { HTMLModules } from '../../src/browser.js';
import { defineHTMLComponent } from '../../src/runtime.js';

const ui = await HTMLModules.load(new URL('./ui.html', import.meta.url).href);
const KEY = 'html-modules-reading-list';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COVERS = ['#6d4c9f', '#2f7d86', '#a0522d', '#8a1c2b', '#3d6b3d', '#b5651d', '#1f5f99', '#7a6a1f'];

export class ReadingList extends ui.appShell.element {
  #books = [];
  #shelves = [];
  #filter = '';

  /** Start from seed data (unless the reader has saved state). */
  load({ books, shelves }) {
    this.#shelves = shelves;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch {}
    this.#books = Array.isArray(saved) ? saved : structuredClone(books);
    this.#seed = structuredClone(books);
    this.#render();
  }

  #seed = [];

  connectedCallback() {
    this.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-act]');
      if (!button) return;
      const book = this.#books.find((b) => b.id === Number(button.dataset.id));
      const order = this.#shelves.map((s) => s.id);
      switch (button.dataset.act) {
        case 'left': book.shelf = order[Math.max(0, order.indexOf(book.shelf) - 1)]; break;
        case 'right': book.shelf = order[Math.min(order.length - 1, order.indexOf(book.shelf) + 1)]; break;
        case 'rate': book.rating = Number(button.dataset.value); break;
        case 'remove': this.#books = this.#books.filter((b) => b !== book); break;
        case 'reset': this.#books = structuredClone(this.#seed); break;
      }
      this.#save();
      this.#render();
    });
    this.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const title = form.title.value.trim();
      if (!title) return;
      const id = Math.max(0, ...this.#books.map((b) => b.id)) + 1;
      this.#books.push({ id, title, author: form.author.value.trim() || 'Unknown', shelf: this.#shelves[0].id, rating: 0, cover: COVERS[id % COVERS.length] });
      form.reset();
      this.#save();
      this.#render();
      form.title.focus();
    });
    this.addEventListener('input', (e) => {
      if (e.target.name !== 'filter') return;
      this.#filter = e.target.value.trim().toLowerCase();
      this.#renderShelves();
    });
  }

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#books));
    } catch {}
  }

  #render() {
    const done = this.#books.filter((b) => b.shelf === 'done');
    const rated = done.filter((b) => b.rating);
    const avg = rated.length ? (rated.reduce((n, b) => n + b.rating, 0) / rated.length).toFixed(1) : '–';
    this.innerHTML = `
      <span slot="title">Reading list</span>
      <rl--stat slot="stats">${this.#books.length}<span slot="label">books</span></rl--stat>
      <rl--stat slot="stats">${this.#books.filter((b) => b.shelf === 'reading').length}<span slot="label">reading</span></rl--stat>
      <rl--stat slot="stats">${done.length}<span slot="label">finished</span></rl--stat>
      <rl--stat slot="stats">${avg}<span slot="label">average rating</span></rl--stat>
      <form slot="toolbar" class="row" autocomplete="off">
        <input name="title" placeholder="Title" aria-label="Title" required>
        <input name="author" placeholder="Author" aria-label="Author">
        <button class="primary" type="submit">Add book</button>
        <input name="filter" type="search" placeholder="Filter" aria-label="Filter books" value="${esc(this.#filter)}">
        <button type="button" data-act="reset" data-id="0">Reset</button>
      </form>
      ${this.#shelves.map((s) => `<rl--shelf data-shelf="${esc(s.id)}"><span slot="title">${esc(s.title)}</span><span slot="count"></span></rl--shelf>`).join('')}`;
    this.#renderShelves();
  }

  #renderShelves() {
    const order = this.#shelves.map((s) => s.id);
    for (const shelf of this.querySelectorAll('rl--shelf')) {
      const id = shelf.dataset.shelf;
      const books = this.#books.filter((b) => b.shelf === id && (!this.#filter || `${b.title} ${b.author}`.toLowerCase().includes(this.#filter)));
      shelf.querySelector('[slot=count]').textContent = books.length;
      for (const old of shelf.querySelectorAll('rl--book-card, p')) old.remove();
      shelf.insertAdjacentHTML('beforeend', books.length ? books.map((b) => {
        const at = order.indexOf(b.shelf);
        const stars = b.shelf === 'done'
          ? `<span slot="meta" aria-label="Rating ${b.rating} of 5">${[1, 2, 3, 4, 5].map((n) => `<button class="star" type="button" data-act="rate" data-id="${b.id}" data-value="${n}" aria-label="Rate ${n}" style="all:unset;cursor:pointer">${n <= b.rating ? '★' : '☆'}</button>`).join('')}</span>`
          : '';
        return `<rl--book-card style="--cover:${esc(b.cover)}">
          <span slot="title">${esc(b.title)}</span><span slot="author">${esc(b.author)}</span>${stars}
          <span slot="actions">
            <button type="button" data-act="left" data-id="${b.id}" ${at === 0 ? 'disabled' : ''} aria-label="Move left">←</button>
            <button type="button" data-act="right" data-id="${b.id}" ${at === order.length - 1 ? 'disabled' : ''} aria-label="Move right">→</button>
            <button type="button" data-act="remove" data-id="${b.id}" aria-label="Remove">Remove</button>
          </span></rl--book-card>`;
      }).join('') : '<p>Nothing here.</p>');
    }
  }
}

export const components = {
  'reading-list': defineHTMLComponent({
    name: 'reading-list',
    element: ReadingList,
    imports: [...ui.appShell.imports, { module: ui, from: './ui.html', as: 'rl' }],
  }),
};
