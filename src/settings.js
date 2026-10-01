/**
 * Settings: defaults for the imports and exports of one document.
 *
 *   <html-import-settings delimiter="-" base="./vendor/ui@2/" conflict="reuse" load="lazy" errors="throw">
 *   <html-module-settings shadow="closed" delegates-focus>      (inside an HTML module)
 *
 * Precedence, for each import option:
 *   the <html-import> attribute  >  the document's <html-import-settings>
 *     >  createHTMLModules({ … }) (pages only, never inside modules)  >  the built-in default.
 *
 * This file holds the vocabulary and validation shared by the elements, the
 * module record (DOM reader and scanner alike), the runtime and the compiler.
 */
import { DELIMITER, assertDelimiter } from './names.js';

/** Built-in defaults for import options. */
export const IMPORT_DEFAULTS = Object.freeze({ delimiter: DELIMITER, conflict: 'error', load: 'eager', errors: 'event' });

/** Built-in defaults for a module's component exports. */
export const EXPORT_DEFAULTS = Object.freeze({ shadow: 'open', delegatesFocus: false });

const CHOICES = {
  conflict: ['error', 'reuse'],
  load: ['eager', 'lazy'],
  errors: ['event', 'throw'],
  shadow: ['open', 'closed'],
  credentials: ['omit', 'same-origin', 'include'],
  mode: ['cors', 'same-origin', 'no-cors'],
  registry: ['global', 'scoped'],
  cache: ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'],
};

/** Import options that `<html-import>` (and a module's import records) may set per import. */
export const IMPORT_OPTIONS = ['delimiter', 'conflict', 'load', 'errors'];
/** Attributes of `<html-import-settings>`. */
export const IMPORT_SETTINGS_ATTRIBUTES = ['delimiter', 'base', 'conflict', 'load', 'errors'];
/**
 * Inside an HTML module an import may also choose its registry: `"global"` (the default: the tags it binds live where
 * its importer's do) or `"scoped"` (a custom element registry of its own, used by the module's components' shadow roots).
 * It means nothing on a page, whose tags always live in the document's registry, so a page rejects it.
 */
export const MODULE_IMPORT_OPTIONS = [...IMPORT_OPTIONS, 'registry'];
export const MODULE_IMPORT_SETTINGS_ATTRIBUTES = [...IMPORT_SETTINGS_ATTRIBUTES, 'registry'];

const registryOnPage = (tag, where) => `"registry" cannot be set on <${tag}>${where}: it applies to the imports of an HTML module's own components (the registry their shadow roots use), so write it in the module; a page's tags always live in the document's registry`;

/** Attributes of `<html-module-settings>`. */
export const MODULE_SETTINGS_ATTRIBUTES = ['shadow', 'delegates-focus'];

// Attributes any settings element may carry without meaning anything to it.
const NEUTRAL = /^(?:id|class|data-[\w.-]+)$/;

/** Subresource Integrity metadata: one or more `sha256|sha384|sha512-<base64>` tokens separated by spaces. */
const SRI_TOKEN = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2}|[A-Za-z0-9_-]+)(\?\S*)?$/;

/** The valid tokens of an SRI string as `[{ algorithm, hash }]`, or throw a SyntaxError naming `where`. */
export function parseIntegrity(value, where = '') {
  const tokens = typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
  const parsed = tokens.map((t) => SRI_TOKEN.exec(t)).filter(Boolean).map((m) => ({ algorithm: m[1], hash: m[2] }));
  if (!tokens.length || parsed.length !== tokens.length) {
    throw new SyntaxError(`Invalid integrity ${JSON.stringify(value)}${where}: use Subresource Integrity metadata such as "sha384-<base64 digest>" (sha256, sha384 or sha512; several may be separated by spaces)`);
  }
  return parsed;
}

const quoteList = (list) => list.map((v) => `"${v}"`).join(' or ');

/**
 * Throw unless `value` is valid for the option `name`. Messages name the valid values.
 * @param {string} name   delimiter | conflict | load | errors | shadow | base
 * @param {unknown} value
 * @param {string} [where] e.g. ' on <html-import-settings>' or ' in ui.html'
 */
export function assertOption(name, value, where = '') {
  if (name === 'delimiter') {
    try {
      assertDelimiter(value);
    } catch (error) {
      throw new SyntaxError(`${error.message}${where}`);
    }
    return;
  }
  if (name === 'base') {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new SyntaxError(`Invalid base ${JSON.stringify(value)}${where}: use a URL, relative to the document, e.g. "./vendor/ui@2/"`);
    }
    return;
  }
  if (name === 'integrity') {
    parseIntegrity(value, where);
    return;
  }
  const choices = CHOICES[name];
  if (!choices) throw new SyntaxError(`Unknown option "${name}"${where}`);
  if (!choices.includes(value)) {
    throw new SyntaxError(`Invalid ${name}="${value}"${where}: use ${quoteList(choices)}`);
  }
}

