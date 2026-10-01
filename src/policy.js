/**
 * Per-window page-security settings shared by the loader and the runtime: the Trusted Types policy that wraps
 * HTML before it reaches an HTML sink (`template.innerHTML`, `DOMParser.parseFromString`), and the CSP nonce
 * for the `<style>` elements used where constructable stylesheets are unavailable.
 *
 * Without configuration: where `window.trustedTypes` exists, a policy named "html-modules" (a pass-through:
 * the markup it wraps is the module source you chose to load) is created on first use, so a CSP of
 * `require-trusted-types-for 'script'; trusted-types html-modules` is enough; elsewhere HTML is passed as a
 * plain string.
 */
const settings = new WeakMap(); // window → { trustedTypes?: policy | false, nonce?: string }
const defaults = new WeakMap(); // window → the "html-modules" policy (or null when it could not be created)

/**
 * Configure a window's security settings (only the keys given are changed).
 * @param {any} win
 * @param {{ trustedTypes?: { createHTML(html: string): unknown } | false, nonce?: string }} options
 */
export function configureWindow(win, { trustedTypes, nonce } = {}) {
  if (trustedTypes !== undefined && trustedTypes !== false && typeof trustedTypes?.createHTML !== 'function') {
    throw new TypeError('Invalid trustedTypes: pass a Trusted Types policy (an object with createHTML(html)), or false to never use Trusted Types');
  }
  if (nonce !== undefined && (typeof nonce !== 'string' || nonce === '')) {
    throw new TypeError(`Invalid nonce ${JSON.stringify(nonce)}: pass the page's CSP nonce as a non-empty string`);
  }
  const current = settings.get(win) ?? {};
  settings.set(win, { ...current, ...(trustedTypes !== undefined && { trustedTypes }), ...(nonce !== undefined && { nonce }) });
}

/** `html` wrapped for an HTML sink in `win`: through the configured policy, else the "html-modules" one, else as is. */
export function trustedHTML(html, win = globalThis) {
  const configured = settings.get(win)?.trustedTypes;
  if (configured === false) return html;
  if (configured) return configured.createHTML(html);
  const tt = win?.trustedTypes;
  if (typeof tt?.createPolicy !== 'function') return html;
  if (!defaults.has(win)) {
    let policy = null;
    try {
      policy = tt.createPolicy('html-modules', { createHTML: (s) => s });
    } catch {} // already created by another copy of this library, or the CSP's trusted-types list omits it
    defaults.set(win, policy);
  }
  const policy = defaults.get(win);
  return policy ? policy.createHTML(html) : html;
}

/** The CSP nonce configured for `win`, or undefined. */
export const nonceFor = (win = globalThis) => settings.get(win)?.nonce;
