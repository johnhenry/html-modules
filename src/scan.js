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
// Elements whose content the tokenizer reads as text, not markup (the tree builder switches it into
// RAWTEXT / RCDATA / script data / PLAINTEXT). <script> has its own escape states; see scriptEnd().
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
const COLLECT = new Set(['html-export', 'html-import']);
const SETTINGS = { 'html-import-settings': 'importSettings', 'html-module-settings': 'moduleSettings' };
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (s) => s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

// Tree construction, just enough of it to know which elements are children of an <html-export>.
// The "special" elements: an end tag for anything else does not close past one of these.
const SPECIAL = new Set(('address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed ' +
  'fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input li link listing main marquee menu meta nav noembed ' +
  'noframes noscript object ol p param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp').split(' '));
// End tags with a dedicated rule: they close the nearest open element of that name within scope.
const SCOPED_END = new Set(('address article aside blockquote button center details dialog dir div dl fieldset figcaption figure footer header hgroup listing main menu nav ol p pre ' +
  'search section summary ul li dd dt h1 h2 h3 h4 h5 h6').split(' '));
const SCOPE = new Set(['applet', 'caption', 'html', 'table', 'td', 'th', 'marquee', 'object', 'template']);
// Start tags that close an open <p>.
const CLOSES_P = new Set(('address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer header hgroup main menu nav ol p search section summary ul ' +
  'h1 h2 h3 h4 h5 h6 pre listing form table hr xmp').split(' '));
// Start tags that leave the "frameset-ok" flag alone (anything else, and any text, clears it; so does <template>).
const FRAMESET_NEUTRAL = new Set(('style script meta link base title noembed noframes div span p section article header footer nav main aside h1 h2 h3 h4 h5 h6 ul ol a b i em strong small code').split(' '));
// Start tags that do not begin the body (they are "in head": the body does not exist yet).
const HEAD_TAGS = new Set(['base', 'basefont', 'bgsound', 'link', 'meta', 'noframes', 'script', 'style', 'template', 'title', 'html', 'head']);
// Tags that are never pushed: <html>, <head>, <body> merge into the document, and their end tags close nothing here.
const DOCUMENT_TAGS = new Set(['html', 'head', 'body']);

const WS = /[\t\n\f\r ]/;
const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
/** ASCII-only lowercase, as the HTML tokenizer does (not Unicode `toLowerCase()`). */
const lower = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
const NAME_END = /[\t\n\f\r />]/;
const COMMENT_END = /--!?>/g;
const nul = (s) => s.replaceAll('\0', '\uFFFD');

/**
 * Read the attributes of a tag starting at `i` (just after the tag name).
 * `eof` is true when the source ends inside the tag: the tokenizer then
 * discards the tag altogether.
 */
function readAttributes(src, i) {
  const attrs = {};
  const n = src.length;
  while (i < n) {
    while (i < n && WS.test(src[i])) i++;
    if (i >= n) break;
    if (src[i] === '>') return { attrs, end: i + 1, eof: false };
    if (src[i] === '/') {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !WS.test(src[j]) && src[j] !== '/' && src[j] !== '>' && (src[j] !== '=' || j === i)) j++;
    const name = lower(src.slice(i, j));
    i = j;
    while (i < n && WS.test(src[i])) i++;
    let value = '';
    if (src[i] === '=') {
      i++;
      while (i < n && WS.test(src[i])) i++;
      const q = src[i];
      if (q === '"' || q === "'") {
        const close = src.indexOf(q, i + 1);
        if (close < 0) return { attrs, end: n, eof: true };
        value = src.slice(i + 1, close);
        i = close + 1;
      } else {
        let k = i;
        while (k < n && !WS.test(src[k]) && src[k] !== '>') k++;
        value = src.slice(i, k);
        i = k;
      }
    }
    if (name && !Object.hasOwn(attrs, name)) attrs[name] = decode(nul(value));
  }
  return { attrs, end: n, eof: true };
}

/** The end of a comment that starts at `i` (`<!--`): `-->`, `--!>`, or the abrupt endings `<!-->` and `<!--->`. */
function commentEnd(src, i) {
  const j = i + 4;
  if (src[j] === '>') return j + 1;
  if (src[j] === '-' && src[j + 1] === '>') return j + 2;
  COMMENT_END.lastIndex = j;
  const m = COMMENT_END.exec(src);
  return m ? m.index + m[0].length : src.length;
}

