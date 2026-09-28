// A behavioural component written in JS. The HTML barrels re-export it, so
// consumers import it from HTML like any other part of the library.
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host { display: block; font-family: var(--lib-font); }
  [part="tablist"] { display: flex; gap: 0.25rem; flex-wrap: wrap; border-bottom: 1px solid var(--lib-border); margin-bottom: 0.75rem; }
  button { font: inherit; font-size: 0.88rem; border: 0; background: none; color: var(--lib-muted); padding: 0.45rem 0.7rem;
           border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; }
  button[aria-selected="true"] { color: var(--lib-accent); border-bottom-color: var(--lib-accent); font-weight: 600; }
`);

export class Tabs extends HTMLElement {
  #list;
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    this.#list = document.createElement('div');
    this.#list.setAttribute('part', 'tablist');
    this.#list.setAttribute('role', 'tablist');
    root.append(this.#list, document.createElement('slot'));
    const panels = [...this.children].filter((c) => c.hasAttribute('data-tab'));
    panels.forEach((panel, i) => {
      const b = document.createElement('button');
      b.textContent = panel.dataset.tab;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.select(i));
      this.#list.append(b);
    });
    this.select(0);
  }

  select(index) {
    const panels = [...this.children].filter((c) => c.hasAttribute('data-tab'));
    panels.forEach((p, i) => (p.hidden = i !== index));
    [...this.#list.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
    this.dispatchEvent(new CustomEvent('tabchange', { detail: { index } }));
  }
}
