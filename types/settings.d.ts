/** Built-in defaults for import options. */
export declare const IMPORT_DEFAULTS: Readonly<{
    delimiter: "--";
    conflict: "error";
    load: "eager";
    errors: "event";
}>;
/** Built-in defaults for a module's component exports. */
export declare const EXPORT_DEFAULTS: Readonly<{
    shadow: "open";
    delegatesFocus: false;
}>;
/** Import options that `<html-import>` (and a module's import records) may set per import. */
export declare const IMPORT_OPTIONS: string[];
/** Attributes of `<html-import-settings>`. */
export declare const IMPORT_SETTINGS_ATTRIBUTES: string[];
/**
 * Inside an HTML module an import may also choose its registry: `"global"` (the default: the tags it binds live where
 * its importer's do) or `"scoped"` (a custom element registry of its own, used by the module's components' shadow roots).
 * It means nothing on a page, whose tags always live in the document's registry, so a page rejects it.
 */
export declare const MODULE_IMPORT_OPTIONS: string[];
export declare const MODULE_IMPORT_SETTINGS_ATTRIBUTES: string[];
/** Attributes of `<html-module-settings>`. */
export declare const MODULE_SETTINGS_ATTRIBUTES: string[];
/** The valid tokens of an SRI string as `[{ algorithm, hash }]`, or throw a SyntaxError naming `where`. */
export declare function parseIntegrity(value: any, where?: string): {
    algorithm: string;
    hash: string;
}[];
/**
 * Throw unless `value` is valid for the option `name`. Messages name the valid values.
 * @param {string} name   delimiter | conflict | load | errors | shadow | base
 * @param {unknown} value
 * @param {string} [where] e.g. ' on <html-import-settings>' or ' in ui.html'
 */
export declare function assertOption(name: string, value: unknown, where?: string): void;
/** A boolean attribute that may also say "true" / "false" (so a per-export attribute can turn a default off). */
export declare function booleanAttribute(name: any, value: any, where?: string): boolean;
/**
 * Validate the attributes of an `<html-import-settings>` and return the
 * options it sets (only those written): `{ delimiter?, base?, conflict?, load?, errors? }`, and, in a module,
 * `registry?`.
 */
export declare function readImportSettings(attrs: any, where?: string, { inModule }?: {
    inModule?: boolean;
}): {};
/**
 * Validate the attributes of an `<html-module-settings>` and return the
 * export defaults it sets: `{ shadow?, delegatesFocus? }`.
 */
export declare function readModuleSettings(attrs: any, where?: string): {
    shadow: any;
    delegatesFocus: boolean;
};
/**
 * The per-import options written on one `<html-import>` (attributes as a
 * plain object): `{ delimiter?, conflict?, load?, errors? }`. `base` is
 * document-level only and is an error here.
 */
export declare function readImportOptions(attrs: any, where?: string, { inModule }?: {
    inModule?: boolean;
}): {};
/**
 * Validate a set of import options given in JavaScript (createHTMLModules(),
 * HTMLModules.import(), the compiler): undefined values are skipped.
 */
export declare function checkOptions(options: any, where?: string): any;
/** Validate the fetch options of a load: `integrity`, `credentials`, `mode` (undefined values are skipped). */
export declare function checkFetchOptions(options: any, where?: string): any;
/**
 * Merge option layers, most specific first; the first defined value of each
 * option wins, then the built-in default.
 * @returns {{ delimiter: string, conflict: 'error'|'reuse', load: 'eager'|'lazy', errors: 'event'|'throw' }}
 */
export declare function resolveImportOptions(...layers: any[]): {
    delimiter: string;
    conflict: 'error' | 'reuse';
    load: 'eager' | 'lazy';
    errors: 'event' | 'throw';
};
/**
 * Report an error loudly (`errors="throw"`): `reportError()`, which the
 * console and `window.onerror` see, or an uncaught throw where it is missing.
 */
export declare function reportLoudly(error: any, win?: typeof globalThis): void;
