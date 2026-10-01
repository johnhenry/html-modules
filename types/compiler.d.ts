export type CompileOptions = import('./types.js').CompileOptions;
export type ModuleRecord = import('./record.js').ModuleRecord;
/**
 * "./icons.html" → "./icons.js"; other specifiers are left alone.
 * @param {string} src
 * @returns {string}
 */
export declare const rewriteSpecifier: (src: string) => string;
/**
 * Apply a module's `<html-import-settings base>` to one of its dependency
 * specifiers, keeping it relative where it can: ("./card.html", "./vendor/ui@1/")
 * → "./vendor/ui@1/card.html"; ("./card.html", "../lib/") → "../lib/card.html";
 * with an absolute base, the absolute URL. Bare and absolute specifiers are
 * left alone, as the runtime leaves them.
 * @param {string} src
 * @param {string} [base]
 * @returns {string}
 */
export declare function rebaseSpecifier(src: string, base?: string): string;
/**
 * @param {string} source HTML module source
 * @param {object} [options]
 * @param {string} [options.url]            the module's URL or file name (for messages and the header)
 * @param {string} [options.runtime]        specifier the output imports the runtime from (default "@johnhenry/html-modules/runtime")
 * @param {'esm'|'register'} [options.format]
 * @param {string} [options.as]             register format: namespace to register under (default: the export names)
 * @param {string} [options.delimiter]      register format: namespace delimiter (default "--"), e.g. "-" for <ui-card>
 * @param {'error'|'reuse'} [options.conflict]  register format: keep tags that are already defined instead of throwing
 * @param {(src: string) => string} [options.rewrite]   dependency specifier rewrite (default ".html" → ".js")
 * @param {boolean} [options.hot]           add Vite-style HMR: the module accepts itself and hot-replaces its components and stylesheets under live elements (see `hotReplaceModule()`); invalidates when that cannot be done in place
 * @param {(html: string, url: string) => Document} [options.parse]  use a DOM parser instead of the built-in scanner
 * @returns {string} JavaScript module source
 */
export declare function compileHTMLModule(source: string, { url, parse, ...options }?: {
    url?: string;
    runtime?: string;
    format?: 'esm' | 'register';
    as?: string;
    delimiter?: string;
    conflict?: 'error' | 'reuse';
    rewrite?: (src: string) => string;
    hot?: boolean;
    parse?: (html: string, url: string) => Document;
}): string;
/**
 * Generate an ES module from a module record.
 * @param {import('./record.js').ModuleRecord} record
 * @param {import('./types.js').CompileOptions} [options]
 * @returns {string} JavaScript module source
 */
export declare function compileRecord(record: import('./record.js').ModuleRecord, { runtime, format, as, delimiter, conflict, rewrite, hot }?: import('./types.js').CompileOptions): string;
