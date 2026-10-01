import { configureWindow } from './policy.js';
export type ModuleNamespace = import('./types.js').ModuleNamespace;
export type TagRecord = import('./types.js').TagRecord;
export type BindResult = import('./types.js').BindResult;
export type PropSpec = import('./types.js').PropSpec;
export type ComponentImport = import('./types.js').ComponentImport;
export type ComponentSpec = import('./types.js').ComponentSpec;
/** @typedef {import('./types.js').ModuleNamespace} ModuleNamespace */
/** @typedef {import('./types.js').TagRecord} TagRecord */
/** @typedef {import('./types.js').BindResult} BindResult */
/** @typedef {import('./types.js').PropSpec} PropSpec */
/** @typedef {import('./types.js').ComponentImport} ComponentImport */
/** @typedef {import('./types.js').ComponentSpec} ComponentSpec */
/**
 * Configure page-security options for a window: a Trusted Types policy for the HTML the runtime parses
 * (`{ createHTML(html) }`, or `false` for none), and the CSP `nonce` for the fallback `<style>` elements.
 * See `createHTMLModules({ trustedTypes, nonce })`, which calls this for its window.
 * @param {any} win
 * @param {{ trustedTypes?: { createHTML(html: string): unknown } | false, nonce?: string }} options
 */
export declare const configureRuntime: typeof configureWindow;
/**
 * An HTML Component Definition: a component's module-local identity and how to
 * render it. The same definition can be registered under any number of tags.
 */
export declare class HTMLComponent {
    #private;
    /** @type {string | null} */
    name: string | null;
    /** @type {string | null} */
    template: string | null;
    /** @type {'open' | 'closed'} */
    shadow: 'open' | 'closed';
    /** @type {boolean} */
    delegatesFocus: boolean;
    /** @type {readonly string[]} */
    styles: readonly string[];
    /** @type {readonly Readonly<{ name: string, type: 'string' | 'number' | 'boolean' }>[]} */
    props: readonly Readonly<{
        name: string;
        type: 'string' | 'number' | 'boolean';
    }>[];
    /** @type {boolean} */
    formAssociated: boolean;
    /** @type {string | undefined} */
    formControl: string | undefined;
    /** @type {'submit' | 'reset' | undefined} */
    formRole: 'submit' | 'reset' | undefined;
    /** @type {readonly Readonly<import('./types.js').ComponentImport>[]} */
    imports: readonly Readonly<import('./types.js').ComponentImport>[];
    /** @type {string | undefined} */
    url: string | undefined;
    /**
     * @param {import('./types.js').ComponentSpec} [spec]
     *   `imports`: modules this component uses, bound before it is registered (an entry with no `module` and a `lazy`
     *   loader is bound when one of its tags is first used); `element`: a JS-authored HTMLElement subclass instead of
     *   a template; `url`: where it came from, for messages.
     */
    constructor({ name, template, shadow, delegatesFocus, styles, props, formAssociated, formControl, formRole, imports, element, url }?: import('./types.js').ComponentSpec);
    get [Symbol.toStringTag](): string;
    /** True when the component is a JS-authored class rather than a template. */
    get isClass(): boolean;
    /**
     * The base element class, for `customElements.define(tag, class extends def.element {})`.
     * @returns {CustomElementConstructor}
     */
    get element(): CustomElementConstructor;
    /**
     * The base element class for another window (e.g. a test DOM).
     * @param {any} [win]
     * @returns {CustomElementConstructor}
     */
    elementFor(win?: any): CustomElementConstructor;
    /**
     * Register this component under `tag` and return the registered class.
     * Its module's own imports are bound first. Defining the same definition
     * under the same tag again is a no-op.
     * @param {string} tag
     * @param {{ registry?: CustomElementRegistry, window?: any }} [options]
     */
    define(tag: string, options?: {
        registry?: CustomElementRegistry;
        window?: any;
    }): CustomElementConstructor;
}
/**
 * Make an HTML Component Definition from a spec, a JS-authored class, or an
 * existing definition (returned as-is).
 * @param {ConstructorParameters<typeof HTMLComponent>[0] | Function | HTMLComponent} spec
 * @returns {HTMLComponent}
 */
export declare function defineHTMLComponent(spec: ConstructorParameters<typeof HTMLComponent>[0] | Function | HTMLComponent): HTMLComponent;
/**
 * @param {unknown} value
 * @returns {value is HTMLComponent}
 */
