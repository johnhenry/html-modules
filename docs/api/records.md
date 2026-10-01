# Module records and settings

[API reference](../api.md) › Module records and settings

A **module record** is the static description of an HTML module: what it imports, what it exports, and its
settings. It is plain JSON, and it is produced the same way whether the source was parsed by a DOM
(`readHTMLModule`, used by the browser loader) or scanned as text (`scanHTMLModule`, used by the compiler, which
needs no DOM). The loader links a record into a namespace; the compiler turns a record into JavaScript. Every
validation rule of the [HTML syntax](html-syntax.md) is applied while building the record, so both paths reject the
same modules with the same messages.

- [The module record](#the-module-record)
- [`readHTMLModule(doc, url)`](#readhtmlmoduledoc-url), [`scanHTMLModule(source, url)`](#scanhtmlmodulesource-url),
  [`recordFromRaw(raw, url)`](#recordfromrawraw-url), [`moduleImportOptions(record, importRecord)`](#moduleimportoptionsrecord-importrecord)
- Settings: [`IMPORT_DEFAULTS`, `EXPORT_DEFAULTS`](#import_defaults-export_defaults),
  [`readImportSettings`](#readimportsettingsattrs-where), [`readModuleSettings`](#readmodulesettingsattrs-where),
  [`readImportOptions`](#readimportoptionsattrs-where), [`resolveImportOptions`](#resolveimportoptionslayers)

## The module record

```ts
type ModuleRecord = {
  url: string,                                   // as passed ("" when none)
  imports: ImportRecord[],                       // document order
  exports: ExportRecord[],                       // document order
  importSettings?: {                             // present when the module has an <html-import-settings>
    delimiter?: string, base?: string, conflict?: 'error' | 'reuse', load?: 'eager' | 'lazy', errors?: 'event' | 'throw',
    registry?: 'global' | 'scoped',      // modules only
  },
  moduleSettings?: { shadow?: 'open' | 'closed', delegatesFocus?: boolean },   // from <html-module-settings>
};

type ImportRecord = {
  src: string,                                   // as written
  as?: string, delimiter?: string, type?: string,
  conflict?: 'error' | 'reuse', load?: 'eager' | 'lazy', errors?: 'event' | 'throw', registry?: 'global' | 'scoped',
  bindings: BindingRecord[],                     // always present, possibly []
};

type BindingRecord = { export: string, element?: string, adopt?: true };

type ExportRecord =
  | { kind: 'component', name: string | null, default?: true, template: string,
      shadow: 'open' | 'closed', delegatesFocus: boolean, styles: string[],
      props?: Array<{ name: string, type: 'string' | 'number' | 'boolean' },
      formAssociated?: true, formControl?: string, formRole?: 'submit' | 'reset' }
  | { kind: 'stylesheet', name: string | null, default?: true, css: string }
  | { kind: 'data', name: string | null, default?: true, value: unknown }
  | { kind: 'reexport', src: string, type?: string, integrity?: string, name?: string | null, default?: true, import?: string };
```

- Optional keys are present **only when written** in the source. An import's `delimiter`, `conflict`, `load` and
  `errors` stay unset when absent (the module's `importSettings`, then the built-in defaults, apply; see
  [`moduleImportOptions`](#moduleimportoptionsrecord-importrecord)). A page's settings and the instance options
  never reach a module.
- `name: null` with `default: true` is a default-only export; a string `name` with `default: true` is a named export
  that is also the default. At most one export has `default: true`, and it may be a re-export.
- A re-export **without a `name` key** is a star re-export (`export * from`); `import: "*"` is a namespace re-export
  (`export * as <name> from`); otherwise `import` (when present) is the source export's name. A `names="…"` list is
  expanded into one record per entry, so records never carry `names`.
- `props` is present only when the export wrote `props="…"`, in the order written, each with its `type` (default `"string"`). It is the binding metadata of a record: the `{{attribute}}` sites themselves are found in the parsed template when the component is registered (see [Data binding](html-syntax.md#data-binding-in-templates)), identically for runtime-loaded and compiled modules.
- `formAssociated: true` is present only when the export wrote `form-associated` (not `form-associated="false"`), `formControl` only when it also wrote `form-control="…"`, and `formRole` only when it also wrote `form-role="submit"` or `"reset"`. See [Form-associated components](html-syntax.md#form-associated-components).
- `shadow` and `delegatesFocus` are always present on components: the export's attribute, else the module's
  `moduleSettings`, else the built-in default (`delegatesFocus` is `true` for a component with a `form-control`, `false` otherwise). `moduleSettings` is also kept on the record for reference.
- `template` is the `<template>`'s content HTML (verbatim from the scanner; serialized by the DOM reader, so
  whitespace and attribute quoting may differ, never the structure). `styles` are the `<style>` texts; a stylesheet's
  `css` is its `<style>` texts joined with `\n`.

A full example: this module

```html
<html-import-settings base="./vendor/" conflict="reuse"></html-import-settings>
<html-module-settings delegates-focus></html-module-settings>
<html-import src="./icons.html" as="icon" delimiter="-"></html-import>
<html-import src="./themes.html"><html-binding export="gold" adopt></html-binding></html-import>
<html-export name="price-tag" default>
  <style>:host { display: inline-block }</style>
  <template><icon-star></icon-star> <slot></slot></template>
</html-export>
<html-export name="sale" shadow="closed" delegates-focus="false"><template><b>Sale</b></template></html-export>
<html-export name="dark"><style>:host { color: white }</style></html-export>
<html-export name="config"><script type="application/json">{ "currency": "EUR" }</script></html-export>
<html-export src="./buttons.html"></html-export>
<html-export src="./forms.html" name="field" import="text-field"></html-export>
```

reads (with `url: 'shop.html'`) into:

```json
{
  "url": "shop.html",
  "imports": [
    { "src": "./icons.html", "as": "icon", "delimiter": "-", "bindings": [] },
    { "src": "./themes.html", "bindings": [{ "export": "gold", "adopt": true }] }
  ],
  "exports": [
    { "kind": "component", "name": "price-tag", "default": true, "template": "<icon-star></icon-star> <slot></slot>",
      "shadow": "open", "delegatesFocus": true, "styles": [":host { display: inline-block }"] },
    { "kind": "component", "name": "sale", "template": "<b>Sale</b>", "shadow": "closed", "delegatesFocus": false, "styles": [] },
    { "kind": "stylesheet", "name": "dark", "css": ":host { color: white }" },
    { "kind": "data", "name": "config", "value": { "currency": "EUR" } },
    { "kind": "reexport", "src": "./buttons.html" },
    { "kind": "reexport", "src": "./forms.html", "name": "field", "import": "text-field" },
    { "kind": "reexport", "src": "./icons.html", "name": "icon", "import": "*" }
  ],
  "importSettings": { "base": "./vendor/", "conflict": "reuse" },
  "moduleSettings": { "delegatesFocus": true }
}
```

The same module's compiled output is shown on the [Compiler](compiler.md#full-example) page.

## `readHTMLModule(doc, url)`

```ts
readHTMLModule(doc: Document, url?: string /* = "" */): ModuleRecord
```

Read a parsed HTML module document (from `DOMParser`, or any DOM) into a record. Collects every `<html-import>`,
`<html-export>`, `<html-import-settings>` and `<html-module-settings>` in document order (`querySelectorAll`, which
does not enter `<template>` content), then validates and builds the record with
[`recordFromRaw`](#recordfromrawraw-url). Throws `SyntaxError` for any invalid module; messages end with ` in <url>`
when a URL is given.

## `scanHTMLModule(source, url)`

```ts
scanHTMLModule(source: string, url?: string /* = "" */): ModuleRecord
```

Read HTML **source text** into the same record, with a small dependency-free scanner (this is what the compiler
uses). It follows the HTML tokenizer where it matters here:

- The input is preprocessed as a browser does: CRLF and lone CR become LF, so a Windows-edited file records the same
  CSS and template text as it does at runtime; NUL becomes U+FFFD in `<style>` / `<script>` text and attribute values.
- Comments end at `-->` or `--!>`, and `<!-->` and `<!--->` are complete (empty) comments. `<!…>`, `<?…>` and
  `<![CDATA[…>` are bogus comments that end at the first `>`; `</` followed by anything but a letter is too (`</>`
  vanishes, and `</` at the very end is text).
- Raw-text elements (`script`, `style`, `textarea`, `title`, `xmp`, `iframe`, `noembed`, `noframes`) end only at
  their own end tag, which may carry attributes (a `>` inside a quoted value does not end it). `<script>` follows the
  script-data escape states (`<!--` … `<script>` … `</script>` … `-->`), and `<plaintext>` never ends.
- A tag the source ends inside (an unterminated `<html-export name="a"` or an unclosed quote) is dropped, and a
  `<template>` that is never closed runs to the end of the source, as in a browser.
- Attribute names are ASCII-lower-cased; values may be double-quoted, single-quoted or unquoted; the first of
  duplicate attributes wins; character references in values are decoded (see
  [Character references](#character-references)).
- Void elements have no content; self-closing syntax is ignored on normal elements; `<template>` content is kept
  verbatim (nested templates included) and is not part of the document.
- Enough tree construction to know which elements are *direct children* of an `<html-export>`: `<p>` closes an open
  `<p>`, an end tag for a non-"special" element does not close past a special one (an unclosed `<div>` keeps
  `</html-export>` from closing the export, as in a browser), `<html>`/`<head>`/`<body>` tags are ignored, and a
  `<frameset>` that replaces the body (nothing but neutral content before it) leaves the module empty.

The test suite checks that the scanner and a **spec parser** (parse5, reading through the same
[`readHTMLModule`](#readhtmlmoduledoc-url)) produce the same record for every example module, for a table of tokenizer
edge cases, and for 4,000 seeded random tag-soup documents (`test/scan-spec.test.js`). Not modelled, so the two can
disagree: foreign content (`<svg>` / `<math>`, whose `<style>` and `<script>` are not raw text there and whose
self-closing tags are honoured), tables and other foster parenting, formatting elements and the adoption agency
(`<a>`, `<b>`, …), and `<li>`/`<dd>`/`<option>`-style implied end tags. Put an export's children directly inside it, as
every example does, and none of this matters. The same goes for `<select>`: a current browser parses an
`<html-export>` inside a `<select>` (customizable select), as the scanner does; older parsers drop it. Both readers
record a nested `<html-export>` / `<html-import>` with its nearest enclosing export or import (`nestedIn`), and
`recordFromRaw` rejects it (see [Placement and nesting rules](html-syntax.md#placement-and-nesting-rules)).

### Character references

Attribute values are decoded exactly as the tokenizer does it, with the **full WHATWG named table** (2,125 names,
vendored as `src/entities.js`, generated by `scripts/generate-entities.js`; it is loaded by the scanner and the
compiler, never by the browser runtime). Numeric references follow the spec's replacements: `&#0;`, anything above
U+10FFFF and the surrogates become U+FFFD (never a `RangeError`), and `&#128;`–`&#159;` become the Windows-1252
characters. Legacy names work without the `;` (`&copy`, `&amp`), but in an attribute value a legacy reference that is
followed by `=` or a letter or digit is left as written, so `?a=1&copy=2` and `&notit;` survive. A name the table does
not know stays as written. Template, `<style>` and `<script>` text is not decoded here: it is kept verbatim.

## `recordFromRaw(raw, url)`

```ts
recordFromRaw(raw: {
  imports: RawElement[], exports: RawElement[], importSettings?: RawElement[], moduleSettings?: RawElement[],
  bindings?: Array<{ tag: 'html-binding', order?: number, attrs, parent: { tag: string, attrs } | null }>,
}, url?: string): ModuleRecord

type RawElement = {
  tag: string, order?: number, attrs: Record<string, string>,
  children: Array<{ tag: string, attrs: Record<string, string>, html?: string, text?: string }>,
};
```

The shared back end of both readers: validate "raw elements" and build the record. `order` is the element's
position among all collected elements, used for the placement rules (a settings element must precede every import
or export). A child's `html` is a `<template>`'s content; `text` is any other child's text content. Useful for
writing another front end (an HTML parser of your choice, a build tool's AST).

`bindings` lists **every** `<html-binding>` of the document (outside templates) with its nearest enclosing element, so one that
is not a direct child of an `<html-import>` (typically swallowed by a self-closed `<html-binding />`) is rejected. A
raw `<html-import>`'s `children` must hold only `<html-binding>`s. Both readers fill these in.

Checks, in order: nesting; misplaced bindings; settings count and placement; `<html-import-settings>` and `<html-module-settings>` attributes;
each import (`src`, namespace, per-import options, bindings); lazy imports that `adopt`; each export (name, default,
kind, attributes, JSON); duplicate names; more than one default.

## `moduleImportOptions(record, importRecord)`

```ts
moduleImportOptions(record: ModuleRecord, i: ImportRecord): { delimiter?, conflict?, load?, errors? }
```

The options one of a module's own imports is bound with: its own attributes, then the module's
`<html-import-settings>`. Only values that were written are returned; anything absent is the built-in default,
because a page's options never reach a module. The loader and the compiler both use it (the compiler writes the
result into each `$imports` entry).

## Settings vocabulary

### `IMPORT_DEFAULTS`, `EXPORT_DEFAULTS`

```js
IMPORT_DEFAULTS  // Object.freeze({ delimiter: '--', conflict: 'error', load: 'eager', errors: 'event' })
EXPORT_DEFAULTS  // Object.freeze({ shadow: 'open', delegatesFocus: false })
```

The built-in defaults: the last layer of import-option precedence, and the defaults of component exports.

### `readImportSettings(attrs, where)`

```ts
readImportSettings(attrs: Record<string, string>, where?: string): { delimiter?, base?, conflict?, load?, errors? }
```

Validate the attributes of an `<html-import-settings>` (as a plain object) and return the options it sets, only
those written. Allowed: `delimiter`, `base`, `conflict`, `load`, `errors`, plus `id`, `class`, `data-*`. Throws
`SyntaxError: Unknown attribute "<x>" on <html-import-settings><where>: use "delimiter", "base", "conflict", "load",
"errors"`, `Invalid <option>="<value>" on <html-import-settings><where>: use "…" or "…"`, `Invalid delimiter …`, or
`Invalid base … : use a URL, relative to the document, e.g. "./vendor/ui@2/"` (for a blank `base`). `where` is
appended to messages (e.g. `" in ui.html"`).

### `readModuleSettings(attrs, where)`

```ts
readModuleSettings(attrs: Record<string, string>, where?: string): { shadow?, delegatesFocus? }
```

Validate the attributes of an `<html-module-settings>` and return the export defaults it sets. Allowed: `shadow`,
`delegates-focus`, plus `id`, `class`, `data-*`. `delegates-focus` is a [boolean attribute](html-syntax.md#boolean-attributes).

### `readImportOptions(attrs, where)`

```ts
readImportOptions(attrs: Record<string, string>, where?: string): { delimiter?, conflict?, load?, errors? }
```

The per-import options written on one `<html-import>` (its attributes as a plain object), validated. Other
attributes are ignored, except `base`, which throws `SyntaxError: "base" cannot be set on <html-import><where>: it
is document-level only; use <html-import-settings base="…">, or write the full path in src`.

### `resolveImportOptions(...layers)`

```ts
resolveImportOptions(...layers: Array<{ delimiter?, conflict?, load?, errors? } | null | undefined>):
  { delimiter: string, conflict: 'error' | 'reuse', load: 'eager' | 'lazy', errors: 'event' | 'throw' }
```

Merge option layers, most specific first: for each option, the first layer with a defined value wins, else
`IMPORT_DEFAULTS`. Does not validate and does not handle `base`.

```js
resolveImportOptions({ load: 'lazy' }, { delimiter: '-', load: 'eager' }, null);
// → { delimiter: '-', conflict: 'error', load: 'lazy', errors: 'event' }
```
