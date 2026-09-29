/**
 * Web Components reference implementation of the declarative layer:
 * <module-import>, <module-binding> (prefix configurable) and <define-element>.
 *
 *   <module-import from="./ui.js"><module-binding name="Card"></module-binding></module-import>
 *   <define-element name="ui-card" component="Card"></define-element>
 *     ≈ import { Card } from "./ui.js"; customElements.define("ui-card", Card)
 *
 * The elements are a control plane only. Module loading is ordinary ESM
 * (`import()`) or the HTML-module loader; bare specifiers resolve through the
 * page's import map (host resolution).
 */
import { createLoader } from './loader.js';
import { readImportDeclaration, applyImport } from './declarations.js';
import { scopeFor } from './scope.js';
import { defineElement } from './interpret.js';

function domReady(doc) {
  if (!doc || doc.readyState !== 'loading') return Promise.resolve();
  return new Promise((r) => doc.addEventListener('DOMContentLoaded', () => r(), { once: true }));
}

/**
 * Define the declarative module elements.
 * @param {object} [options]
 * @param {any} [options.window]          window-like global providing HTMLElement/customElements/document
 * @param {ReturnType<typeof createLoader>} [options.loader]
 * @param {string} [options.prefix]       element prefix; "module" → <module-import>, <module-binding>,
 *                                         <define-element>; "esm" → <esm-import>, <esm-binding>, <esm-define>
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
  const defineTag = prefix === 'module' ? 'define-element' : `${prefix}-define`;

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

  /**
   * <define-element name="ui-card" component="Card">: register a binding that
   * an import declared, as a separate explicit step. The binding may come from
   * an import anywhere in the document, before or after this element, including
   * one inserted later; until then the element waits (`scope.whenDeclared`).
   */
  class DefineElement extends win.HTMLElement {
    #promise = null;

    /** Promise of the registered constructor. */
    get defined() {
      return this.#start();
    }

    connectedCallback() {
      this.#start().catch(() => {}); // surfaced via the "error" event and `.defined`
    }

    #start() {
      this.#promise ??= (async () => {
        const doc = this.ownerDocument;
        await domReady(doc);
        const name = this.getAttribute('name');
        const component = this.getAttribute('component');
        if (!name || !component) throw new SyntaxError(`<${defineTag}> requires "name" and "component" attributes`);
        const value = await scope.whenDeclared(component);
        const constructor = defineElement(registry, name, value, win);
        this.dispatchEvent(new win.CustomEvent('load', { detail: { name, constructor } }));
        return constructor;
      })().catch((error) => {
        this.dispatchEvent(new win.CustomEvent('error', { detail: { error } }));
        throw error;
      });
      return this.#promise;
    }
  }

  const reg = win.customElements;
  if (!reg.get(importTag)) reg.define(importTag, ModuleImport);
  if (!reg.get(bindingTag)) reg.define(bindingTag, ModuleBinding);
  if (!reg.get(defineTag)) reg.define(defineTag, DefineElement);
  return {
    ModuleImport: reg.get(importTag),
    ModuleBinding: reg.get(bindingTag),
    DefineElement: reg.get(defineTag),
    loader: theLoader,
    scope,
  };
}
