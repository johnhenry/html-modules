/**
 * Type definitions only (no runtime code): the shared shapes of the public API, as JSDoc `@typedef`s that
 * `tsc --declaration` turns into the package's `.d.ts` files (see `types/`, `npm run types`).
 */
export type ModuleNamespace = {
    readonly components: Readonly<Record<string, import('./runtime.js').HTMLComponent | CustomElementConstructor>>;
    readonly default?: unknown;
    readonly [name: string]: unknown;
};
export type TagRecord = {
    tag: string;
    namespace: string | null;
    export: string;
    reused?: true;
};
export type BindResult = {
    elements: Record<string, CustomElementConstructor>;
    values: Record<string, unknown>;
    tags: Record<string, TagRecord>;
};
export type ImportResult = BindResult & {
    module: ModuleNamespace;
};
export type ImportElementResult = {
    module: ModuleNamespace;
    elements: Record<string, CustomElementConstructor>;
    bindings: Record<string, unknown>;
    tags: Record<string, TagRecord>;
};
export type ImportOptions = {
    /**
     * namespace: every component as `<as><delimiter><export>`
     */
    as?: string;
    delimiter?: string;
    /**
     * bind only these exports
     */
    bindings?: Array<{
        export: string;
        element?: string;
        adopt?: boolean;
    }>;
    base?: string;
    type?: 'html' | 'js';
    /**
     * where `adopt` bindings adopt
     */
    root?: Document | ShadowRoot;
    conflict?: 'error' | 'reuse';
    load?: 'eager' | 'lazy';
    errors?: 'event' | 'throw';
    /**
     * Subresource Integrity metadata (HTML modules only)
     */
    integrity?: string;
    credentials?: 'omit' | 'same-origin' | 'include';
    mode?: 'cors' | 'same-origin' | 'no-cors';
    /**
     * sanitize this module's component templates (and those of the HTML modules it imports) with this function; `false`: not even the instance's
     */
    sanitize?: Sanitizer | false;
};
export type Sanitizer = (html: string, context: {
    def: Readonly<Record<string, any>>;
    url: string;
    window: any;
    report: (details: unknown) => void;
}) => string | DocumentFragment | {
    toString(): string;
} | Promise<string | DocumentFragment | {
    toString(): string;
}>;
export type LazyImportHandle = {
    src: string;
    /**
     * settles when the module has been loaded and bound
     */
    ready: Promise<ImportResult>;
    /**
     * load now, whether or not a tag has been used
     */
    load: () => Promise<ImportResult>;
    /**
     * stop watching (only before loading starts)
     */
    cancel: () => void;
    state: 'waiting' | 'cancelled' | 'loading' | 'loaded' | 'error';
};
export type HotReloadResult = {
    reload: boolean;
    reasons: string[];
    updated: string[];
    elements: number;
    skipped?: true;
};
export type Loader = {
    load: (specifier: string, referrer?: string, options?: {
        type?: 'html' | 'js';
        integrity?: string;
        credentials?: string;
        mode?: string;
        cache?: RequestCache;
        sanitize?: Sanitizer | false;
    }) => Promise<ModuleNamespace>;
    unload: (specifier: string, referrer?: string, options?: {
        type?: 'html' | 'js';
    }) => boolean;
    reload: (specifier: string, referrer?: string, options?: {
        sanitize?: Sanitizer | false;
    }) => Promise<{
        previous: ModuleNamespace | undefined;
        next: ModuleNamespace;
    }>;
    cached: (specifier: string, referrer?: string, options?: {
        sanitize?: Sanitizer | false;
    }) => boolean;
    /**
     * the sanitizer applied to component templates by default; assignable
     */
    sanitize: Sanitizer | undefined;
    resolve: (specifier: string, referrer?: string) => string;
    cache: Map<string, Promise<ModuleNamespace>>;
    baseURL: string | undefined;
    /**
     * the integrity manifest in effect: absolute module URL → Subresource Integrity metadata (a copy)
     */
    integrity: Record<string, string>;
    /**
     * true when an HTML fetch without integrity metadata is refused
     */
    strict: boolean;
};
export type CreateHTMLModulesOptions = {
    /**
     * referrer for top-level loads (default: the document's base URL)
     */
    baseURL?: string;
    /**
     * resolves bare specifiers (in browsers, `import.meta.resolve`)
     */
    hostResolve?: (specifier: string) => string | URL | null | undefined;
    fetch?: typeof fetch;
    /**
     * fetch `credentials` for HTML modules
     */
    credentials?: 'omit' | 'same-origin' | 'include';
    /**
     * fetch `mode` for HTML modules
     */
    mode?: 'cors' | 'same-origin' | 'no-cors';
    /**
     * Trusted Types policy for the HTML parsed and stamped (default: a policy named "html-modules" where `window.trustedTypes` exists; `false`: never)
     */
    trustedTypes?: {
        createHTML(html: string): unknown;
    } | false;
    /**
     * CSP nonce for the `<style>` elements used where constructable stylesheets are unavailable
     */
    nonce?: string;
    /**
     * an integrity manifest: module URL → Subresource Integrity metadata, the shape of an import map's `integrity` (keys resolve against `baseURL`); every HTML module fetched must match its entry, and a JavaScript entry must also be pinned by the page's import map
     */
    integrity?: Record<string, string>;
    /**
     * refuse any HTML fetch without integrity metadata (a manifest entry or an `integrity` attribute); default false
     */
    strict?: boolean;
    /**
     * sanitize every component template of the HTML modules this instance loads (see `Sanitizer`); overridable per import
     */
    sanitize?: Sanitizer | false;
    /**
     * default: parses into a detached element (no CSP-checked document)
     */
    parseHTML?: (html: string, url: string) => ParentNode;
    /**
     * default: native `import()`
     */
    importModule?: (url: string) => Promise<object>;
    onEvent?: (event: {
        type: 'fetch' | 'load' | 'error' | 'sanitize';
        url: string;
        kind?: string;
        error?: unknown;
        name?: string | null;
        details?: unknown;
    }) => void;
    /**
     * the window whose DOM and registry to use
     */
    window?: any;
    registry?: CustomElementRegistry;
    /**
     * namespace delimiter (default "--")
     */
    delimiter?: string;
    /**
     * base URL for resolving import specifiers, relative to `baseURL`
     */
    base?: string;
    /**
     * a tag already defined by something else: error (default) or keep it
     */
    conflict?: 'error' | 'reuse';
    /**
     * default for `<html-import>` elements (default "eager")
     */
    load?: 'eager' | 'lazy';
    /**
     * also reportError() failures (default "event")
     */
    errors?: 'event' | 'throw';
};
export type HTMLModulesInstance = {
    loader: Loader;
    /**
     * `<kind>:<resolved URL>` → the namespace
     */
    cache: Map<string, Promise<ModuleNamespace>>;
    /**
     * the default namespace delimiter
     */
    delimiter: string;
    options: Readonly<{
        delimiter: string;
        conflict: 'error' | 'reuse';
        load: 'eager' | 'lazy';
        errors: 'event' | 'throw';
    }>;
    /**
     * absolute base URL for import specifiers
     */
    base: string | undefined;
    /**
     * the sanitizer applied to component templates by default; assignable (affects loads that start afterwards)
     */
    sanitize: Sanitizer | undefined;
    resolve: (src: string, base?: string) => string;
    load: (src: string, options?: {
        base?: string;
        type?: 'html' | 'js';
        integrity?: string;
        credentials?: 'omit' | 'same-origin' | 'include';
        mode?: 'cors' | 'same-origin' | 'no-cors';
        sanitize?: Sanitizer | false;
    }) => Promise<ModuleNamespace>;
    unload: (src: string, options?: {
        base?: string;
        type?: 'html' | 'js';
    }) => boolean;
    hotReload: (src: string, options?: {
        base?: string;
        sanitize?: Sanitizer | false;
    }) => Promise<HotReloadResult>;
    bind: (module: ModuleNamespace, options?: {
        as?: string;
        delimiter?: string;
        bindings?: Array<{
            export: string;
            element?: string;
            adopt?: boolean;
        }>;
        from?: string;
        root?: Document | ShadowRoot;
        conflict?: 'error' | 'reuse';
    }) => BindResult;
    import: {
        (src: string, options: ImportOptions & {
            load: 'lazy';
        }): LazyImportHandle;
        (src: string, options?: ImportOptions): Promise<ImportResult>;
    };
};
export type HTMLImportElement = HTMLElement & {
    readonly module: Promise<ModuleNamespace>;
    readonly ready: Promise<ImportElementResult>;
    load(): Promise<ImportElementResult>;
    readonly state: 'idle' | 'waiting' | 'loading' | 'loaded' | 'error';
    readonly elements: Record<string, CustomElementConstructor>;
    readonly bindings: Record<string, unknown>;
    readonly tags: Record<string, TagRecord>;
    readonly settings: {
        delimiter: string;
        conflict: 'error' | 'reuse';
        load: 'eager' | 'lazy';
        errors: 'event' | 'throw';
        base: string | undefined;
    };
    src: string;
    as: string;
    type: string;
    integrity: string;
    sanitize: Sanitizer | false | undefined;
    delimiter: string | null;
    conflict: string | null;
    loadMode: string | null;
    errors: string | null;
};
export type HTMLImportSettingsElement = HTMLElement & {
    readonly error: Error | null;
    readonly active: boolean;
    readonly values: {
        delimiter?: string;
        base?: string;
        conflict?: string;
        load?: string;
        errors?: string;
    };
};
export type HTMLModuleSettingsElement = HTMLElement & {
    readonly error: SyntaxError | null;
};
export type HTMLModuleElements = {
    HTMLImport: {
        new (): HTMLImportElement;
        prototype: HTMLImportElement;
    };
    HTMLBinding: {
        new (): HTMLElement;
        prototype: HTMLElement;
    };
    HTMLExport: {
        new (): HTMLElement;
        prototype: HTMLElement;
    };
    HTMLImportSettings: {
        new (): HTMLImportSettingsElement;
        prototype: HTMLImportSettingsElement;
    };
    HTMLModuleSettings: {
        new (): HTMLModuleSettingsElement;
        prototype: HTMLModuleSettingsElement;
    };
};
export type PropSpec = {
    name: string;
    type?: 'string' | 'number' | 'boolean';
};
export type ComponentImport = {
    /**
     * the loaded module (absent for a lazy import)
     */
    module?: ModuleNamespace;
    /**
     * the `src` as written
     */
    from: string;
    as?: string;
    delimiter?: string;
    conflict?: 'error' | 'reuse';
    errors?: 'event' | 'throw';
    load?: 'eager' | 'lazy';
    /**
     * `scoped`: bind into the registry of the component's own shadow roots
     */
    registry?: 'global' | 'scoped';
    /**
     * loads a lazy import when one of its tags is first used
     */
    lazy?: () => Promise<ModuleNamespace>;
    bindings?: Array<{
        export: string;
        element?: string;
        adopt?: boolean;
    }>;
};
export type ComponentSpec = {
    /**
     * module-local identity, e.g. "custom-card"
     */
    name?: string | null;
    /**
     * template HTML (the content of the `<template>`), or a DocumentFragment of it (stamped without being parsed)
     */
    template?: string | DocumentFragment;
    shadow?: 'open' | 'closed';
    delegatesFocus?: boolean;
    /**
     * CSS text, adopted into every shadow root (one sheet per definition)
     */
    styles?: string[];
    props?: PropSpec[];
    formAssociated?: boolean;
    formControl?: string;
    /**
     * needs `formAssociated`; the element is a submit or reset button (no `formControl`)
     */
    formRole?: 'submit' | 'reset';
    imports?: ComponentImport[];
    /**
     * a JS-authored HTMLElement subclass instead of a template
     */
    element?: Function;
    url?: string;
};
export type CompileOptions = {
    /**
     * where the output imports the runtime from (default "@johnhenry/html-modules/runtime")
     */
    runtime?: string;
    format?: 'esm' | 'register';
    /**
     * register format: the namespace to register under
     */
    as?: string;
    /**
     * register format: the namespace delimiter
     */
    delimiter?: string;
    /**
     * register format: keep tags that are already defined
     */
    conflict?: 'error' | 'reuse';
    /**
     * dependency specifier rewrite (default ".html" → ".js")
     */
    rewrite?: (src: string) => string;
    /**
     * add Vite-style HMR
     */
    hot?: boolean;
};
/**
 * A module namespace: what `HTMLModules.load()` resolves to and what a compiled module's `import * as` gives.
 * Named exports are camelCase (`custom-card` → `customCard`): definitions, stylesheets, data.
 * @typedef {{
 *   readonly components: Readonly<Record<string, import('./runtime.js').HTMLComponent | CustomElementConstructor>>,
 *   readonly default?: unknown,
 *   readonly [name: string]: unknown,
 * }} ModuleNamespace
 */
