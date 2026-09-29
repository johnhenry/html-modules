/**
 * Module records: the static description of an HTML module, produced the
 * same way whether the source was parsed by a DOM (`readHTMLModule`, used by
 * the browser loader) or scanned as text (`scanHTMLModule`, used by the
 * compiler in Node). Records are plain JSON.
 *
 *   <html-import src="./icons.html" as="icon"></html-import>     → imports[]
 *   <html-export name="custom-card" shadow="open">                → a component
 *     <style>:host { display: block }</style>                      (styles)
 *     <template><article><slot></slot></article></template>        (template)
 *   </html-export>
 *   <html-export name="dark"><style>…</style></html-export>       → a stylesheet
 *   <html-export name="config">                                   → data
 *     <script type="application/json">{"size":3}</script>
 *   </html-export>
 *   <html-export src="./more.html"></html-export>                 → re-export every component
 *   <html-export src="./b.html" name="button" import="fancy-button"></html-export>
 *                                                                 → re-export one, renamed
 *   <html-export name="default">…</html-export>                   → the default export (`export default`)
 *   <html-export name>…</html-export>                             → the same: an empty name is the default
 *   <html-export name="custom-card" default>…</html-export>       → named, and also the default export
 *                                                                   (`export { customCard, customCard as default }`)
 *   <html-import src="./icons.html" as="icon" delimiter="-">      → tags <icon-star>, … inside this module
 *
 * An export record's `name` is its named-export name, or null for the
 * default-only export (`name="default"` or a bare `name`); `default: true`
 * marks the default export, whichever way it was spelled. A module has at
 * most one default. Re-exports are never the default.
 *
 * An import's `delimiter` is present only when written; absent, it is "--"
 * (inside modules the page's library-wide default does not apply, so a
 * module's own templates always know their tags).
 *
 * @typedef {{ export: string, element?: string, adopt?: boolean }} BindingRecord
 * @typedef {{ src: string, as?: string, delimiter?: string, type?: string, bindings: BindingRecord[] }} ImportRecord
 * @typedef {{ kind: 'component', name: string|null, default?: true, template: string, shadow: 'open'|'closed', delegatesFocus: boolean, styles: string[] }
 *         | { kind: 'stylesheet', name: string|null, default?: true, css: string }
 *         | { kind: 'data', name: string|null, default?: true, value: unknown }
 *         | { kind: 'reexport', src: string, name?: string, import?: string }} ExportRecord
 * @typedef {{ url: string, imports: ImportRecord[], exports: ExportRecord[] }} ModuleRecord
 *
 * A "raw element" is the neutral input both readers produce:
 * @typedef {{ tag: string, attrs: Record<string, string>, children: Array<{ tag: string, attrs: Record<string, string>, html?: string, text?: string }> }} RawElement
 */
import { assertDelimiter, assertExportName, assertNamespace } from './names.js';

const JSON_TYPE = /^(application|text)\/([\w.+-]+\+)?json$/i;
const has = (attrs, name) => Object.prototype.hasOwnProperty.call(attrs, name);
const nonEmpty = (v) => (v == null || v === '' ? undefined : v);

function describe(raw) {
  const bits = ['name', 'src'].filter((a) => has(raw.attrs, a)).map((a) => ` ${a}="${raw.attrs[a]}"`);
  if (has(raw.attrs, 'default')) bits.push(' default');
  return `<${raw.tag}${bits.join('')}>`;
}

/** Build a binding record from an <html-binding>'s attributes. */
export function bindingRecord(attrs, where = '') {
  const name = nonEmpty(attrs.export);
  if (!name) throw new SyntaxError(`<html-binding> requires an "export" attribute${where}`);
  const element = nonEmpty(attrs.element);
  return { export: name, ...(element && { element }), ...(has(attrs, 'adopt') && { adopt: true }) };
}

/** Build an import record from a raw <html-import>. */
export function importRecord(raw, url = '') {
  const where = url ? ` in ${url}` : '';
  const src = nonEmpty(raw.attrs.src);
  if (!src) throw new SyntaxError(`<html-import> requires a "src" attribute${where}`);
  const as = nonEmpty(raw.attrs.as);
  if (as) {
    try {
      assertNamespace(as);
    } catch (error) {
      throw new SyntaxError(`${error.message}${where}`);
    }
  }
  const delimiter = has(raw.attrs, 'delimiter') ? raw.attrs.delimiter : undefined;
  if (delimiter !== undefined) {
    try {
      assertDelimiter(delimiter);
    } catch (error) {
      throw new SyntaxError(`${error.message}${where}`);
    }
  }
  const type = nonEmpty(raw.attrs.type);
  const bindings = raw.children.filter((c) => c.tag === 'html-binding').map((c) => bindingRecord(c.attrs, where));
  return { src, ...(as && { as }), ...(delimiter !== undefined && { delimiter }), ...(type && { type }), bindings };
}

/**
 * Work out an export's name and whether it is the default:
 *   name="card"          → { name: "card" }
 *   name="default"       → { name: null, default: true }
 *   name (empty)         → { name: null, default: true }
 *   name="card" default  → { name: "card", default: true }
 */
