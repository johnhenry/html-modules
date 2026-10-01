/**
 * The common runtime: HTML Component Definitions → native Custom Elements.
 *
 * This is the only place component semantics live. Runtime-loaded HTML
 * modules (via the loader) and compiled modules (via the compiler) both end up
 * calling `defineHTMLComponent()` with the same definition and binding with
 * `bindModule()`, so the two paths cannot drift apart.
 *
 *   const card = defineHTMLComponent({ name: 'custom-card', template: '<article><slot></slot></article>' });
 *   card.define('my-card');                      // one registration name
 *   card.define('admin--custom-card');           // another (a fresh subclass each time)
 *   customElements.define('x-card', class extends card.element {});
 *
 * Defining a component never happens on import: a definition is inert until
 * something binds it to a tag.
 */
import {
  DELIMITER, assertDelimiter, assertElementName, assertNamespace, bindingName, camelCase, kebabCase,
} from './names.js';
import { assertOption, reportLoudly } from './settings.js';
import { componentRootCreated, lazyTargets, watchLazy } from './lazy.js';
import { configureWindow, nonceFor, trustedHTML } from './policy.js';
import { analyzeTemplate, resolveSites, updateSites } from './template.js';
import { FORM_ATTRIBUTES, FORM_PROPERTIES, checkFormControl, formAttributeChanged, installFormAssociation, setupForm } from './form.js';

/**
 * Configure page-security options for a window: a Trusted Types policy for the HTML the runtime parses
 * (`{ createHTML(html) }`, or `false` for none), and the CSP `nonce` for the fallback `<style>` elements.
 * See `createHTMLModules({ trustedTypes, nonce })`, which calls this for its window.
 * @param {any} win
 * @param {{ trustedTypes?: { createHTML(html: string): unknown } | false, nonce?: string }} options
 */
export const configureRuntime = configureWindow;

const COMPONENT = Symbol.for('html-modules.component');
const STYLESHEET = Symbol.for('html-modules.stylesheet');
const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const SHADOW_MODES = new Set(['open', 'closed']);

// ---------------------------------------------------------------------------
// Component definitions

/**
 * An HTML Component Definition: a component's module-local identity and how to
 * render it. The same definition can be registered under any number of tags.
 */
export class HTMLComponent {
  #element; // JS-authored class, if any
  #perWindow = new WeakMap(); // window → template-backed base class

  /**
   * @param {object} spec
   * @param {string|null} [spec.name]        module-local identity, e.g. "custom-card"
   * @param {string} [spec.template]         template HTML (the content of the <template>)
   * @param {'open'|'closed'} [spec.shadow]  shadow root mode (default "open")
   * @param {boolean} [spec.delegatesFocus]
   * @param {string[]} [spec.styles]         CSS text, adopted into every shadow root (one sheet per definition)
   * @param {boolean} [spec.formAssociated]  take part in forms (`static formAssociated`, ElementInternals): `form-associated`
   * @param {string} [spec.formControl]      selector of the control in the template whose value is the form value: `form-control`
   * @param {Array<{ name: string, type?: 'string'|'number'|'boolean' }>} [spec.props]  attributes reflected as properties and observed (`props="count:number"`)
   * @param {Array<{module: object, from: string, as?: string, delimiter?: string, conflict?: string, errors?: string, load?: string, lazy?: () => Promise<object>, bindings?: object[]}>} [spec.imports]
   *                                         modules this component uses, bound before it is registered
   *                                         (an entry with no `module` and a `lazy` loader is bound when one of its tags is first used)
   * @param {Function} [spec.element]        a JS-authored HTMLElement subclass instead of a template
   * @param {string} [spec.url]              where it came from, for messages
   */
  constructor({ name = null, template, shadow = 'open', delegatesFocus = false, styles = [], props = [], formAssociated = false, formControl, imports = [], element, url } = {}) {
    if (element !== undefined) {
      if (typeof element !== 'function') throw new TypeError('defineHTMLComponent: `element` must be a class extending HTMLElement');
      this.#element = element;
      name ??= element.name ? kebabCase(element.name) : null;
    } else if (typeof template !== 'string') {
      throw new TypeError('defineHTMLComponent: pass a `template` string or an `element` class');
    }
    if (!SHADOW_MODES.has(shadow)) throw new SyntaxError(`Invalid shadow mode "${shadow}": use "open" or "closed"`);
    this.name = name;
    this.template = element === undefined ? template : null;
    this.shadow = shadow;
    this.delegatesFocus = Boolean(delegatesFocus);
    this.styles = Object.freeze([...styles]);
    this.props = Object.freeze(props.map((p) => Object.freeze({ name: p.name, type: p.type ?? 'string' })));
    this.formAssociated = Boolean(formAssociated);
    if (formControl !== undefined) {
      if (!this.formAssociated) throw new TypeError('defineHTMLComponent: `formControl` needs `formAssociated: true`');
      this.formControl = String(formControl);
    }
    for (const p of this.props) {
      if (this.formAssociated && FORM_PROPERTIES.has(camelCase(p.name))) throw new SyntaxError(`defineHTMLComponent: "${p.name}" cannot be a prop of a form-associated component: it is a built-in property`);
    }
    this.imports = Object.freeze(imports.map((i) => Object.freeze({ ...i, bindings: Object.freeze([...(i.bindings ?? [])]) })));
    if (url) this.url = url;
    Object.defineProperty(this, COMPONENT, { value: true });
    Object.freeze(this);
  }