/**
 * What a registered tag was made from (the runtime never parses tags).
 * @typedef {{ tag: string, namespace: string | null, export: string, reused?: true }} TagRecord
 */
/**
 * The result of `HTMLModules.import()` / `bindModule()` for what was bound.
 * @typedef {{
 *   elements: Record<string, CustomElementConstructor>,
 *   values: Record<string, unknown>,
 *   tags: Record<string, TagRecord>,
 * }} BindResult
 */
/**
 * The result of `HTMLModules.import()` (eager): the namespace and what was bound.
 * @typedef {BindResult & { module: ModuleNamespace }} ImportResult
 */
/**
 * The `ready` value of an `<html-import>` element (and the `detail` of its `load` event).
 * @typedef {{ module: ModuleNamespace, elements: Record<string, CustomElementConstructor>, bindings: Record<string, unknown>, tags: Record<string, TagRecord> }} ImportElementResult
 */
/**
 * Options of `HTMLModules.import()`.
 * @typedef {object} ImportOptions
 * @property {string} [as]                     namespace: every component as `<as><delimiter><export>`
 * @property {string} [delimiter]
 * @property {Array<{ export: string, element?: string, adopt?: boolean }>} [bindings]  bind only these exports
 * @property {string} [base]
 * @property {'html' | 'js'} [type]
 * @property {Document | ShadowRoot} [root]    where `adopt` bindings adopt
 * @property {'error' | 'reuse'} [conflict]
 * @property {'eager' | 'lazy'} [load]
 * @property {'event' | 'throw'} [errors]
 * @property {string} [integrity]              Subresource Integrity metadata (HTML modules only)
 * @property {'omit' | 'same-origin' | 'include'} [credentials]
 * @property {'cors' | 'same-origin' | 'no-cors'} [mode]
 * @property {Sanitizer | false} [sanitize]    sanitize this module's component templates (and those of the HTML modules it imports) with this function; `false`: not even the instance's
 */
