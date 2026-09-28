// A JS module that exports a component without registering it.
// The importing HTML chooses the tag name (or several).
export class Counter extends HTMLElement {
  #count = 0;
  connectedCallback() {
    if (this.firstChild) return;
    const label = this.getAttribute('label') ?? 'count';
    const button = document.createElement('button');
    button.textContent = `${label}: 0`;
    button.addEventListener('click', () => (button.textContent = `${label}: ${++this.#count}`));
    this.append(button);
  }
}
