// Imports a module as <ui--…> with the sanitizer chosen by the query string, then reports what rendered and which
// execution vectors ran (window.__pwned). Query: module=untrusted|benign, mode=raw|import|default|element|dynamic-js,
// remote=<origin of the module host, a second origin>, profile=<profile name>, onlyReport=1
import { HTMLModules } from '../../../../src/browser.js';
import { safeFragmentSanitizer } from '../../../../src/safe-fragment.js';
import * as safeFragment from '../../../../node_modules/@johnhenry/safe-fragment/dist/index.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'import';
const remote = params.get('remote') ?? '';
const file = `${params.get('module') ?? 'untrusted'}.html`;
const src = `${remote}/test/browser/fixtures/sanitize/${file}${remote ? '?header=Access-Control-Allow-Origin:*' : ''}`;

window.__pwned = [];
window.__events = [];
window.__violations = [];
document.addEventListener('html-modules:sanitize', (e) => window.__events.push(e.detail));
document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(`${e.violatedDirective}: ${e.blockedURI || e.sample}`));

const profile = params.get('profile') ?? { namespaces: ['ui'], attributes: ['tone', 'label'] };
const sanitize = safeFragmentSanitizer({ safeFragment, profile });

try {
  const as = 'ui';
  if (mode === 'raw') await HTMLModules.import(src, { as });
  else if (mode === 'import') await HTMLModules.import(src, { as, sanitize });
  else if (mode === 'default') {
    HTMLModules.sanitize = sanitize;
    await HTMLModules.import(src, { as });
  } else if (mode === 'element') {
    const el = document.createElement('html-import');
    el.setAttribute('src', src);
    el.setAttribute('as', as);
    el.sanitize = sanitize;
    document.body.append(el);
    await el.ready;
  }
  const card = document.createElement('ui--card');
  card.setAttribute('label', 'Ada');
  const intro = Object.assign(document.createElement('span'), { slot: 'intro', textContent: 'intro' });
  card.append(intro, 'light'); // (no innerHTML: the page may run under Trusted Types)
  document.body.append(card);
  await new Promise((r) => setTimeout(r, 300)); // let any image or iframe payload run
  const root = card.shadowRoot;
  for (const id of ['js', 'btn']) root.querySelector('.' + id)?.click(); // payloads that need a click
  await new Promise((r) => setTimeout(r, 100));
  window.__result = {
    html: root.innerHTML,
    has: Object.fromEntries(['script', 'iframe', 'style', 'img', 'ui--badge', 'slot'].map((t) => [t, root.querySelector(t) !== null])),
    attrs: {
      imgOnerror: root.querySelector('.img')?.hasAttribute('onerror') ?? null,
      jsHref: root.querySelector('.js')?.getAttribute('href') ?? null,
      btnOnclick: root.querySelector('.btn')?.hasAttribute('onclick') ?? null,
    },
    badgeUpgraded: root.querySelector('ui--badge')?.shadowRoot?.innerHTML ?? null,
    sheets: root.adoptedStyleSheets.length,
    trustedTypes: Boolean(window.trustedTypes?.createPolicy),
  };
} catch (error) {
  window.__result = { error: String(error?.message ?? error) };
}
window.__done = true;
