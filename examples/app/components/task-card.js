// A task card with behaviour. Exported only; the page chooses its tag names.
// <task-card> is the full card; a second tag ending in "-compact" renders a slim variant.
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.6rem 0.7rem; }
  :host(:focus-within) { outline: 2px solid var(--board-accent); outline-offset: 1px; }
  .title { margin: 0 0 0.35rem; font-weight: 600; overflow-wrap: anywhere; }
  :host([compact]) .title { margin: 0; font-weight: 500; text-decoration: line-through; color: var(--muted); }
  .meta { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
  .tag { font-size: 0.7rem; font-weight: 600; padding: 0 0.45rem; border-radius: 99px; background: color-mix(in srgb, var(--board-accent) 18%, transparent); }
  .actions { margin-left: auto; display: flex; gap: 0.2rem; }
  button { font: inherit; font-size: 0.8rem; line-height: 1; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: 6px; padding: 0.3rem 0.45rem; cursor: pointer; }
  button:disabled { opacity: 0.35; cursor: default; }
  .row { display: flex; gap: 0.5rem; align-items: center; }
`);

export class TaskCard extends HTMLElement {
  #task = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [sheet];
    this.shadowRoot.addEventListener('click', (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action || !this.#task) return;
      this.dispatchEvent(new CustomEvent('task-action', { bubbles: true, composed: true, detail: { id: this.#task.id, action } }));
    });
  }

  get compact() {
    return this.localName.endsWith('-compact');
  }

  set task(task) {
    this.#task = task;
    this.toggleAttribute('compact', this.compact);
    this.#render();
  }

  get task() {
    return this.#task;
  }

  #render() {
    const t = this.#task;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const first = t.status === 'todo', last = t.status === 'done';
    this.shadowRoot.innerHTML = this.compact
      ? `<div class="row"><p class="title">${esc(t.title)}</p><span class="actions"><button data-action="back" aria-label="Move back">←</button><button data-action="remove" aria-label="Delete">✕</button></span></div>`
      : `<p class="title">${esc(t.title)}</p>
         <div class="meta"><span class="tag">${esc(t.tag)}</span>
           <span class="actions">
             <button data-action="back" aria-label="Move back" ${first ? 'disabled' : ''}>←</button>
             <button data-action="forward" aria-label="Move forward" ${last ? 'disabled' : ''}>→</button>
             <button data-action="remove" aria-label="Delete">✕</button>
           </span></div>`;
  }
}
