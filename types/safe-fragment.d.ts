/**
 * An adapter from `@johnhenry/safe-fragment` to the `sanitize` option of html-modules. Nothing here imports
 * safe-fragment statically and html-modules does not depend on it: pass the module, or let the adapter `import()` it
 * from wherever the page's import map (or your bundler) puts `@johnhenry/safe-fragment`.
 *
 *   import * as safeFragment from '@johnhenry/safe-fragment';
 *   import { safeFragmentSanitizer } from '@johnhenry/html-modules/safe-fragment';
 *
 *   HTMLModules.sanitize = safeFragmentSanitizer({
 *     safeFragment,
 *     profile: { namespaces: ['ui'] },   // ui-v1 + <slot>, part, slot, and ui--* custom elements; or a profile name
 *   });
 *   await HTMLModules.import('https://cdn.example/ui.html', { as: 'ui' });  // its templates come out sanitized
 *
 * What it does for each component template: `sanitizeToFragment(html, { profile, document })` and returns the
 * resulting DocumentFragment (no re-parse), after announcing what the profile removed as a `sanitize` event. What the
 * profiles keep and drop is safe-fragment's and is listed in the README's `## Security model`.
 */
/**
 * Register (once) a safe-fragment profile fit for component templates, derived from a built-in one, and return its name.
 * It keeps everything `base` keeps and adds `<slot name>`, `part` and `slot` on every element, and custom elements
 * under each namespace (`ui--*`). It cannot add `<style>` (safe-fragment refuses it in every profile, and drops a
 * `<style>` it finds in a template with its content: a module's stylesheets belong in `<html-export><style>`, which is
 * never sanitized) or forms and SVG (the built-ins have none).
 * @param {{ getProfile(name: string): any, deriveProfile(base: any, overrides: any): any, registerProfile(profile: any): any }} safeFragment
 * @param {object} [options]
 * @param {string} [options.name]          the new profile's name (default `html-modules-<base>`, e.g. `html-modules-ui-v1`; it ends in the base's `-v<N>`)
 * @param {string} [options.base]          the profile to start from (default `"ui-v1"`; `"article-v1"` for read-mostly content)
 * @param {string[]} [options.namespaces]  namespaces of the custom elements the templates use: `['ui']` keeps `<ui--card>`, `<ui--stat>`, …
 * @param {string} [options.delimiter]     the namespace delimiter (default `"--"`)
 * @param {string[]} [options.attributes]  extra attributes the namespaced custom elements may carry (their props: `label`, `tone`, …)
 * @param {string[]} [options.dataAttributes]  extra `data-*` names to keep (full names: `data-id`)
 * @returns {string} the profile's name
 */
export declare function registerTemplateProfile(safeFragment: {
    getProfile(name: string): any;
    deriveProfile(base: any, overrides: any): any;
    registerProfile(profile: any): any;
}, { name, base, namespaces, delimiter, attributes, dataAttributes }?: {
    name?: string;
    base?: string;
    namespaces?: string[];
    delimiter?: string;
    attributes?: string[];
    dataAttributes?: string[];
}): string;
/**
 * A `sanitize` function for html-modules that runs each component template through safe-fragment.
 * @param {object} options
 * @param {string | { name?: string, base?: string, namespaces?: string[], delimiter?: string, attributes?: string[], dataAttributes?: string[] }} options.profile
 *        a registered profile's name, or the options of `registerTemplateProfile()` (the profile is registered on first use)
 * @param {{ sanitizeToFragment(html: string, options: object): Promise<{ fragment: DocumentFragment, report: any }> }} [options.safeFragment]
 *        the `@johnhenry/safe-fragment` module; default: `import('@johnhenry/safe-fragment')` through the page's import map or your bundler
 * @param {(report: any, context: { def: any, url: string }) => void} [options.onReport]  called with every sanitization report
 * @param {boolean} [options.quiet]  do not announce removals as `sanitize` events (default: announce them)
 * @param {object} [options.sanitizeOptions]  more options for `sanitizeToFragment()` (`maxInputLength`, `baseUrl`, `loadDOMPurify`)
 * @returns {import('./types.js').Sanitizer}
 */
export declare function safeFragmentSanitizer({ profile, safeFragment, onReport, quiet, sanitizeOptions }?: {
    profile: string | {
        name?: string;
        base?: string;
        namespaces?: string[];
        delimiter?: string;
        attributes?: string[];
        dataAttributes?: string[];
    };
    safeFragment?: {
        sanitizeToFragment(html: string, options: object): Promise<{
            fragment: DocumentFragment;
            report: any;
        }>;
    };
    onReport?: (report: any, context: {
        def: any;
        url: string;
    }) => void;
    quiet?: boolean;
    sanitizeOptions?: object;
}): import('./types.js').Sanitizer;
