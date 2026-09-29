# Compiler and CLI

[API reference](../api.md) › Compiler and CLI

Browsers cannot `import` an `.html` file, and this library does not try to make them (no service worker, no custom
loader). Instead, an **optional** compiler turns an HTML module into an ordinary ES module. The output imports only
the runtime, exports the same definitions the runtime loader would build, and **registers nothing** on import
(unless you ask for the `register` format). Runtime-loaded and compiled modules render identically; the test suite
and the compiler example page check this.

- [`compileHTMLModule(source, options)`](#compilehtmlmodulesource-options)
- [`compileRecord(record, options)`](#compilerecordrecord-options)
- [`rewriteSpecifier(src)`](#rewritespecifiersrc), [`rebaseSpecifier(src, base)`](#rebasespecifiersrc-base)
- [Output formats](#output-formats) and a [full example](#full-example)
- [The `html-module` CLI](#the-html-module-cli)

## `compileHTMLModule(source, options)`

```ts
compileHTMLModule(source: string, options?: {
  url?: string,                                  // = "module.html": the module's URL or file name (messages, header)
  runtime?: string,                              // = "@johnhenry/html-modules/runtime"
  format?: 'esm' | 'register',                   // = "esm"
  as?: string,                                   // register: namespace to register under (default: the export names)
  delimiter?: string,                            // register: namespace delimiter, = "--"
  conflict?: 'error' | 'reuse',                  // register: for tags already defined by something else, = "error"
  rewrite?: (src: string) => string,             // dependency specifier rewrite, = rewriteSpecifier (".html" → ".js")
  parse?: (html: string, url: string) => Document,   // use a DOM parser instead of the built-in scanner
}): string
```

Compile HTML module source to JavaScript module source. Reads the source into a [module record](records.md) with
[`scanHTMLModule`](records.md#scanhtmlmodulesource-url) (no DOM, no dependencies), or with `readHTMLModule(parse(source,
url))` when `parse` is given (both give the same output; a test checks it), then calls
[`compileRecord`](#compilerecordrecord-options).

| Option | Default | Meaning |
| --- | --- | --- |
| `url` | `"module.html"` | Appears in error messages (`… in ui.html`) and, as a base name, in the header comment. |
| `runtime` | `"@johnhenry/html-modules/runtime"` | The specifier the output imports the runtime from. The default resolves wherever the package is installed (Node, bundlers, or a browser import map that maps it). Point it elsewhere for a vendored copy: `"./vendor/html-modules/runtime.js"`. Use **one** copy of the runtime per page (see the README's limitations). |
| `format` | `"esm"` | `esm`: definitions only. `register`: also registers every component when the module is imported. |
| `as` | none | `register` only: register as `<as><delimiter><export>`. Without it, components register under their export names, which then must be valid custom element names. Validated in every format. |
| `delimiter` | `"--"` | `register` with `as` only. Validated in every format. |
| `conflict` | `"error"` | `register` only: `reuse` keeps tags that are already defined by a different definition. |
| `rewrite` | `rewriteSpecifier` | Maps each dependency specifier (after `base` rebasing) to the specifier the output imports. |
| `parse` | none | A DOM parser, to use the DOM reader instead of the scanner. |

Throws: every module `SyntaxError` (see [Errors](errors.md)); `TypeError: Unknown format "…": use "esm" or
"register"`; `SyntaxError` for an invalid `as`, `delimiter` or `conflict`; and, for `register` with `as`, the
`bindingName` `SyntaxError` for a tag a component would get (checked at compile time, not on import):
`<ui.star> is not a valid custom element name (it has no hyphen)`.

## `compileRecord(record, options)`

```ts
compileRecord(record: ModuleRecord, options?: { runtime?, format?, as?, delimiter?, conflict?, rewrite? }): string
```

Generate the ES module from a record (for example one you built with [`recordFromRaw`](records.md#recordfromrawraw-url)).
Options as above.

## `rewriteSpecifier(src)`

```ts
rewriteSpecifier(src: string): string
```

The default `rewrite`: replace a trailing `.html` / `.htm` (case-insensitive, before any `?` or `#`) with `.js`; leave
everything else alone.

```js
rewriteSpecifier('./a.html');        // "./a.js"
rewriteSpecifier('./a.HTM?x=1#y');   // "./a.js?x=1#y"
rewriteSpecifier('@ui/a.htm');       // "@ui/a.js"
rewriteSpecifier('./widgets.js');    // "./widgets.js"
```

Pass your own to target another extension (`(s) => s.replace(/\.html$/, '.mjs')`) or a different layout.

## `rebaseSpecifier(src, base)`

```ts
rebaseSpecifier(src: string, base?: string): string
```

Apply a module's `<html-import-settings base>` to one of its dependency specifiers, keeping it **relative** where it
can, exactly as the runtime would resolve it. Only relative specifiers (`./`, `../`, `/`) change; bare and absolute
ones are left alone, as the runtime leaves them.

```js
rebaseSpecifier('./card.html', './vendor/ui@1/');        // "./vendor/ui@1/card.html"
rebaseSpecifier('./card.html', '../lib/');               // "../lib/card.html"
rebaseSpecifier('../x.html', './a/b/');                  // "./a/x.html"
rebaseSpecifier('./x.html', '/root/');                   // "/root/x.html"
rebaseSpecifier('./x.html', 'https://cdn.test/ui/');     // "https://cdn.test/ui/x.html"
rebaseSpecifier('./x.html?v=1#f', './v/');               // "./v/x.html?v=1#f"
rebaseSpecifier('@acme/ui.html', './v/');                // "@acme/ui.html"
rebaseSpecifier('./x.html');                             // "./x.html" (no base)
```

## Output formats

Both formats produce, in order:

1. A header: `// Compiled from <basename> by html-module. Do not edit; recompile instead.`
2. `import { <helpers> } from "<runtime>";`: only the helpers used, sorted (`defineHTMLComponent`,
   `defineHTMLStylesheet`, `lookupExport`, `manifest`, `registerComponents`).
3. One `import * as $m<n> from "<specifier>";` per dependency (each `<html-import src>` and `<html-export src>`,
   once per distinct `src`), with the specifier rebased by the module's `base` and rewritten (`.html` → `.js`).
   **Compile the dependencies too.**
4. `export * from "<specifier>";` per star re-export.
5. `const $imports = [ … ];` when the module has imports: one entry per `<html-import>`, `{ module, from, as?,
   <options>, bindings }`, where `<options>` are the [`moduleImportOptions`](records.md#moduleimportoptionsrecord-importrecord)
   (the import's attributes, then the module's `<html-import-settings>`: `delimiter`, `conflict`, `load`, `errors`).
   Every component definition of the module gets this same array as its `imports`.
6. One `const` per export: `$x_<camelName>` (or `$default` for a default-only export):
   - component → `defineHTMLComponent({ name, template, shadow, delegatesFocus, styles, imports, url: import.meta.url })`,
     with `<html-module-settings>` defaults already baked in;
   - stylesheet → `defineHTMLStylesheet({ name, css, url: import.meta.url })`;
   - data → the JSON value as a literal;
   - named re-export → `lookupExport($m<n>, "<import or name>", "<src>")`.
7. `const $components = manifest({ <components and named re-exports> }, [<[star namespace, src] pairs>]);`
8. `register` only: `registerComponents({ components: $components }, { as?, delimiter? (only with as and when not
   "--"), conflict? (only when "reuse"), from: import.meta.url });`
9. `export { $x_… as <camelName>, …, $components as components };` and `export default …;` when the module has a
   default.

Notes:

- **Nothing registers on import** in the `esm` format. Register with `ns.card.define('my-card')`, `bindModule(ns,
  { as })`, or declaratively: `<html-import src="./ui.js" as="ui">` reads the compiled module's `components`
  manifest like any JS module.
- **Default exports** compile to `export default`: `<html-export name="default">` → `export default $default;`,
  and `name="card" default` → `export default $x_card;` next to the named export.
- **Lazy loading does not compile**: dependencies are static imports, so registration is always eager. `load` is
  carried in `$imports` for fidelity only.
- `errors` is carried into `$imports` (a failing dependency binding is reported under `errors: 'throw'`). For the
  `register` format's own registrations it does not apply: a failing registration already throws while the module
  evaluates.
- Reserved words are fine as export names (`<html-export name="class">` → `$x_class as class`).
- The output depends only on the record and options: compile in Node, in a dev server, or in the browser.

### Full example

`shop.html`:

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

`html-module shop.html --stdout` (the `esm` format) prints, verbatim:

```js
// Compiled from shop.html by html-module. Do not edit; recompile instead.
import { defineHTMLComponent, defineHTMLStylesheet, lookupExport, manifest } from "@johnhenry/html-modules/runtime";
import * as $m0 from "./vendor/icons.js";
import * as $m1 from "./vendor/themes.js";
import * as $m2 from "./vendor/buttons.js";
import * as $m3 from "./vendor/forms.js";
export * from "./vendor/buttons.js";

const $imports = [
  { module: $m0, from: "./icons.html", as: "icon", delimiter: "-", conflict: "reuse", bindings: [] },
  { module: $m1, from: "./themes.html", conflict: "reuse", bindings: [{"export":"gold","adopt":true}] },
];
const $x_priceTag = defineHTMLComponent({
  name: "price-tag",
  template: "<icon-star></icon-star> <slot></slot>",
  shadow: "open",
  delegatesFocus: true,
  styles: [":host { display: inline-block }"],
  imports: $imports,
  url: import.meta.url,
});
const $x_sale = defineHTMLComponent({
  name: "sale",
  template: "<b>Sale</b>",
  shadow: "closed",
  delegatesFocus: false,
  styles: [],
  imports: $imports,
  url: import.meta.url,
});
const $x_dark = defineHTMLStylesheet({ name: "dark", css: ":host { color: white }", url: import.meta.url });
const $x_config = {"currency":"EUR"};
const $x_field = lookupExport($m3, "text-field", "./forms.html");
const $components = manifest({
  "price-tag": $x_priceTag,
  "sale": $x_sale,
  "field": $x_field,
}, [[$m2, "./buttons.html"]]);

export {
  $x_priceTag as priceTag,
  $x_sale as sale,
  $x_dark as dark,
  $x_config as config,
  $x_field as field,
  $components as components,
};
export default $x_priceTag;
```

Things to notice: `base="./vendor/"` rebased every dependency; `from` keeps the specifier as written (for
messages); the module's `conflict="reuse"` reached both `$imports` entries; `delegates-focus` from
`<html-module-settings>` is baked into `price-tag`, and `sale` turned it off.

With `--format register --as shop --delimiter - --conflict reuse`, the same output gains `registerComponents` in the
helper import and, after the manifest, this line (so importing the file registers `<shop-price-tag>`,
`<shop-sale>`, the re-exported `<shop-field>` and every component of `buttons.js`):

```js
registerComponents({ components: $components }, { as: "shop", delimiter: "-", conflict: "reuse", from: import.meta.url });
```

The repo's own compiled examples are in [`examples/compiled/`](../../examples/compiled/) (generated by `npm run
examples:compile`, with `runtime: '../../src/runtime.js'`).

## The `html-module` CLI

Installed as the `html-module` bin of `@johnhenry/html-modules`.

```sh
npm install --save-dev @johnhenry/html-modules
npx html-module ui.html                                  # → ui.js
npx html-module ui.html -o dist/ui.js
npx html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
npx html-module ui.html --format register --as ui        # → ui.register.js, registers <ui--…> on import
npx html-module ui.html --format register --as ui --delimiter -       # registers <ui-…>
npx html-module ui.html --format register --as ui --conflict reuse    # keeps tags that are already defined
npx html-module ui.html --stdout

# without installing it first, name the package (a bare `npx html-module` would look for a package called html-module):
npx -p @johnhenry/html-modules html-module ui.html
```

```
Usage: html-module <input.html...> [options]

Options:
  -o, --out <file>        output file (one input only; default: input with .js)
  -f, --format <format>   esm (default: definitions only) or register (also registers on import)
      --as <namespace>    register format: register as <namespace>--<export>
      --delimiter <d>     register format: the namespace delimiter (default: --), e.g. - for <namespace>-<export>
      --conflict <mode>   register format: error (default) or reuse, for tags that are already defined
      --runtime <spec>    where the output imports the runtime from (default: @johnhenry/html-modules/runtime)
      --stdout            print instead of writing files
  -h, --help
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `<input.html...>` | (required) | One or more HTML module files. Each is compiled with `url` set to the path as given. |
| `-o`, `--out <file>` | the input path with `.html`/`.htm` replaced by `.js` (`esm`) or `.register.js` (`register`) | Output file. Only with a single input. Missing directories are created. |
| `-f`, `--format <format>` | `esm` | `esm` or `register`. |
| `--as <namespace>` | none | `register`: the namespace. |
| `--delimiter <d>` | `--` | `register`: the namespace delimiter. |
| `--conflict <mode>` | `error` | `register`: `error` or `reuse`. |
| `--runtime <spec>` | `@johnhenry/html-modules/runtime` | The runtime specifier written into the output. |
| `--stdout` | off | Print every compiled module to stdout instead of writing files. |
| `-h`, `--help` | | Print the usage and exit 0. |

On success, each written file is reported as `<input> → <output>` on stdout. Exit codes:

| Code | When |
| --- | --- |
| `0` | every input compiled (or `--help`) |
| `1` | an input failed to read or compile: `<input>: <ErrorName>: <message>` on stderr. Inputs are processed in order and the CLI **stops at the first failure**; files already written stay. |
| `2` | usage error: no inputs, `-o` with several inputs, or an unknown flag (the parser's message, then the usage, on stderr) |

The CLI's `main(argv, { stdout, stderr })` is exported from `bin/html-module.js` for tests; it is not part of the
package's `exports`.