export declare const isHTMLComponent: (value: unknown) => value is HTMLComponent;
/**
 * True when `win` supports scoped custom element registries: `new CustomElementRegistry()` and
 * `attachShadow({ customElementRegistry })`. Detected by trying it (feature-detecting only the constructor would
 * claim support in browsers that have the interface but ignore the shadow root option).
 * @param {any} [win]
 * @returns {boolean}
 */
export declare function supportsScopedRegistries(win?: any): boolean;
/**
 * Server-side rendering: the declarative shadow DOM markup for one instance of a component, to place inside its
 * host element together with the host's own light DOM. Pure string work, so it runs in Node.
 *
 *   `<ui--card>${renderDeclarative(card, '<h2>Title</h2>')}</ui--card>`
 *   // <ui--card><template shadowrootmode="open"><style>…</style><article>…</article></template><h2>Title</h2></ui--card>
 *
 * The root's mode and `delegatesFocus` are the definition's. The definition's styles (and those its imports
 * adopt) are written as `<style>` elements so the first paint is styled before any script runs; on upgrade the
 * component adopts its constructed sheets as well (the rules are then listed twice, which is harmless).
 * `innerHTML` is the host's light DOM children and is inserted as written: escape untrusted text yourself.
 * @param {HTMLComponent} def a template-backed component (not a JS-authored class)
 * @param {string} [innerHTML]
 * @returns {string}
 */
export declare function renderDeclarative(def: HTMLComponent, innerHTML?: string): string;
/** A stylesheet export: CSS text that can be adopted into documents and shadow roots. */
export declare class HTMLStylesheet {
    #private;
    /** @type {string | null} */
    name: string | null;
    /** @type {string} */
    css: string;
    /** @type {string | undefined} */
    url: string | undefined;
    /** @param {{ name?: string | null, css?: string, url?: string }} [spec] */
    constructor({ name, css, url }?: {
        name?: string | null;
        css?: string;
        url?: string;
    });
    get [Symbol.toStringTag](): string;
    /** `css` with its relative `url(...)`s made absolute against the module's `url`: what is actually applied. */
    get resolvedCss(): any;
    /**
     * A constructed CSSStyleSheet for `win` (one per window, shared), or null without constructable sheets.
     * @param {any} [win]
     * @returns {CSSStyleSheet | null}
     */
    sheetFor(win?: any): CSSStyleSheet | null;
    /**
     * Adopt into a document or shadow root.
     * @param {Document | ShadowRoot} root
     * @param {{ window?: any }} [options]
     */
    adopt(root: Document | ShadowRoot, options?: {
        window?: any;
    }): void;
}
/**
 * @param {{ name?: string | null, css?: string, url?: string } | HTMLStylesheet} spec
 * @returns {HTMLStylesheet}
 */
export declare const defineHTMLStylesheet: (spec: {
    name?: string | null;
    css?: string;
    url?: string;
} | HTMLStylesheet) => HTMLStylesheet;
/**
 * @param {unknown} value
 * @returns {value is HTMLStylesheet}
 */
export declare const isHTMLStylesheet: (value: unknown) => value is HTMLStylesheet;
/**
 * @param {unknown} value
 * @returns {value is HTMLStylesheet | CSSStyleSheet}
 */
export declare const isStylesheet: (value: unknown) => value is HTMLStylesheet | CSSStyleSheet;
/**
 * Adopt a stylesheet export (HTMLStylesheet or CSSStyleSheet) into a document
 * or shadow root. Adopting the same sheet twice is a no-op. Where constructable
 * stylesheets are unavailable, a <style> element is inserted instead (with the window's CSP `nonce`, if one is
 * configured: see `configureRuntime()`).
 * @param {Document | ShadowRoot} root
 * @param {HTMLStylesheet | CSSStyleSheet} value
 * @param {{ window?: any }} [options]
 */
export declare function adoptStylesheet(root: Document | ShadowRoot, value: HTMLStylesheet | CSSStyleSheet, { window: win }?: {
    window?: any;
}): void;
/**
 * The counterpart of `adoptStylesheet()`: take a stylesheet out of a document or shadow root again. A no-op when
 * it was not adopted there. It is removed outright, whoever adopted it: adoption is not reference-counted, so
 * two bindings that adopted the same sheet into one root lose it together.
 * @param {Document | ShadowRoot} root
 * @param {HTMLStylesheet | CSSStyleSheet} value
 * @param {{ window?: any }} [options]
 */