/** A boolean attribute that may also say "true" / "false" (so a per-export attribute can turn a default off). */
export function booleanAttribute(name, value, where = '') {
  const v = String(value).toLowerCase();
  if (v === '' || v === 'true' || v === name) return true;
  if (v === 'false') return false;
  throw new SyntaxError(`Invalid ${name}="${value}"${where}: it is a boolean attribute; write ${name}, ${name}="true" or ${name}="false"`);
}

function checkAttributes(tag, attrs, allowed, where) {
  for (const name of Object.keys(attrs)) {
    if (allowed.includes(name) || NEUTRAL.test(name)) continue;
    throw new SyntaxError(`Unknown attribute "${name}" on <${tag}>${where}: use ${allowed.map((a) => `"${a}"`).join(', ')}`);
  }
}

/**
 * Validate the attributes of an `<html-import-settings>` and return the
 * options it sets (only those written): `{ delimiter?, base?, conflict?, load?, errors? }`, and, in a module,
 * `registry?`.
 */
export function readImportSettings(attrs, where = '', { inModule = false } = {}) {
  const at = ` on <html-import-settings>${where}`;
  if (!inModule && Object.prototype.hasOwnProperty.call(attrs, 'registry')) throw new SyntaxError(registryOnPage('html-import-settings', where));
  const allowed = inModule ? MODULE_IMPORT_SETTINGS_ATTRIBUTES : IMPORT_SETTINGS_ATTRIBUTES;
  checkAttributes('html-import-settings', attrs, allowed, where);
  const out = {};
  for (const name of allowed) {
    if (!Object.prototype.hasOwnProperty.call(attrs, name)) continue;
    assertOption(name, attrs[name], at);
    out[name] = attrs[name];
  }
  return out;
}

/**
 * Validate the attributes of an `<html-module-settings>` and return the
 * export defaults it sets: `{ shadow?, delegatesFocus? }`.
 */
export function readModuleSettings(attrs, where = '') {
  const at = ` on <html-module-settings>${where}`;
  checkAttributes('html-module-settings', attrs, MODULE_SETTINGS_ATTRIBUTES, where);
  const out = {};
  if (Object.prototype.hasOwnProperty.call(attrs, 'shadow')) {
    assertOption('shadow', attrs.shadow, at);
    out.shadow = attrs.shadow;
  }
  if (Object.prototype.hasOwnProperty.call(attrs, 'delegates-focus')) {
    out.delegatesFocus = booleanAttribute('delegates-focus', attrs['delegates-focus'], at);
  }
  return out;
}

/**
 * The per-import options written on one `<html-import>` (attributes as a
 * plain object): `{ delimiter?, conflict?, load?, errors? }`. `base` is
 * document-level only and is an error here.
 */
export function readImportOptions(attrs, where = '', { inModule = false } = {}) {
  const at = ` on <html-import>${where}`;
  if (!inModule && Object.prototype.hasOwnProperty.call(attrs, 'registry')) throw new SyntaxError(registryOnPage('html-import', where));
  if (Object.prototype.hasOwnProperty.call(attrs, 'base')) {
    throw new SyntaxError(`"base" cannot be set on <html-import>${where}: it is document-level only; use <html-import-settings base="…">, or write the full path in src`);
  }
  const out = {};
  for (const name of inModule ? MODULE_IMPORT_OPTIONS : IMPORT_OPTIONS) {
    if (!Object.prototype.hasOwnProperty.call(attrs, name)) continue;
    assertOption(name, attrs[name], at);
    out[name] = attrs[name];
  }
  return out;
}

/**
 * Validate a set of import options given in JavaScript (createHTMLModules(),
 * HTMLModules.import(), the compiler): undefined values are skipped.
 */
export function checkOptions(options, where = '') {
  for (const name of [...IMPORT_OPTIONS, 'base']) {
    if (options[name] !== undefined) assertOption(name, options[name], where);
  }
  return options;
}

/** Validate the fetch options of a load: `integrity`, `credentials`, `mode` (undefined values are skipped). */
export function checkFetchOptions(options, where = '') {
  for (const name of ['integrity', 'credentials', 'mode', 'cache']) {
    if (options[name] !== undefined) assertOption(name, options[name], where);
  }
  return options;
}

/**
 * Merge option layers, most specific first; the first defined value of each
 * option wins, then the built-in default.
 * @returns {{ delimiter: string, conflict: 'error'|'reuse', load: 'eager'|'lazy', errors: 'event'|'throw' }}
 */
export function resolveImportOptions(...layers) {
  const out = {};
  for (const name of IMPORT_OPTIONS) {
    out[name] = IMPORT_DEFAULTS[name];
    for (const layer of layers) {
      if (layer && layer[name] !== undefined) {
        out[name] = layer[name];
        break;
      }
    }
  }
  return out;
}

/**
 * Report an error loudly (`errors="throw"`): `reportError()`, which the
 * console and `window.onerror` see, or an uncaught throw where it is missing.
 */
export function reportLoudly(error, win = globalThis) {
  const report = win?.reportError ?? globalThis.reportError;
  if (typeof report === 'function') {
    report.call(win?.reportError ? win : globalThis, error);
    return;
  }
  setTimeout(() => {
    throw error;
  });
}
