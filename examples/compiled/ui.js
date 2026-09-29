// Compiled from ui.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest } from "../../src/runtime.js";

const $x_card = defineHTMLComponent({
  name: "card",
  template: "\n    <article part=\"card\">\n      <header part=\"title\"><slot name=\"title\"></slot></header>\n      <slot></slot>\n      <footer part=\"footer\"><slot name=\"footer\"></slot></footer>\n    </article>\n  ",
  shadow: "open",
  delegatesFocus: false,
  styles: ["\n    :host { display: block; background: var(--surface, #fff); color: var(--text, #111); border: 1px solid var(--border, #ddd); border-radius: 10px; padding: 0.9rem 1rem; }\n    header ::slotted(*) { display: block; margin: 0 0 0.35rem; font-weight: 650; font-size: 1rem; }\n    footer ::slotted(*) { display: block; margin-top: 0.6rem; color: var(--muted, #666); font-size: 0.86rem; }\n  "],
  imports: [],
  url: import.meta.url,
});
const $x_button = defineHTMLComponent({
  name: "button",
  template: "<button part=\"button\" type=\"button\"><slot></slot></button>",
  shadow: "open",
  delegatesFocus: true,
  styles: ["\n    :host { display: inline-block; }\n    button { font: inherit; font-size: 0.9rem; cursor: pointer; border-radius: 8px; padding: 0.4rem 0.85rem;\n      border: 1px solid var(--brand, var(--accent, #5b4bd6)); background: var(--brand, var(--accent, #5b4bd6)); color: var(--surface, #fff); }\n    :host([variant=\"ghost\"]) button { background: transparent; color: var(--brand, var(--accent, #5b4bd6)); }\n    button:focus-visible { outline: 2px solid var(--brand, var(--accent, #5b4bd6)); outline-offset: 2px; }\n  "],
  imports: [],
  url: import.meta.url,
});
const $x_badge = defineHTMLComponent({
  name: "badge",
  template: "<slot></slot>",
  shadow: "open",
  delegatesFocus: false,
  styles: ["\n    :host { display: inline-block; font-size: 0.75rem; font-weight: 600; padding: 0.1rem 0.55rem; border-radius: 999px;\n      background: var(--accent-soft, #ebe8ff); color: var(--text, #111); }\n    :host([tone=\"ok\"]) { background: var(--ok-soft, #e1f3e8); color: var(--ok, #1f7a4a); }\n    :host([tone=\"warn\"]) { background: var(--warn-soft, #fbf0d9); color: var(--warn, #8a5a00); }\n    :host([tone=\"bad\"]) { background: var(--bad-soft, #fbe6e4); color: var(--bad, #b3261e); }\n  "],
  imports: [],
  url: import.meta.url,
});
const $x_callout = defineHTMLComponent({
  name: "callout",
  template: "<aside part=\"callout\"><slot></slot></aside>",
  shadow: "open",
  delegatesFocus: false,
  styles: ["\n    :host { display: block; border-left: 4px solid var(--brand, var(--accent, #5b4bd6)); background: var(--surface-2, #f4f4f0); padding: 0.6rem 0.85rem; border-radius: 0 8px 8px 0; }\n    ::slotted(strong) { color: var(--brand, var(--accent, #5b4bd6)); }\n  "],
  imports: [],
  url: import.meta.url,
});
const $x_meta = {"library":"ui","version":"1.2.0","components":4};
const $components = manifest({
  "card": $x_card,
  "button": $x_button,
  "badge": $x_badge,
  "callout": $x_callout,
}, []);

export {
  $x_card as card,
  $x_button as button,
  $x_badge as badge,
  $x_callout as callout,
  $x_meta as meta,
  $components as components,
};
export default $x_callout;