/**
 * A template sanitizer: `createHTMLModules({ sanitize })`, `HTMLModules.import(src, { sanitize })`, `<html-import>.sanitize`.
 * It receives each component template of a freshly loaded HTML module (never the module source) and returns the
 * markup to stamp: a string, a `TrustedHTML`, or a `DocumentFragment` (stamped without being parsed again), or a
 * Promise of one. `def` is the component's record (`name`, `shadow`, `props`, … and its unsanitized `template`);
 * `report(details)` announces what was removed as a `sanitize` event (`onEvent`, and `html-modules:sanitize` on the document).
 * @callback Sanitizer
 * @param {string} html
 * @param {{ def: Readonly<Record<string, any>>, url: string, window: any, report: (details: unknown) => void }} context
 * @returns {string | DocumentFragment | { toString(): string } | Promise<string | DocumentFragment | { toString(): string }>}
 */
/**
 * The handle `HTMLModules.import(src, { load: 'lazy' })` returns right away.
 * @typedef {object} LazyImportHandle
 * @property {string} src
 * @property {Promise<ImportResult>} ready     settles when the module has been loaded and bound
 * @property {() => Promise<ImportResult>} load  load now, whether or not a tag has been used
 * @property {() => void} cancel               stop watching (only before loading starts)
 * @property {'waiting' | 'cancelled' | 'loading' | 'loaded' | 'error'} state
 */
