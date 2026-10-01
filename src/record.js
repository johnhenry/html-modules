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
 *   <html-export src="./b.html" names="card, fancy-button as button"></html-export>
 *                                                                 → re-export several (`export { … } from`)
 *   <html-export src="./icons.html" name="icon" import="*"></html-export>
 *                                                                 → re-export the namespace (`export * as icon from`)
 *   <html-export src="./b.html" name="default" import="card"></html-export>
 *                                                                 → re-export as the default (`export { card as default } from`)
 *   <html-export name="default">…</html-export>                   → the default export (`export default`)
 *   <html-export name>…</html-export>                             → the same: an empty name is the default
 *   <html-export name="custom-card" default>…</html-export>       → named, and also the default export
 *                                                                   (`export { customCard, customCard as default }`)
 *   <html-import src="./icons.html" as="icon" delimiter="-">      → tags <icon-star>, … inside this module
 *   <html-import-settings delimiter="-" base="./lib/" load="lazy">  → importSettings: defaults for this module's imports
 *   <html-module-settings shadow="closed" delegates-focus>        → moduleSettings: defaults for its component exports
 *
 * Settings elements come before the elements they configure (<html-import>,
 * <html-export>), at most one of each per module. Export defaults are baked
 * into each component record (`shadow`, `delegatesFocus`); import defaults stay
 * in `importSettings` and are applied with `moduleImportOptions()`.
 *
 * An export record's `name` is its named-export name, or null for the
 * default-only export (`name="default"` or a bare `name`); `default: true`
 * marks the default export, whichever way it was spelled. A module has at
 * most one default, which may be a re-export (never a star re-export).
 *
 * An import's `delimiter` is present only when written; absent, it is "--"
 * (inside modules the page's library-wide default does not apply, so a
 * module's own templates always know their tags).
 *
 * @typedef {{ export: string, element?: string, adopt?: boolean }} BindingRecord
 * @typedef {{ src: string, as?: string, delimiter?: string, type?: string, integrity?: string, conflict?: 'error'|'reuse', load?: 'eager'|'lazy', errors?: 'event'|'throw', registry?: 'global'|'scoped', bindings: BindingRecord[] }} ImportRecord
 * @typedef {{ kind: 'component', name: string|null, default?: true, template: string, shadow: 'open'|'closed', delegatesFocus: boolean, styles: string[], props?: Array<{ name: string, type: 'string'|'number'|'boolean' }>, formAssociated?: true, formControl?: string }
 *         | { kind: 'stylesheet', name: string|null, default?: true, css: string }
 *         | { kind: 'data', name: string|null, default?: true, value: unknown }
 *         | { kind: 'reexport', src: string, type?: string, integrity?: string, name?: string|null, default?: true, import?: string }} ExportRecord
 * (a re-export without a `name` key is a star re-export; `import: "*"` is a namespace re-export)
 * @typedef {{ url: string, imports: ImportRecord[], exports: ExportRecord[],
 *   importSettings?: { delimiter?: string, base?: string, conflict?: string, load?: string, errors?: string, registry?: string },
 *   moduleSettings?: { shadow?: 'open'|'closed', delegatesFocus?: boolean } }} ModuleRecord
 *
 * A "raw element" is the neutral input both readers produce:
 * @typedef {{ tag: string, order?: number, attrs: Record<string, string>, children: Array<{ tag: string, attrs: Record<string, string>, html?: string, text?: string }> }} RawElement
 */
import { assertExportName, assertNamespace, camelCase } from './names.js';
import { parseProps } from './template.js';
import { FORM_PROPERTIES } from './form.js';
import { hasLazyTargets } from './lazy.js';
import {
  EXPORT_DEFAULTS, IMPORT_DEFAULTS, assertOption, booleanAttribute, readImportOptions, readImportSettings, readModuleSettings,
} from './settings.js';

const JSON_TYPE = /^(application|text)\/([\w.+-]+\+)?json$/i;
const has = (attrs, name) => Object.prototype.hasOwnProperty.call(attrs, name);
const nonEmpty = (v) => (v == null || v === '' ? undefined : v);

/**
 * True when CSS text has an `@import` at-rule (outside comments and strings). `replaceSync()` silently drops
 * `@import`, so a module that relies on one would render unstyled with no error.
 */
function usesImport(css) {
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c && css[i] !== '\n'; i++) if (css[i] === '\\') i++;
    } else if (c === '@' && /^@import(?![\w-])/i.test(css.slice(i, i + 8))) {
      return true;
    }
  }
  return false;
}