  get [Symbol.toStringTag]() {
    return 'HTMLComponent';
  }

  /** True when the component is a JS-authored class rather than a template. */
  get isClass() {
    return this.#element !== undefined;
  }

  /** The base element class, for `customElements.define(tag, class extends def.element {})`. */
  get element() {
    return this.elementFor(globalThis);
  }

  /** The base element class for another window (e.g. a test DOM). */
  elementFor(win = globalThis) {
    if (this.#element) return this.#element;
    if (!this.#perWindow.has(win)) this.#perWindow.set(win, templateElementClass(this, win));
    return this.#perWindow.get(win);
  }

  /**
   * Register this component under `tag` and return the registered class.
   * Its module's own imports are bound first. Defining the same definition
   * under the same tag again is a no-op.
   * @param {string} tag
   * @param {{ registry?: CustomElementRegistry, window?: any }} [options]
   */
  define(tag, options) {
    return defineElement(tag, this, options);
  }
}

/**
 * Make an HTML Component Definition from a spec, a JS-authored class, or an
 * existing definition (returned as-is).
 * @param {ConstructorParameters<typeof HTMLComponent>[0] | Function | HTMLComponent} spec
 */
export function defineHTMLComponent(spec) {
  if (isHTMLComponent(spec)) return spec;
  if (typeof spec === 'function') return new HTMLComponent({ element: spec });
  return new HTMLComponent(spec);
}

export const isHTMLComponent = (value) => value != null && value[COMPONENT] === true;

const pascal = (name) => (name ? camelCase(name).replace(/^./, (c) => c.toUpperCase()) : 'HTMLModuleElement');

/**
 * Per-element state: `{ root, live, win, def }`: the shadow root, the bound template sites, the window, and the
 * definition last stamped into it (a hot reload swaps it).
 */
const states = new WeakMap();
const internalsMap = new WeakMap(); // element → its ElementInternals (attachable once)

/** The element's ElementInternals, attached on first use: the platform allows one `attachInternals()` per element. */
function internalsOf(el, win) {
  if (!internalsMap.has(el)) {
    const attach = win.HTMLElement.prototype.attachInternals;
    if (typeof attach !== 'function') throw new TypeError('This environment has no ElementInternals (attachInternals())');
    internalsMap.set(el, attach.call(el));
  }
  return internalsMap.get(el);
}

/** Define the reflected property for a declared prop on `proto`: the attribute is the single source of truth. */
function defineProp(proto, { name, type }) {
  Object.defineProperty(proto, camelCase(name), {
    enumerable: true,
    configurable: true,
    get() {
      if (type === 'boolean') return this.hasAttribute(name);
      const value = this.getAttribute(name);
      if (type === 'number') {
        const n = Number(value);
        return value === null || Number.isNaN(n) ? 0 : n;
      }
      return value ?? '';
    },
    set(value) {
      if (type === 'boolean') this.toggleAttribute(name, Boolean(value));
      else this.setAttribute(name, String(value));
    },
  });
}

/**
 * A definition's template as a window sees it: the parsed content and its binding sites, analysed once per
 * definition and window (a malformed binding fails here, at registration, before anything is registered).
 */
const views = new WeakMap(); // def → WeakMap<window, { content(), info }>

function viewOf(def, win) {
  if (!views.has(def)) views.set(def, new WeakMap());
  const byWindow = views.get(def);
  if (!byWindow.has(win)) {
    let template;
    const content = () => {
      template ??= Object.assign(win.document.createElement('template'), { innerHTML: trustedHTML(def.template, win) });
      return template.content;
    };
    const info = analyzeTemplate(content(), describeDefinition(def));
    if (def.formControl) checkFormControl(content(), def.formControl, describeDefinition(def));
    byWindow.set(win, { content, info });
  }
  return byWindow.get(win);
}

/**
 * The live slot of a template-backed definition: registered classes delegate to `slot.def`, so a hot reload can
 * swap the definition under elements that are already defined (a custom element definition cannot be replaced).
 * A replacement definition shares the slot of the one it replaces.
 */
const slots = new WeakMap(); // def → slot
const slotOf = (def) => {
  if (!slots.has(def)) slots.set(def, { def, instances: new Set(), windows: new Set(), observed: null });
  return slots.get(def);
};

/** True when both are the same definition, or one has been hot-swapped for the other. */
const sameDefinition = (a, b) => a === b || (slots.has(a) && slots.get(a) === slots.get(b));

/** Observed attributes a definition's class needs. */
const observedFor = (def, view) => [...new Set([...def.props.map((p) => p.name), ...view.info.names, ...(def.formAssociated ? FORM_ATTRIBUTES : [])])];

/** Stamp (or re-stamp) the template of `def` into an element's shadow root and bind it. */
function stamp(el, state, def) {
  const { root, win } = state;
  const view = viewOf(def, win);
  const fragment = (el.ownerDocument ?? win.document).importNode(view.content(), true);
  const live = view.info.sites.length ? resolveSites(fragment, view.info) : null;
  root.append(fragment);
  state.def = def;
  state.live = live;
  if (live) updateSites(live, el);
  if (def.formAssociated) setupForm(el, root, def.formControl, (host) => internalsOf(host, win));
}

function templateElementClass(def, win) {
  const slot = slotOf(def);
  slot.windows.add(win);
  const original = viewOf(def, win);
  const observed = observedFor(def, original);
  slot.observed ??= new Set(observed);
  const cls = class extends win.HTMLElement {
    static get component() {
      return slot.def;
    }
    static get observedAttributes() {
      return observed;
    }
    static get formAssociated() {
      return def.formAssociated;
    }

    /** Memoized: one ElementInternals per element, shared with the runtime (a subclass may call this too). */
    attachInternals() {
      return internalsOf(this, win);
    }

    constructor() {
      super();
      const current = slot.def; // the latest definition: a hot reload may have replaced the one this class was made from
      const view = viewOf(current, win);
      // A server-rendered (declarative) shadow root is kept, not re-stamped, but still gets the component's styles.
      let root = existingShadowRoot(this, current.shadow === 'closed');
      if (!root) {
        try {
          root = this.attachShadow({ mode: current.shadow, delegatesFocus: current.delegatesFocus });
        } catch (error) {
          // A declarative root of the other mode: `shadowRoot` hides a closed one, `attachInternals()` shows it.
          root = existingShadowRoot(this, true);
          if (!root) throw error;
        }
      }
      if (root.mode && root.mode !== current.shadow) {
        throw new Error(`<${this.localName}> already has ${root.mode === 'open' ? 'an open' : 'a closed'} shadow root (server-rendered?), but ${describeDefinition(current)} is shadow="${current.shadow}": render it with shadowrootmode="${current.shadow}" (renderDeclarative() does), or set shadow="${root.mode}" on the export`);
      }
      let rendered = root.childNodes.length > 0; // (before the fallback <style> lands in the root)
      if (rendered && view.info.sites.length) {
        // Server-rendered markup cannot carry bindings: keep its leading <style>s, stamp the template afresh.
        let node = root.firstChild;
        while (node && node.nodeType === 1 && node.localName === 'style') node = node.nextSibling;
        while (node) {
          const next = node.nextSibling;
          node.remove();
          node = next;
        }
        rendered = false;
      }
      // A property set before the element was upgraded shadows the accessor: take its value and give it back.
      for (const { name } of current.props) {
        const property = camelCase(name);
        if (Object.prototype.hasOwnProperty.call(this, property)) {
          const value = this[property];
          delete this[property];
          this[property] = value;
        }
      }
      const state = { root, live: null, win, def: current };
      states.set(this, state);
      slot.instances.add(new WeakRef(this));
      applyComponentStyles(root, current, win);
      if (!rendered) stamp(this, state, current);
      else if (current.formAssociated) setupForm(this, root, current.formControl, (host) => internalsOf(host, win));
      // Lazy imports watch component shadow roots too (see lazy.js).
      componentRootCreated(this, root, win);
    }

    attributeChangedCallback(name, previous, value) {
      const state = states.get(this);
      if (state?.live && previous !== value) updateSites(state.live, this, [name]);
      if (state?.def.formAssociated) formAttributeChanged(this, name, previous, value);
    }
  };
  if (def.formAssociated) installFormAssociation(cls, (el) => internalsOf(el, win));
  for (const prop of def.props) defineProp(cls.prototype, prop);
  Object.defineProperty(cls, 'name', { value: pascal(def.name) });
  return cls;
}

/**
 * A shadow root the element already has: an open one (declarative or not) is `host.shadowRoot`; a closed
 * declarative one is only visible through `attachInternals().shadowRoot` (which can be called once per element,
 * so it is only asked for when the component is closed, or after attachShadow() has refused).
 */
function existingShadowRoot(host, includeClosed) {
  if (host.shadowRoot) return host.shadowRoot;
  if (!includeClosed || typeof host.attachInternals !== 'function') return null;
  try {
    return host.attachInternals().shadowRoot ?? null;
  } catch {
    return null; // no internals available (already attached by a subclass, or disabled)
  }
}

/** The stylesheets a component's shadow roots get: its own `styles`, then any adopted by its imports. */
function componentSheets(def) {
  const list = def.styles.map((css) => defineHTMLStylesheet({ name: def.name, css, url: def.url }));
  for (const dep of def.imports) {
    for (const b of dep.bindings) if (b.adopt) list.push(lookupExport(dep.module, b.export, dep.from));
  }
  return list;
}

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
export function renderDeclarative(def, innerHTML = '') {
  if (!isHTMLComponent(def)) throw new TypeError('renderDeclarative: pass a component definition (from defineHTMLComponent() or a loaded module)');
  if (def.isClass) throw new TypeError(`renderDeclarative: ${describeDefinition(def)} is a JavaScript-authored class, not a template; there is no template to render`);
  if (def.template.includes('{{')) {
    throw new TypeError(`renderDeclarative: ${describeDefinition(def)} has data bindings ({{…}}) in its template, which cannot be rendered on the server: the element re-stamps its template when it upgrades. Render the host's content yourself, or take the bindings out`);
  }
  const css = sheetsOf(def).filter(isHTMLStylesheet).map((sheet) => `<style>${sheet.resolvedCss.replace(/<\/style/gi, '<\\/style')}</style>`);
  return `<template shadowrootmode="${def.shadow}"${def.delegatesFocus ? ' shadowrootdelegatesfocus' : ''}>${css.join('')}${def.template}</template>${innerHTML}`;
}

const sheetCache = new WeakMap(); // def → stylesheet values (built once, shared by every instance)

const sheetsOf = (def) => {
  if (!sheetCache.has(def)) sheetCache.set(def, componentSheets(def));
  return sheetCache.get(def);
};

function applyComponentStyles(root, def, win) {
  for (const sheet of sheetsOf(def)) adoptStylesheet(root, sheet, { window: win });
}

// ---------------------------------------------------------------------------
// Stylesheet definitions

// url(...) in CSS: double-quoted, single-quoted or bare (a bare URL has no spaces, quotes or ")").
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s'")]*))\s*\)/gi;

/**
 * Make the relative `url(...)`s in `css` absolute against `base` (a module's URL), so they resolve against the
 * module wherever the sheet is adopted. Browsers resolve a constructed sheet's (and an adopted `<style>`'s)
 * relative URLs against the page, and do not reliably honour `new CSSStyleSheet({ baseURL })`, so the text itself
 * is rewritten. Absolute URLs (`https:`, `data:`, …), fragment-only references (`url(#filter)`) and empty URLs
 * are left alone; `/root-relative` URLs resolve against the module's origin.
 */
function resolveCssUrls(css, base) {
  let baseURL;
  try {
    baseURL = new URL(base);
  } catch {
    return css; // no absolute module URL: nothing to resolve against
  }
  return css.replace(CSS_URL, (match, dq, sq, bare) => {
    const ref = dq ?? sq ?? bare ?? '';
    if (ref === '' || ref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) return match;
    return `url(${JSON.stringify(new URL(ref, baseURL).href)})`;
  });
}

/** A stylesheet export: CSS text that can be adopted into documents and shadow roots. */
export class HTMLStylesheet {
  #sheets = new WeakMap(); // window → CSSStyleSheet
  #resolved;

  constructor({ name = null, css = '', url } = {}) {
    this.name = name;
    this.css = String(css);
    if (url) this.url = url;
    this.#resolved = url ? resolveCssUrls(this.css, url) : this.css;
    Object.defineProperty(this, STYLESHEET, { value: true });
    Object.freeze(this);
  }

  get [Symbol.toStringTag]() {
    return 'HTMLStylesheet';
  }

  /** `css` with its relative `url(...)`s made absolute against the module's `url`: what is actually applied. */
  get resolvedCss() {
    return this.#resolved;
  }

  /** A constructed CSSStyleSheet for `win` (one per window, shared), or null without constructable sheets. */
  sheetFor(win = globalThis) {
    if (!this.#sheets.has(win)) {
      let sheet = null;
      try {
        // `baseURL` makes url(...) in the CSS resolve against the module, not the page that adopts the sheet.
        try {
          sheet = this.url ? new win.CSSStyleSheet({ baseURL: this.url }) : new win.CSSStyleSheet();
        } catch {
          sheet = new win.CSSStyleSheet(); // a url that is not absolute cannot be a base URL
        }
        sheet.replaceSync(this.#resolved);
      } catch {
        sheet = null;
      }
      this.#sheets.set(win, sheet);
    }
    return this.#sheets.get(win);
  }

  /** Adopt into a document or shadow root. */
  adopt(root, options) {
    adoptStylesheet(root, this, options);
  }
}

export const defineHTMLStylesheet = (spec) => (isHTMLStylesheet(spec) ? spec : new HTMLStylesheet(spec));
export const isHTMLStylesheet = (value) => value != null && value[STYLESHEET] === true;
const isCSSStyleSheet = (value) => value != null && typeof value === 'object' && typeof value.replaceSync === 'function' && 'cssRules' in value;
export const isStylesheet = (value) => isHTMLStylesheet(value) || isCSSStyleSheet(value);

const adoptedFallback = new WeakMap(); // root → Map<stylesheet, <style> element> (roots without adoptedStyleSheets)
const adoptions = new WeakMap(); // HTMLStylesheet → { refs: Set<WeakRef<root>>, roots: WeakSet<root> }: where it is adopted (a hot reload swaps it there)
const replacements = new WeakMap(); // HTMLStylesheet → the stylesheet that replaced it (hot reload)

/** The current version of a stylesheet: itself, or what a hot reload replaced it with. */
function liveSheet(value) {
  while (isHTMLStylesheet(value) && replacements.has(value)) value = replacements.get(value);
  return value;
}

const windowOf = (root) => root.defaultView ?? root.ownerDocument?.defaultView ?? globalThis;

/**
 * Adopt a stylesheet export (HTMLStylesheet or CSSStyleSheet) into a document
 * or shadow root. Adopting the same sheet twice is a no-op. Where constructable
 * stylesheets are unavailable, a <style> element is inserted instead (with the window's CSP `nonce`, if one is
 * configured: see `configureRuntime()`).
 */
export function adoptStylesheet(root, value, { window: win } = {}) {
  if (!isStylesheet(value)) throw new TypeError('adoptStylesheet: not a stylesheet');
  adoptSheet(root, liveSheet(value), win ?? windowOf(root));
}

function adoptSheet(root, value, win) {
  if (isHTMLStylesheet(value)) {
    if (!adoptions.has(value)) adoptions.set(value, { refs: new Set(), roots: new WeakSet() });
    const where = adoptions.get(value);
    if (!where.roots.has(root)) {
      where.roots.add(root);
      where.refs.add(new WeakRef(root));
    }
  }
  const sheet = isHTMLStylesheet(value) ? value.sheetFor(win) : value;
  if (sheet && Array.isArray(root.adoptedStyleSheets)) {
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return;
  }
  if (!isHTMLStylesheet(value)) throw new TypeError('This document cannot adopt a CSSStyleSheet');
  if (!adoptedFallback.has(root)) adoptedFallback.set(root, new Map());
  const seen = adoptedFallback.get(root);
  if (seen.has(value)) return;
  const doc = root.ownerDocument ?? root;
  const style = doc.createElement('style');
  if (value.name) style.setAttribute('data-html-module', value.name);
  const nonce = nonceFor(win);
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = value.resolvedCss;
  seen.set(value, style);
  const parent = root.head ?? root;
  parent.append(style);
}

/**
 * The counterpart of `adoptStylesheet()`: take a stylesheet out of a document or shadow root again. A no-op when
 * it was not adopted there. It is removed outright, whoever adopted it: adoption is not reference-counted, so
 * two bindings that adopted the same sheet into one root lose it together.
 */
export function unadoptStylesheet(root, value, { window: win } = {}) {
  if (!isStylesheet(value)) throw new TypeError('unadoptStylesheet: not a stylesheet');
  unadoptSheet(root, liveSheet(value), win ?? windowOf(root));
}

function unadoptSheet(root, value, win) {
  if (isHTMLStylesheet(value)) {
    adoptions.get(value)?.roots.delete(root); // (its WeakRef goes stale; a hot reload skips roots that are no longer members)
  }
  const sheet = isHTMLStylesheet(value) ? value.sheetFor(win) : value;
  if (sheet && Array.isArray(root.adoptedStyleSheets) && root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet);
  }
  const style = adoptedFallback.get(root)?.get(value);
  if (style) {
    style.remove();
    adoptedFallback.get(root).delete(value);
  }
}

// ---------------------------------------------------------------------------
// Registration

const isTemplateElement = (v) => v != null && typeof v === 'object' && v.localName === 'template' && 'content' in v;

function extendsHTMLElement(fn, win) {
  if (typeof fn !== 'function' || !fn.prototype) return false;
  for (const Base of [win?.HTMLElement, globalThis.HTMLElement]) {
    if (typeof Base === 'function' && fn.prototype instanceof Base) return true;
  }
  return false;
}

/** True for values that can become a custom element: definitions, HTMLElement classes, templates. */
export function isElementLike(value, win = globalThis) {
  return isHTMLComponent(value) || isTemplateElement(value) || extendsHTMLElement(value, win);
}

function kindOf(value) {
  if (isHTMLStylesheet(value) || isCSSStyleSheet(value)) return 'a stylesheet';
  if (typeof value === 'function') return `a function that does not extend HTMLElement (${value.name || 'anonymous'})`;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'data (an object)' : `data (a ${typeof value})`;
}

const wrapped = new WeakMap(); // class or template → definition (stable identity)

/** The definition for any element-like value; throws a TypeError for anything else. */
export function toComponent(value, { window: win = globalThis, what = 'value' } = {}) {
  if (isHTMLComponent(value)) return value;
  if (isTemplateElement(value) || extendsHTMLElement(value, win)) {
    if (!wrapped.has(value)) {
      wrapped.set(value, isTemplateElement(value)
        ? new HTMLComponent({ template: value.innerHTML })
        : new HTMLComponent({ element: value }));
    }
    return wrapped.get(value);
  }
  throw new TypeError(`Cannot register ${what} as a custom element: it is ${kindOf(value)}, not a component`);
}

const registrations = new WeakMap(); // registry → Map<tag, definition>

function describeDefinition(def) {
  return `${def.name ? `"${def.name}"` : 'an anonymous component'}${def.url ? ` from ${def.url}` : ''}`;
}

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
export function defineElement(tag, value, options) {
  return registerTag(tag, value, options).element;
}

/**
 * Check that `value` can be registered as `tag`, changing nothing, and return what to commit. `pending` is
 * the tags an enclosing batch has checked so far (tag → definition), so two entries of one batch that want
 * the same tag are caught before either is registered.
 */
function checkTag(tag, value, { registry, window: win = globalThis, conflict = 'error' } = {}, pending) {
  registry ??= win.customElements ?? globalThis.customElements;
  assertElementName(tag);
  assertOption('conflict', conflict);
  const def = toComponent(value, { window: win, what: `<${tag}>` });
  if (!def.isClass) def.elementFor(win); // a malformed template fails here, before anything is registered
  if (!registrations.has(registry)) registrations.set(registry, new Map());
  const existing = registry.get(tag);
  const taken = Boolean(existing) || Boolean(pending?.has(tag));
  const holder = existing ? registrations.get(registry).get(tag) : pending?.get(tag);
  if (taken && !(holder === def || (holder && sameDefinition(holder, def))) && conflict !== 'reuse') {
    throw new Error(`Cannot bind <${tag}>: it is already defined${holder ? ` by ${describeDefinition(holder)}` : ''} (conflict="reuse" keeps the existing definition instead)`);
  }
  if (!taken) pending?.set(tag, def);
  return { tag, def, registry, win };
}

/** Register what checkTag() accepted: `{ element, reused }`. */
function commitTag({ tag, def, registry, win }) {
  const seen = registrations.get(registry);
  const existing = registry.get(tag);
  if (existing) return { element: existing, reused: !sameDefinition(seen.get(tag), def) };
  bindImports(def, registry, win);
  const Base = def.elementFor(win);
  const Registered = class extends Base {};
  Object.defineProperty(Registered, 'name', { value: Base.name });
  registry.define(tag, Registered);
  seen.set(tag, def);
  return { element: Registered, reused: false };
}

/** defineElement(), also saying whether an existing definition was reused. */
const registerTag = (tag, value, options) => commitTag(checkTag(tag, value, options));

const lazyDeps = new WeakMap(); // registry → Set of lazy import entries already being watched

/**
 * Bind a definition's module imports before it is registered. Eager imports
 * are bound now; a lazy one (no `module`, a `lazy` loader) is watched for,
 * and loaded and bound when one of its tags is first used. A failure is
 * thrown to whoever is registering the component, and with `errors: 'throw'`
 * also reported with reportError().
 */
function bindImports(def, registry, win) {
  for (const dep of def.imports) {
    const options = { as: dep.as, delimiter: dep.delimiter, bindings: dep.bindings, from: dep.from, conflict: dep.conflict, registry, window: win };
    if (dep.module === undefined && typeof dep.lazy === 'function') {
      if (!lazyDeps.has(registry)) lazyDeps.set(registry, new WeakSet());
      if (lazyDeps.get(registry).has(dep)) continue;
      watchLazyDep(dep, options, registry, win, new WeakSet());
      continue;
    }
    try {
      bindModule(dep.module, options);
    } catch (error) {
      if (dep.errors === 'throw') reportLoudly(error, win);
      throw error;
    }
  }
}

/**
 * Watch for the tags of one lazy import; when one is used, load and bind it. A failure is announced on
 * the element that used the tag, and the import is armed again for the next element that uses one (not
 * for the ones that already failed, which would retry forever): the loader has evicted the failed load,
 * so that next use fetches again.
 */
function watchLazyDep(dep, options, registry, win, failed) {
  const { delimiter = DELIMITER } = dep;
  lazyDeps.get(registry).add(dep);
  watchLazy(win, lazyTargets({ ...dep, delimiter }), (el) => {
    Promise.resolve().then(dep.lazy).then((ns) => bindModule(ns, options)).catch((error) => {
      failed.add(el);
      lazyDeps.get(registry).delete(dep);
      watchLazyDep(dep, options, registry, win, failed);
      el.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error, from: dep.from, lazy: true } }));
      if (dep.errors === 'throw') reportLoudly(error, win);
    });
  }, { skip: (el) => failed.has(el) });
}

