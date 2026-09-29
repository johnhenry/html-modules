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
  },
  moduleSettings?: { shadow?: 'open' | 'closed', delegatesFocus?: boolean },   // from <html-module-settings>
};

type ImportRecord = {
  src: string,                                   // as written
  as?: string, delimiter?: string, type?: string,
  conflict?: 'error' | 'reuse', load?: 'eager' | 'lazy', errors?: 'event' | 'throw',
  bindings: BindingRecord[],                     // always present, possibly []
};

type BindingRecord = { export: string, element?: string, adopt?: true };

type ExportRecord =
  | { kind: 'component', name: string | null, default?: true, template: string,
      shadow: 'open' | 'closed', delegatesFocus: boolean, styles: string[] }
  | { kind: 'stylesheet', name: string | null, default?: true, css: string }
  | { kind: 'data', name: string | null, default?: true, value: unknown }
  | { kind: 'reexport', src: string, name?: string, import?: string };
```

- Optional keys are present **only when written** in the source. An import's `delimiter`, `conflict`, `load` and
  `errors` stay unset when absent (the module's `importSettings`, then the built-in defaults, apply; see
  [`moduleImportOptions`](#moduleimportoptionsrecord-importrecord)). A page's settings and the instance options
  never reach a module.
- `name: null` with `default: true` is a default-only export; a string `name` with `default: true` is a named export
  that is also the default. At most one export has `default: true`. Re-exports have no `default`.
- `shadow` and `delegatesFocus` are always present on components: the export's attribute, else the module's
  `moduleSettings`, else the built-in default. `moduleSettings` is also kept on the record for reference.
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
    { "kind": "reexport", "src": "./forms.html", "name": "field", "import": "text-field" }
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
uses). It follows the HTML parsing rules that matter here: comments and `<!…>` / `<?…>` constructs are skipped;
raw-text elements (`script`, `style`, `textarea`, `title`, `xmp`, `iframe`, `noembed`, `noframes`) end only at
their own end tag; attribute names are lower-cased, values may be double-quoted, single-quoted or unquoted, the first
of duplicate attributes wins, and character references in values are decoded (numeric ones, and `&amp;` `&lt;`
`&gt;` `&quot;` `&apos;` `&nbsp;`); void elements have no content; self-closing syntax is ignored on normal
elements; `<template>` content is kept verbatim (nested templates included) and is not part of the document.

The test suite checks that the scanner and the DOM reader produce the same record for every example module and for
tricky source. Known differences: the scanner decodes only the named character references listed above. Both
readers record a nested `<html-export>` / `<html-import>` with its enclosing element (`nestedIn`), and
`recordFromRaw` rejects it (see [Placement and nesting rules](html-syntax.md#placement-and-nesting-rules)).

## `recordFromRaw(raw, url)`

```ts
recordFromRaw(raw: {
  imports: RawElement[], exports: RawElement[], importSettings?: RawElement[], moduleSettings?: RawElement[],
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

Checks, in order: settings count and placement; `<html-import-settings>` and `<html-module-settings>` attributes;
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