export declare function unadoptStylesheet(root: Document | ShadowRoot, value: HTMLStylesheet | CSSStyleSheet, { window: win }?: {
    window?: any;
}): void;
/** True for values that can become a custom element: definitions, HTMLElement classes, templates. */
export declare function isElementLike(value: any, win?: typeof globalThis): boolean;
/**
 * The definition for any element-like value; throws a TypeError for anything else.
 * @param {unknown} value
 * @param {{ window?: any, what?: string }} [options]
 * @returns {HTMLComponent}
 */
export declare function toComponent(value: unknown, { window: win, what }?: {
    window?: any;
    what?: string;
}): HTMLComponent;
/**
 * Register an element-like value under `tag`. Every registration is a fresh
 * subclass, so one definition can have many tags (PRD §14). Registering the
 * same definition under the same tag again returns the existing class.
 * A tag already defined by something else is an error, or, with
 * `conflict: 'reuse'`, keeps the existing definition and returns its class.
 * @param {string} tag
 * @param {unknown} value
 * @param {{ registry?: CustomElementRegistry, window?: any, conflict?: 'error'|'reuse' }} [options]
 * @returns {CustomElementConstructor}
 */
export declare function defineElement(tag: string, value: unknown, options?: {
    registry?: CustomElementRegistry;
    window?: any;
    conflict?: 'error' | 'reuse';
}): CustomElementConstructor;
/**
 * Look up an export of a module namespace by the name used in markup.
 * Checks the `components` manifest, then the name as written, then its
 * camelCase form ("custom-card" → `customCard`).
 * @param {import('./types.js').ModuleNamespace} ns
 * @param {string} name
 * @param {string} [from]
 * @returns {unknown}
 */
export declare function lookupExport(ns: import('./types.js').ModuleNamespace, name: string, from?: string): unknown;
/**
 * The components a module offers for a whole-namespace import, as
 * [exportName, value] pairs: its `components` manifest if it has one,
 * otherwise its exports made with defineHTMLComponent(). Other exports
 * (constants, functions, plain classes) are never treated as components.
 * @param {import('./types.js').ModuleNamespace} ns
 * @param {string} [from]
 * @returns {Array<[string, unknown]>}
 */
export declare function componentsOf(ns: import('./types.js').ModuleNamespace, from?: string): Array<[string, unknown]>;
/**
 * The components a namespace re-export (`<html-export src name="icon" import="*">`,
 * `export * as icon from`) adds to the re-exporting module's manifest: each of the
 * source's components as `<name>--<export>` ("icon--star"), so importing the
 * re-exporter `as="ui"` gives `<ui--icon--star>`. "--" cannot occur in an export
 * name, so these never collide with the module's own. A source with no
 * components (a plain JS module) adds nothing.
 * @param {string} name the namespace export's name
 * @param {object} ns   the source namespace
 * @returns {Record<string, unknown>}
 */
export declare function namespaceComponents(name: string, ns: object): Record<string, unknown>;
/**
 * Apply one binding `{ export, element?, adopt? }` of an import.
 * `namespace` is the import's `as` when the tag was made from it, and null
 * when `element=` chose the tag (or nothing was registered): the mapping is
 * recorded here, never parsed back out of the tag. `reused: true` is added
 * when `conflict: 'reuse'` kept a different, existing definition of the tag.
 * @returns {{ export: string, value: unknown, tag: string|null, namespace: string|null, element: Function|null, adopted: boolean, reused?: true }}
 * @param {import('./types.js').ModuleNamespace} ns
 * @param {{ export: string, element?: string, adopt?: boolean }} binding
 * @param {{ as?: string, delimiter?: string, from?: string, registry?: CustomElementRegistry, window?: any, root?: Document | ShadowRoot, conflict?: 'error' | 'reuse' }} [options]
 */
export declare function applyBinding(ns: import('./types.js').ModuleNamespace, binding: {
    export: string;
    element?: string;
    adopt?: boolean;
}, options?: {
    as?: string;
    delimiter?: string;
    from?: string;
    registry?: CustomElementRegistry;
    window?: any;
    root?: Document | ShadowRoot;
    conflict?: 'error' | 'reuse';
}): {
    export: string;
    value: unknown;
    tag: string | null;
    namespace: string | null;
    element: Function | null;
    adopted: boolean;
    reused?: true;
};
/**
 * Register every component of a namespace. With `as`, tags are
 * `<as><delimiter><export>` (delimiter "--" unless given); without it, the
 * export names themselves (which then must be valid custom element names).
 * This is what compiled `register` modules call.
 * @returns {Record<string, CustomElementConstructor>} tag → registered class
 * @param {import('./types.js').ModuleNamespace | { components: Record<string, unknown> }} ns
 * @param {{ as?: string, delimiter?: string, from?: string, registry?: CustomElementRegistry, window?: any, conflict?: 'error' | 'reuse' }} [options]
 */