function assertNoImport(raw, css, where) {
  if (usesImport(css)) {
    throw new SyntaxError(`${describe(raw)}: @import is not supported in a <style>: a constructed stylesheet ignores @import rules, so it would silently do nothing; link the stylesheet from the page, or inline its rules${where}`);
  }
}

function describe(raw) {
  const bits = ['name', 'src', 'import', 'names', 'export', 'element'].filter((a) => has(raw.attrs, a)).map((a) => ` ${a}="${raw.attrs[a]}"`);
  if (has(raw.attrs, 'default')) bits.push(' default');
  return `<${raw.tag}${bits.join('')}>`;
}

const SELF_CLOSING = '"/>" does not close an element in HTML, so a self-closed <html-binding … />, <html-import … /> or <html-export … /> swallows everything that follows it as its children: write the end tag';

/**
 * Why an `<html-binding>` is misplaced, or null when its parent is an `<html-import>`. `parent` is the nearest
 * enclosing element, `{ tag, attrs }`, or null (outside any element but the document's own).
 * Shared by the module record (both readers) and by `<html-binding>` in a page.
 */
export function bindingPlacementProblem(attrs, parent, where = '') {
  if (parent?.tag === 'html-import') return null;
  const named = (a) => `<html-binding${has(a, 'export') ? ` export="${a.export}"` : ''}>`;
  const document = !parent || ['html', 'head', 'body'].includes(parent.tag);
  if (parent?.tag === 'html-binding') {
    return `${named(attrs)} is nested inside ${named(parent.attrs)}${where}: an <html-binding> must be a direct child of <html-import>. ${SELF_CLOSING}: <html-binding …></html-binding>`;
  }
  return `${named(attrs)} is not a direct child of <html-import>${where}: it is ${document ? 'outside any <html-import>' : `inside <${parent.tag}>`}, and an <html-binding> only means something as a direct child of <html-import>. ${SELF_CLOSING}`;
}

/** Build a binding record from an <html-binding>'s attributes. */
export function bindingRecord(attrs, where = '') {
  const name = nonEmpty(attrs.export);
  if (!name) throw new SyntaxError(`<html-binding> requires an "export" attribute${where}`);
  const element = nonEmpty(attrs.element);
  return { export: name, ...(element && { element }), ...(has(attrs, 'adopt') && { adopt: true }) };
}

/**
 * The error message for a lazy import that has no tag to wait for (so nothing would ever load it), or null.
 * Shared by modules (`recordFromRaw`), `<html-import>` and `HTMLModules.import()`.
 */
export function lazyImportProblem({ src, as, bindings = [] }, where = '') {
  if (hasLazyTargets({ as, bindings })) return null;
  return `<html-import src="${src}"> is lazy but has no tag to wait for${where}: it would never load. A lazy import loads when one of its tags is first used, so it needs "as" (every component as a tag) or an <html-binding> that registers a tag (element="…", or a component export under "as"); adopt, data and default-without-element bindings register none. Write load="eager" to load it at once`;
}

