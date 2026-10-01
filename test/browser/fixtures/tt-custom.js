// The page owns the Trusted Types policy (the CSP lists only "my-policy") and hands it to html-modules.
import { createHTMLModules } from '/src/index.js';

window.__sinks = [];
const policy = window.trustedTypes?.createPolicy
  ? window.trustedTypes.createPolicy('my-policy', { createHTML: (html) => { window.__sinks.push(html.length); return html; } })
  : { createHTML: (html) => { window.__sinks.push(html.length); return html; } };
const modules = createHTMLModules({ trustedTypes: policy });
const ns = await modules.load('./strict-mod.html');
ns.greet.define('t-greet');
const el = document.createElement('t-greet'); // (insertAdjacentHTML with a string is itself a Trusted Types sink)
el.setAttribute('who', 'TT');
document.body.append(el);
window.__text = el.shadowRoot.querySelector('b').textContent;
window.__tt = Boolean(window.trustedTypes?.createPolicy);
window.__done = true;
