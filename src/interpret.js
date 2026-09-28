/**
 * Interpretation layer: what HTML does with an imported binding.
 * Importing never registers anything by itself; these run only when a
 * binding asks for it via `element="…"` or `adopt`.
 */

const isTemplate = (v) => v != null && typeof v === 'object' && v.localName === 'template' && 'content' in v;

/**
 * A custom element class that stamps a template into an open shadow root.
 * @param {HTMLTemplateElement} template
 * @param {any} win
 */
export function templateElementClass(template, win = globalThis) {
  return class TemplateElement extends win.HTMLElement {
    static template = template;
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      const doc = this.ownerDocument ?? win.document;
      root.append(doc.importNode(template.content, true));
    }
  };
}

/**
 * Turn an exported value into a custom element constructor.
 * - HTMLElement subclasses are used as-is
 * - templates become template-stamping elements
 */
export function toElementConstructor(value, win = globalThis) {
  if (typeof value === 'function') {
    // Fail at registration with a clear message, not later with "Illegal constructor".
    if (win.HTMLElement && !(value.prototype instanceof win.HTMLElement)) {
      throw new TypeError(`Cannot register ${value.name || 'function'} as a custom element: it does not extend HTMLElement`);
    }
    return value;
  }
  if (isTemplate(value)) return templateElementClass(value, win);
  throw new TypeError(`Cannot register ${Object.prototype.toString.call(value)} as a custom element`);
}

const definedFrom = new WeakMap(); // registry -> Map<name, sourceValue>

/**
 * Register `value` as custom element `name`. The same export may be registered
 * under several names (a subclass is used when the constructor is taken).
 * Re-registering the same name with the same value is a no-op.
 */
export function defineElement(registry, name, value, win = globalThis) {
  if (!/^[a-z][.0-9_a-z·-￿]*-[.0-9_a-z·-￿-]*$/.test(name)) {
    throw new SyntaxError(`"${name}" is not a valid custom element name`);
  }
  if (!definedFrom.has(registry)) definedFrom.set(registry, new Map());
  const sources = definedFrom.get(registry);
  const existing = registry.get(name);
  if (existing) {
    if (sources.get(name) === value || existing === value) return existing;
    throw new Error(`Custom element "${name}" is already defined by a different constructor`);
  }
  let ctor = toElementConstructor(value, win);
  const taken = typeof registry.getName === 'function' ? registry.getName(ctor) : null;
  if (taken) ctor = class extends ctor {};
  try {
    registry.define(name, ctor);
  } catch (error) {
    if (ctor !== value || typeof value !== 'function') throw error;
    ctor = class extends ctor {};
    registry.define(name, ctor);
  }
  sources.set(name, value);
  return ctor;
}

/**
 * Apply an exported stylesheet to a document.
 * Accepts a CSSStyleSheet, a `<style>` element, or `{ kind: 'stylesheet', cssText }`.
 */
export function adoptStyleSheet(doc, value) {
  if (value && typeof value.replaceSync === 'function' && 'adoptedStyleSheets' in doc) {
    if (!doc.adoptedStyleSheets.includes(value)) doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, value];
    return;
  }
  const cssText = value?.kind === 'stylesheet' ? value.cssText : value?.localName === 'style' ? value.textContent : null;
  if (cssText == null) throw new TypeError('`adopt` requires a stylesheet export');
  const style = doc.createElement('style');
  style.textContent = cssText;
  (doc.head ?? doc.documentElement).append(style);
}
