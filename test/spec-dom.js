// A spec-compliant reader oracle. linkedom's parser is not an HTML parser in the
// WHATWG sense (it shares the scanner's blind spots: comment endings, bogus
// comments, plaintext, …), so tests that compare the DOM reader with the scanner
// parse with parse5 instead. This is the smallest DOM facade `readHTMLModule()`
// needs over a parse5 tree: querySelectorAll over the document (not into
// <template> content), localName, attributes, children, parentElement.closest,
// innerHTML (templates) and textContent.
import { parse, serialize } from 'parse5';

const textOf = (node) => {
  if (node.nodeName === '#text') return node.value;
  let out = '';
  for (const c of node.childNodes ?? []) out += textOf(c);
  return out;
};

class El {
  constructor(node, parent) {
    this.node = node;
    this.parent = parent;
    this.localName = node.tagName;
    this.attributes = node.attrs.map((a) => ({ name: a.name, value: a.value }));
  }

  get parentElement() {
    return this.parent instanceof El ? this.parent : null;
  }

  get children() {
    return (this.node.childNodes ?? []).filter((c) => c.tagName).map((c) => new El(c, this));
  }

  get innerHTML() {
    return serialize(this.node);
  }

  get textContent() {
    return textOf(this.node);
  }

  closest(selector) {
    const names = selector.split(',').map((s) => s.trim());
    for (let el = this; el; el = el.parentElement) if (names.includes(el.localName)) return el;
    return null;
  }
}

/** Parse `html` as a document the way a browser would, as the facade `readHTMLModule()` reads. */
export function specParse(html) {
  const doc = parse(html);
  return {
    querySelectorAll(selector) {
      const names = new Set(selector.split(',').map((s) => s.trim()));
      const out = [];
      const walk = (node, parent) => {
        for (const c of node.childNodes ?? []) {
          if (!c.tagName) continue;
          const el = new El(c, parent);
          if (names.has(el.localName)) out.push(el);
          walk(c, el); // a <template>'s content is a separate fragment: not walked
        }
      };
      walk(doc, null);
      return out;
    },
  };
}

/** Stand-in for `new DOMParser().parseFromString(html, 'text/html')`. */
export const specDOMParser = { parseFromString: (html) => specParse(html) };
