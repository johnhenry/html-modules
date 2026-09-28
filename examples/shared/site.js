// Shared helpers for the example pages: theme toggle, "covers" chips, and
// small renderers for values, checks and errors.
import { pages, allItems } from './catalog.js';

const THEME_KEY = 'wmg-examples-theme';

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
  if (typeof value === 'function') return value.prototype instanceof HTMLElement ? `class ${value.name || '(anonymous)'} extends HTMLElement` : `function ${value.name || ''}`;
  if (typeof CSSStyleSheet !== 'undefined' && value instanceof CSSStyleSheet) return `CSSStyleSheet (${value.cssRules.length} rules)`;
  if (value?.kind === 'stylesheet') return `{ kind: "stylesheet", cssText: ${JSON.stringify(value.cssText.trim().slice(0, 40))}… }`;
  if (typeof Element !== 'undefined' && value instanceof Element) {
    const id = value.id ? `#${value.id}` : '';
    return `<${value.localName}${id}> element`;
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
  const view = (ok) => (ok == null ? ['pending', 'not run'] : ok ? ['pass', 'pass'] : ['fail', 'fail']);
  target.innerHTML = checks
    .map(([label, ok]) => { const [cls, text] = view(ok); return `<li><span class="status ${cls}">${text}</span><span>${label}</span></li>`; })
    .join('');
  target.classList.add('checks');
  return checks.every(([, ok]) => ok === true);
}

export function status(ok, text = ok ? 'pass' : 'fail') {
  return `<span class="status ${ok === 'pending' ? 'pending' : ok ? 'pass' : 'fail'}">${esc(text)}</span>`;
}

/** An mport resolution trace (lookup / resolved / probe / ok / fail / skip / aborted) as a list. */
export function traceHTML(trace = []) {
  const trim = (s) => String(s).replaceAll(location.origin, '');
  return `<ol class="trace">${trace.map((e) => `<li class="t-${esc(e.type)}"><span class="t-type">${esc(e.type)}</span> <span class="t-provider">${esc(e.provider)}</span>` +
    `${e.version ? ` → <code>${esc(e.version)}</code>` : ''}` +
    `${e.cached ? ' <span class="muted">(cached)</span>' : ''}` +
    `${e.ms != null ? ` <span class="muted">${Math.round(e.ms)} ms</span>` : ''}` +
    `${e.reason ? ` <span class="muted">${esc(e.reason)}</span>` : ''}` +
    `${e.error ? ` <span class="t-error">${esc(trim(e.error))}</span>` : ''}</li>`).join('')}</ol>`;
}

/** mport's router.health.snapshot() as a table. */
export function healthHTML(snapshot) {
  const rows = Object.entries(snapshot)
    .map(([name, s]) => `<tr><td><code>${esc(name)}</code></td><td>${s.ok}</td><td>${s.fail}</td><td>${s.streak}</td><td>${s.latency == null ? '—' : `${Math.round(s.latency)} ms`}</td><td>${s.healthy ? status(true, 'closed') : status(false, 'open')}</td></tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>provider</th><th>ok</th><th>fail</th><th>streak</th><th>latency</th><th>circuit</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
