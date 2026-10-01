/**
 * Data binding for component templates: a minimal, declarative, eval-free syntax.
 *
 *   <html-export name="user-card" props="name count:number open:boolean">
 *     <template>
 *       <h2>Hello, {{name}}!</h2>
 *       <a href="/users/{{name}}" title="{{ name }} ({{count}})">profile</a>
 *     </template>
 *   </html-export>
 *
 * `{{name}}` is the value of the host element's attribute `name` (nothing else: no expressions, no JavaScript).
 * In a text node it sets the node's data (never markup); in an attribute value it sets that attribute of the
 * stamped element. `\{{` is a literal `{{`. A bound node is patched when its attribute changes: the template is
 * stamped once per element, then only the nodes that mention the changed attribute are touched.
 *
 * This file is DOM-agnostic about the window (it only needs `Node`-like objects): the runtime calls
 * `analyzeTemplate()` once per definition and window, `resolveSites()` on every stamped fragment, and
 * `updateSites()` when attributes change. Compiled modules use the same code through the runtime.
 */

export const PROP_TYPES = Object.freeze(['string', 'number', 'boolean']);

// A binding names a host attribute: letters, digits, "_", "-" ("name", "data-id", "aria-label").
const NAME = /^[A-Za-z_][\w-]*$/;

/**
 * Split text into literal strings and `{ name }` bindings, or return null when it has no binding and no escape
 * (so it is left alone). Throws a SyntaxError for an unterminated `{{` or one that is not a plain attribute
 * name (an expression, a filter, a call: there are none).
 * @param {string} text
 * @returns {Array<string | { name: string }> | null}
 */
export function parseBindingText(text) {
  if (!text.includes('{{')) return null;
  const parts = [];
  let literal = '';
  let i = 0;
  let touched = false;
  while (i < text.length) {
    const at = text.indexOf('{{', i);
    if (at < 0) break;
    if (at - 1 >= i && text[at - 1] === '\\') {
      // `\{{`: a literal "{{"
      literal += text.slice(i, at - 1) + '{{';
      i = at + 2;
      touched = true;
      continue;
    }
    const end = text.indexOf('}}', at + 2);
    if (end < 0) {
      throw new SyntaxError(`Unterminated binding "${text.slice(at, at + 24)}": a binding is {{attribute-name}}; write \\{{ for a literal "{{"`);
    }
    const name = text.slice(at + 2, end).trim();
    if (!NAME.test(name)) {
      throw new SyntaxError(`Invalid binding "{{${text.slice(at + 2, end)}}}": a binding is the name of a host attribute, {{attribute-name}}. There are no expressions, filters or calls; write \\{{ for a literal "{{"`);
    }
    literal += text.slice(i, at);
    if (literal) parts.push(literal);
    literal = '';
    parts.push({ name });
    i = end + 2;
    touched = true;
  }
  if (!touched) return null;
  literal += text.slice(i);
  if (literal) parts.push(literal);
  return parts;
}

const namesOf = (parts) => [...new Set(parts.filter((p) => typeof p !== 'string').map((p) => p.name))];

// Attributes whose value is a URL: a value that would run script is refused.
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'background', 'longdesc', 'usemap', 'ping', 'codebase', 'xlink:href']);
// Attributes a binding may never write: HTML or CSS injection.
const NEVER = new Set(['style', 'srcdoc']);
// Control characters, whitespace and invisible code points that a URL parser ignores inside a scheme.
const INVISIBLE = new RegExp(`[${[[0, 0x20], [0x7f, 0xa0], [0x1680], [0x180e], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x2064], [0x3000], [0xfeff]]
  .map(([from, to = from]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`, 'g');

/**
 * True when `value` is a URL a browser would run as script (or render as an active document): `javascript:`,
 * `vbscript:`, or a `data:` HTML/SVG/XHTML document. The scheme is matched after the whitespace, control
 * characters and invisible code points a URL parser ignores are removed.
 */
export function isUnsafeURL(value) {
  const s = String(value).replace(INVISIBLE, '').toLowerCase();
  return /^(?:javascript|vbscript):/.test(s) || /^data:(?:text\/html|application\/xhtml|image\/svg)/.test(s);
}

/** Why a binding on this attribute is refused (a message), or null. */
export function refusedAttribute(name) {
  const lower = name.toLowerCase();
  if (/^on/.test(lower)) return `"${name}" is an event handler attribute; bindings never write on* attributes (listen for the event in script instead)`;
  if (NEVER.has(lower)) return `"${name}" cannot be bound: it would inject ${lower === 'style' ? 'CSS' : 'HTML'}`;
  return null;
}

const SKIP_TEXT = new Set(['script', 'style']);

/**
 * Find the binding sites of a template's content (a DocumentFragment): every text node and attribute that
 * mentions `{{…}}` or `\{{`. The result is plain data (a path of child indexes from the fragment, and the parsed
 * parts), reusable for every stamp of the template. Nested `<template>` elements are opaque (their content is
 * not stamped into the shadow root), and the text of `<script>` / `<style>` is never bound.
 * @param {DocumentFragment} content
 * @param {string} [what] how to name the definition in errors
 * @returns {{ sites: Array<object>, names: string[] }}
 */
