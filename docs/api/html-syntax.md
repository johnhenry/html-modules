# HTML syntax

[API reference](../api.md) › HTML syntax

Five elements make up the format. Two are written **inside an HTML module** (`<html-export>`,
`<html-module-settings>`), two **in any document** that imports (`<html-import>` with its `<html-binding>`
children), and one in either (`<html-import-settings>`). A page and an HTML module use the same `<html-import>`
syntax; an import inside a module is private to that module.

- [`<html-export>`](#html-export): exports of a module
- [`<html-import>`](#html-import): imports into a page or a module
- [`<html-binding>`](#html-binding): selective bindings of one import
- [`<html-import-settings>`](#html-import-settings): import defaults for one document
- [`<html-module-settings>`](#html-module-settings): export defaults for one module
- [Precedence of import options](#precedence-of-import-options)
- [Placement and nesting rules](#placement-and-nesting-rules)
- [Boolean attributes](#boolean-attributes)

Every rule on this page is enforced identically by the DOM reader (`readHTMLModule`, used by the browser loader)
and the source scanner (`scanHTMLModule`, used by the compiler), except where [a known
difference](#placement-and-nesting-rules) is stated. Error messages are quoted in full on the [Errors](errors.md)
page; "in m.html" in a message is the module's URL.

## `<html-export>`

An `<html-export>` in an HTML module is one public export. Everything in the file that is not an `<html-export>`
(other markup, comments, scripts) is private and invisible to importers. `<html-export>` elements inside a
`<template>` are template content, not exports. In a page (outside a module) the element is defined but inert: it
does nothing.

### What an export is, by its children

Only **direct children** count.

| Children | Export kind | Value (runtime and compiled) |
| --- | --- | --- |
| exactly one `<template>`, plus any `<style>` | **component** | an [`HTMLComponent`](runtime.md#htmlcomponent) definition. The template content is stamped into a shadow root per instance; the `<style>` children become the definition's `styles` (one constructed stylesheet per definition, adopted by every instance). A `<style>` *inside* the template also works but is cloned into every instance. Any other direct child (including a `<script>`) is ignored. |
| `<style>` only (one or more) | **stylesheet** | an [`HTMLStylesheet`](runtime.md#htmlstylesheet): the `<style>` texts joined with `\n` |
| exactly one `<script>` whose `type` is JSON (`application/json`, `text/json`, or `application/<x>+json` / `text/<x>+json`, case-insensitive), and nothing else | **data** | the parsed JSON value |
| `src` attribute (children ignored) | **re-export** | see [Re-exports](#re-exports) |

Anything else is a `SyntaxError`: no template/style/JSON, two templates, a JSON script next to a `<style>`, two
scripts, a non-JSON script with no template, invalid JSON.

### Attributes

| Attribute | Applies to | Values | Meaning |
| --- | --- | --- | --- |
| `name` | all | a kebab name, `default`, or empty | The export name. A kebab name (`card`, `fancy-button`) is a **named export**; JavaScript sees it camelCased (`fancyButton`) and the `components` manifest keys it as written. `name="default"` or an empty `name` (`<html-export name>`) is the **default export** only. Required unless `src` is given. `components` is reserved (the manifest's name). |
| `default` | component, stylesheet, data | boolean, no value (`default` or `default="default"`) | Also make this named export the module's default: `name="card" default` is `export { card, card as default }`. Not allowed alone (use `name="default"`), with `name="default"` / an empty name, or on a re-export. |
| `shadow` | component only | `open` (default), `closed` | The shadow root mode. Overrides `<html-module-settings shadow>`. An empty value means "not set". On a non-component export it is an error. |
| `delegates-focus` | component only | [boolean](#boolean-attributes): present, `"true"`, `"false"` | `delegatesFocus` for `attachShadow()`. Overrides `<html-module-settings delegates-focus>`; `delegates-focus="false"` turns a module default off. On a non-component export it is an error. |
| `src` | re-export | a module specifier | Makes this a re-export of another module (HTML or JS), resolved like an `<html-import src>` of this module (including its `<html-import-settings base>`). |
| `import` | re-export with `name` | an export name of the source module | The export to take from `src`, when it differs from `name`. |

### Default exports

A module has **at most one** default export, however it is spelled:

```html
<html-export name="default"><template>…</template></html-export>        <!-- export default …      (canonical) -->
<html-export name><template>…</template></html-export>                  <!-- the same: an empty name            -->
<html-export name="card" default><template>…</template></html-export>   <!-- export { card, card as default }   -->
```

- A **default-only** export (`name="default"` or empty) has no identity of its own: its definition's `name` is
  `null`, it is **not** in the `components` manifest, and a namespace import (`as=`) does **not** register it. The
  importer names it: `<html-binding export="default" element="my-tip">` or `ns.default.define('my-tip')`.
- A **named default** (`name="card" default`) is in the manifest and registered under its name as usual, and is
  also `ns.default`.
- Components, stylesheets and data can all be defaults.
- Watch out for templating: a variable that renders as `name=""` silently makes a default export. Write
  `name="default"` when you mean it.

### Re-exports

```html
<html-export src="./more.html"></html-export>                                   <!-- export * from "./more.html"            -->
<html-export src="./b.html" name="button" import="fancy-button"></html-export>  <!-- export { fancyButton as button } from … -->
<html-export src="./b.html" name="button"></html-export>                        <!-- export { button } from …               -->
<html-export src="./widgets.js" name="counter" import="Counter"></html-export>  <!-- a JS module's export, too             -->
```

- **Star** (`src` without `name`) follows ESM `export *`: every named export of the source enters this module's
  namespace (components, stylesheets and data alike) except `default` and `components`; this module's own names win;
  a name two star sources give different values is left out of the namespace. The `components` manifest merges the
  source's components; a component name two star sources disagree on is a `SyntaxError` (`Conflicting star exports
  for 'x' from 'a' and 'b'`).
- **Named** (`src` + `name`, optional `import`): the export is looked up in the source by the name used in markup:
  its `components` manifest first, then the name as written, then its camelCase form. A missing name is a
  `SyntaxError: The requested module '…' does not provide an export named '…'`. Identity is preserved: the re-export
  *is* the source's definition, not a copy. A named re-export that is a component enters this module's manifest.
- A re-export is never the default (`default`, `name="default"` or an empty name with `src` is an error), and
  `import` without `name` is an error.
- Circular re-exports (and imports) are rejected: `Circular HTML module dependency: a -> b -> a`.

## `<html-import>`

```html
<html-import src="./ui.html" as="ui"></html-import>                        <!-- every component as <ui--…>         -->
<html-import src="./ui.html" as="ui" delimiter="-"></html-import>          <!-- … as <ui-…>                        -->
<html-import src="./ui.html" as="ui" load="lazy"></html-import>            <!-- fetched when a <ui--…> first appears -->
<html-import src="./ui.html" as="ui">                                      <!-- only these:                        -->
  <html-binding export="card"></html-binding>                              <!--   <ui--card>                        -->
  <html-binding export="button" element="brand-button"></html-binding>     <!--   a tag you choose                  -->
</html-import>
<html-import src="./setup.html"></html-import>                             <!-- load only: side effects, warm cache -->
```

`<html-import src as>` is the HTML counterpart of `import * as ui from "./ui.js"`, except that `as` names a
**namespace of custom elements**: every component export is registered as `<as><delimiter><export>`. Stylesheet and
data exports are not elements and are not registered by `as` (bind them with `<html-binding>`).

| Attribute | Values | Default | Meaning |
| --- | --- | --- | --- |
| `src` | a module specifier | (required) | Relative (`./`, `../`, `/`: against the document's [`base`](#html-import-settings) if set, else the importing page's base URL, or the importing module's URL), absolute (`https:`, `file:`, `blob:`, …), or bare (`@acme/ui/kit.html`: resolved by the host, in the browser `import.meta.resolve`, i.e. the page's `<script type="importmap">`). |
| `as` | a kebab name | none | The namespace. Without `as` and without bindings, the import only loads the module. |
| `type` | `html`, `js` | by extension | `html` loads the URL as an HTML module; any other value loads it as JavaScript (native `import()`). Without `type`, `.html` / `.htm` (before any `?` or `#`) are HTML and everything else is JavaScript. The cache is by URL: the first load of a URL decides its kind. |
| `delimiter` | a [delimiter](names.md#isvaliddelimiterdelimiter) | `--` | Namespace delimiter for this import's tags. |
| `conflict` | `error`, `reuse` | `error` | When a tag this import wants is already defined by a *different* definition: `error` fails the binding (naming the tag and who defined it); `reuse` keeps the existing definition and records the binding with `reused: true`. The same definition under the same tag again is always a no-op. |
| `load` | `eager`, `lazy` | `eager` | `lazy`: fetch nothing until one of the import's tags is used; see [Lazy loading](javascript.md#lazy-loading). |
| `errors` | `event`, `throw` | `event` | `throw`: failures are also passed to `reportError()` (the console, `window.onerror`), in addition to `error` events and rejections. For development. |

- `delimiter`, `conflict`, `load` and `errors` default from the document's `<html-import-settings>`, then (pages
  only) the instance options; see [Precedence](#precedence-of-import-options).
- `base` is **not** allowed on `<html-import>` (it is document-level): `SyntaxError: "base" cannot be set on
  <html-import> …`.
- Any other attribute (`id`, `class`, …) is ignored.
- Empty `as`, `type` or `src` values count as absent.
- In a page, `delimiter`, `conflict`, `load` and `errors` are resolved once, when the import starts (on
  connection, or on first access of `.ready` / `.module` / `.load()`); `src` and `type` are read when loading
  begins, and `as` when the module is bound. Changing attributes after that has no effect.

### What gets bound

| Import | Registers | `el.bindings` |
| --- | --- | --- |
| `as`, no `<html-binding>` children | every component of the module's `components` manifest (for a JS module: its `components` export, else its exports made with `defineHTMLComponent()`) as `<as><delimiter><name>`; **every tag is checked before any is registered** | `{}` |
| `<html-binding>` children (with or without `as`) | **only** what the bindings name; see [`<html-binding>`](#html-binding) | one entry per binding |
| neither | nothing (the module is loaded, for side effects or to warm the cache) | `{}` |

A JS module imported with `as` that has neither a `components` export nor `defineHTMLComponent()` exports is a
`TypeError` (arbitrary exports such as `VERSION` or a plain class are never registered by `as`).

### Inside a module

An `<html-import>` in an HTML module is a dependency of that module:

- Its components are bound when **one of the importing module's components is registered** (not when the module
  loads), into the same registry, and stylesheets it `adopt`s apply **inside that module's components' shadow roots
  only**, never to the page.
- It uses `--` and the other built-in defaults unless it (or the module's own `<html-import-settings>`) says
  otherwise. A page's settings and the instance options never reach it, so a module's templates always use the tags
  their author wrote.
- An eager dependency is fetched with the module; the module fails to load if the dependency does.
- A lazy dependency (`load="lazy"`, directly or via the module's settings) is not fetched with the module; it loads
  when one of its tags first appears (typically inside one of the module's components' shadow roots). A lazy module
  import **may not `adopt`** a stylesheet (the components need it when they render): that is a `SyntaxError`.

## `<html-binding>`

A direct child of an `<html-import>` (anywhere else it does nothing). With any `<html-binding>` children, only
those exports are bound. The same export may be bound several times (two `element=` tags).

| Attribute | Values | Meaning |
| --- | --- | --- |
| `export` | an export name as used in markup | Required, non-empty. Looked up in the module's `components` manifest, then as written, then camelCased (`fancy-button` → `fancyButton`, `Counter` stays `Counter`); `default` means the default export. |
| `element` | a valid custom element name | Register the export under exactly this tag (the markup form of `definition.define(tag)`), overriding `<as><delimiter><export>`. The export must be element-like: a definition, a class extending `HTMLElement`, or a `<template>` element. |
| `adopt` | boolean (presence) | Adopt a stylesheet export (an `HTMLStylesheet` or `CSSStyleSheet`) into the root that contains the import: the document, or the shadow root the `<html-import>` is in. Inside a module: into the module's components' shadow roots. |

What one binding does:

| Export value | `element` | `as` on the import | Result |
| --- | --- | --- | --- |
| component | given | any | registered as `element`; `el.tags[element].namespace` is `null` |
| component | none | given | registered as `<as><delimiter><export>`, except `export="default"`, which is a `SyntaxError` (it has no name: add `element=`) |
| component | none | none | nothing registered; the definition is on `el.bindings[export]` |
| stylesheet | none | any | with `adopt`, adopted; the value is on `el.bindings[export]` |
| stylesheet / data | given | any | `TypeError: Cannot register '…' from '…' as <tag>: it is a stylesheet, not a component` (or `data (an object)`, …) |
| not a stylesheet | any | any, with `adopt` | `TypeError: Cannot adopt '…' from '…': it is …, not a stylesheet` |
| data | none | any | the value is on `el.bindings[export]` |

Every applied binding's value is recorded in `el.bindings[export]`. A binding may be added at any time: before the
module loads (it is picked up by the initial pass), or after (it is applied at once). Each binding fires its own
`load` or `error` event (see [Elements](elements.md#events)); a failing binding does not stop the others. Removing a
binding does not unregister anything: custom element definitions are permanent.

## `<html-import-settings>`

Defaults for the `<html-import>` elements of the document it is in: a page, or an HTML module. Every attribute is
optional.

```html
<html-import-settings delimiter="-" base="./vendor/ui@2/" conflict="reuse" load="lazy" errors="throw"></html-import-settings>
```

| Attribute | Values | Default | Meaning |
| --- | --- | --- | --- |
| `delimiter` | a delimiter | `--` | as on `<html-import>` |
| `base` | a non-blank URL | none | A base URL for resolving this document's relative `<html-import src>` (and, in a module, `<html-export src>`) specifiers, like `<base href>` but only for HTML imports. Resolved against the document's **own URL** (a module's URL, inside a module), **not** against `<base href>`. Bare and absolute specifiers are unaffected, and so is everything else (links, images, the JavaScript API). Give a folder a trailing slash (`./vendor/ui@2/`). |
| `conflict` | `error`, `reuse` | `error` | as on `<html-import>` |
| `load` | `eager`, `lazy` | `eager` | as on `<html-import>` |
| `errors` | `event`, `throw` | `event` | as on `<html-import>` |

`id`, `class` and `data-*` attributes are allowed and mean nothing. Any other attribute, or a bad value, is a
`SyntaxError` whose message lists the valid attributes or values.

**In a page**, the element's attributes are read once, when the document's first `<html-import>` starts:

- A late one (after an `<html-import>` in tree order, or inserted after imports started) or a second one fires
  `error` on itself and is **ignored**; it never changes imports that have started. The first valid one in tree
  order applies.
- An invalid one (an unknown attribute or a bad value) fires `error` on itself, **and every `<html-import>` of that
  document fails with the same error**, rather than silently running with other options. A `base` that does not
  resolve against the document URL also fails every import of the document.
- `<html-import>` elements inside shadow roots use their `ownerDocument`'s settings. Put the settings element in
  the document's light DOM.

**In a module**, the same mistakes are `SyntaxError`s when the module loads or compiles, reported on the page's
`<html-import>` of that module.

## `<html-module-settings>`

Defaults for the component exports of the HTML module it is in. Only meaningful inside a module.

```html
<html-module-settings shadow="closed" delegates-focus></html-module-settings>
<html-export name="safe"><template>…</template></html-export>                                  <!-- closed, delegates focus -->
<html-export name="glass" shadow="open" delegates-focus="false"><template>…</template></html-export>
```

| Attribute | Values | Default | Meaning |
| --- | --- | --- | --- |
| `shadow` | `open`, `closed` | `open` | the default shadow root mode |
| `delegates-focus` | [boolean](#boolean-attributes) | `false` | the default `delegatesFocus` |

`id`, `class` and `data-*` are allowed; anything else is a `SyntaxError`. The defaults are baked into each component
record (`shadow`, `delegatesFocus`), so runtime-loaded and compiled modules agree. **In a page** there is nothing to
configure: the element fires an `error` event on itself (and, when the instance's `errors` option is `throw`, calls
`reportError()`); it is never silently ignored.

## Precedence of import options

For each of `delimiter`, `conflict`, `load` and `errors`, the first layer that sets it wins:

| | Pages | Inside modules |
| --- | --- | --- |
| 1 | the `<html-import>` attribute | the `<html-import>` attribute |
| 2 | the document's `<html-import-settings>` | the module's `<html-import-settings>` |
| 3 | `createHTMLModules({ delimiter, conflict, load, errors })` | (never) |
| 4 | built-in defaults: `--`, `error`, `eager`, `event` | built-in defaults |

`base` is document-level only: the document's `<html-import-settings base>`, else (pages) the instance `base`
option, else the document's base URL (pages) or the module URL (modules).

The JavaScript API (`HTMLModules.import()`, `bind()`) is not in any document: its call options override the
instance options, and document settings never apply to it. The instance `load` option applies to `<html-import>`
elements only; `import()` is lazy only when the call says `load: 'lazy'`.

## Placement and nesting rules

- `<html-import-settings>` must come before every `<html-import>` of its document, and `<html-module-settings>` before
  every `<html-export>` of its module, in document order. At most one of each per document.
- In a module, the settings elements are found wherever they are (as `querySelectorAll` would find them), and
  their position is checked against the imports and exports.
- `<html-export>`, `<html-import>` and the settings elements inside a `<template>` are template content and are
  ignored by the module reader.
- **`<html-export>` and `<html-import>` are top-level declarations and must not be nested inside one another.** A
  nested one is a `SyntaxError` naming both elements, e.g. `<html-export name="b"> is nested inside <html-export
  name="a">`, raised identically by the runtime loader and the compiler. (Inside a `<template>` they are inert
  template content, which is allowed.)
- `<html-binding>` counts only as a direct child of `<html-import>`, and template/style/script count only as direct
  children of `<html-export>`.

## Boolean attributes

`delegates-focus` (on `<html-export>` and `<html-module-settings>`) accepts, case-insensitively: present with no
value, `""`, `"true"` or its own name (`delegates-focus="delegates-focus"`) for true, and `"false"` for false. Any
other value is a `SyntaxError: Invalid delegates-focus="…": it is a boolean attribute; write delegates-focus,
delegates-focus="true" or delegates-focus="false"`.

`default` (on `<html-export>`) takes no value: present, `""` or `"default"`. `adopt` (on `<html-binding>`) is true
whenever present, whatever its value.
