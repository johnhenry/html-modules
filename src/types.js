/**
 * Type definitions only (no runtime code): the shared shapes of the public API, as JSDoc `@typedef`s that
 * `tsc --declaration` turns into the package's `.d.ts` files (see `types/`, `npm run types`).
 */

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
 * @property {(specifier: string, referrer?: string, options?: { type?: 'html' | 'js', integrity?: string, credentials?: string, mode?: string, cache?: RequestCache }) => Promise<ModuleNamespace>} load
 * @property {(specifier: string, referrer?: string, options?: { type?: 'html' | 'js' }) => boolean} unload
 * @property {(specifier: string, referrer?: string) => Promise<{ previous: ModuleNamespace | undefined, next: ModuleNamespace }>} reload
 * @property {(specifier: string, referrer?: string) => string} resolve
 * @property {Map<string, Promise<ModuleNamespace>>} cache
 * @property {string | undefined} baseURL
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
 * @property {(html: string, url: string) => ParentNode} [parseHTML]  default: parses into a detached element (no CSP-checked document)
 * @property {(url: string) => Promise<object>} [importModule]      default: native `import()`
 * @property {(event: { type: 'fetch' | 'load' | 'error', url: string, kind?: string, error?: unknown }) => void} [onEvent]
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
 * @property {(src: string, base?: string) => string} resolve
 * @property {(src: string, options?: { base?: string, type?: 'html' | 'js', integrity?: string, credentials?: 'omit' | 'same-origin' | 'include', mode?: 'cors' | 'same-origin' | 'no-cors' }) => Promise<ModuleNamespace>} load
 * @property {(src: string, options?: { base?: string, type?: 'html' | 'js' }) => boolean} unload
 * @property {(src: string, options?: { base?: string }) => Promise<HotReloadResult>} hotReload
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
 * @property {string} [template]               template HTML (the content of the `<template>`)
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