export function analyzeTemplate(content, what = 'template') {
  const sites = [];
  const names = new Set();
  const walk = (node, path) => {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const here = [...path, i];
      if (child.nodeType === 3) {
        if (SKIP_TEXT.has(node.localName)) continue;
        let parts;
        try {
          parts = parseBindingText(child.data);
        } catch (error) {
          throw new SyntaxError(`${what}: ${error.message}`);
        }
        if (parts) {
          sites.push({ path: here, text: true, parts, names: namesOf(parts) });
          for (const n of namesOf(parts)) names.add(n);
        }
      } else if (child.nodeType === 1) {
        for (const attr of [...child.attributes]) {
          if (!attr.value.includes('{{')) continue;
          const refused = refusedAttribute(attr.name);
          if (refused) throw new SyntaxError(`${what}: <${child.localName} ${attr.name}="${attr.value}">: ${refused}`);
          let parts;
          try {
            parts = parseBindingText(attr.value);
          } catch (error) {
            throw new SyntaxError(`${what}: <${child.localName} ${attr.name}>: ${error.message}`);
          }
          if (parts) {
            sites.push({ path: here, text: false, attr: attr.name, ns: attr.namespaceURI ?? null, parts, names: namesOf(parts) });
            for (const n of namesOf(parts)) names.add(n);
          }
        }
        if (child.localName !== 'template') walk(child, here);
      }
    }
  };
  walk(content, []);
  return { sites, names: [...names] };
}

/** Resolve analyzed sites against a stamped clone of the content (before it is appended anywhere). */
export function resolveSites(fragment, analysis) {
  return analysis.sites.map((site) => {
    let node = fragment;
    for (const index of site.path) node = node.childNodes[index];
    return { ...site, node, last: undefined };
  });
}

const render = (parts, host) => parts.map((p) => (typeof p === 'string' ? p : host.getAttribute(p.name) ?? '')).join('');

/**
 * Write the sites that mention one of `changed` (all of them when `changed` is omitted) from the host's
 * attributes. A site whose text did not change is not touched. An attribute site whose whole value is a single
 * binding of an absent attribute removes the target attribute (so `<button disabled="{{disabled}}">` follows a
 * boolean attribute); a URL attribute that would run script is removed, never set.
 */
export function updateSites(sites, host, changed) {
  for (const site of sites) {
    if (changed && !site.names.some((n) => changed.includes(n)) && site.last !== undefined) continue;
    if (site.text) {
      const value = render(site.parts, host);
      if (value !== site.last) {
        site.node.data = value;
        site.last = value;
      }
      continue;
    }
    const single = site.parts.length === 1 && typeof site.parts[0] !== 'string';
    let value = single && !host.hasAttribute(site.parts[0].name) ? null : render(site.parts, host);
    if (value !== null && URL_ATTRIBUTES.has(site.attr.toLowerCase()) && isUnsafeURL(value)) value = null;
    if (value === site.last) continue;
    site.last = value;
    if (value === null) {
      if (site.ns) site.node.removeAttributeNS(site.ns, site.attr.split(':').pop());
      else site.node.removeAttribute(site.attr);
    } else if (site.ns) site.node.setAttributeNS(site.ns, site.attr, value);
    else site.node.setAttribute(site.attr, value);
  }
}

// ---------------------------------------------------------------------------
// Declared props: `props="title count:number open:boolean"`

const PROP_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
// Property names a prop may not take: they would break the element (or the runtime's own members).
const RESERVED_PROPS = new Set([
  'constructor', 'prototype', 'attributes', 'children', 'childNodes', 'innerHTML', 'outerHTML', 'textContent', 'innerText',
  'shadowRoot', 'classList', 'style', 'className', 'attachInternals', 'attachShadow', 'internals', 'component', 'form',
  'validity', 'validationMessage', 'willValidate', 'labels', 'states',
]);

/**
 * Parse a `props` attribute: whitespace or comma separated `name` or `name:type` (type string, number or boolean;
 * default string). Each becomes an observed attribute reflected by a property of the camelCase name. Throws a
 * SyntaxError naming `what` for a malformed list.
 * @param {string} text
 * @param {string} what e.g. '<html-export name="card">'
 * @param {(name: string) => string} camel
 * @returns {Array<{ name: string, type: 'string'|'number'|'boolean' }>}
 */
export function parseProps(text, what, camel, where = '') {
  const items = text.split(/[\s,]+/).filter(Boolean);
  if (!items.length) throw new SyntaxError(`${what}: props="" declares no props; write props="title count:number open:boolean"${where}`);
  const seen = new Set();
  return items.map((item) => {
    const [name, type = 'string', ...extra] = item.split(':');
    if (!PROP_NAME.test(name) || extra.length) {
      throw new SyntaxError(`${what}: "${item}" in props is not "<name>" or "<name>:<type>"; a name is a lower-case attribute name such as "count" or "aria-label"${where}`);
    }
    if (!PROP_TYPES.includes(type)) {
      throw new SyntaxError(`${what}: props type "${type}" for "${name}" must be ${PROP_TYPES.map((t) => `"${t}"`).join(', ')} or omitted${where}`);
    }
    const property = camel(name);
    if (name.startsWith('on') || RESERVED_PROPS.has(property)) {
      throw new SyntaxError(`${what}: "${name}" cannot be a prop: ${name.startsWith('on') ? 'bindings never write on* attributes' : `"${property}" is a member of the element itself`}${where}`);
    }
    if (seen.has(name)) throw new SyntaxError(`${what}: prop "${name}" is declared twice${where}`);
    seen.add(name);
    return { name, type };
  });
}
