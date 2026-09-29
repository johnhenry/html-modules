// Compiled from vault.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest } from "../../src/runtime.js";

const $x_safe = defineHTMLComponent({
  name: "safe",
  template: "🔒 <slot></slot> <input aria-label=\"PIN\" placeholder=\"PIN\">",
  shadow: "closed",
  delegatesFocus: true,
  styles: ["\n    :host { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem; border-radius: 8px; border: 1px solid var(--border, #ccc); background: var(--surface-2, #f4f4f0); }\n    input { font: inherit; width: 5.5rem; padding: 0.2rem 0.4rem; border-radius: 6px; border: 1px solid var(--border, #ccc); background: var(--surface, #fff); color: var(--text, #111); }\n  "],
  imports: [],
  url: import.meta.url,
});
const $x_glass = defineHTMLComponent({
  name: "glass",
  template: "🔍 <slot></slot>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem; border-radius: 8px; border: 1px dashed var(--accent, #5b4bd6); }"],
  imports: [],
  url: import.meta.url,
});
const $components = manifest({
  "safe": $x_safe,
  "glass": $x_glass,
}, []);

export {
  $x_safe as safe,
  $x_glass as glass,
  $components as components,
};