// ---------------------------------------------------------------------------
// Module namespaces and bindings

/**
 * Look up an export of a module namespace by the name used in markup.
 * Checks the `components` manifest, then the name as written, then its
 * camelCase form ("custom-card" → `customCard`).
 */
export function lookupExport(ns, name, from = 'module') {
  if (name === 'default') {
    if (hasOwn(ns, 'default')) return ns.default;
  } else {
    if (hasOwn(ns?.components, name)) return ns.components[name];
    if (hasOwn(ns, name)) return ns[name];
    const camel = camelCase(name);
    if (hasOwn(ns, camel)) return ns[camel];
  }
  throw new SyntaxError(`The requested module '${from}' does not provide an export named '${name}'`);
}

/**
 * The components a module offers for a whole-namespace import, as
 * [exportName, value] pairs: its `components` manifest if it has one,
 * otherwise its exports made with defineHTMLComponent(). Other exports
 * (constants, functions, plain classes) are never treated as components.
 */
export function componentsOf(ns, from = 'module') {
  if (ns?.components != null && typeof ns.components === 'object') return Object.entries(ns.components);
  const found = Object.keys(ns ?? {}).filter((k) => k !== 'default' && isHTMLComponent(ns[k])).map((k) => [kebabCase(k), ns[k]]);
  if (!found.length) {
    throw new TypeError(`The module '${from}' does not export any HTML components: export a \`components\` manifest or definitions made with defineHTMLComponent(), or bind exports explicitly with <html-binding>`);
  }
  return found;
}

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
export function namespaceComponents(name, ns) {
  let entries;
  try {
    entries = componentsOf(ns);
  } catch {
    return {};
  }
  return Object.fromEntries(entries.map(([key, value]) => [`${name}${DELIMITER}${key}`, value]));
}