/** Build an import record from a raw <html-import>. */
export function importRecord(raw, url = '') {
  const where = url ? ` in ${url}` : '';
  const src = nonEmpty(raw.attrs.src);
  if (!src) throw new SyntaxError(`<html-import> requires a "src" attribute${where}`);
  const stray = raw.children.find((c) => c.tag !== 'html-binding');
  if (stray) {
    throw new SyntaxError(`${describe(raw)} has a <${stray.tag}> child${where}: only <html-binding> elements may be children of <html-import>. ${SELF_CLOSING}`);
  }
  const as = nonEmpty(raw.attrs.as);
  if (as) {
    try {
      assertNamespace(as);
    } catch (error) {
      throw new SyntaxError(`${error.message}${where}`);
    }
  }
  const { delimiter, conflict, load, errors, registry } = readImportOptions(raw.attrs, where, { inModule: true });
  const type = nonEmpty(raw.attrs.type);
  const integrity = nonEmpty(raw.attrs.integrity);
  if (integrity) assertOption('integrity', integrity, ` on <html-import src="${src}">${where}`);
  const bindings = raw.children.filter((c) => c.tag === 'html-binding').map((c) => bindingRecord(c.attrs, where));
  return {
    src, ...(as && { as }), ...(delimiter !== undefined && { delimiter }), ...(type && { type }), ...(integrity && { integrity }),
    ...(conflict && { conflict }), ...(load && { load }), ...(errors && { errors }), ...(registry && { registry }), bindings,
  };
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

/** Parse a `names` list: "card, fancy-button as button, default, card as default". */
function reexportList(raw, src, where, via) {
  const items = raw.attrs.names.split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) throw new SyntaxError(`${describe(raw)}: names="" lists no exports; write names="card, button" (or drop "names" to re-export every component)${where}`);
  return items.map((item) => {
    const m = /^(\S+)(?:\s+as\s+(\S+))?$/.exec(item);
    if (!m) throw new SyntaxError(`${describe(raw)}: "${item}" in names is not "<export>" or "<export> as <name>"${where}`);
    const [, from, to = from] = m;
    if (from === '*') throw new SyntaxError(`${describe(raw)}: "*" cannot appear in names; write name="${m[2] ?? 'ns'}" import="*" for a namespace re-export${where}`);
    if (to !== 'default') assertExportName(to, where);
    return {
      kind: 'reexport', src, ...via, name: to === 'default' ? null : to,
      ...(to === 'default' && { default: true }),
      ...(from !== to && { import: from }),
    };
  });
}

/**
 * A re-export's records (one, or one per entry of a `names` list):
 *   src                           → export * from               { src }
 *   src name="card"               → export { card } from        { src, name: "card" }
 *   src name="b" import="a"       → export { a as b } from      { src, name: "b", import: "a" }
 *   src name="ns" import="*"      → export * as ns from         { src, name: "ns", import: "*" }
 *   src name="default"            → export { default } from     { src, name: null, default: true }
 *   src name="default" import="a" → export { a as default } from
 *   src name="card" default       → export { card, card as default } from
 *   src names="a, b as c"         → export { a, b as c } from   (one record each)
 * A star re-export is the one with no `name` key.
 */
function reexportRecords(raw, src, where) {
  const { attrs } = raw;
  const type = nonEmpty(attrs.type);
  const integrity = nonEmpty(attrs.integrity);
  if (integrity) assertOption('integrity', integrity, ` on ${describe(raw)}${where}`);
  const via = { ...(type && { type }), ...(integrity && { integrity }) };
  if (has(attrs, 'names')) {
    const other = ['name', 'import', 'default'].filter((a) => has(attrs, a));
    if (other.length) throw new SyntaxError(`${describe(raw)}: "names" lists every re-exported name; it cannot be combined with ${other.map((a) => `"${a}"`).join(' or ')}${where}`);
    return reexportList(raw, src, where, via);
  }
  const imported = nonEmpty(attrs.import);
  if (!has(attrs, 'name')) {
    if (imported) throw new SyntaxError(`${describe(raw)}: import="${imported}" needs a name="…" to export it as${where}`);
    if (has(attrs, 'default')) throw new SyntaxError(`${describe(raw)}: a star re-export (src without a name) is never the default; write name="default" to re-export the source's default${where}`);
    return [{ kind: 'reexport', src, ...via }];
  }
  const { name, isDefault } = exportName(raw, where);
  return [{ kind: 'reexport', src, ...via, name, ...(isDefault && { default: true }), ...(imported && { import: imported }) }];
}

