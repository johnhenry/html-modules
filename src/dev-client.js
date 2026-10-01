/**
 * The browser half of `html-module dev`: served at `/@html-modules/client.js` and added to every HTML page the dev
 * server serves. It listens for file changes over Server-Sent Events and applies them without losing the page's
 * state where it can:
 *
 *  - a changed `.html` the page has loaded as an HTML module → `HTMLModules.hotReload(url)`: components and
 *    styles are swapped under live elements. When that cannot be done in place (exports added or removed, a
 *    changed shadow mode, new observed attributes, …) the page reloads.
 *  - the page itself, or any other file (a script, a stylesheet, a compiled module): the page reloads.
 *  - a module with a syntax error: nothing changes; the error is shown in an overlay and in the console, and clears
 *    on the next good save.
 *
 * It uses the page's own `globalThis.HTMLModules` (set by `@johnhenry/html-modules/browser`) so it shares its
 * module cache and registry; a page without it is simply reloaded on any change.
 */
const prefix = '[html-modules]';
let overlay = null;

function show(message) {
  clear();
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('pre { position: fixed; inset: auto 1rem 1rem 1rem; z-index: 2147483647; margin: 0; padding: 0.75rem 1rem; max-height: 40vh; overflow: auto; background: #3b0d0d; color: #ffd9d9; border: 1px solid #ff6b6b; border-radius: 6px; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; }');
  root.adoptedStyleSheets = [sheet];
  const pre = document.createElement('pre');
  pre.textContent = `${prefix} ${message}`;
  root.append(pre);
  document.documentElement.append(host);
  overlay = host;
}

function clear() {
  overlay?.remove();
  overlay = null;
}

async function apply({ path }) {
  const url = new URL(path, location.href);
  const page = url.pathname === location.pathname || (location.pathname.endsWith('/') && url.pathname === `${location.pathname}index.html`);
  const modules = globalThis.HTMLModules;
  if (page || !/\.html?$/i.test(url.pathname) || typeof modules?.hotReload !== 'function') {
    console.info(`${prefix} ${path} changed: reloading`);
    location.reload();
    return;
  }
  try {
    const result = await modules.hotReload(url.href);
    clear();
    if (result.skipped) return; // an HTML file this page never loaded as a module
    if (result.reload) {
      console.info(`${prefix} ${path} changed and cannot be applied in place (${result.reasons.join('; ')}): reloading`);
      location.reload();
    } else {
      console.info(`${prefix} ${path}: updated ${result.updated.join(', ') || 'nothing'} (${result.elements} element${result.elements === 1 ? '' : 's'})`);
      document.dispatchEvent(new CustomEvent('html-modules:hot', { detail: { path, ...result } }));
    }
  } catch (error) {
    console.error(`${prefix} ${path}:`, error);
    show(`${path}\n${error?.message ?? error}`);
  }
}

let opened = false;
const source = new EventSource('/@html-modules/events');
source.addEventListener('open', () => {
  if (opened) location.reload(); // the server restarted: files may have changed meanwhile
  opened = true;
});
source.addEventListener('change', (event) => apply(JSON.parse(event.data)));