/**
 * Apply one binding `{ export, element?, adopt? }` of an import.
 * `namespace` is the import's `as` when the tag was made from it, and null
 * when `element=` chose the tag (or nothing was registered): the mapping is
 * recorded here, never parsed back out of the tag. `reused: true` is added
 * when `conflict: 'reuse'` kept a different, existing definition of the tag.
 * @returns {{ export: string, value: unknown, tag: string|null, namespace: string|null, element: Function|null, adopted: boolean, reused?: true }}
 */
export function applyBinding(ns, binding, options = {}) {
  return runBinding(planBinding(ns, binding, options));
}

/** Everything applyBinding() can reject, checked without changing anything. */
function planBinding(ns, binding, { as, delimiter = DELIMITER, from = 'module', registry, window: win = globalThis, root, conflict } = {}, pending) {
  const name = binding.export;
  if (!name) throw new SyntaxError('<html-binding> requires an "export" attribute');
  const value = lookupExport(ns, name, from);
  const plan = { name, value, adopt: false, root, win, tag: null, namespace: null, register: null };
  if (binding.adopt) {
    if (!isStylesheet(value)) throw new TypeError(`Cannot adopt '${name}' from '${from}': it is ${kindOf(value)}, not a stylesheet`);
    plan.adopt = Boolean(root);
  }
  let tag = binding.element ?? null;
  if (tag) {
    assertElementName(tag);
    if (!isElementLike(value, win)) {
      throw new TypeError(`Cannot register '${name}' from '${from}' as <${tag}>: it is ${kindOf(value)}, not a component`);
    }
  } else if (as && !binding.adopt && isElementLike(value, win)) {
    if (name === 'default') throw new SyntaxError(`Binding the default export of '${from}' needs element="…"`);
    tag = bindingName(as, name, delimiter);
    plan.namespace = as;
  }
  if (tag) {
    plan.tag = tag;
    plan.register = checkTag(tag, value, { registry, window: win, conflict }, pending);
  }
  return plan;
}

