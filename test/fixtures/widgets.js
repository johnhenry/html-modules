// A JS module with a component manifest (PRD §21): only the manifest's
// entries are components; VERSION and formatDate are never registered.
export const VERSION = '2.1';
export const formatDate = (d) => new Date(d).toISOString().slice(0, 10);

export class Counter extends HTMLElement {
  connectedCallback() {
    this.textContent = `count: ${this.getAttribute('start') ?? 0}`;
  }
}

export class Clock extends HTMLElement {}

export const components = {
  'tally-counter': Counter,
  'wall-clock': Clock,
};
