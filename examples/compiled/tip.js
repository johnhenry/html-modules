// Compiled from tip.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest } from "../../src/runtime.js";

const $default = defineHTMLComponent({
  name: null,
  template: "<b>Tip</b> <slot></slot>",
  shadow: "open",
  delegatesFocus: false,
  styles: ["\n    :host { display: block; border: 1px dashed var(--accent, #5b4bd6); border-radius: 8px; padding: 0.5rem 0.75rem; }\n    b { color: var(--accent, #5b4bd6); }\n  "],
  imports: [],
  url: import.meta.url,
});
const $components = manifest({}, []);

export {
  $components as components,
};
export default $default;
