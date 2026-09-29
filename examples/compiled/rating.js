// Compiled from rating.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest } from "../../src/runtime.js";
import * as $m0 from "./icons.js";
import * as $m1 from "./themes.js";

const $imports = [
  { module: $m0, from: "./icons.html", as: "icon", bindings: [] },
  { module: $m1, from: "./themes.html", bindings: [{"export":"gold","adopt":true}] },
];
const $x_stars = defineHTMLComponent({
  name: "stars",
  template: "<icon--star></icon--star><icon--star></icon--star><icon--star></icon--star><slot></slot>",
  shadow: "open",
  delegatesFocus: false,
  styles: [":host { display: inline-flex; gap: 0.1rem; color: var(--gold, #d4a017); font-size: 1.15rem; }"],
  imports: $imports,
  url: import.meta.url,
});
const $components = manifest({
  "stars": $x_stars,
}, []);

export {
  $x_stars as stars,
  $components as components,
};