/**
 * The result of `HTMLModules.hotReload()`.
 * @typedef {{ reload: boolean, reasons: string[], updated: string[], elements: number, skipped?: true }} HotReloadResult
 */
/**
 * The loader behind an HTMLModules instance: resolve, fetch, parse, cache.
 * @typedef {object} Loader
 * @property {(specifier: string, referrer?: string, options?: { type?: 'html' | 'js', integrity?: string, credentials?: string, mode?: string, cache?: RequestCache, sanitize?: Sanitizer | false }) => Promise<ModuleNamespace>} load
 * @property {(specifier: string, referrer?: string, options?: { type?: 'html' | 'js' }) => boolean} unload
 * @property {(specifier: string, referrer?: string, options?: { sanitize?: Sanitizer | false }) => Promise<{ previous: ModuleNamespace | undefined, next: ModuleNamespace }>} reload
 * @property {(specifier: string, referrer?: string, options?: { sanitize?: Sanitizer | false }) => boolean} cached
 * @property {Sanitizer | undefined} sanitize  the sanitizer applied to component templates by default; assignable
 * @property {(specifier: string, referrer?: string) => string} resolve
 * @property {Map<string, Promise<ModuleNamespace>>} cache
 * @property {string | undefined} baseURL
 * @property {Record<string, string>} integrity  the integrity manifest in effect: absolute module URL → Subresource Integrity metadata (a copy)
 * @property {boolean} strict                    true when an HTML fetch without integrity metadata is refused
 */