function exportRecord(raw, where, defaults = {}) {
  const { attrs } = raw;
  const src = nonEmpty(attrs.src);
  if (src) return reexportRecords(raw, src, where);
  for (const a of ['import', 'names', 'type', 'integrity']) {
    if (has(attrs, a)) throw new SyntaxError(`${describe(raw)}: "${a}" only applies to a re-export (an <html-export> with "src")${where}`);
  }
  const { name, isDefault } = exportName(raw, where);

  const templates = raw.children.filter((c) => c.tag === 'template');
  const styles = raw.children.filter((c) => c.tag === 'style').map((c) => c.text ?? '');
  const scripts = raw.children.filter((c) => c.tag === 'script');
  const base = { name, ...(isDefault && { default: true }) };
  if (templates.length > 1) throw new SyntaxError(`${describe(raw)} has ${templates.length} <template> elements; an export has one${where}`);
  if (templates.length) {
    // Per-export attributes override the module's <html-module-settings>.
    const shadow = nonEmpty(attrs.shadow) ?? defaults.shadow ?? EXPORT_DEFAULTS.shadow;
    if (shadow !== 'open' && shadow !== 'closed') throw new SyntaxError(`${describe(raw)}: shadow="${shadow}" must be "open" or "closed"${where}`);
    for (const css of styles) assertNoImport(raw, css, where);
    const props = has(attrs, 'props') ? parseProps(attrs.props, describe(raw), camelCase, where) : null;
    const formAssociated = has(attrs, 'form-associated') && booleanAttribute('form-associated', attrs['form-associated'], ` on ${describe(raw)}${where}`);
    const formControl = nonEmpty(attrs['form-control']);
    // A component whose value lives in a control inside its shadow root delegates focus to it by default: the host
    // itself is not focusable, so without this a browser cannot focus an invalid control when the form is validated
    // (Firefox logs "The invalid form control with name='x' is not focusable" and shows no message), and focus(),
    // a click on the host and a label's focus never reach the input. An explicit delegates-focus (or the module's
    // <html-module-settings delegates-focus>) still decides.
    const delegatesFocus = has(attrs, 'delegates-focus')
      ? booleanAttribute('delegates-focus', attrs['delegates-focus'], ` on ${describe(raw)}${where}`)
      : defaults.delegatesFocus ?? (formAssociated && formControl ? true : EXPORT_DEFAULTS.delegatesFocus);
    if (has(attrs, 'form-control') && !formControl) throw new SyntaxError(`${describe(raw)}: form-control="" is empty; write a selector for the control inside the template, e.g. form-control="input"${where}`);
    if (formControl && !formAssociated) throw new SyntaxError(`${describe(raw)}: form-control="${formControl}" needs form-associated: the component must take part in forms for its control's value to be the form value${where}`);
    if (formAssociated) {
      const clash = props?.find((p) => FORM_PROPERTIES.has(camelCase(p.name)));
      if (clash) throw new SyntaxError(`${describe(raw)}: "${clash.name}" cannot be a prop of a form-associated component: it is a built-in property (${[...FORM_PROPERTIES].join(', ')})${where}`);
    }
    return [{
      kind: 'component', ...base, template: templates[0].html ?? '', shadow, delegatesFocus, styles, ...(props && { props }),
      ...(formAssociated && { formAssociated: true, ...(formControl && { formControl }) }),
    }];
  }
  for (const a of ['shadow', 'delegates-focus', 'props', 'form-associated', 'form-control']) {
    if (has(attrs, a)) throw new SyntaxError(`${describe(raw)}: "${a}" only applies to an export with a <template>${where}`);
  }
  if (scripts.length) {
    const json = scripts.filter((s) => JSON_TYPE.test(s.attrs.type ?? ''));
    if (json.length !== scripts.length || json.length > 1 || styles.length) {
      throw new SyntaxError(`${describe(raw)}: a data export has exactly one <script type="application/json"> and nothing else${where}`);
    }
    try {
      return [{ kind: 'data', ...base, value: JSON.parse(json[0].text ?? '') }];
    } catch (error) {
      throw new SyntaxError(`${describe(raw)}: invalid JSON${where}: ${error.message}`);
    }
  }
  if (styles.length) {
    for (const css of styles) assertNoImport(raw, css, where);
    return [{ kind: 'stylesheet', ...base, css: styles.join('\n') }];
  }
  throw new SyntaxError(`${describe(raw)} needs a <template> (a component), <style> (a stylesheet) or <script type="application/json"> (data)${where}`);
}

/** The one settings element of a kind, checked for count and placement (it must precede every `before` element). */
function settingsElement(list, before, what, where) {
  if (!list?.length) return null;
  if (list.length > 1) throw new SyntaxError(`More than one <${list[0].tag}>${where}: a module has at most one`);
  const [el] = list;
  if (el.order !== undefined && before.some((b) => b.order !== undefined && b.order < el.order)) {
    throw new SyntaxError(`<${el.tag}> must come before any <${what}>${where}`);
  }
  return el;
}

/**
 * The options a module's own import is bound with: its attributes, then the
 * module's <html-import-settings>. Only values that were written are returned;
 * the rest are the built-in defaults (a page's options never reach a module).
 * @param {ModuleRecord} record
 * @param {ImportRecord} i
 * @returns {{ delimiter?: string, conflict?: string, load?: string, errors?: string, registry?: string }}
 */
