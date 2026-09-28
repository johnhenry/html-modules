/**
 * Declarative imports: read <module-import>/<import> markup into a plain
 * declaration, and apply a loaded namespace to it.
 *
 *   <module-import from="./ui.js">                        import { Card, Button as B } from "./ui.js"
 *     <module-binding name="Card" element="ui-card">        + customElements.define("ui-card", Card)
 *     <module-binding name="Button" as="B">
 *   </module-import>
 *   <module-import from="./ui.html" default="Card">       import Card from "./ui.html"
 *   <module-import from="./ui.html" namespace="UI">       import * as UI from "./ui.html"
 *   <module-import from="./setup.js">                     import "./setup.js"   (side effect only)
 *   <module-import from="./ui.js" name="Card" element="ui-card">  (single-binding shorthand)
 *
 * `as` is always a local alias; `element` is custom-element registration;
 * `adopt` applies a stylesheet export to the document.
 */
import { hasExport } from './namespace.js';
import { defineElement, adoptStyleSheet } from './interpret.js';

/**
 * @typedef {{ name: string, as?: string, element?: string, adopt?: boolean }} BindingDecl
 * @typedef {{ from: string, type?: 'js'|'html', defaultLocal?: string, namespaceLocal?: string, bindings: BindingDecl[], sideEffectOnly: boolean }} ImportDecl
 */

const attr = (el, n) => {
  const v = el.getAttribute(n);
  return v == null || v === '' ? undefined : v;
};

/**
 * @param {Element} el
 * @param {{ prefix?: string }} [options]
 * @returns {ImportDecl}
 */
export function readImportDeclaration(el, { prefix = 'module' } = {}) {
  const from = attr(el, 'from');
  if (!from) throw new SyntaxError(`<${el.localName}> requires a "from" attribute`);
  const bindingTags = new Set([`${prefix}-binding`, 'binding']);
  const bindings = [...el.children]
    .filter((c) => bindingTags.has(c.localName))
    .map((b) => readBinding(b));
  if (el.hasAttribute('name')) bindings.push(readBinding(el));
  else if (el.hasAttribute('element') || el.hasAttribute('as')) {
    throw new SyntaxError(`<${el.localName}>: "element"/"as" shorthand requires "name"`);
  }
  const type = attr(el, 'type');
  const defaultLocal = attr(el, 'default');
  const namespaceLocal = attr(el, 'namespace');
  return {
    from,
    ...(type && { type }),
    ...(defaultLocal && { defaultLocal }),
    ...(namespaceLocal && { namespaceLocal }),
    bindings,
    sideEffectOnly: !bindings.length && !defaultLocal && !namespaceLocal,
  };
}

function readBinding(el) {
  const name = attr(el, 'name');
  if (!name) throw new SyntaxError(`<${el.localName}> requires a "name" attribute`);
  const as = attr(el, 'as');
  const element = attr(el, 'element');
  return { name, ...(as && { as }), ...(element && { element }), ...(el.hasAttribute('adopt') && { adopt: true }) };
}

/**
 * Apply a loaded namespace to a declaration.
 * @param {ImportDecl} decl
 * @param {object} ns
 * @param {{ scope?: import('./scope.js').ModuleScope, registry?: CustomElementRegistry, document?: Document, window?: any }} ctx
 * @returns {Record<string, unknown>} the local bindings created
 */
export function applyImport(decl, ns, { scope, registry, document, window } = {}) {
  const created = {};
  const declare = (local, value) => {
    scope?.declare(local, value, decl.from);
    created[local] = value;
  };
  const need = (name) => {
    if (!hasExport(ns, name)) {
      throw new SyntaxError(`The requested module '${decl.from}' does not provide an export named '${name}'`);
    }
    return ns[name];
  };
  if (decl.defaultLocal) declare(decl.defaultLocal, need('default'));
  if (decl.namespaceLocal) declare(decl.namespaceLocal, ns);
  for (const b of decl.bindings) {
    const value = need(b.name);
    const local = b.as ?? b.name;
    if (local === 'default') throw new SyntaxError(`Importing "default" requires an "as" alias (from '${decl.from}')`);
    declare(local, value);
    if (b.element) {
      if (!registry) throw new TypeError('A CustomElementRegistry is required for element="…"');
      defineElement(registry, b.element, value, window);
    }
    if (b.adopt) {
      if (!document) throw new TypeError('A document is required for adopt');
      adoptStyleSheet(document, value);
    }
  }
  return created;
}
