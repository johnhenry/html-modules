/**
 * Names: export names, namespaces and the namespace delimiter.
 *
 * Export names and namespaces are lower-case kebab words ("custom-card", "ui").
 * A namespaced tag is `<namespace><delimiter><export>`. The default delimiter
 * is `--`: neither a namespace nor an export name can contain "--", so
 * "ui--custom-card" always splits one way, and "--" always supplies the hyphen
 * a custom element name needs, even for a one-word export ("ui--card").
 *
 * Other delimiters are allowed (`<html-import as="ui" delimiter="-">`), with
 * two consequences the runtime handles: a tag may no longer split one way
 * ("ui-custom-card"), so nothing parses tags back into their parts (bindings
 * record `{ tag, namespace, export }` instead); and a tag may not be a valid
 * custom element name ("ui.card" has no hyphen), which is an error naming the
 * tag and the reason.
 */

/** The default namespace delimiter: `<html-import as="ui">` + "custom-card" → `<ui--custom-card>`. */
export const DELIMITER = '--';

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;

// https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const PCEN_CHAR = '[-.0-9_a-z·À-ÖØ-öø-ͽͿ-῿‌-‍‿-⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\u{10000}-\u{EFFFF}]';
const PCEN = new RegExp(`^[a-z]${PCEN_CHAR}*-${PCEN_CHAR}*$`, 'u');
const PCEN_CHARS = new RegExp(`^${PCEN_CHAR}+$`, 'u');
const RESERVED_TAGS = new Set([
  'annotation-xml', 'color-profile', 'font-face', 'font-face-src',
  'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph',
]);

/**
 * Names an HTML module may not use as a named export: `components` is the
 * manifest, and `default` is spelled `name="default"` (or a bare `name`),
 * which makes the default export rather than a named one.
 */
export const RESERVED_EXPORTS = new Set(['components', 'default']);

/**
 * True for a lower-case kebab word such as "ui" or "custom-card".
 * @param {unknown} name
 * @returns {boolean}
 */
export const isKebabName = (name) => typeof name === 'string' && KEBAB.test(name);

/**
 * Why `name` is not a valid custom element name, or null if it is.
 * @param {unknown} name
 * @returns {string | null}
 */
export function elementNameProblem(name) {
  if (typeof name !== 'string' || name === '') return 'it is empty';
  if (!/^[a-z]/.test(name)) return 'it must start with a lower-case ASCII letter';
  if (!name.includes('-')) return 'it has no hyphen';
  if (/[A-Z]/.test(name)) return 'it contains upper-case letters';
  if (!PCEN.test(name)) return 'it contains characters not allowed in custom element names';
  if (RESERVED_TAGS.has(name)) return 'it is reserved by HTML';
  return null;
}

/**
 * True for a valid custom element name.
 * @param {unknown} name
 * @returns {boolean}
 */
export const isValidElementName = (name) => elementNameProblem(name) === null;

/**
 * True for a string that can be a namespace delimiter: non-empty, and only characters allowed in custom element names.
 * @param {unknown} delimiter
 * @returns {boolean}
 */
export const isValidDelimiter = (delimiter) => typeof delimiter === 'string' && PCEN_CHARS.test(delimiter);

/**
 * Throw unless `delimiter` can be a namespace delimiter.
 * @param {unknown} delimiter
 */
export function assertDelimiter(delimiter) {
  if (!isValidDelimiter(delimiter)) {
    const shown = typeof delimiter === 'string' ? `"${delimiter}"` : String(delimiter);
    throw new SyntaxError(`Invalid delimiter ${shown}: use one or more characters allowed in custom element names (lower-case letters, digits, "-", ".", "_", …), e.g. "--" or "-"`);
  }
}

/**
 * "custom-card" → "customCard".
 * @param {string} name
 * @returns {string}
 */
export const camelCase = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * "customCard" / "CustomCard" → "custom-card"; kebab names pass through.
 * @param {string} name
 * @returns {string}
 */
export const kebabCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/**
 * Throw unless `name` can be a named export of an HTML module.
 * @param {string} name
 * @param {string} [where]
 */
export function assertExportName(name, where = '') {
  if (!isKebabName(name)) {
    throw new SyntaxError(`Invalid export name "${name}"${where}: use lower-case words joined by single hyphens, e.g. "custom-card"`);
  }
  if (name === 'default') {
    throw new SyntaxError(`"default" cannot be a named export${where}: name="default" makes the default export`);
  }
  if (RESERVED_EXPORTS.has(name)) {
    throw new SyntaxError(`"${name}" is reserved and cannot be used as an export name${where}`);
  }
}

/**
 * Throw unless `namespace` can be an import namespace.
 * @param {unknown} namespace
 */
export function assertNamespace(namespace) {
  if (!isKebabName(namespace)) {
    throw new SyntaxError(`Invalid namespace "${namespace}": use lower-case words joined by single hyphens (no "--"), e.g. "ui"`);
  }
}

/**
 * Throw unless `tag` is a valid custom element name.
 * @param {unknown} tag
 */
export function assertElementName(tag) {
  const problem = elementNameProblem(tag);
  if (problem) throw new SyntaxError(`"${tag}" is not a valid custom element name: ${problem}`);
}

/**
 * The tag an export is bound to under a namespace:
 * ("ui", "custom-card") → "ui--custom-card"; ("ui", "card", "-") → "ui-card".
 * Throws a SyntaxError naming the tag when the result is not a valid custom
 * element name (e.g. ("ui", "card", ".") → "ui.card", which has no hyphen).
 * @param {string} namespace
 * @param {string} exportName
 * @param {string} [delimiter]
 * @returns {string}
 */
export function bindingName(namespace, exportName, delimiter = DELIMITER) {
  assertNamespace(namespace);
  assertDelimiter(delimiter);
  const tag = `${namespace}${delimiter}${kebabCase(exportName)}`;
  const problem = elementNameProblem(tag);
  if (problem) {
    throw new SyntaxError(`Cannot bind '${exportName}' under namespace "${namespace}" with delimiter "${delimiter}": <${tag}> is not a valid custom element name (${problem})`);
  }
  return tag;
}

/**
 * Split a namespaced tag into `{ namespace, name }`, or null when it does not
 * split into two kebab names exactly one way. With the default "--" every
 * bound tag splits one way; with "-", "ui-card" does but "ui-custom-card" does
 * not (null). A display helper only: the runtime never parses tags, it records
 * `{ tag, namespace, export }` when it binds.
 * @param {string} tag
 * @param {string} [delimiter]
 * @returns {{ namespace: string, name: string } | null}
 */
export function parseBindingName(tag, delimiter = DELIMITER) {
  if (typeof tag !== 'string' || !isValidDelimiter(delimiter)) return null;
  let found = null;
  for (let at = tag.indexOf(delimiter); at > 0; at = tag.indexOf(delimiter, at + 1)) {
    const namespace = tag.slice(0, at);
    const name = tag.slice(at + delimiter.length);
    if (!isKebabName(namespace) || !isKebabName(name)) continue;
    if (found) return null; // ambiguous
    found = { namespace, name };
  }
  return found;
}
