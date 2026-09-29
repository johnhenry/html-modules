// Compiled from icons.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest, registerComponents } from "../../src/runtime.js";

const $x_star = defineHTMLComponent({
  name: "star",
  template: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z\"/></svg>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; } svg { width: 100%; height: 100%; }"],
  imports: [],
  url: import.meta.url,
});
const $x_heart = defineHTMLComponent({
  name: "heart",
  template: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.2 2.3h2c.6-1.2 2.1-2.3 4.2-2.3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z\"/></svg>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; } svg { width: 100%; height: 100%; }"],
  imports: [],
  url: import.meta.url,
});
const $x_check = defineHTMLComponent({
  name: "check",
  template: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 12.5l5 5L20 6.5\"/></svg>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; } svg { width: 100%; height: 100%; }"],
  imports: [],
  url: import.meta.url,
});
const $x_plus = defineHTMLComponent({
  name: "plus",
  template: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M12 5v14M5 12h14\"/></svg>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; } svg { width: 100%; height: 100%; }"],
  imports: [],
  url: import.meta.url,
});
const $components = manifest({
  "star": $x_star,
  "heart": $x_heart,
  "check": $x_check,
  "plus": $x_plus,
}, []);
registerComponents({ components: $components }, { as: "reg", from: import.meta.url });

export {
  $x_star as star,
  $x_heart as heart,
  $x_check as check,
  $x_plus as plus,
  $components as components,
};