export function moduleImportOptions(record, i) {
  const s = record.importSettings ?? {};
  const out = {};
  for (const name of ['delimiter', 'conflict', 'load', 'errors', 'registry']) {
    const v = i[name] ?? s[name];
    if (v !== undefined) out[name] = v;
  }
  return out;
}

/**
 * Validate raw elements and build a module record.
 * @param {{ imports: RawElement[], exports: RawElement[], importSettings?: RawElement[], moduleSettings?: RawElement[],
 *   bindings?: Array<{ tag: 'html-binding', attrs: Record<string, string>, parent: { tag: string, attrs: Record<string, string> } | null }> }} raw
 *   (`bindings` is every <html-binding> in the document, with its parent, so a misplaced one is rejected)
 * @param {string} [url]
 * @returns {ModuleRecord}
 */
export function recordFromRaw({ imports, exports, importSettings: iset = [], moduleSettings: mset = [], bindings: stray = [] }, url = '') {
  const where = url ? ` in ${url}` : '';
  // Exports and imports are top-level declarations. A nested one would be read by
  // a DOM (querySelectorAll finds it) but not by a scanner that stops at the outer
  // element, so both readers reject it the same way.
  for (const raw of [...exports, ...imports]) {
    if (raw.nestedIn) throw new SyntaxError(`${describe(raw)} is nested inside ${describe(raw.nestedIn)}${where}: <html-export> and <html-import> must not be nested. ${SELF_CLOSING}`);
  }
  // An <html-binding> belongs directly inside an <html-import>: anywhere else (typically because a
  // self-closed `<html-binding />` swallowed the next one) a DOM would find it and a scanner not.
  for (const b of stray) {
    const problem = bindingPlacementProblem(b.attrs, b.parent, where);
    if (problem) throw new SyntaxError(problem);
  }
  const iel = settingsElement(iset, imports, 'html-import', where);
  const mel = settingsElement(mset, exports, 'html-export', where);
  const importSettings = iel ? readImportSettings(iel.attrs, where, { inModule: true }) : null;
  const moduleSettings = mel ? readModuleSettings(mel.attrs, where) : null;
  const record = {
    url,
    imports: imports.map((i) => importRecord(i, url)),
    exports: [],
    ...(importSettings && { importSettings }),
    ...(moduleSettings && { moduleSettings }),
  };
  for (const i of record.imports) {
    const load = i.load ?? importSettings?.load ?? IMPORT_DEFAULTS.load;
    if (load === 'lazy' && i.bindings.some((b) => b.adopt)) {
      throw new SyntaxError(`<html-import src="${i.src}"> is lazy but adopts a stylesheet${where}: a module's components need their stylesheets when they render, so write load="eager" on this import`);
    }
    const problem = load === 'lazy' && lazyImportProblem(i, where);
    if (problem) throw new SyntaxError(problem);
  }
  const names = new Set();
  let firstDefault = null;
  for (const raw of exports) {
    for (const e of exportRecord(raw, where, moduleSettings ?? undefined)) {
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
  }
  return record;
}

function rawOf(el, order) {
  const attrs = (node) => Object.fromEntries([...node.attributes].map((a) => [a.name, a.value]));
  const parent = el.parentElement?.closest?.('html-export, html-import');
  if (el.localName === 'html-binding') {
    const p = el.parentElement;
    return { tag: 'html-binding', order, attrs: attrs(el), children: [], parent: p ? { tag: p.localName, attrs: attrs(p) } : null };
  }
  return {
    tag: el.localName,
    order,
    ...(parent && (el.localName === 'html-export' || el.localName === 'html-import') && { nestedIn: { tag: parent.localName, attrs: attrs(parent) } }),
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
  const raw = { imports: [], exports: [], importSettings: [], moduleSettings: [], bindings: [] };
  const into = { 'html-import': raw.imports, 'html-export': raw.exports, 'html-import-settings': raw.importSettings, 'html-module-settings': raw.moduleSettings, 'html-binding': raw.bindings };
  [...doc.querySelectorAll(Object.keys(into).join(', '))].forEach((el, order) => into[el.localName].push(rawOf(el, order)));
  return recordFromRaw(raw, url);
}
