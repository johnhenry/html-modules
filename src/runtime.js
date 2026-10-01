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
   * @param {Array<{module: object, from: string, as?: string, delimiter?: string, conflict?: string, errors?: string, load?: string, lazy?: () => Promise<object>, bindings?: object[]}>} [spec.imports]
   *                                         modules this component uses, bound before it is registered
   *                                         (an entry with no `module` and a `lazy` loader is bound when one of its tags is first used)
   * @param {Function} [spec.element]        a JS-authored HTMLElement subclass instead of a template
   * @param {string} [spec.url]              where it came from, for messages
   */
  constructor({ name = null, template, shadow = 'open', delegatesFocus = false, styles = [], imports = [], element, url } = {}) {
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

function templateElementClass(def, win) {
  let template;
  const content = () => {
    template ??= Object.assign(win.document.createElement('template'), { innerHTML: def.template });
    return template.content;
  };
  const cls = class extends win.HTMLElement {
    static get component() {
      return def;
    }
    constructor() {
      super();
      // A server-rendered (declarative) shadow root is kept, not re-stamped.
      if (this.shadowRoot?.childNodes.length) {
        componentRootCreated(this, this.shadowRoot, win);
        return;
      }
      const root = this.shadowRoot ?? this.attachShadow({ mode: def.shadow, delegatesFocus: def.delegatesFocus });
      applyComponentStyles(root, def, win);
      root.append((this.ownerDocument ?? win.document).importNode(content(), true));
      // Lazy imports watch component shadow roots too (see lazy.js).
      componentRootCreated(this, root, win);
    }
  };
  Object.defineProperty(cls, 'name', { value: pascal(def.name) });
  return cls;
}

/** The stylesheets a component's shadow roots get: its own `styles`, then any adopted by its imports. */
function componentSheets(def) {
  const list = def.styles.map((css) => defineHTMLStylesheet({ name: def.name, css }));
  for (const dep of def.imports) {
    for (const b of dep.bindings) if (b.adopt) list.push(lookupExport(dep.module, b.export, dep.from));
  }
  return list;
}

const sheetCache = new WeakMap(); // def → stylesheet values (built once, shared by every instance)

function applyComponentStyles(root, def, win) {
  if (!sheetCache.has(def)) sheetCache.set(def, componentSheets(def));
  for (const sheet of sheetCache.get(def)) adoptStylesheet(root, sheet, { window: win });
}

// ---------------------------------------------------------------------------
// Stylesheet definitions

/** A stylesheet export: CSS text that can be adopted into documents and shadow roots. */
export class HTMLStylesheet {
  #sheets = new WeakMap(); // window → CSSStyleSheet

  constructor({ name = null, css = '', url } = {}) {
    this.name = name;
    this.css = String(css);
    if (url) this.url = url;
    Object.defineProperty(this, STYLESHEET, { value: true });
    Object.freeze(this);
  }

  get [Symbol.toStringTag]() {
    return 'HTMLStylesheet';
  }

  /** A constructed CSSStyleSheet for `win` (one per window, shared), or null without constructable sheets. */
  sheetFor(win = globalThis) {
    if (!this.#sheets.has(win)) {
      let sheet = null;
      try {
        sheet = new win.CSSStyleSheet();
        sheet.replaceSync(this.css);
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

const adoptedFallback = new WeakMap(); // root → Set<stylesheet> (roots without adoptedStyleSheets)

/**
 * Adopt a stylesheet export (HTMLStylesheet or CSSStyleSheet) into a document
 * or shadow root. Adopting the same sheet twice is a no-op. Where constructable
 * stylesheets are unavailable, a <style> element is inserted instead.
 */
export function adoptStylesheet(root, value, { window: win } = {}) {
  if (!isStylesheet(value)) throw new TypeError('adoptStylesheet: not a stylesheet');
  win ??= root.defaultView ?? root.ownerDocument?.defaultView ?? globalThis;
  const sheet = isHTMLStylesheet(value) ? value.sheetFor(win) : value;
  if (sheet && Array.isArray(root.adoptedStyleSheets)) {
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    return;
  }
  if (!isHTMLStylesheet(value)) throw new TypeError('This document cannot adopt a CSSStyleSheet');
  if (!adoptedFallback.has(root)) adoptedFallback.set(root, new Set());
  const seen = adoptedFallback.get(root);
  if (seen.has(value)) return;
  seen.add(value);
  const doc = root.ownerDocument ?? root;
  const style = doc.createElement('style');
  if (value.name) style.setAttribute('data-html-module', value.name);
  style.textContent = value.css;
  const parent = root.head ?? root;
  parent.append(style);
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

/** defineElement(), also saying whether an existing definition was reused. */
function registerTag(tag, value, { registry, window: win = globalThis, conflict = 'error' } = {}) {
  registry ??= win.customElements ?? globalThis.customElements;
  assertElementName(tag);
  assertOption('conflict', conflict);
  const def = toComponent(value, { window: win, what: `<${tag}>` });
  if (!registrations.has(registry)) registrations.set(registry, new Map());
  const seen = registrations.get(registry);
  const existing = registry.get(tag);
  if (existing) {
    if (seen.get(tag) === def) return { element: existing, reused: false };
    if (conflict === 'reuse') return { element: existing, reused: true };
    const by = seen.get(tag);
    throw new Error(`Cannot bind <${tag}>: it is already defined${by ? ` by ${describeDefinition(by)}` : ''} (conflict="reuse" keeps the existing definition instead)`);
  }
  bindImports(def, registry, win);
  const Base = def.elementFor(win);
  const Registered = class extends Base {};
  Object.defineProperty(Registered, 'name', { value: Base.name });
  registry.define(tag, Registered);
  seen.set(tag, def);
  return { element: Registered, reused: false };
}

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
export function applyBinding(ns, binding, { as, delimiter = DELIMITER, from = 'module', registry, window: win = globalThis, root, conflict } = {}) {
  const name = binding.export;
  if (!name) throw new SyntaxError('<html-binding> requires an "export" attribute');
  const value = lookupExport(ns, name, from);
  const result = { export: name, value, tag: null, namespace: null, element: null, adopted: false };
  if (binding.adopt) {
    if (!isStylesheet(value)) throw new TypeError(`Cannot adopt '${name}' from '${from}': it is ${kindOf(value)}, not a stylesheet`);
    if (root) {
      adoptStylesheet(root, value, { window: win });
      result.adopted = true;
    }
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
    result.namespace = as;
  }
  if (tag) {
    result.tag = tag;
    const { element, reused } = registerTag(tag, value, { registry, window: win, conflict });
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
  return planComponents(ns, { as, delimiter, from }).map(({ tag, namespace, export: name, value }) => ({
    tag, namespace, export: name,
    ...registerTag(tag, toComponent(value, { window: win, what: `components['${name}'] of '${from}'` }), { registry, window: win, conflict }),
  }));
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
    for (const b of bindings) {
      const r = applyBinding(ns, b, { as, delimiter, from, registry, window: win, root, conflict });
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
