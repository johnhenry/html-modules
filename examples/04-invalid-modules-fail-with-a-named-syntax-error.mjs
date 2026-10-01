// Mistakes in an HTML module are SyntaxErrors that name the element, the rule
// and the module, and they fail the same way whether the module is scanned
// (compiler), read from a DOM (browser loader) or compiled. Nothing is
// silently ignored. This example feeds each broken module to all three.
//
//   node examples/04-invalid-modules-fail-with-a-named-syntax-error.mjs
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { scanHTMLModule, readHTMLModule, compileHTMLModule } from '@johnhenry/html-modules';

const T = '<template>x</template>';
const cases = [
  // Exports
  [`<html-export name="card"></html-export>`, /<html-export name="card"> needs a <template> \(a component\), <style> \(a stylesheet\) or <script type="application\/json"> \(data\) in m\.html/],
  [`<html-export>${T}</html-export>`, /<html-export> requires a "name" attribute: name="card", or name="default" for the default export \(or "src" for a re-export\) in m\.html/],
  [`<html-export name="FancyCard">${T}</html-export>`, /Invalid export name "FancyCard" in m\.html: use lower-case words joined by single hyphens/],
  [`<html-export name="components">${T}</html-export>`, /"components" is reserved and cannot be used as an export name/],
  [`<html-export name="card">${T}</html-export><html-export name="card">${T}</html-export>`, /Duplicate export "card" in m\.html/],
  [`<html-export name="card">${T}${T}</html-export>`, /has 2 <template> elements; an export has one/],
  [`<html-export name="card" shadow="none">${T}</html-export>`, /shadow="none" must be "open" or "closed"/],
  [`<html-export name="card" delegates-focus="maybe">${T}</html-export>`, /Invalid delegates-focus="maybe".*it is a boolean attribute/],
  [`<html-export name="theme" shadow="closed"><style>p{}</style></html-export>`, /"shadow" only applies to an export with a <template>/],
  [`<html-export name="theme"><style>@import url("x.css");</style></html-export>`, /<html-export name="theme">: @import is not supported in a <style>: a constructed stylesheet ignores @import rules.* in m\.html/],
  [`<html-export name="cfg"><script type="application/json">{nope}</script></html-export>`, /<html-export name="cfg">: invalid JSON in m\.html/],
  // Props (data binding)
  [`<html-export name="card" props="">${T}</html-export>`, /<html-export name="card">: props="" declares no props; write props="title count:number open:boolean" in m\.html/],
  [`<html-export name="card" props="Title">${T}</html-export>`, /"Title" in props is not "<name>" or "<name>:<type>"; a name is a lower-case attribute name/],
  [`<html-export name="card" props="count:int">${T}</html-export>`, /props type "int" for "count" must be "string", "number", "boolean" or omitted in m\.html/],
  [`<html-export name="card" props="a a">${T}</html-export>`, /prop "a" is declared twice in m\.html/],
  [`<html-export name="card" props="onclick">${T}</html-export>`, /"onclick" cannot be a prop: bindings never write on\* attributes in m\.html/],
  [`<html-export name="theme" props="a"><style>p{}</style></html-export>`, /"props" only applies to an export with a <template> in m\.html/],
  // Form association
  [`<html-export name="f" form-associated="maybe">${T}</html-export>`, /Invalid form-associated="maybe" on <html-export name="f"> in m\.html: it is a boolean attribute/],
  [`<html-export name="f" form-control="input">${T}</html-export>`, /form-control="input" needs form-associated: the component must take part in forms/],
  [`<html-export name="f" form-associated form-control="">${T}</html-export>`, /form-control="" is empty; write a selector for the control inside the template/],
  [`<html-export name="f" form-associated props="value">${T}</html-export>`, /"value" cannot be a prop of a form-associated component: it is a built-in property \(name, value/],
  [`<html-export name="f" form-associated><style>p{}</style></html-export>`, /"form-associated" only applies to an export with a <template> in m\.html/],
  // Defaults
  [`<html-export default>${T}</html-export>`, /"default" needs a name to go with it; write name="default" for a default-only export/],
  [`<html-export name="default" default>${T}</html-export>`, /name="default" is already the default export; drop the "default" attribute/],
  [`<html-export name="a" default>${T}</html-export><html-export name="default">${T}</html-export>`, /More than one default export: <html-export name="a" default> and <html-export name="default">/],
  [`<html-export src="./b.html" default></html-export>`, /a star re-export \(src without a name\) is never the default; write name="default" to re-export the source's default/],
  [`<html-export src="./b.html" import="x"></html-export>`, /import="x" needs a name="…" to export it as/],
  [`<html-export src="./b.html" names=""></html-export>`, /names="" lists no exports/],
  [`<html-export src="./b.html" names="a b"></html-export>`, /"a b" in names is not "<export>" or "<export> as <name>"/],
  [`<html-export src="./b.html" names="* as icon"></html-export>`, /"\*" cannot appear in names; write name="icon" import="\*" for a namespace re-export/],
  [`<html-export src="./b.html" names="a" name="b"></html-export>`, /"names" lists every re-exported name; it cannot be combined with "name"/],
  [`<html-export name="a" type="html">${T}</html-export>`, /<html-export name="a">: "type" only applies to a re-export \(an <html-export> with "src"\) in m\.html/],
  [`<html-export name="a" import="b">${T}</html-export>`, /"import" only applies to a re-export \(an <html-export> with "src"\)/],
  // Imports
  [`<html-import as="ui"></html-import>`, /<html-import> requires a "src" attribute in m\.html/],
  [`<html-import src="./ui.html" as="UI"></html-import>`, /Invalid namespace "UI"/],
  [`<html-import src="./ui.html" base="./lib/"></html-import>`, /"base" cannot be set on <html-import> in m\.html: it is document-level only/],
  [`<html-import src="./ui.html" load="soon"></html-import>`, /Invalid load="soon" on <html-import> in m\.html: use "eager" or "lazy"/],
  [`<html-import src="./ui.html" integrity="md5-abc"></html-import>`, /Invalid integrity "md5-abc" on <html-import src="\.\/ui\.html"> in m\.html: use Subresource Integrity metadata/],
  [`<html-import src="./ui.html"><html-binding element="x-y"></html-binding></html-import>`, /<html-binding> requires an "export" attribute/],
  [`<html-import src="./t.html" load="lazy"><html-binding export="gold" adopt></html-binding></html-import>`, /is lazy but adopts a stylesheet in m\.html/],
  [`<html-import src="./a.html" load="lazy"></html-import>`, /<html-import src="\.\/a\.html"> is lazy but has no tag to wait for in m\.html: it would never load/],
  [`<html-import src="./a.html" as="a"><html-binding export="x"/><html-binding export="y"/></html-import>`, /<html-binding export="y"> is nested inside <html-binding export="x"> in m\.html: an <html-binding> must be a direct child of <html-import>\..*"\/>" does not close an element in HTML/],
  [`<html-binding export="x"></html-binding>`, /<html-binding export="x"> is not a direct child of <html-import> in m\.html: it is outside any <html-import>/],
  [`<html-import src="./a.html"><div></div></html-import>`, /<html-import src="\.\/a\.html"> has a <div> child in m\.html: only <html-binding> elements may be children of <html-import>/],
  // Settings
  [`<html-import src="./a.html"></html-import><html-import-settings delimiter="-"></html-import-settings>`, /<html-import-settings> must come before any <html-import> in m\.html/],
  [`<html-import-settings></html-import-settings><html-import-settings></html-import-settings>`, /More than one <html-import-settings> in m\.html: a module has at most one/],
  [`<html-import-settings shadow="open"></html-import-settings>`, /Unknown attribute "shadow" on <html-import-settings> in m\.html: use "delimiter", "base", "conflict", "load", "errors"/],
  [`<html-module-settings shadow="none"></html-module-settings>`, /Invalid shadow="none" on <html-module-settings> in m\.html: use "open" or "closed"/],
  [`<html-export name="a">${T}</html-export><html-module-settings shadow="closed"></html-module-settings>`, /<html-module-settings> must come before any <html-export> in m\.html/],
];

const viaDOM = (html) => readHTMLModule(parseHTML(`<!doctype html><html><body>${html}</body></html>`).document, 'm.html');
for (const [html, message] of cases) {
  for (const read of [(h) => scanHTMLModule(h, 'm.html'), viaDOM, (h) => compileHTMLModule(h, { url: 'm.html' })]) {
    assert.throws(() => read(html), (e) => e instanceof SyntaxError && message.test(e.message), `${html}\n  expected ${message}`);
  }
}

// Templates are not part of the document: an <html-export> inside one is not an export.
assert.deepEqual(scanHTMLModule(`<template><html-export name="x">${T}</html-export></template>`).exports, []);

console.log(`ok: ${cases.length} broken modules fail with the documented SyntaxError through the scanner, the DOM reader and the compiler`);
