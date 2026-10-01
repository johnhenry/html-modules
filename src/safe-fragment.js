// @ts-self-types="../types/safe-fragment.d.ts"
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
 *     profile: { namespaces: ['ui'] },   // component-template-v1 (ui-v1 + <slot>, part, slot) + ui--* custom elements; or a profile name
 *   });
 *   await HTMLModules.import('https://cdn.example/ui.html', { as: 'ui' });  // its templates come out sanitized
 *
 * What it does for each component template: `sanitizeToFragment(html, { profile, document })` and returns the
 * resulting DocumentFragment (no re-parse), after announcing what the profile removed as a `sanitize` event. What the
 * profiles keep and drop is safe-fragment's and is listed in the README's `## Security model`.
 */

// Attributes every kept element may carry for shadow-DOM composition. (`part` names a styling hook of an element in a
// shadow tree, `slot` assigns a light-DOM child to a slot, `exportparts` forwards a nested host's parts.)
const COMPOSITION = ['part', 'slot'];
// What a namespaced custom element may carry by default: the global attributes of `ui-v1`, aria and composition.
const CUSTOM_ELEMENT_ATTRIBUTES = [
  'id', 'class', 'title', 'lang', 'dir', 'role', 'tabindex', ...COMPOSITION, 'exportparts',
  'aria-label', 'aria-hidden', 'aria-expanded', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns',
];

/**
 * Register (once) a safe-fragment profile fit for component templates and return its name. The default base is
 * safe-fragment's built-in `component-template-v1` (`ui-v1` plus `<slot name>` and `part`, `slot`, `exportparts` on every
 * element: safe-fragment 99ac557, ADR 0005), derived with `deriveProfile()` to add custom elements under each namespace
 * (`ui--*`) and `data-*` names, which a built-in cannot carry. With nothing to add, the built-in itself is returned.
 * Any other `base` (`"ui-v1"`, `"article-v1"`) gets the composition attributes added here too.
 *
 * What a template loses under it (everything `ui-v1` removes): `<style>` (safe-fragment refuses it in every profile
 * and drops it with its content, ADR 0006: a module's stylesheets belong in `<html-export><style>`, which is never
 * sanitized), `<form>` and form controls, SVG and MathML, `style=""`, `srcset`, `data-*` other than `data-action` (plus
 * the names you list), `http:` links, and every attribute not on the profile's list. Custom elements outside a namespace
 * you list are unwrapped to their content.
 * @param {{ getProfile(name: string): any, deriveProfile(base: any, overrides: any): any, registerProfile(profile: any): any }} safeFragment
 * @param {object} [options]
 * @param {string} [options.name]          the new profile's name (default `html-modules-<base>`, e.g. `html-modules-component-template-v1`; it ends in the base's `-v<N>`)
 * @param {string} [options.base]          the profile to start from (default `"component-template-v1"`; `"ui-v1"` or `"article-v1"` for read-mostly content)
 * @param {string[]} [options.namespaces]  namespaces of the custom elements the templates use: `['ui']` keeps `<ui--card>`, `<ui--stat>`, …
 * @param {string} [options.delimiter]     the namespace delimiter (default `"--"`)
 * @param {string[]} [options.attributes]  extra attributes the namespaced custom elements may carry (their props: `label`, `tone`, …)
 * @param {string[]} [options.dataAttributes]  extra `data-*` names to keep (full names: `data-id`)
 * @returns {string} the profile's name
 */
export function registerTemplateProfile(safeFragment, { name, base = 'component-template-v1', namespaces = [], delimiter = '--', attributes = [], dataAttributes = [] } = {}) {
  const { getProfile, deriveProfile, registerProfile } = safeFragment ?? {};
  if (typeof getProfile !== 'function' || typeof deriveProfile !== 'function' || typeof registerProfile !== 'function') {
    throw new TypeError('registerTemplateProfile: pass the @johnhenry/safe-fragment module (it needs getProfile, deriveProfile and registerProfile)');
  }
  const baseProfile = getProfile(base);
  if (!baseProfile) {
    throw new Error(`registerTemplateProfile: safe-fragment has no profile named "${base}"${base === 'component-template-v1' ? ' (it is built in from safe-fragment 99ac557; with an older one, pass base: "ui-v1")' : ''}`);
  }
  if (baseProfile.mode !== 'html') throw new Error(`registerTemplateProfile: "${base}" does not parse markup (its mode is "${baseProfile.mode}"), so it cannot sanitize a template`);
  const composed = 'slot' in baseProfile.elements;
  if (composed && name === undefined && namespaces.length === 0 && dataAttributes.length === 0) return base; // nothing to add to the built-in
  const derivedName = name ?? `html-modules-${base}`;
  if (getProfile(derivedName)) return derivedName;
  const overrides = {
    name: derivedName,
    customElements: [...baseProfile.customElements, ...namespaces.map((ns) => ({ tag: `${ns}${delimiter}*`, attributes: [...CUSTOM_ELEMENT_ATTRIBUTES, ...attributes] }))],
    allowedDataAttributes: [...new Set([...baseProfile.allowedDataAttributes, ...dataAttributes])],
  };
  if (!composed) {
    overrides.elements = Object.fromEntries(Object.entries(baseProfile.elements).map(([tag, attrs]) => [tag, [...new Set([...attrs, ...COMPOSITION])]]));
    overrides.elements.slot = ['name'];
  }
  registerProfile(deriveProfile(baseProfile, overrides));
  return derivedName;
}

