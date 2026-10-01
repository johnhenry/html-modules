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

// Attributes every kept element may carry for shadow-DOM composition. (`part` names a styling hook of an element in a
// shadow tree, `slot` assigns a light-DOM child to a slot, `exportparts` forwards a nested host's parts.)
const COMPOSITION = ['part', 'slot'];
// What a namespaced custom element may carry by default: the global attributes of `ui-v1`, aria and composition.
const CUSTOM_ELEMENT_ATTRIBUTES = [
  'id', 'class', 'title', 'lang', 'dir', 'role', 'tabindex', ...COMPOSITION, 'exportparts',
  'aria-label', 'aria-hidden', 'aria-expanded', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns',
];

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
export function registerTemplateProfile(safeFragment, { name, base = 'ui-v1', namespaces = [], delimiter = '--', attributes = [], dataAttributes = [] } = {}) {
  const { getProfile, deriveProfile, registerProfile } = safeFragment ?? {};
  if (typeof getProfile !== 'function' || typeof deriveProfile !== 'function' || typeof registerProfile !== 'function') {
    throw new TypeError('registerTemplateProfile: pass the @johnhenry/safe-fragment module (it needs getProfile, deriveProfile and registerProfile)');
  }
  const baseProfile = getProfile(base);
  if (!baseProfile) throw new Error(`registerTemplateProfile: safe-fragment has no profile named "${base}"`);
  if (baseProfile.mode !== 'html') throw new Error(`registerTemplateProfile: "${base}" does not parse markup (its mode is "${baseProfile.mode}"), so it cannot sanitize a template`);
  const derivedName = name ?? `html-modules-${base}`;
  const existing = getProfile(derivedName);
  if (existing) return derivedName;
  const elements = Object.fromEntries(Object.entries(baseProfile.elements).map(([tag, attrs]) => [tag, [...new Set([...attrs, ...COMPOSITION])]]));
  elements.slot = ['name'];
  const customElements = [...baseProfile.customElements, ...namespaces.map((ns) => ({ tag: `${ns}${delimiter}*`, attributes: [...CUSTOM_ELEMENT_ATTRIBUTES, ...attributes] }))];
  registerProfile(deriveProfile(baseProfile, {
    name: derivedName,
    elements,
    customElements,
    allowedDataAttributes: [...new Set([...baseProfile.allowedDataAttributes, ...dataAttributes])],
  }));
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
 * @param {object} [options.sanitizeOptions]  more options for `sanitizeToFragment()` (`maxInputLength`, `baseUrl`, `loadDOMPurify`)
 * @returns {import('./types.js').Sanitizer}
 */
export function safeFragmentSanitizer({ profile, safeFragment, onReport, quiet = false, sanitizeOptions } = {}) {
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
    const { fragment, report } = await lib.sanitizeToFragment(html, { ...sanitizeOptions, profile: profileName, document: context.window?.document });
    const removed = notes(report);
    if (removed.length && !quiet) {
      context.report?.({ profile: profileName, engine: report.engine, removed: removed.map(({ what, tag, attribute, reason, snippet }) => ({ what, tag, ...(attribute && { attribute }), reason, ...(snippet && { snippet }) })) });
    }
    onReport?.(report, { def: context.def, url: context.url });
    return fragment;
  };
}