/** After `<!`, `<?` or `</` + a non-letter: a bogus comment runs to the first `>`. */
function bogusEnd(src, from) {
  const end = src.indexOf('>', from);
  return end < 0 ? src.length : end + 1;
}

const SCRIPT_CLOSE = /script(?=[\t\n\f\r />])/iy;
const SCRIPT_WORD = /([a-z]+)(?=[\t\n\f\r />])/iy;
const scriptWord = (src, at) => {
  SCRIPT_WORD.lastIndex = at;
  const m = SCRIPT_WORD.exec(src);
  return m ? { word: lower(m[1]), end: at + m[1].length } : null;
};

/**
 * Where the content of a <script> element ends: the index of the `</script`
 * that closes it, or -1. Follows the tokenizer's script data states, so an
 * "escaped" `<!--` hides a `<script>` … `</script>` pair that does not end the element.
 */
function scriptEnd(src, from) {
  const n = src.length;
  let state = 'data';
  let dashes = 0;
  let i = from;
  const closesAt = (k) => {
    SCRIPT_CLOSE.lastIndex = k;
    return SCRIPT_CLOSE.test(src);
  };
  while (i < n) {
    const c = src[i];
    if (state === 'data') {
      if (c === '<') {
        if (src[i + 1] === '/') {
          if (closesAt(i + 2)) return i;
          i += 2;
          continue;
        }
        if (src.startsWith('<!--', i)) {
          state = 'escaped';
          dashes = 2;
          i += 4;
          continue;
        }
      }
      i++;
      continue;
    }
    if (c === '-') {
      dashes = Math.min(dashes + 1, 2);
      i++;
      continue;
    }
    if (c === '>' && dashes >= 2) {
      state = 'data';
      dashes = 0;
      i++;
      continue;
    }
    dashes = 0;
    if (c !== '<') {
      i++;
      continue;
    }
    if (src[i + 1] === '/') {
      if (state === 'escaped') {
        if (closesAt(i + 2)) return i;
      } else {
        const w = scriptWord(src, i + 2);
        if (w?.word === 'script') {
          state = 'escaped';
          i = w.end;
          continue;
        }
      }
      i += 2;
      continue;
    }
    if (state === 'escaped') {
      const w = scriptWord(src, i + 1);
      if (w?.word === 'script') {
        state = 'double';
        i = w.end;
        continue;
      }
    }
    i++;
  }
  return -1;
}

/**
 * The content of a raw-text element that starts at `from` (just after its
 * start tag) and where the source resumes after its end tag.
 */
function skipRawText(src, tag, from) {
  const n = src.length;
  if (tag === 'plaintext') return { text: nul(src.slice(from)), after: n };
  let at;
  if (tag === 'script') at = scriptEnd(src, from);
  else {
    const close = new RegExp(`</${tag}(?=[\\t\\n\\f\\r />])`, 'ig');
    close.lastIndex = from;
    at = close.exec(src)?.index ?? -1;
  }
  if (at < 0) return { text: nul(src.slice(from)), after: n };
  const text = src.slice(from, at);
  // The end tag may carry attributes (ignored), and `>` inside a quoted value does not end it.
  const { end } = readAttributes(src, at + 2 + tag.length);
  return { text: nul(text), after: end };
}

/**
 * Scan HTML source into raw `<html-export>` / `<html-import>` elements, and the
 * settings elements `<html-import-settings>` / `<html-module-settings>`.
 * @param {string} src
 */