function runBinding(plan) {
  const result = { export: plan.name, value: plan.value, tag: null, namespace: null, element: null, adopted: false };
  if (plan.adopt) {
    adoptStylesheet(plan.root, plan.value, { window: plan.win });
    result.adopted = true;
  }
  if (plan.tag) {
    result.tag = plan.tag;
    result.namespace = plan.namespace;
    const { element, reused } = commitTag(plan.register);
    result.element = element;
    if (reused) result.reused = true;
  }
  return result;
}

/**
 * The namespaced registrations `registerComponents()` would make, without
 * making them: `[{ tag, namespace, export, value }]`. Every tag is checked
 * first, so an invalid one (e.g. "ui.card" with delimiter ".") fails before
 * anything is registered.
 */
function planComponents(ns, { as, delimiter = DELIMITER, from = 'module' } = {}) {
  if (as != null) assertNamespace(as);
  assertDelimiter(delimiter);
  return componentsOf(ns, from).map(([name, value]) => ({
    tag: as != null ? bindingName(as, name, delimiter) : kebabCase(name),
    namespace: as ?? null,
    export: name,
    value,
  }));
}

/**
 * Register every component of a namespace. With `as`, tags are
 * `<as><delimiter><export>` (delimiter "--" unless given); without it, the
 * export names themselves (which then must be valid custom element names).
 * This is what compiled `register` modules call.
 * @returns {Record<string, Function>} tag → registered class
 */
