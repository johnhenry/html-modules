// The scanner (compiler) and the DOM reader (browser loader) must record the same module for any
// source. The reader here is a spec parser (parse5), so these tests pin the scanner to the HTML
// tokenizer and tree builder on the cases where a naive scanner disagrees, and a seeded fuzz over
// random tag soup checks the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHTMLModule, scanHTMLModule } from '../src/index.js';
import { canonicalHTML, specParse } from './spec-dom.js';

const norm = (r) => ({ ...r, exports: r.exports.map((e) => (e.kind === 'component' ? { ...e, template: canonicalHTML(e.template) } : e)) });
const outcome = (read) => {
  try {
    return { record: norm(read()) };
  } catch (error) {
    return { error: `${error.name}: ${error.message}` };
  }
};
const viaSpec = (html) => outcome(() => readHTMLModule(specParse(html), 'm.html'));
const viaScan = (html) => outcome(() => scanHTMLModule(html, 'm.html'));
const names = (o) => o.record?.exports.map((e) => e.name) ?? o.error;

const exp = (name, body = '<template><p>x</p></template>') => `<html-export name="${name}">${body}</html-export>`;

const CASES = [
  ['a comment closed by --!>', `<!-- <html-export name="c"> --!>${exp('a')}`, ['a']],
  ['<!--> is an empty comment', `<!-->${exp('a')}`, ['a']],
  ['<!---> is an empty comment', `<!--->${exp('a')}`, ['a']],
  ['<!----> and --->', `<!---->${exp('a')}<!-- x --->${exp('b')}`, ['a', 'b']],
  ['an unterminated comment swallows the rest', `${exp('a')}<!-- ${exp('b')}`, ['a']],
  ['</ + a non-letter is a bogus comment', `</3 ${exp('no')}-->${exp('a')}`, ['a']],
  ['</> is nothing', `</>${exp('a')}`, ['a']],
  ['</ at the end is text', `${exp('a')}</`, ['a']],
  ['<! and <? are bogus comments ending at >', `<!x ${exp('no')}>${exp('a')}<? ${exp('no2')}>${exp('b')}`, ['a', 'b']],
  ['<![CDATA[ in HTML content is a bogus comment', `<![CDATA[ ${exp('no')} ]]>${exp('a')}`, ['a']],
  ['<plaintext> never ends', `${exp('a')}<plaintext>${exp('no')}`, ['a']],
  ['a <frameset> that replaces the body removes everything', `${exp('a', '<style>p{}</style>')}<frameset>${exp('b')}`, []],
  ['a <frameset> after text is ignored', `x${exp('a')}<frameset>${exp('b')}`, ['a', 'b']],
  ['end of input inside a tag drops the tag', `${exp('a')}<html-export name="b" `, ['a']],
  ['end of input inside a quoted value drops the tag', `${exp('a')}<html-export name="b`, ['a']],
  ['a script escape hides a nested </script>', `<html-export name="d"><script type="application/json">{"a":"<!--<script></script>-->"}</script></html-export>${exp('a')}`, ['d', 'a']],
  ['an end tag with a quoted > in an attribute', `<html-export name="s"><style>p{}</style x=">"></html-export>${exp('a')}`, ['s', 'a']],
  ['a template with no end runs to the end of the input', `<html-export name="a"><template><p>x`, ['a']],
  ['CRLF and CR are LF in styles, templates and data', `<html-export name="s"><style>a {\r\n  b: c;\r\n}\r</style></html-export><html-export name="t"><template><p>a\r\nb</p></template></html-export>`, ['s', 't']],
  ['NUL becomes U+FFFD in styles and attribute values', `<html-export name="s" data-x="a\0b"><style>a { content: "\0" }</style></html-export>`, ['s']],
  ['non-ASCII spaces do not end a tag name', `<html-export name="x">${exp('a')}`, ['a']],
  ['an unclosed <div> keeps </html-export> from closing the export', `<html-export name="a"><div><template><p>x</p></template></html-export><html-export name="b">`, 'nested'],
  ['unclosed <p> elements are closed by the next <p>', `<html-export name="a"><p>one<p>two</p><template><p>x</p></template></html-export>`, ['a']],
];