/**
 * Options of `createHTMLModules()`: the loader's, and defaults for this instance's imports.
 * @typedef {object} CreateHTMLModulesOptions
 * @property {string} [baseURL]                referrer for top-level loads (default: the document's base URL)
 * @property {(specifier: string) => string | URL | null | undefined} [hostResolve]  resolves bare specifiers (in browsers, `import.meta.resolve`)
 * @property {typeof fetch} [fetch]
 * @property {'omit' | 'same-origin' | 'include'} [credentials]  fetch `credentials` for HTML modules
 * @property {'cors' | 'same-origin' | 'no-cors'} [mode]         fetch `mode` for HTML modules
 * @property {{ createHTML(html: string): unknown } | false} [trustedTypes]  Trusted Types policy for the HTML parsed and stamped (default: a policy named "html-modules" where `window.trustedTypes` exists; `false`: never)
 * @property {string} [nonce]                  CSP nonce for the `<style>` elements used where constructable stylesheets are unavailable
 * @property {Record<string, string>} [integrity]  an integrity manifest: module URL → Subresource Integrity metadata, the shape of an import map's `integrity` (keys resolve against `baseURL`); every HTML module fetched must match its entry, and a JavaScript entry must also be pinned by the page's import map
 * @property {boolean} [strict]                refuse any HTML fetch without integrity metadata (a manifest entry or an `integrity` attribute); default false
 * @property {Sanitizer | false} [sanitize]    sanitize every component template of the HTML modules this instance loads (see `Sanitizer`); overridable per import
 * @property {(html: string, url: string) => ParentNode} [parseHTML]  default: parses into a detached element (no CSP-checked document)
 * @property {(url: string) => Promise<object>} [importModule]      default: native `import()`
 * @property {(event: { type: 'fetch' | 'load' | 'error' | 'sanitize', url: string, kind?: string, error?: unknown, name?: string | null, details?: unknown }) => void} [onEvent]
 * @property {any} [window]                    the window whose DOM and registry to use
 * @property {CustomElementRegistry} [registry]
 * @property {string} [delimiter]              namespace delimiter (default "--")
 * @property {string} [base]                   base URL for resolving import specifiers, relative to `baseURL`
 * @property {'error' | 'reuse'} [conflict]    a tag already defined by something else: error (default) or keep it
 * @property {'eager' | 'lazy'} [load]         default for `<html-import>` elements (default "eager")
 * @property {'event' | 'throw'} [errors]      also reportError() failures (default "event")
 */
/**
 * The programmatic API: `createHTMLModules()` returns one, `@johnhenry/html-modules/browser` exports one as `HTMLModules`.
 * @typedef {object} HTMLModulesInstance
 * @property {Loader} loader
 * @property {Map<string, Promise<ModuleNamespace>>} cache  `<kind>:<resolved URL>` → the namespace
 * @property {string} delimiter                the default namespace delimiter
 * @property {Readonly<{ delimiter: string, conflict: 'error' | 'reuse', load: 'eager' | 'lazy', errors: 'event' | 'throw' }>} options
 * @property {string | undefined} base         absolute base URL for import specifiers
 * @property {Sanitizer | undefined} sanitize  the sanitizer applied to component templates by default; assignable (affects loads that start afterwards)
 * @property {(src: string, base?: string) => string} resolve
 * @property {(src: string, options?: { base?: string, type?: 'html' | 'js', integrity?: string, credentials?: 'omit' | 'same-origin' | 'include', mode?: 'cors' | 'same-origin' | 'no-cors', sanitize?: Sanitizer | false }) => Promise<ModuleNamespace>} load
 * @property {(src: string, options?: { base?: string, type?: 'html' | 'js' }) => boolean} unload
 * @property {(src: string, options?: { base?: string, sanitize?: Sanitizer | false }) => Promise<HotReloadResult>} hotReload
 * @property {(module: ModuleNamespace, options?: { as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>, from?: string, root?: Document | ShadowRoot, conflict?: 'error' | 'reuse' }) => BindResult} bind
 * @property {{ (src: string, options: ImportOptions & { load: 'lazy' }): LazyImportHandle, (src: string, options?: ImportOptions): Promise<ImportResult> }} import
 */
