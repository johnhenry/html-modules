// JS components that are exported, never self-registered. Importers choose the tags.
export class Counter extends HTMLElement {
  #count = 0;
  #button;
  connectedCallback() {
    if (this.#button) return;
    this.#button = document.createElement('button');
    this.#button.addEventListener('click', () => this.#render(++this.#count));
    this.append(this.#button);
    this.#render(0);
  }
  #render(n) {
    this.#button.textContent = `<${this.localName}> ${n}`;
  }
}

export default class Greeting extends HTMLElement {
  connectedCallback() {
    this.textContent = `Hello from <${this.localName}>, registered after its import was inserted late.`;
  }
}