export function registerComponents(ns, options = {}) {
  return Object.fromEntries(registerAll(ns, options).map((b) => [b.tag, b.element]));
}

function registerAll(ns, { as, delimiter, from = 'module', registry, window: win = globalThis, conflict } = {}) {
  // Check every tag (and that every component can be registered) before registering any, so a conflict
  // on the last one does not leave the namespace half-bound.
  const pending = new Map();
  const checked = planComponents(ns, { as, delimiter, from }).map(({ tag, namespace, export: name, value }) => ({
    tag, namespace, export: name,
    plan: checkTag(tag, toComponent(value, { window: win, what: `components['${name}'] of '${from}'` }), { registry, window: win, conflict }, pending),
  }));
  return checked.map(({ tag, namespace, export: name, plan }) => ({ tag, namespace, export: name, ...commitTag(plan) }));
}

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
 * @returns {{ elements: Record<string, Function>, values: Record<string, unknown>, tags: Record<string, { tag: string, namespace: string|null, export: string, reused?: true }> }}
 */
export function bindModule(ns, { as, delimiter = DELIMITER, bindings = [], from = 'module', registry, window: win = globalThis, root, conflict } = {}) {
  if (as != null) assertNamespace(as);
  assertDelimiter(delimiter);
  if (conflict !== undefined) assertOption('conflict', conflict);
  const out = { elements: {}, values: {}, tags: {} };
  const record = ({ tag, namespace, export: name, element, reused }) => {
    out.elements[tag] = element;
    out.tags[tag] = { tag, namespace, export: name, ...(reused && { reused: true }) };
  };
  if (bindings.length) {
    // Every binding is checked before any is applied: one that cannot be bound leaves nothing bound.
    const pending = new Map();
    const plans = bindings.map((b) => planBinding(ns, b, { as, delimiter, from, registry, window: win, root, conflict }, pending));
    for (const plan of plans) {
      const r = runBinding(plan);
      out.values[r.export] = r.value;
      if (r.tag) record(r);
    }
  } else if (as != null) {
    for (const r of registerAll(ns, { as, delimiter, from, registry, window: win, conflict })) record(r);
  }
  return out;
}