for (const [label, html, expected] of CASES) {
  test(`spec parser and scanner agree: ${label}`, () => {
    const a = viaSpec(html);
    const b = viaScan(html);
    assert.deepEqual(b, a, 'the scanner differs from the spec parser');
    if (expected === 'nested') assert.match(a.error, /is nested inside/);
    else assert.deepEqual(names(a), expected);
  });
}

test('CRLF/CR in the source never reach a record', () => {
  const r = scanHTMLModule('<html-export name="s"><style>a {\r\n b: c;\r}</style></html-export><html-export name="t"><template>a\r\nb</template></html-export>', 'm.html');
  assert.equal(r.exports[0].css, 'a {\n b: c;\n}');
  assert.equal(r.exports[1].template, 'a\nb');
});

test('NUL in raw text and attribute values is U+FFFD', () => {
  const r = scanHTMLModule('<html-export name="s" data-x="a\0b"><style>a\0b</style></html-export>', 'm.html');
  assert.equal(r.exports[0].css, 'a�b');
});

// ---------------------------------------------------------------------------
// A seeded fuzz over tag soup. The pieces are tokenizer edge cases and structure the scanner models;
// <select>, foreign content (<svg>), tables, formatting elements (<a>, <b>) and the other
// tree-construction machinery are deliberately not in it (see docs/api/html-syntax.md, "How modules are parsed").
// parse5 follows the parsing rules from before "customizable select", so <select> is left out too.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  '<html-export name="a">', '<html-export name="b" default>', '</html-export>', '<html-export name="c-d">', '<html-import src="./x.html" as="q">', '</html-import>',
  '<html-binding export="a">', '</html-binding>', '<html-import-settings delimiter="-">', '</html-import-settings>',
  '<template>', '</template>', '<template shadow="open">', '<style>', '</style>', '<style >', '</style x=">">', '<script type="application/json">', '<script>', '</script>', '</SCRIPT >',
  '<div>', '</div>', '<p>', '</p>', '<span>', '</span>', '<br>', '<br/>', '<img src=x>',
  '<!--', '-->', '--!>', '<!-->', '<!--->', '<!-- <script> -->', '<!--<script>', '--!', '<!', '<!DOCTYPE html>', '<![CDATA[', ']]>', '<?', '</', '</3', '</>', '<', '>', '/', '"', "'", '=', ' ', '\n', '\r\n', '\r', '\0',
  '<plaintext>', '<textarea>', '</textarea>', '<title>', '</title>', '<xmp>', '</xmp>', '<iframe>', '</iframe>', '<noembed>', '</noembed>', '<noframes>', '</noframes>', '<frameset>',
  '&amp;', '&#x110000;', '&eacute', '&notit;', 'x', '{"k": 1}', 'a{}', ' name="e"', ' src="./y.html"', ' as="z"', ' default', ' shadow="closed"',
];

function soup(random) {
  const length = 2 + Math.floor(random() * 16);
  let out = '';
  for (let k = 0; k < length; k++) out += PIECES[Math.floor(random() * PIECES.length)];
  return out;
}

test('fuzz: the scanner and a spec parser read random tag soup the same', () => {
  const random = rng(Number(process.env.FUZZ_SEED) || 0x5ca17);
  const failures = [];
  for (let k = 0; k < (Number(process.env.FUZZ_RUNS) || 4000); k++) {
    const html = soup(random);
    const a = viaSpec(html);
    const b = viaScan(html);
    try {
      assert.deepEqual(b, a);
    } catch {
      failures.push(html);
    }
  }
  assert.deepEqual(failures.slice(0, 5).map((h) => JSON.stringify(h)), [], `${failures.length} disagreements`);
});