/**
 * `<html-import>`.
 * @typedef {HTMLElement & {
 *   readonly module: Promise<ModuleNamespace>,
 *   readonly ready: Promise<ImportElementResult>,
 *   load(): Promise<ImportElementResult>,
 *   readonly state: 'idle' | 'waiting' | 'loading' | 'loaded' | 'error',
 *   readonly elements: Record<string, CustomElementConstructor>,
 *   readonly bindings: Record<string, unknown>,
 *   readonly tags: Record<string, TagRecord>,
 *   readonly settings: { delimiter: string, conflict: 'error' | 'reuse', load: 'eager' | 'lazy', errors: 'event' | 'throw', base: string | undefined },
 *   src: string, as: string, type: string, integrity: string,
 *   sanitize: Sanitizer | false | undefined,
 *   delimiter: string | null, conflict: string | null, loadMode: string | null, errors: string | null,
 * }} HTMLImportElement
 */
/**
 * `<html-import-settings>`.
 * @typedef {HTMLElement & {
 *   readonly error: Error | null,
 *   readonly active: boolean,
 *   readonly values: { delimiter?: string, base?: string, conflict?: string, load?: string, errors?: string },
 * }} HTMLImportSettingsElement
 */
/**
 * `<html-module-settings>`.
 * @typedef {HTMLElement & { readonly error: SyntaxError | null }} HTMLModuleSettingsElement
 */
/**
 * The classes of the five elements, as `defineHTMLModuleElements()` and `@johnhenry/html-modules/browser` return them.
 * @typedef {{
 *   HTMLImport: { new (): HTMLImportElement, prototype: HTMLImportElement },
 *   HTMLBinding: { new (): HTMLElement, prototype: HTMLElement },
 *   HTMLExport: { new (): HTMLElement, prototype: HTMLElement },
 *   HTMLImportSettings: { new (): HTMLImportSettingsElement, prototype: HTMLImportSettingsElement },
 *   HTMLModuleSettings: { new (): HTMLModuleSettingsElement, prototype: HTMLModuleSettingsElement },
 * }} HTMLModuleElements
 */
/**
 * A declared prop: an attribute that is also a property (`props="title count:number open:boolean"`).
 * @typedef {{ name: string, type?: 'string' | 'number' | 'boolean' }} PropSpec
 */
/**
 * One import of a component's module, as `defineHTMLComponent({ imports })` takes it.
 * @typedef {object} ComponentImport
 * @property {ModuleNamespace} [module]        the loaded module (absent for a lazy import)
 * @property {string} from                     the `src` as written
 * @property {string} [as]
 * @property {string} [delimiter]
 * @property {'error' | 'reuse'} [conflict]
 * @property {'event' | 'throw'} [errors]
 * @property {'eager' | 'lazy'} [load]
 * @property {'global' | 'scoped'} [registry]  `scoped`: bind into the registry of the component's own shadow roots
 * @property {() => Promise<ModuleNamespace>} [lazy]  loads a lazy import when one of its tags is first used
 * @property {Array<{ export: string, element?: string, adopt?: boolean }>} [bindings]
 */
/**
 * The spec of `new HTMLComponent()` / `defineHTMLComponent()`.
 * @typedef {object} ComponentSpec
 * @property {string | null} [name]            module-local identity, e.g. "custom-card"
 * @property {string | DocumentFragment} [template]  template HTML (the content of the `<template>`), or a DocumentFragment of it (stamped without being parsed)
 * @property {'open' | 'closed'} [shadow]
 * @property {boolean} [delegatesFocus]
 * @property {string[]} [styles]               CSS text, adopted into every shadow root (one sheet per definition)
 * @property {PropSpec[]} [props]
 * @property {boolean} [formAssociated]
 * @property {string} [formControl]
 * @property {'submit' | 'reset'} [formRole]       needs `formAssociated`; the element is a submit or reset button (no `formControl`)
 * @property {ComponentImport[]} [imports]
 * @property {Function} [element]              a JS-authored HTMLElement subclass instead of a template
 * @property {string} [url]
 */
/**
 * Options of `compileHTMLModule()` / `compileRecord()`.
 * @typedef {object} CompileOptions
 * @property {string} [runtime]                where the output imports the runtime from (default "@johnhenry/html-modules/runtime")
 * @property {'esm' | 'register'} [format]
 * @property {string} [as]                     register format: the namespace to register under
 * @property {string} [delimiter]              register format: the namespace delimiter
 * @property {'error' | 'reuse'} [conflict]    register format: keep tags that are already defined
 * @property {(src: string) => string} [rewrite]  dependency specifier rewrite (default ".html" → ".js")
 * @property {boolean} [hot]                   add Vite-style HMR
 */
export {};
