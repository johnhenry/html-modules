/**
 * The declarative layer: <html-import>, <html-binding> and <html-export>.
 *
 *   <html-import src="./ui.html" as="ui"></html-import>             every component as <ui--…>
 *   <html-import src="./ui.html" as="ui">                           only these:
 *     <html-binding export="card"></html-binding>                     <ui--card>
 *     <html-binding export="button" element="brand-button"></html-binding>
 *     <html-binding export="theme" adopt></html-binding>              a stylesheet, adopted
 *   </html-import>
 *   <html-import src="./counter.js">                                a JS-authored class
 *     <html-binding export="Counter" element="x-counter"></html-binding>
 *   </html-import>
 *   <html-import src="./setup.html"></html-import>                  load only (side effects, warm cache)
 *
 * Elements that use a binding may appear anywhere, before or after the import:
 * they upgrade natively when their tag is defined (PRD §17).
 *
 * Events: `load` (detail: { module, elements, bindings }) and `error`
 * (detail: { error }) on <html-import>; `load` / `error` on each
 * <html-binding>, where `error` bubbles through its import.
 */
import { applyBinding, registerComponents } from './runtime.js';
import { bindingRecord } from './record.js';
import { assertNamespace } from './names.js';

const BIND = Symbol('html-modules.bind');

function domReady(doc) {
  if (!doc || doc.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}

/**
 * Define <html-import>, <html-binding> and <html-export> over an HTMLModules instance.
 * @param {{ modules: ReturnType<typeof import('./html-modules.js').createHTMLModules>, window?: any, registry?: CustomElementRegistry }} options
 */
export function defineHTMLModuleElements({ modules, window: win = globalThis, registry } = {}) {
  if (!modules) throw new TypeError('defineHTMLModuleElements: pass { modules } (from createHTMLModules())');
  const reg = () => registry ?? win.customElements;
  const reported = new WeakSet();

  class HTMLImport extends win.HTMLElement {
    #module = null;
    #ready = null;
    #state = null; // set once the module is loaded and the document parsed
    #applied = new WeakSet();
    #elements = {};
    #bindings = {};

    /** Promise of the module namespace (loads it if needed). */
    get module() {
      return this.#load();
    }

    /** Promise that settles once the module is bound: { module, elements, bindings }. */
    get ready() {
      this.#start();
      return this.#ready;
    }

    /** Registered tags → classes, so far. */
    get elements() {
      return { ...this.#elements };
    }

    /** Bound export names → values (components, stylesheets, data), so far. */
    get bindings() {
      return { ...this.#bindings };
    }

    connectedCallback() {
      this.#start();
    }

    #load() {
      this.#module ??= (async () => {
        const src = this.getAttribute('src');
        if (!src) throw new SyntaxError('<html-import> requires a "src" attribute');
        return modules.load(src, { base: this.ownerDocument?.baseURI, type: this.getAttribute('type') || undefined });
      })();
      return this.#module;
    }

    #start() {
      if (this.#ready) return;
      this.#ready = (async () => {
        const doc = this.ownerDocument;
        // Load while the rest of the document parses; decide what to bind once
        // this element's children exist.
        const [module] = await Promise.all([this.#load(), domReady(doc)]);
        const as = this.getAttribute('as') || undefined;
        if (as) assertNamespace(as);
        this.#state = { module, as, from: this.getAttribute('src'), root: this.getRootNode?.() ?? doc };
        const children = [...this.children].filter((c) => c.localName === 'html-binding');
        let firstError = null;
        if (children.length) {
          for (const child of children) {
            const error = this.#apply(child);
            firstError ??= error;
          }
        } else if (as) {
          Object.assign(this.#elements, registerComponents(module, { as, from: this.#state.from, registry: reg(), window: win }));
        }
        if (firstError) throw firstError;
        const detail = { module, elements: this.elements, bindings: this.bindings };
        this.dispatchEvent(new win.CustomEvent('load', { detail }));
        return detail;
      })();
      this.#ready.catch((error) => {
        if (reported.has(error)) return; // already announced by its <html-binding>
        this.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error } }));
      });
    }

    /** Called by a child <html-binding> when it connects. */
    [BIND](binding) {
      if (this.#state) this.#apply(binding); // otherwise the initial pass picks it up
      else this.#start();
    }

    #apply(el) {
      if (this.#applied.has(el)) return null;
      this.#applied.add(el);
      const { module, as, from, root } = this.#state;
      try {
        const result = applyBinding(module, bindingRecord(Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]))), {
          as, from, registry: reg(), window: win, root,
        });
        this.#bindings[result.export] = result.value;
        if (result.tag) this.#elements[result.tag] = result.element;
        el.dispatchEvent(new win.CustomEvent('load', { detail: result }));
        return null;
      } catch (error) {
        reported.add(error);
        el.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error, binding: el } }));
        return error;
      }
    }
  }

  class HTMLBinding extends win.HTMLElement {
    connectedCallback() {
      const parent = this.parentElement;
      if (parent?.localName === 'html-import' && typeof parent[BIND] === 'function') parent[BIND](this);
    }
  }

  /** Inert: exports are read from module documents, never executed in place. */
  class HTMLExport extends win.HTMLElement {}

  const r = win.customElements;
  if (!r.get('html-import')) r.define('html-import', HTMLImport);
  if (!r.get('html-binding')) r.define('html-binding', HTMLBinding);
  if (!r.get('html-export')) r.define('html-export', HTMLExport);
  return { HTMLImport: r.get('html-import'), HTMLBinding: r.get('html-binding'), HTMLExport: r.get('html-export') };
}
