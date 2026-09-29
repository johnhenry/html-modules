// Behaviour in JavaScript on top of a template written in HTML: load the HTML
// module, extend its definition's base element, and export the result as a
// component so <html-import src="./like-button.js" as="x"> can bind it.
import { HTMLModules } from '../../src/browser.js';
import { defineHTMLComponent } from '../../src/runtime.js';

const { likeView } = await HTMLModules.load(new URL('./like-view.html', import.meta.url).href);

export class LikeButton extends likeView.element {
  #count = 0;
  connectedCallback() {
    this.#count = Number(this.getAttribute('count') ?? 0);
    this.#render();
    this.shadowRoot.querySelector('button').addEventListener('click', () => {
      const liked = this.toggleAttribute('liked');
      this.#count += liked ? 1 : -1;
      this.#render();
    });
  }
  #render() {
    this.shadowRoot.querySelector('output').textContent = this.#count;
    this.shadowRoot.querySelector('button').setAttribute('aria-pressed', String(this.hasAttribute('liked')));
  }
}

export const likeButton = defineHTMLComponent({ name: 'like-button', element: LikeButton, imports: likeView.imports });
