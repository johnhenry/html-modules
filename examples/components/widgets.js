// JavaScript-authored components that take part in the same model (PRD §21).
// Only the `components` manifest names components; VERSION and formatDate are
// ordinary exports and are never registered.
import { defineHTMLComponent } from '../../src/runtime.js';

export const VERSION = '3.0.1';
export const formatDate = (date) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);

/** A button that counts its clicks. */
export class ClickCounter extends HTMLElement {
  #count = 0;
  #shadow = this.attachShadow({ mode: 'open' });
  connectedCallback() {
    this.#count = Number(this.getAttribute('start') ?? 0);
    this.#shadow.innerHTML = `<style>button{font:inherit;cursor:pointer;border-radius:8px;padding:.35rem .75rem;border:1px solid var(--border,#ccc);background:var(--surface-2,#f0f0f0);color:var(--text,#111)}output{font-weight:700;margin-left:.4rem}</style><button type="button" part="button"><slot>Clicks</slot><output>${this.#count}</output></button>`;
    this.#shadow.querySelector('button').addEventListener('click', () => {
      this.#shadow.querySelector('output').textContent = ++this.#count;
      this.dispatchEvent(new CustomEvent('count', { detail: this.#count, bubbles: true }));
    });
  }
}

/** Shows the current time, updated every second while connected. */
export class LiveClock extends HTMLElement {
  #timer;
  connectedCallback() {
    const tick = () => (this.textContent = new Date().toLocaleTimeString());
    tick();
    this.#timer = setInterval(tick, 1000);
  }
  disconnectedCallback() {
    clearInterval(this.#timer);
  }
}

export const components = {
  'click-counter': ClickCounter,
  'live-clock': LiveClock,
};
