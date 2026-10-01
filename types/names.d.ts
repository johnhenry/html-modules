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
export declare const DELIMITER = "--";
/**
 * Names an HTML module may not use as a named export: `components` is the
 * manifest, and `default` is spelled `name="default"` (or a bare `name`),
 * which makes the default export rather than a named one.
 */
export declare const RESERVED_EXPORTS: Set<string>;
/**
 * True for a lower-case kebab word such as "ui" or "custom-card".
 * @param {unknown} name
 * @returns {boolean}
 */
export declare const isKebabName: (name: unknown) => boolean;
/**
 * Why `name` is not a valid custom element name, or null if it is.
 * @param {unknown} name
 * @returns {string | null}
 */
export declare function elementNameProblem(name: unknown): string | null;
/**
 * True for a valid custom element name.
 * @param {unknown} name
 * @returns {boolean}
 */
export declare const isValidElementName: (name: unknown) => boolean;
/**
 * True for a string that can be a namespace delimiter: non-empty, and only characters allowed in custom element names.
 * @param {unknown} delimiter
 * @returns {boolean}
 */
export declare const isValidDelimiter: (delimiter: unknown) => boolean;
/**
 * Throw unless `delimiter` can be a namespace delimiter.
 * @param {unknown} delimiter
 */
export declare function assertDelimiter(delimiter: unknown): void;
/**
 * "custom-card" → "customCard".
 * @param {string} name
 * @returns {string}
 */
export declare const camelCase: (name: string) => string;
/**
 * "customCard" / "CustomCard" → "custom-card"; kebab names pass through.
 * @param {string} name
 * @returns {string}
 */
export declare const kebabCase: (name: string) => string;
/**
 * Throw unless `name` can be a named export of an HTML module.
 * @param {string} name
 * @param {string} [where]
 */
export declare function assertExportName(name: string, where?: string): void;
/**
 * Throw unless `namespace` can be an import namespace.
 * @param {unknown} namespace
 */
export declare function assertNamespace(namespace: unknown): void;
/**
 * Throw unless `tag` is a valid custom element name.
 * @param {unknown} tag
 */
export declare function assertElementName(tag: unknown): void;
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
export declare function bindingName(namespace: string, exportName: string, delimiter?: string): string;
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
export declare function parseBindingName(tag: string, delimiter?: string): {
    namespace: string;
    name: string;
} | null;
