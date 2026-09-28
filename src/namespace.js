/**
 * Module namespaces.
 *
 * Both JS and HTML modules produce the same thing: a namespace of named
 * exports. For JS this is the native ES module namespace object. For HTML we
 * construct an equivalent: a frozen, null-prototype object tagged "Module".
 */

/**
 * Create a module-namespace-like object from export entries.
 * @param {Iterable<[string, unknown]>} entries
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createNamespace(entries) {
  const ns = Object.create(null);
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name, value] of sorted) {
    Object.defineProperty(ns, name, { value, enumerable: true, writable: false, configurable: false });
  }
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  return Object.freeze(ns);
}

/**
 * List export names of a namespace (JS or HTML).
 * @param {object} ns
 * @returns {string[]}
 */
export function exportNames(ns) {
  return Object.keys(ns);
}

/**
 * True if the namespace provides `name` as an export.
 * @param {object} ns
 * @param {string} name
 */
export function hasExport(ns, name) {
  return ns != null && Object.prototype.hasOwnProperty.call(ns, name);
}
