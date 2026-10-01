// Shared helpers for the example pages: theme toggle, "covers" chips, and
// small renderers for values, checks and errors.
import { pages, allItems } from './catalog.js';

const THEME_KEY = 'html-modules-examples-theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

applyTheme(readTheme());

function currentScheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

for (const button of document.querySelectorAll('.theme-toggle')) {
  const label = () => (button.textContent = currentScheme() === 'dark' ? 'Light mode' : 'Dark mode');
  label();
  button.addEventListener('click', () => {
    const next = currentScheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    label();
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
}

// <nav class="site-nav"></nav> → links to every page.
for (const nav of document.querySelectorAll('nav.site-nav')) {
  const here = location.pathname.split('/').pop() || 'index.html';
  nav.innerHTML = [{ href: 'index.html', title: 'All examples' }, ...pages]
    .map((p) => `<a href="./${p.href}"${p.href === here ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('');
}

// <pre data-source="./components/ui.html"></pre> → that file's source.
for (const pre of document.querySelectorAll('pre[data-source]')) {
  fetch(pre.dataset.source, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
    .then((text) => { pre.innerHTML = `<code>${esc(text.trim())}</code>`; })
    .catch((e) => { pre.textContent = `Could not load ${pre.dataset.source}: ${e.message}`; });
}

// <div class="covers" data-page="id"></div> → the checklist items this page covers.
const labels = new Map(allItems.map((i) => [i.id, i.label]));
for (const host of document.querySelectorAll('.covers[data-page]')) {
  const page = pages.find((p) => p.id === host.dataset.page);
  if (!page) continue;
  host.innerHTML = `<details><summary>Covers ${page.covers.length} checklist items</summary><ul class="chips">${page.covers
    .map((id) => `<li class="chip" title="${esc(labels.get(id) ?? id)}">${esc(id)}</li>`)
    .join('')}</ul></details>`;
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** A short human description of an exported value. */
export function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const tag = Object.prototype.toString.call(value);
  if (tag === '[object Module]') return `Module { ${Object.keys(value).join(', ')} }`;
  if (tag === '[object HTMLComponent]') return value.isClass ? `HTMLComponent "${value.name}" (class ${value.element.name})` : `HTMLComponent "${value.name ?? '(default)'}" (template, shadow: ${value.shadow}${value.styles.length ? `, ${value.styles.length} style` : ''}${value.imports.length ? `, ${value.imports.length} import${value.imports.length > 1 ? 's' : ''}` : ''})`;
  if (tag === '[object HTMLStylesheet]') return `HTMLStylesheet "${value.name}" (${value.css.trim().length} chars of CSS)`;
  if (typeof value === 'function') return value.prototype instanceof HTMLElement ? `class ${value.name || '(anonymous)'} extends HTMLElement` : `function ${value.name || ''}`;
  if (typeof CSSStyleSheet !== 'undefined' && value instanceof CSSStyleSheet) return `CSSStyleSheet (${value.cssRules.length} rules)`;
  if (typeof Element !== 'undefined' && value instanceof Element) {
    const id = value.id ? `#${value.id}` : '';
    return `<${value.localName}${id}> element`;
  }
  if (typeof value === 'object' && Object.values(value).length && Object.values(value).every((v) => typeof v?.define === 'function')) {
    return `manifest { ${Object.keys(value).map((k) => JSON.stringify(k)).join(', ')} }`;
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? json.slice(0, 77) + '…' : json;
    } catch {
      return tag;
    }
  }
  return JSON.stringify(value);
}

/** Render a namespace as a table of export → value. */
export function namespaceTable(ns) {
  const rows = Object.keys(ns)
    .map((k) => `<tr><td><code>${esc(k)}</code></td><td>${esc(describe(ns[k]))}</td></tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>export</th><th>value</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function errorText(error) {
  if (!error) return String(error);
  let text = `${error.name}: ${error.message}`;
  if (error.cause) text += `\n  cause: ${error.cause.name ?? 'Error'}: ${error.cause.message ?? error.cause}`;
  if (error.errors?.length) text += error.errors.map((e) => `\n  - ${e.message ?? e}`).join('');
  return text;
}

/** A list of labelled checks. `checks` is [label, boolean | null][]; null means "not run yet". */
export function renderChecks(target, checks) {
  const view = (ok) => (ok == null ? ['pending', 'not run'] : ok === 'unsupported' ? ['unsupported', 'unsupported here'] : ok ? ['pass', 'pass'] : ['fail', 'fail']);
  target.innerHTML = checks
    .map(([label, ok]) => { const [cls, text] = view(ok); return `<li><span class="status ${cls}">${text}</span><span>${label}</span></li>`; })
    .join('');
  target.classList.add('checks');
  return checks.every(([, ok]) => ok === true || ok === 'unsupported');
}

export function status(ok, text = ok ? 'pass' : 'fail') {
  return `<span class="status ${ok === 'pending' ? 'pending' : ok === 'unsupported' ? 'unsupported' : ok ? 'pass' : 'fail'}">${esc(text)}</span>`;
}