// DOMPurify's own log (the engine safe-fragment falls back to where there is no native Sanitizer: Safari, and Firefox
// before it ships one) lists the wrappers it parses into, `body` and a `remove` marker, as removed elements of every
// input, benign ones included. They are never in a template, so they are not reported as removals (safe-fragment#9).
const ENGINE_ARTEFACTS = new Set(['body', 'head', 'html', 'remove']);
const real = (note) => !(ENGINE_ARTEFACTS.has(note.tag) && String(note.reason).startsWith('removed-by-engine:dompurify'));

const notes = (report) => [
  ...(report.removedElements ?? []).filter(real).map((n) => ({ ...n, what: 'element' })),
  ...(report.removedAttributes ?? []).filter(real).map((n) => ({ ...n, what: 'attribute' })),
  ...(report.rewrittenUrls ?? []).filter(real).map((n) => ({ ...n, what: 'url' })),
];

/**
 * A `sanitize` function for html-modules that runs each component template through safe-fragment.
 * @param {object} options
 * @param {string | { name?: string, base?: string, namespaces?: string[], delimiter?: string, attributes?: string[], dataAttributes?: string[] }} options.profile
 *        a registered profile's name, or the options of `registerTemplateProfile()` (the profile is registered on first use)
 * @param {{ sanitizeToFragment(html: string, options: object): Promise<{ fragment: DocumentFragment, report: any }> }} [options.safeFragment]
 *        the `@johnhenry/safe-fragment` module; default: `import('@johnhenry/safe-fragment')` through the page's import map or your bundler
 * @param {(report: any, context: { def: any, url: string }) => void} [options.onReport]  called with every sanitization report
 * @param {boolean} [options.quiet]  do not announce removals as `sanitize` events (default: announce them)
 * @param {'keep-in-shadow' | 'prefix'} [options.idPolicy]  what happens to the `id`s of a template (and the `for`, `aria-*` and `form-control` references to them). Default `"keep-in-shadow"`: html-modules stamps every
 *        template into a shadow root (`attachShadow()`; there is no light-DOM mode), where named access on `window`/`document` (the DOM-clobbering vector the `user-content-` prefix exists for) cannot reach, so the author's ids
 *        stay and a component's `#id` selectors and `form-control="#id"` keep working. `"prefix"` has safe-fragment rewrite every id to `user-content-<id>`. It is `"prefix"` regardless when the sanitizer is called
 *        without a component (no `context.def`), because a fragment of unknown destination must not keep ids.
 * @param {object} [options.sanitizeOptions]  more options for `sanitizeToFragment()` (`maxInputLength`, `baseUrl`, `loadDOMPurify`)
 * @returns {import('./types.js').Sanitizer}
 */
export function safeFragmentSanitizer({ profile, safeFragment, onReport, quiet = false, idPolicy = 'keep-in-shadow', sanitizeOptions } = {}) {
  if (idPolicy !== 'keep-in-shadow' && idPolicy !== 'prefix') throw new TypeError(`safeFragmentSanitizer: idPolicy must be "keep-in-shadow" or "prefix", got ${JSON.stringify(idPolicy)}`);
  if ((typeof profile !== 'string' || profile === '') && (typeof profile !== 'object' || profile === null)) {
    throw new TypeError('safeFragmentSanitizer: pass { profile }: the name of a registered safe-fragment profile (e.g. "ui-v1"), or options for registerTemplateProfile() (e.g. { namespaces: ["ui"] })');
  }
  let library;
  const load = () => (library ??= Promise.resolve(safeFragment ?? import('@johnhenry/safe-fragment')));
  let profileName;
  return async function sanitize(html, context) {
    const lib = await load();
    if (typeof lib?.sanitizeToFragment !== 'function') throw new TypeError('safeFragmentSanitizer: the safe-fragment module has no sanitizeToFragment() (pass the namespace of @johnhenry/safe-fragment)');
    profileName ??= typeof profile === 'string' ? profile : registerTemplateProfile(lib, profile);
    const { fragment, report } = await lib.sanitizeToFragment(html, { ...sanitizeOptions, profile: profileName, idPolicy: context.def && idPolicy === 'keep-in-shadow' ? 'keep-in-shadow' : 'prefix', document: context.window?.document });
    const removed = notes(report);
    if (removed.length && !quiet) {
      context.report?.({ profile: profileName, engine: report.engine, removed: removed.map(({ what, tag, attribute, reason, snippet }) => ({ what, tag, ...(attribute && { attribute }), reason, ...(snippet && { snippet }) })) });
    }
    onReport?.(report, { def: context.def, url: context.url });
    return fragment;
  };
}