export function scanRawElements(src) {
  // Input stream preprocessing: CRLF and CR are LF.
  src = String(src).replace(/\r\n?/g, '\n');
  const out = { imports: [], exports: [], importSettings: [], moduleSettings: [] };
  let order = 0; // document order of the collected elements, for placement rules
  const stack = []; // open elements outside templates
  const rawAt = []; // parallel to `stack`: the raw element of an open <html-export>/<html-import>
  let collecting = null; // { raw, depth }
  let template = null; // { depth, start, child }
  let framesetOk = true;
  let bodyStarted = false; // has any token created the <body> yet?
  let i = 0;
  const n = src.length;

  const popTo = (k) => {
    stack.length = k;
    if (rawAt.length > k) rawAt.length = k;
    if (collecting && stack.length < collecting.depth) collecting = null;
  };
  // An end tag: a dedicated one closes the nearest such element within scope; any other
  // closes the nearest of its name unless a "special" element is in the way.
  const endTag = (tag) => {
    if (DOCUMENT_TAGS.has(tag)) return;
    const scoped = SCOPED_END.has(tag);
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k] === tag) return popTo(k);
      if (scoped ? SCOPE.has(stack[k]) : SPECIAL.has(stack[k])) return;
    }
  };
  const closeP = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k] === 'p') return popTo(k);
      if (SCOPE.has(stack[k]) || stack[k] === 'button') return;
    }
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    const text = src.slice(i, lt < 0 ? n : lt);
    if (!template && /[^\t\n\f\r ]/.test(text)) {
      bodyStarted = true;
      if (/[^\t\n\f\r \0]/.test(text)) framesetOk = false;
    }
    if (lt < 0) break;
    i = lt;
    const c1 = src[i + 1];
    if (c1 === '!') {
      i = src.startsWith('<!--', i) ? commentEnd(src, i) : bogusEnd(src, i + 2);
      continue;
    }
    if (c1 === '?') {
      i = bogusEnd(src, i + 2);
      continue;
    }
    if (c1 === '/' && !isAlpha(src[i + 2] ?? '')) {
      // `</>` vanishes; `</` at the end is text; `</` + anything else is a bogus comment.
      if (src[i + 2] === '>') i += 3;
      else if (i + 2 >= n) i = n;
      else i = bogusEnd(src, i + 2);
      continue;
    }
    if (c1 !== '/' && !isAlpha(c1 ?? '')) {
      if (!template) {
        // A literal "<" is text.
        bodyStarted = true;
        framesetOk = false;
      }
      i++;
      continue;
    }
    const closing = c1 === '/';
    let nameEnd = i + (closing ? 2 : 1);
    while (nameEnd < n && !NAME_END.test(src[nameEnd])) nameEnd++;
    const tag = lower(src.slice(i + (closing ? 2 : 1), nameEnd));
    const { attrs, end, eof } = readAttributes(src, nameEnd);
    const tagStart = i;
    i = end;
    if (eof) break; // end of input inside a tag: the tag is dropped

    if (!template) {
      if (closing) {
        if (tag === 'br' || tag === 'body' || tag === 'html') bodyStarted = true;
      } else if (tag !== 'frameset') {
        if (!HEAD_TAGS.has(tag)) bodyStarted = true;
        if (tag === 'template' || (!FRAMESET_NEUTRAL.has(tag) && !tag.includes('-'))) framesetOk = false;
      }
    }
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
      endTag(tag);
      continue;
    }

    if (tag === 'frameset' && (!bodyStarted || framesetOk)) {
      // A <frameset> before the body starts, or in a body that has nothing but neutral content,
      // replaces the body: nothing before it is in the document any more, and nothing after it can be.
      return { imports: [], exports: [], importSettings: [], moduleSettings: [] };
    }
    if (CLOSES_P.has(tag)) closeP();
    if (DOCUMENT_TAGS.has(tag) || tag === 'frameset') continue;

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
      // The nearest open export or import is the one it is nested in (as `closest()` finds in a DOM).
      const parent = rawAt.findLast(Boolean) ?? collecting.raw;
      const raw = { tag, order: order++, attrs, children: [], nestedIn: { tag: parent.tag, attrs: parent.attrs } };
      (tag === 'html-export' ? out.exports : out.imports).push(raw);
      stack.push(tag);
      rawAt[stack.length - 1] = raw;
      continue;
    }
    if (COLLECT.has(tag) && !collecting) {
      const raw = { tag, order: order++, attrs, children: [] };
      (tag === 'html-export' ? out.exports : out.imports).push(raw);
      stack.push(tag);
      rawAt[stack.length - 1] = raw;
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
  // The source ended inside a <template>: its content runs to the end.
  if (template?.child) template.child.html = src.slice(template.start);
  return out;
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
