/**
 * Web Components reference implementation of the declarative layer:
 * <module-import> and <module-binding> (prefix configurable).
 *
 * The elements are a control plane only. Module loading is ordinary ESM
 * (`import()`) or the HTML-module loader; resolution goes through the loader's
 * import map / router (mport) / host resolution.
 */
import { createLoader } from './loader.js';
import { readImportDeclaration, applyImport } from './declarations.js';
import { scopeFor } from './scope.js';

function domReady(doc) {
  if (!doc || doc.readyState !== 'loading') return Promise.resolve();
  return new Promise((r) => doc.addEventListener('DOMContentLoaded', () => r(), { once: true }));
}

/**
 * Define the declarative module elements.
 * @param {object} [options]
 * @param {any} [options.window]          window-like global providing HTMLElement/customElements/document
 * @param {ReturnType<typeof createLoader>} [options.loader]
 * @param {string} [options.prefix]       element prefix; "module" → <module-import>, <module-binding>
 * @param {CustomElementRegistry} [options.registry]   where `element="…"` registrations go
 * @param {import('./scope.js').ModuleScope} [options.scope]
 */
export function defineModuleElements({
  window: win = globalThis,
  loader,
  prefix = 'module',
  registry = win.customElements,
  scope = scopeFor(win.document ?? win),
} = {}) {
  const theLoader = loader ?? createLoader({ window: win });
  const importTag = `${prefix}-import`;
  const bindingTag = `${prefix}-binding`;

  class ModuleImport extends win.HTMLElement {
    #promise = null;
    #bindings = null;

    /** Promise of the imported module namespace. */
    get module() {
      return this.#start();
    }

    /** Local bindings created by this import (after it loads). */
    get bindings() {
      return this.#bindings;
    }

    get declaration() {
      return readImportDeclaration(this, { prefix });
    }

    connectedCallback() {
      this.#start().catch(() => {}); // surfaced via the "error" event and `.module`
    }

    #start() {
      this.#promise ??= (async () => {
        const doc = this.ownerDocument;
        await domReady(doc);
        const decl = readImportDeclaration(this, { prefix });
        const referrer = doc?.baseURI || undefined;
        const ns = await theLoader.load(decl.from, referrer, decl.type ? { type: decl.type } : {});
        this.#bindings = applyImport(decl, ns, { scope, registry, document: doc, window: win });
        this.dispatchEvent(new win.CustomEvent('load', { detail: { module: ns, bindings: this.#bindings } }));
        return ns;
      })().catch((error) => {
        this.dispatchEvent(new win.CustomEvent('error', { detail: { error } }));
        throw error;
      });
      return this.#promise;
    }
  }

  class ModuleBinding extends win.HTMLElement {}

  const reg = win.customElements;
  if (!reg.get(importTag)) reg.define(importTag, ModuleImport);
  if (!reg.get(bindingTag)) reg.define(bindingTag, ModuleBinding);
  return { ModuleImport: reg.get(importTag), ModuleBinding: reg.get(bindingTag), loader: theLoader, scope };
}
