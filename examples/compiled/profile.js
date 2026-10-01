// Compiled from profile.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, manifest } from "../../src/runtime.js";

const $x_userCard = defineHTMLComponent({
  name: "user-card",
  template: "\n    <article part=\"card\">\n      <h3>{{name}}</h3>\n      <p class=\"meta\">{{role}} · <span class=\"posts\">{{count}}</span> posts</p>\n      <a class=\"profile\" href=\"/users/{{name}}\" title=\"Profile of {{name}} ({{count}} posts)\">profile</a>\n      <a class=\"website\" href=\"{{website}}\">website</a>\n      <button disabled=\"{{off}}\">Follow</button>\n      <p class=\"literal\">Write \\{{name}} to print the braces.</p>\n    </article>\n  ",
  shadow: "open",
  delegatesFocus: false,
  styles: ["\n    :host { display: block; }\n    article { border: 1px solid var(--border, #ccc); border-radius: 8px; padding: 0.75rem 1rem; max-width: 28rem; }\n    h3 { margin: 0 0 0.25rem; }\n    .meta { color: var(--muted, #666); margin: 0 0 0.5rem; }\n    a, button { margin-right: 0.5rem; }\n  "],
  props: [{"name":"name","type":"string"},{"name":"role","type":"string"},{"name":"count","type":"number"},{"name":"open","type":"boolean"}],
  imports: [],
  url: import.meta.url,
});
const $components = manifest({
  "user-card": $x_userCard,
}, []);

export {
  $x_userCard as userCard,
  $components as components,
};
