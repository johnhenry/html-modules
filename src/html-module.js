/**
 * HTML modules: an HTML document that produces a module namespace.
 *
 *   <template export="Card">…</template>          → Card: HTMLTemplateElement
 *   <style export="theme">…</style>               → theme: CSSStyleSheet (or descriptor)
 *   <script type="module" export="controller">    → controller: JS module namespace
 *   <script type="application/json" export="cfg"> → cfg: parsed JSON
 *   <svg export="logo">…</svg>                     → logo: the element
 *   <template export="default">…</template>       → default export
 *
 * Re-exports (barrels), with native-looking and custom-element spellings:
 *   <module-export from="./controls.html">
 *     <module-binding name="Card" as="Panel"></module-binding>
 *   </module-export>
 *   <module-export from="./controls.js" all></module-export>   (export * from)
 *   <module-export from="./icons.html" namespace="icons">     (export * as icons from)
 *
 * Elements without `export` are private to the module.
 */
import { createNamespace, hasExport } from './namespace.js';

const REEXPORT_SELECTOR = 'module-export[from], export[from]';
const BINDING_SELECTOR = ':scope > module-binding, :scope > binding';

/**
 * Default interpretation of an exported element → exported value.
 * @param {Element} el
 * @param {{ url: string, window?: any, importModule: (url: string) => Promise<object>, scriptURL: (source: string, url: string) => string }} ctx
 */
export async function defaultExportValue(el, ctx) {
  const tag = el.localName;
  if (tag === 'template') return el;
  if (tag === 'style') {
    const cssText = el.textContent ?? '';
    const Sheet = ctx.window?.CSSStyleSheet;
    if (Sheet) {
      try {
        const sheet = new Sheet();
        if (typeof sheet.replaceSync === 'function') {
          sheet.replaceSync(cssText);
          return sheet;
        }
      } catch {}
    }
    return { kind: 'stylesheet', cssText };
  }
  if (tag === 'script') {
    const type = (el.getAttribute('type') ?? '').trim().toLowerCase();
    if (type === 'module') {
      const src = el.getAttribute('src');
      const url = src
        ? new URL(src, ctx.url).href
        : ctx.scriptURL(el.textContent ?? '', `${ctx.url}#${el.getAttribute('export')}`);
      return ctx.importModule(url);
    }
    if (type === 'application/json' || type.endsWith('+json')) {
      return JSON.parse(el.textContent ?? 'null');
    }
    throw new TypeError(`Unsupported exported <script type="${type}"> in ${ctx.url}`);
  }
  return el;
}

/**
 * Inline module source as a data: URL. Relative imports inside it will not resolve.
 * `url` (the HTML module URL plus `#exportName`) is recorded as the sourceURL for devtools.
 */
export function dataScriptURL(source, url) {
  const code = url ? `${source}\n//# sourceURL=${url}` : source;
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
}

function readReexport(node) {
  const from = node.getAttribute('from');
  const all = node.hasAttribute('all');
  const bindings = [...node.querySelectorAll(BINDING_SELECTOR)].map((b) => ({
    name: requireAttr(b, 'name'),
    as: b.getAttribute('as') ?? undefined,
  }));
  if (node.hasAttribute('name')) bindings.push({ name: node.getAttribute('name'), as: node.getAttribute('as') ?? undefined });
  const namespace = node.hasAttribute('namespace') ? requireAttr(node, 'namespace') : undefined;
  if (!all && !namespace && bindings.length === 0) {
    throw new SyntaxError(`<${node.localName} from="${from}"> must have \`all\`, \`namespace\`, or at least one binding`);
  }
  return { from, all, namespace, bindings };
}

function requireAttr(el, name) {
  const v = el.getAttribute(name);
  if (v == null || v === '') throw new SyntaxError(`<${el.localName}> requires a "${name}" attribute`);
  return v;
}

/**
 * Build the namespace for a parsed HTML module document.
 * @param {Document} doc
 * @param {object} options
 * @param {string} options.url                                  URL of the HTML module.
 * @param {(specifier: string, referrer: string) => Promise<object>} [options.load] load another module (needed for re-exports).
 * @param {(url: string) => Promise<object>} [options.importModule]
 * @param {(source: string, url: string) => string} [options.scriptURL]
 * @param {typeof defaultExportValue} [options.interpret]
 * @param {any} [options.window]
 * @returns {Promise<Readonly<Record<string, unknown>>>}
 */
export async function parseHTMLModule(doc, {
  url,
  load,
  importModule = (u) => import(u),
  scriptURL = dataScriptURL,
  interpret = defaultExportValue,
  window,
} = {}) {
  const ctx = { url, window, importModule, scriptURL };
  /** @type {Map<string, unknown>} */
  const local = new Map();
  for (const el of doc.querySelectorAll('[export]')) {
    const name = el.getAttribute('export').trim();
    if (!name) throw new SyntaxError(`Empty export name on <${el.localName}> in ${url}`);
    if (local.has(name)) throw new SyntaxError(`Duplicate export "${name}" in ${url}`);
    local.set(name, undefined);
    local.set(name, await interpret(el, ctx));
  }

  const explicit = new Map();
  const star = new Map(); // name -> value | AMBIGUOUS
  const AMBIGUOUS = Symbol('ambiguous');
  for (const node of doc.querySelectorAll(REEXPORT_SELECTOR)) {
    const { from, all, namespace, bindings } = readReexport(node);
    if (!load) throw new TypeError(`Re-export from "${from}" in ${url} requires a loader`);
    const ns = await load(from, url);
    if (namespace) {
      if (local.has(namespace) || explicit.has(namespace)) throw new SyntaxError(`Duplicate export "${namespace}" in ${url}`);
      explicit.set(namespace, ns);
    }
    for (const { name, as } of bindings) {
      if (!hasExport(ns, name)) {
        throw new SyntaxError(`The requested module '${from}' does not provide an export named '${name}' (re-exported by ${url})`);
      }
      const exported = as ?? name;
      if (local.has(exported) || explicit.has(exported)) throw new SyntaxError(`Duplicate export "${exported}" in ${url}`);
      explicit.set(exported, ns[name]);
    }
    if (all) {
      for (const name of Object.keys(ns)) {
        if (name === 'default') continue; // `export *` never re-exports default
        if (star.has(name) && star.get(name) !== ns[name]) star.set(name, AMBIGUOUS);
        else star.set(name, ns[name]);
      }
    }
  }

  const entries = new Map([...local, ...explicit]);
  for (const [name, value] of star) {
    if (!entries.has(name) && value !== AMBIGUOUS) entries.set(name, value);
  }
  return createNamespace(entries);
}
