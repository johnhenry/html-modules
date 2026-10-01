// <safe-fragment> inside a (trusted) component's template: the component hands untrusted text to it as an attribute.
import { HTMLModules } from '../../../../src/browser.js';
import * as safeFragment from '../../../../examples/vendor/safe-fragment/safe-fragment.js';

window.__pwned = [];
try {
  safeFragment.registerSafeFragment();
  await HTMLModules.import('./bio.html', { as: 'bio' });
  const card = document.createElement('bio--card');
  card.setAttribute('bio', '<p>Hello <strong>world</strong> <img src="/package.json" onerror="window.__pwned.push(\'img onerror\')"> <a href="javascript:window.__pwned.push(\'link\')">x</a></p>');
  document.body.append(card);
  await new Promise((r) => setTimeout(r, 400));
  const first = card.shadowRoot.querySelector('safe-fragment');
  first.querySelector('a')?.click();
  const initial = first.innerHTML;
  card.setAttribute('bio', '<p>Second <em>one</em> <iframe srcdoc="&lt;script&gt;parent.__pwned.push(\'iframe\')&lt;/script&gt;"></iframe></p>');
  await new Promise((r) => setTimeout(r, 400));
  window.__result = { initial, updated: first.innerHTML, pwned: window.__pwned, tag: first.localName, defined: Boolean(customElements.get('safe-fragment')) };
} catch (error) {
  window.__result = { error: String(error?.stack ?? error) };
}
window.__done = true;
