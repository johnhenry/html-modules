/** Called by the runtime whenever a component instance's shadow root is ready. */
export declare function componentRootCreated(host: any, root: any, win?: typeof globalThis): void;
/**
 * The shadow root html-modules created for a component instance (also for closed roots), or null.
 * @param {Element} host
 * @returns {ShadowRoot | null}
 */
export declare const componentRoot: (host: Element) => ShadowRoot | null;
/**
 * The tags a lazy import waits for: `{ tags: string[], prefixes: string[] }`.
 * Bindings that register no tag (adopt, data, invalid names) add nothing.
 * @param {{ as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }> }} spec
 */
export declare function lazyTargets({ as, delimiter, bindings }?: {
    as?: string;
    delimiter?: string;
    bindings?: Array<{
        export: string;
        element?: string;
        adopt?: boolean;
    }>;
}): {
    tags: any[];
    prefixes: any[];
};
/**
 * Whether a lazy import has any tag to wait for (what `lazyTargets()` would watch, ignoring whether each tag is
 * valid): a namespace import, or a binding that registers a tag. Adopt, data and default-without-`element`
 * bindings register none, and neither does an import with no `as` and no `element=`.
 * @param {{ as?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }> }} [spec]
 * @returns {boolean}
 */
export declare function hasLazyTargets({ as, bindings }?: {
    as?: string;
    bindings?: Array<{
        export: string;
        element?: string;
        adopt?: boolean;
    }>;
}): boolean;
/**
 * Call `fire(element)` once, the first time an element with one of the
 * target tags is present in the window's document or in a component shadow
 * root (now or later). Returns `{ cancel() }`. With no targets nothing is
 * watched, and `fire` is never called.
 * @param {any} win
 * @param {{ tags: string[], prefixes: string[] }} targets
 * @param {(el: Element) => void} fire
 * @param {{ skip?: (el: Element) => boolean }} [options]  `skip` excludes elements that must not fire it (e.g. ones it already failed for)
 */
export declare function watchLazy(win: any, { tags, prefixes }: {
    tags: string[];
    prefixes: string[];
}, fire: (el: Element) => void, { skip }?: {
    skip?: (el: Element) => boolean;
}): {
    readonly active: boolean;
    cancel(): void;
};
