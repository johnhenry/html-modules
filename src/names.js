/**
 * Names: export names, namespaces and the `--` delimiter.
 *
 * Export names and namespaces are lower-case kebab words ("custom-card", "ui").
 * Neither can contain "--", so a bound tag such as "ui--custom-card" always
 * splits into exactly one namespace and one export name.
 */

/** The namespace delimiter: `<html-import as="ui">` + "custom-card" → `<ui--custom-card>`. */
export const DELIMITER = '--';

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;

// https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const PCEN = /^[a-z][-.0-9_a-z·À-ÖØ-öø-ͽͿ-῿‌-‍‿-⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\u{10000}-\u{EFFFF}]*-[-.0-9_a-z·À-ÖØ-öø-ͽͿ-῿‌-‍‿-⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\u{10000}-\u{EFFFF}]*$/u;
const RESERVED_TAGS = new Set([
  'annotation-xml', 'color-profile', 'font-face', 'font-face-src',
  'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph',
]);

/** Names an HTML module may not export, because its namespace uses them. */
export const RESERVED_EXPORTS = new Set(['components', 'default']);

/** True for a lower-case kebab word such as "ui" or "custom-card". */
export const isKebabName = (name) => typeof name === 'string' && KEBAB.test(name);

/** True for a valid custom element name. */
export const isValidElementName = (name) => typeof name === 'string' && PCEN.test(name) && !RESERVED_TAGS.has(name);

/** "custom-card" → "customCard". */
export const camelCase = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** "customCard" / "CustomCard" → "custom-card"; kebab names pass through. */
export const kebabCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** Throw unless `name` can be an HTML module export name. */
export function assertExportName(name, where = '') {
  if (!isKebabName(name)) {
    throw new SyntaxError(`Invalid export name "${name}"${where}: use lower-case words joined by single hyphens, e.g. "custom-card"`);
  }
  if (RESERVED_EXPORTS.has(name)) {
    throw new SyntaxError(`"${name}" is reserved and cannot be used as an export name${where}`);
  }
}

/** Throw unless `namespace` can be an import namespace. */
export function assertNamespace(namespace) {
  if (!isKebabName(namespace)) {
    throw new SyntaxError(`Invalid namespace "${namespace}": use lower-case words joined by single hyphens (no "${DELIMITER}"), e.g. "ui"`);
  }
}

/** Throw unless `tag` is a valid custom element name. */
export function assertElementName(tag) {
  if (!isValidElementName(tag)) throw new SyntaxError(`"${tag}" is not a valid custom element name`);
}

/** The tag an export is bound to under a namespace: ("ui", "custom-card") → "ui--custom-card". */
export function bindingName(namespace, exportName) {
  assertNamespace(namespace);
  return `${namespace}${DELIMITER}${kebabCase(exportName)}`;
}

/** Split a bound tag: "ui--custom-card" → { namespace: "ui", name: "custom-card" }, or null. */
export function parseBindingName(tag) {
  const at = tag.indexOf(DELIMITER);
  if (at < 1) return null;
  const namespace = tag.slice(0, at);
  const name = tag.slice(at + DELIMITER.length);
  return isKebabName(namespace) && isKebabName(name) ? { namespace, name } : null;
}
