/**
 * Check fetched bytes against Subresource Integrity metadata with SubtleCrypto, as the platform does for
 * `<script integrity>`: of the algorithms listed, the strongest one decides, and any of its digests may match.
 * Fails closed: without `crypto.subtle` the load is refused rather than trusted.
 * @returns {Promise<void>} rejects with an Error naming `url` when the digest does not match
 */
export declare function verifyIntegrity(bytes: any, integrity: any, url: any, win?: typeof globalThis): Promise<void>;
/**
 * Build a module namespace from a record and its loaded dependencies. The
 * shape matches a compiled module: camelCase named exports, `default`, and a
 * `components` manifest keyed by export name.
 * Each import carries the options it is bound with (its attributes, then the
 * module's <html-import-settings>). A lazy import that was not loaded gets a
 * `lazy` loader from `options.lazy(src, type)` instead of a `module`.
 * @param {import('./record.js').ModuleRecord} record
 * @param {Map<string, object>} modules src (as written, or `type:src` for a dependency with a `type`) → loaded namespace
 * @param {{ lazy?: (src: string, type?: string, integrity?: string) => () => Promise<object> }} [options]
 * @returns {import('./types.js').ModuleNamespace}
 */
export declare function linkHTMLModule(record: import('./record.js').ModuleRecord, modules: Map<string, object>, { lazy }?: {
    lazy?: (src: string, type?: string, integrity?: string) => () => Promise<object>;
}): import('./types.js').ModuleNamespace;
/**
 * A module-namespace-like object: null prototype, sorted keys, frozen, tagged "Module".
 * @param {Iterable<[string, unknown]>} entries
 * @returns {import('./types.js').ModuleNamespace}
 */
export declare function createNamespace(entries: Iterable<[string, unknown]>): import('./types.js').ModuleNamespace;
/**
 * Parse module source into a container whose descendants are the module's elements, without a Document the
 * engine CSP-checks. `DOMParser` (and `createHTMLDocument()` + `innerHTML`) build a *connected* tree, and Chromium
 * evaluates the page's `style-src` for every `<style>` inserted into one, logging a `style-src-elem` violation
 * (and sending a report) per element even though nothing is applied. A detached `<body>` of a scripting-less
 * `createHTMLDocument()` document takes the same fragment-parsing path with the same insertion mode as a document
 * parse after `<body>` (`<html>`/`<head>`/`<body>` tags are ignored, `<style>`/`<title>`/`<link>` keep their
 * head behaviour, and `<noscript>` is parsed as elements, as in a `DOMParser` document), but its tree is never
 * connected, so nothing is checked. Falls back to `DOMParser` where the window has no `document.implementation`.
 * @param {string} html
 * @param {any} [win]
 * @returns {ParentNode}
 */
export declare function parseModuleSource(html: string, win?: any): ParentNode;
/**
 * @param {object} [options]
 * @param {string} [options.baseURL]  referrer for top-level loads (default: the document's base URL)
 * @param {(specifier: string) => string|URL|null|undefined} [options.hostResolve]  bare specifiers
 * @param {typeof fetch} [options.fetch]
 * @param {'omit'|'same-origin'|'include'} [options.credentials]  fetch `credentials` for HTML modules (default: the platform's)
 * @param {'cors'|'same-origin'|'no-cors'} [options.mode]          fetch `mode` for HTML modules (default: the platform's)
 * @param {{ createHTML(html: string): unknown } | false} [options.trustedTypes]  Trusted Types policy for the HTML parsed and stamped in `window` (default: a policy named "html-modules" where `window.trustedTypes` exists; `false`: never)
 * @param {string} [options.nonce]   CSP nonce for the `<style>` elements used where constructable stylesheets are unavailable
 * @param {(html: string, url: string) => ParentNode} [options.parseHTML]  default: parses into a detached element (see `parseModuleSource`)
 * @param {(url: string) => Promise<object>} [options.importModule]      default: native import()
 * @param {any} [options.window]
 * @param {(event: { type: 'fetch'|'load'|'error', url: string, kind?: string, error?: unknown }) => void} [options.onEvent]
 * @returns {import('./types.js').Loader}
 */
export declare function createLoader({ baseURL, hostResolve, fetch: fetchImpl, credentials, mode, trustedTypes, nonce, parseHTML, importModule, window: win, onEvent, }?: {
    baseURL?: string;
    hostResolve?: (specifier: string) => string | URL | null | undefined;
    fetch?: typeof fetch;
    credentials?: 'omit' | 'same-origin' | 'include';
    mode?: 'cors' | 'same-origin' | 'no-cors';
    trustedTypes?: {
        createHTML(html: string): unknown;
    } | false;
    nonce?: string;
    parseHTML?: (html: string, url: string) => ParentNode;
    importModule?: (url: string) => Promise<object>;
    window?: any;
    onEvent?: (event: {
        type: 'fetch' | 'load' | 'error';
        url: string;
        kind?: string;
        error?: unknown;
    }) => void;
}): import('./types.js').Loader;