export declare function registerComponents(ns: import('./types.js').ModuleNamespace | {
    components: Record<string, unknown>;
}, options?: {
    as?: string;
    delimiter?: string;
    from?: string;
    registry?: CustomElementRegistry;
    window?: any;
    conflict?: 'error' | 'reuse';
}): Record<string, CustomElementConstructor>;
/**
 * Bind a loaded module the way `<html-import>` does.
 *  - with `bindings`: only those exports (`{ export, element?, adopt? }`)
 *  - otherwise, with `as`: every component as `<as><delimiter><export>`
 *  - otherwise: nothing (the module was loaded for its side effects)
 * `tags` records what each registered tag was made from, so nothing needs to
 * split a tag to find its namespace and export (with delimiter "-", it can't).
 * `conflict: 'reuse'` keeps tags that are already defined by something else
 * (recorded with `reused: true`) instead of throwing.
 * @param {object} ns module namespace (runtime-loaded HTML, compiled, or plain JS)
 * @param {{ as?: string, delimiter?: string, bindings?: object[], from?: string, registry?: CustomElementRegistry, window?: any, root?: Document|ShadowRoot, conflict?: 'error'|'reuse' }} [options]
 * @returns {BindResult}
 */
export declare function bindModule(ns: object, { as, delimiter, bindings, from, registry, window: win, root, conflict }?: {
    as?: string;
    delimiter?: string;
    bindings?: object[];
    from?: string;
    registry?: CustomElementRegistry;
    window?: any;
    root?: Document | ShadowRoot;
    conflict?: 'error' | 'reuse';
}): BindResult;
/**
 * The `components` manifest of an HTML module: its own components, then those
 * re-exported with `<html-export src>` (star re-exports). A name offered by two
 * different star sources is an error. Used by the loader and by compiled output.
 * @param {Record<string, unknown>} locals  export name → value (non-components are skipped)
 * @param {Array<[object, string]>} [stars] [namespace, from] pairs
 */
export declare function manifest(locals: Record<string, unknown>, stars?: Array<[object, string]>): Readonly<{}>;
/**
 * Replace a component definition under the elements already registered with it: they keep their classes, listeners
 * and light DOM, and get the new template (re-stamped) and styles (swapped) in place. The replacement can be
 * registered under the same tag again (it is the same component). Returns `{ ok: true, elements }`, or
 * `{ ok: false, reason }` and changes nothing when the change cannot be applied to live elements: `shadow`,
 * `delegatesFocus`, `form-associated`, new observed attributes or props, changed imports, JavaScript-authored classes.
 * @param {HTMLComponent} previous
 * @param {HTMLComponent} next
 * @returns {{ ok: true, elements: number } | { ok: false, reason: string }}
 */
export declare function hotReplaceComponent(previous: HTMLComponent, next: HTMLComponent): {
    ok: true;
    elements: number;
} | {
    ok: false;
    reason: string;
};
/**
 * Replace a stylesheet export: every root that adopted `previous` gets `next` instead, and later adoptions of `previous` adopt `next`.
 * @param {HTMLStylesheet} previous
 * @param {HTMLStylesheet} next
 */
export declare function hotReplaceStylesheet(previous: HTMLStylesheet, next: HTMLStylesheet): number;
/**
 * Hot-replace one module's exports with another's (a re-fetched HTML module, or a re-evaluated compiled one): its
 * components and stylesheets are swapped under live elements. Nothing is changed unless **every** export can be
 * swapped; otherwise `reload` is true and `reasons` says why (exports added or removed, changed data, imports or
 * a setting that is fixed when an element is created), and the caller should reload the page.
 * @param {object} previous the module namespace before
 * @param {object} next     the module namespace after
 * @returns {{ reload: boolean, reasons: string[], updated: string[], elements: number }}
 * @param {import('./types.js').ModuleNamespace | Record<string, unknown>} previous
 * @param {import('./types.js').ModuleNamespace | Record<string, unknown>} next
 */
export declare function hotReplaceModule(previous: object, next: object): {
    reload: boolean;
    reasons: string[];
    updated: string[];
    elements: number;
};
