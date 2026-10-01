// Under `default-src 'self'; script-src 'self'; style-src 'self'; require-trusted-types-for 'script'`:
// no inline script, no inline style, every HTML sink needs TrustedHTML.
const violations = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective}: ${e.blockedURI || e.sample}`));
window.__violations = violations;
await document.getElementById('m').ready;
const g = document.getElementById('g');
g.who = 'Ada';
window.__strict = {
  trustedTypes: Boolean(window.trustedTypes?.createPolicy),
  text: g.shadowRoot.querySelector('b').textContent,
  href: g.shadowRoot.querySelector('a').hasAttribute('href'),
  color: getComputedStyle(g).color,
  sheets: g.shadowRoot.adoptedStyleSheets.length,
};
window.__done = true;