function exportName(raw, where) {
  const { attrs } = raw;
  const modifier = has(attrs, 'default');
  if (modifier && attrs.default !== '' && attrs.default.toLowerCase() !== 'default') {
    throw new SyntaxError(`${describe(raw)}: "default" is a boolean attribute and takes no value${where}`);
  }
  if (!has(attrs, 'name')) {
    if (modifier) {
      throw new SyntaxError(`${describe(raw)}: "default" needs a name to go with it; write name="default" for a default-only export, or name="card" default to export card as the default too${where}`);
    }
    throw new SyntaxError(`<html-export> requires a "name" attribute: name="card", or name="default" for the default export (or "src" for a re-export)${where}`);
  }
  const name = attrs.name;
  if (name === '' || name === 'default') {
    if (modifier) throw new SyntaxError(`${describe(raw)}: name="${name}" is already the default export; drop the "default" attribute${where}`);
    return { name: null, isDefault: true };
  }
  assertExportName(name, where);
  return { name, isDefault: modifier };
}

function exportRecord(raw, where) {
  const { attrs } = raw;
  const src = nonEmpty(attrs.src);
  if (src) {
    const imported = nonEmpty(attrs.import);
    const named = has(attrs, 'name');
    if (has(attrs, 'default') || (named && (attrs.name === '' || attrs.name === 'default'))) {
      throw new SyntaxError(`${describe(raw)}: a re-export cannot be the default export${where}`);
    }
    if (imported && !named) throw new SyntaxError(`${describe(raw)}: import="${imported}" needs a name="…" to export it as${where}`);
    if (named) assertExportName(attrs.name, where);
    return { kind: 'reexport', src, ...(named && { name: attrs.name }), ...(imported && { import: imported }) };
  }
  const { name, isDefault } = exportName(raw, where);

  const templates = raw.children.filter((c) => c.tag === 'template');
  const styles = raw.children.filter((c) => c.tag === 'style').map((c) => c.text ?? '');
  const scripts = raw.children.filter((c) => c.tag === 'script');
  const base = { name, ...(isDefault && { default: true }) };
  if (templates.length > 1) throw new SyntaxError(`${describe(raw)} has ${templates.length} <template> elements; an export has one${where}`);
  if (templates.length) {
    const shadow = nonEmpty(attrs.shadow) ?? 'open';
    if (shadow !== 'open' && shadow !== 'closed') throw new SyntaxError(`${describe(raw)}: shadow="${shadow}" must be "open" or "closed"${where}`);
    return { kind: 'component', ...base, template: templates[0].html ?? '', shadow, delegatesFocus: has(attrs, 'delegates-focus'), styles };
  }
  for (const a of ['shadow', 'delegates-focus']) {
    if (has(attrs, a)) throw new SyntaxError(`${describe(raw)}: "${a}" only applies to an export with a <template>${where}`);
  }
  if (scripts.length) {
    const json = scripts.filter((s) => JSON_TYPE.test(s.attrs.type ?? ''));
    if (json.length !== scripts.length || json.length > 1 || styles.length) {
      throw new SyntaxError(`${describe(raw)}: a data export has exactly one <script type="application/json"> and nothing else${where}`);
    }
    try {
      return { kind: 'data', ...base, value: JSON.parse(json[0].text ?? '') };
    } catch (error) {
      throw new SyntaxError(`${describe(raw)}: invalid JSON${where}: ${error.message}`);
    }
  }
  if (styles.length) return { kind: 'stylesheet', ...base, css: styles.join('\n') };
  throw new SyntaxError(`${describe(raw)} needs a <template> (a component), <style> (a stylesheet) or <script type="application/json"> (data)${where}`);
}

/**
 * Validate raw elements and build a module record.
 * @param {{ imports: RawElement[], exports: RawElement[] }} raw
 * @param {string} [url]
 * @returns {ModuleRecord}
 */
export function recordFromRaw({ imports, exports }, url = '') {
  const where = url ? ` in ${url}` : '';
  const record = { url, imports: imports.map((i) => importRecord(i, url)), exports: [] };
  const names = new Set();
  let firstDefault = null;
  for (const raw of exports) {
    const e = exportRecord(raw, where);
    if (e.name) {
      if (names.has(e.name)) throw new SyntaxError(`Duplicate export "${e.name}"${where}`);
      names.add(e.name);
    }
    if (e.default) {
      if (firstDefault) throw new SyntaxError(`More than one default export: ${describe(firstDefault)} and ${describe(raw)}${where}`);
      firstDefault = raw;
    }
    record.exports.push(e);
  }
  return record;
}

function rawOf(el) {
  const attrs = (node) => Object.fromEntries([...node.attributes].map((a) => [a.name, a.value]));
  return {
    tag: el.localName,
    attrs: attrs(el),
    children: [...el.children].map((c) => ({
      tag: c.localName,
      attrs: attrs(c),
      ...(c.localName === 'template' ? { html: c.innerHTML } : { text: c.textContent }),
    })),
  };
}

/**
 * Read a parsed HTML module document (e.g. from DOMParser) into a record.
 * `<html-export>` and `<html-import>` inside templates are ignored, as they
 * are not part of the document.
 * @param {Document} doc
 * @param {string} [url]
 * @returns {ModuleRecord}
 */
export function readHTMLModule(doc, url = '') {
  return recordFromRaw({
    imports: [...doc.querySelectorAll('html-import')].map(rawOf),
    exports: [...doc.querySelectorAll('html-export')].map(rawOf),
  }, url);
}
