/**
 * A small HTML scanner that reads an HTML module's source text into the same
 * record `readHTMLModule()` reads from a DOM, so the compiler needs no DOM and
 * no dependencies. It follows the HTML parsing rules that matter here:
 * comments, raw-text elements (<script>, <style>, …), quoted attributes and
 * entities in them, void elements, self-closing syntax being ignored on normal
 * elements, and <template> content (kept verbatim, nested templates included)
 * being outside the document.
 */
import { recordFromRaw } from './record.js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
const COLLECT = new Set(['html-export', 'html-import']);
const SETTINGS = { 'html-import-settings': 'importSettings', 'html-module-settings': 'moduleSettings' };
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (s) => s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

const TAG = /<(\/?)([a-zA-Z][^\s/>]*)/y;
const WS = /[\t\n\f\r ]/;

/** Read the attributes of a tag starting at `i` (just after the tag name). */
function readAttributes(src, i) {
  const attrs = {};
  const n = src.length;
  while (i < n) {
    while (i < n && WS.test(src[i])) i++;
    if (src[i] === '>') return { attrs, end: i + 1 };
    if (src[i] === '/') {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !WS.test(src[j]) && src[j] !== '/' && src[j] !== '>' && (src[j] !== '=' || j === i)) j++;
    const name = src.slice(i, j).toLowerCase();
    i = j;
    while (i < n && WS.test(src[i])) i++;
    let value = '';
    if (src[i] === '=') {
      i++;
      while (i < n && WS.test(src[i])) i++;
      const q = src[i];
      if (q === '"' || q === "'") {
        const close = src.indexOf(q, i + 1);
        const stop = close < 0 ? n : close;
        value = src.slice(i + 1, stop);
        i = stop + 1;
      } else {
        let k = i;
        while (k < n && !WS.test(src[k]) && src[k] !== '>') k++;
        value = src.slice(i, k);
        i = k;
      }
    }
    if (name && !(name in attrs)) attrs[name] = decode(value);
  }
  return { attrs, end: n };
}

/**
 * Scan HTML source into raw `<html-export>` / `<html-import>` elements, and the
 * settings elements `<html-import-settings>` / `<html-module-settings>`.
 * @param {string} src
 */
export function scanRawElements(src) {
  const out = { imports: [], exports: [], importSettings: [], moduleSettings: [] };
  let order = 0; // document order of the collected elements, for placement rules
  const stack = []; // open elements outside templates
  let collecting = null; // { raw, depth }
  let template = null; // { depth, start, child }
  let i = 0;
  const n = src.length;

  const closeTo = (tag) => {
    const at = stack.lastIndexOf(tag);
    if (at < 0) return;
    stack.length = at;
    if (collecting && stack.length < collecting.depth) collecting = null;
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const end = src.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    TAG.lastIndex = i;
    const m = TAG.exec(src);
    if (!m) {
      i++;
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const { attrs, end } = readAttributes(src, i + m[0].length);
    const tagStart = i;
    i = end;

    if (template) {
      // Inside template content: only count nested templates (and skip raw text).
      if (tag === 'template') {
        if (!closing) template.depth++;
        else if (--template.depth === 0) {
          if (template.child) template.child.html = src.slice(template.start, tagStart);
          template = null;
        }
      } else if (!closing && RAW_TEXT.has(tag)) {
        i = skipRawText(src, tag, i).after;
      }
      continue;
    }

    if (closing) {
      closeTo(tag);
      continue;
    }

    const directChild = collecting && stack.length === collecting.depth;
    if (tag === 'template') {
      const child = directChild ? { tag, attrs } : null;
      if (child) collecting.raw.children.push(child);
      template = { depth: 1, start: i, child };
      continue;
    }
    if (Object.hasOwn(SETTINGS, tag)) {
      // Recorded wherever they appear (as a DOM's querySelectorAll would find them);
      // they collect no children of their own.
      out[SETTINGS[tag]].push({ tag, order: order++, attrs, children: [] });
    }
    if (COLLECT.has(tag) && collecting) {
      // Nested export/import: recorded so the record builder rejects it exactly as it
      // does for the DOM reader; otherwise handled as ordinary content below.
      const raw = { tag, order: order++, attrs, children: [], nestedIn: { tag: collecting.raw.tag, attrs: collecting.raw.attrs } };
      (tag === 'html-export' ? out.exports : out.imports).push(raw);
    }
    if (COLLECT.has(tag) && !collecting) {
      const raw = { tag, order: order++, attrs, children: [] };
      (tag === 'html-export' ? out.exports : out.imports).push(raw);
      stack.push(tag);
      collecting = { raw, depth: stack.length };
      continue;
    }
    const child = directChild ? { tag, attrs } : null;
    if (child) collecting.raw.children.push(child);
    if (RAW_TEXT.has(tag)) {
      const { text, after } = skipRawText(src, tag, i);
      if (child) child.text = text;
      i = after;
      continue;
    }
    if (!VOID.has(tag)) stack.push(tag);
  }
  return out;
}

function skipRawText(src, tag, from) {
  const close = new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'ig');
  close.lastIndex = from;
  const m = close.exec(src);
  if (!m) return { text: src.slice(from), after: src.length };
  const gt = src.indexOf('>', m.index);
  return { text: src.slice(from, m.index), after: gt < 0 ? src.length : gt + 1 };
}

/**
 * Scan an HTML module's source into a module record.
 * @param {string} source
 * @param {string} [url]
 * @returns {import('./record.js').ModuleRecord}
 */
export function scanHTMLModule(source, url = '') {
  return recordFromRaw(scanRawElements(source), url);
}