/**
 * The `components` manifest of an HTML module: its own components, then those
 * re-exported with `<html-export src>` (star re-exports). A name offered by two
 * different star sources is an error. Used by the loader and by compiled output.
 * @param {Record<string, unknown>} locals  export name → value (non-components are skipped)
 * @param {Array<[object, string]>} [stars] [namespace, from] pairs
 */
export function manifest(locals, stars = []) {
  const out = {};
  for (const [name, value] of Object.entries(locals)) if (isElementLike(value)) out[name] = value;
  const fromStar = new Map();
  for (const [ns, from] of stars) {
    for (const [name, value] of componentsOf(ns, from)) {
      if (hasOwn(locals, name)) continue;
      if (fromStar.has(name) && out[name] !== value) {
        throw new SyntaxError(`Conflicting star exports for '${name}' from '${fromStar.get(name)}' and '${from}'`);
      }
      fromStar.set(name, from);
      out[name] = value;
    }
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Hot reload
//
// A custom element definition cannot be replaced, so registered classes delegate to a swappable definition (see
// `slotOf`): replacing a component's definition re-stamps the shadow roots of its live elements in place, and
// replacing a stylesheet export swaps the adopted sheet in every root that adopted it. The same code serves
// `HTMLModules.hotReload()` (runtime-loaded modules) and the Vite plugin's HMR (compiled modules).

const importsKey = (def) => JSON.stringify(def.imports.map(({ module, lazy, ...rest }) => rest));

/**
 * Check, changing nothing, whether `next` can replace `previous` under live elements. Returns a reason string when it
 * cannot (the page must reload), or a function that applies the swap.
 */
function planComponentSwap(previous, next) {
  if (previous.isClass || next.isClass) return 'a JavaScript-authored class cannot be hot-swapped';
  for (const key of ['shadow', 'delegatesFocus', 'formAssociated', 'formControl']) {
    if (previous[key] !== next[key]) return `${key} changed (${JSON.stringify(previous[key])} → ${JSON.stringify(next[key])}): it is fixed when an element is created`;
  }
  if (importsKey(previous) !== importsKey(next)) return 'the component\'s own imports changed';
  const slot = slotOf(previous);
  for (const win of slot.windows) {
    let view;
    try {
      view = viewOf(next, win);
    } catch (error) {
      return error.message;
    }
    const added = observedFor(next, view).filter((n) => !slot.observed.has(n));
    if (added.length) return `new attribute${added.length > 1 ? 's' : ''} ${added.map((n) => `"${n}"`).join(', ')} cannot be observed on elements that are already defined (observedAttributes is read once)`;
  }
  const known = new Map(previous.props.map((p) => [p.name, p.type]));
  const unknown = next.props.filter((p) => known.get(p.name) !== p.type).map((p) => p.name);
  if (unknown.length) return `props ${unknown.map((n) => `"${n}"`).join(', ')} changed or are new: a property accessor is defined once per class`;
  return () => {
    const changed = previous.template !== next.template;
    slot.def = next;
    slots.set(next, slot);
    let restamped = 0;
    for (const ref of [...slot.instances]) {
      const el = ref.deref();
      const state = el && states.get(el);
      if (!state) {
        slot.instances.delete(ref);
        continue;
      }
      const { root, win } = state;
      for (const sheet of sheetsOf(state.def)) unadoptStylesheet(root, sheet, { window: win });
      if (changed) root.replaceChildren();
      for (const sheet of sheetsOf(next)) adoptStylesheet(root, sheet, { window: win });
      if (changed) {
        stamp(el, state, next);
        componentRootCreated(el, root, win);
      } else state.def = next;
      restamped++;
    }
    return restamped;
  };
}

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
export function hotReplaceComponent(previous, next) {
  if (!isHTMLComponent(previous) || !isHTMLComponent(next)) return { ok: false, reason: 'both must be component definitions' };
  const plan = planComponentSwap(previous, next);
  if (typeof plan === 'string') return { ok: false, reason: plan };
  return { ok: true, elements: plan() };
}

/** Replace a stylesheet export: every root that adopted `previous` gets `next` instead, and later adoptions of `previous` adopt `next`. */
export function hotReplaceStylesheet(previous, next) {
  if (!isHTMLStylesheet(previous) || !isHTMLStylesheet(next)) throw new TypeError('hotReplaceStylesheet: both must be HTMLStylesheets');
  if (previous === next) return 0;
  const where = adoptions.get(previous);
  replacements.set(previous, next);
  let swapped = 0;
  const seen = new Set();
  for (const ref of where?.refs ?? []) {
    const root = ref.deref();
    if (!root || seen.has(root) || !where.roots.has(root)) continue;
    seen.add(root);
    const win = windowOf(root);
    unadoptSheet(root, previous, win);
    adoptSheet(root, liveSheet(next), win);
    swapped++;
  }
  return swapped;
}

/**
 * Hot-replace one module's exports with another's (a re-fetched HTML module, or a re-evaluated compiled one): its
 * components and stylesheets are swapped under live elements. Nothing is changed unless **every** export can be
 * swapped; otherwise `reload` is true and `reasons` says why (exports added or removed, changed data, imports or
 * a setting that is fixed when an element is created), and the caller should reload the page.
 * @param {object} previous the module namespace before
 * @param {object} next     the module namespace after
 * @returns {{ reload: boolean, reasons: string[], updated: string[], elements: number }}
 */
export function hotReplaceModule(previous, next) {
  const names = (ns) => Object.keys(ns).filter((k) => k !== 'components').sort();
  const [before, after] = [names(previous), names(next)];
  const reasons = [];
  const added = after.filter((k) => !before.includes(k));
  const removed = before.filter((k) => !after.includes(k));
  if (added.length || removed.length) reasons.push(`exports changed (${[...added.map((k) => `+${k}`), ...removed.map((k) => `-${k}`)].join(', ')})`);
  const applies = [];
  const updated = [];
  const handled = new Set();
  for (const key of before.filter((k) => after.includes(k))) {
    const [a, b] = [previous[key], next[key]];
    if (a === b) continue;
    if (isHTMLComponent(a) && isHTMLComponent(b)) {
      if (handled.has(a)) continue;
      handled.add(a);
      const plan = planComponentSwap(a, b);
      if (typeof plan === 'string') reasons.push(`<${a.name ?? key}>: ${plan}`);
      else applies.push(() => plan());
      updated.push(key);
    } else if (isHTMLStylesheet(a) && isHTMLStylesheet(b)) {
      if (handled.has(a)) continue;
      handled.add(a);
      applies.push(() => hotReplaceStylesheet(a, b));
      updated.push(key);
    } else if (JSON.stringify(a) !== JSON.stringify(b) || typeof a !== typeof b || typeof a === 'function') {
      reasons.push(`export "${key}" changed and is not a component or stylesheet`);
    }
  }
  if (reasons.length) return { reload: true, reasons, updated: [], elements: 0 };
  let elements = 0;
  for (const apply of applies) elements += Number(apply()) || 0;
  return { reload: false, reasons: [], updated, elements };
}
