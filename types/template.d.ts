/**
 * Data binding for component templates: a minimal, declarative, eval-free syntax.
 *
 *   <html-export name="user-card" props="name count:number open:boolean">
 *     <template>
 *       <h2>Hello, {{name}}!</h2>
 *       <a href="/users/{{name}}" title="{{ name }} ({{count}})">profile</a>
 *     </template>
 *   </html-export>
 *
 * `{{name}}` is the value of the host element's attribute `name` (nothing else: no expressions, no JavaScript).
 * In a text node it sets the node's data (never markup); in an attribute value it sets that attribute of the
 * stamped element. `\{{` is a literal `{{`. A bound node is patched when its attribute changes: the template is
 * stamped once per element, then only the nodes that mention the changed attribute are touched.
 *
 * This file is DOM-agnostic about the window (it only needs `Node`-like objects): the runtime calls
 * `analyzeTemplate()` once per definition and window, `resolveSites()` on every stamped fragment, and
 * `updateSites()` when attributes change. Compiled modules use the same code through the runtime.
 */
export declare const PROP_TYPES: readonly string[];
/**
 * Split text into literal strings and `{ name }` bindings, or return null when it has no binding and no escape
 * (so it is left alone). Throws a SyntaxError for an unterminated `{{` or one that is not a plain attribute
 * name (an expression, a filter, a call: there are none).
 * @param {string} text
 * @returns {Array<string | { name: string }> | null}
 */
export declare function parseBindingText(text: string): Array<string | {
    name: string;
}> | null;
/**
 * True when `value` is a URL a browser would run as script (or render as an active document): `javascript:`,
 * `vbscript:`, or a `data:` HTML/SVG/XHTML document. The scheme is matched after the whitespace, control
 * characters and invisible code points a URL parser ignores are removed.
 */
export declare function isUnsafeURL(value: any): boolean;
/** Why a binding on this attribute is refused (a message), or null. */
export declare function refusedAttribute(name: any): string;
/**
 * Find the binding sites of a template's content (a DocumentFragment): every text node and attribute that
 * mentions `{{…}}` or `\{{`. The result is plain data (a path of child indexes from the fragment, and the parsed
 * parts), reusable for every stamp of the template. Nested `<template>` elements are opaque (their content is
 * not stamped into the shadow root), and the text of `<script>` / `<style>` is never bound.
 * @param {DocumentFragment} content
 * @param {string} [what] how to name the definition in errors
 * @returns {{ sites: Array<object>, names: string[] }}
 */
export declare function analyzeTemplate(content: DocumentFragment, what?: string): {
    sites: Array<object>;
    names: string[];
};
/** Resolve analyzed sites against a stamped clone of the content (before it is appended anywhere). */
export declare function resolveSites(fragment: any, analysis: any): any;
/**
 * Write the sites that mention one of `changed` (all of them when `changed` is omitted) from the host's
 * attributes. A site whose text did not change is not touched. An attribute site whose whole value is a single
 * binding of an absent attribute removes the target attribute (so `<button disabled="{{disabled}}">` follows a
 * boolean attribute); a URL attribute that would run script is removed, never set.
 */
export declare function updateSites(sites: any, host: any, changed: any): void;
/**
 * Parse a `props` attribute: whitespace or comma separated `name` or `name:type` (type string, number or boolean;
 * default string). Each becomes an observed attribute reflected by a property of the camelCase name. Throws a
 * SyntaxError naming `what` for a malformed list.
 * @param {string} text
 * @param {string} what e.g. '<html-export name="card">'
 * @param {(name: string) => string} camel
 * @returns {Array<{ name: string, type: 'string'|'number'|'boolean' }>}
 */
export declare function parseProps(text: string, what: string, camel: (name: string) => string, where?: string): Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
}>;
