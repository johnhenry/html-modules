# HTML syntax

[API reference](../api.md) › HTML syntax

Five elements make up the format. Two are written **inside an HTML module** (`<html-export>`,
`<html-module-settings>`), two **in any document** that imports (`<html-import>` with its `<html-binding>`
children), and one in either (`<html-import-settings>`). A page and an HTML module use the same `<html-import>`
syntax; an import inside a module is private to that module.

- [`<html-export>`](#html-export): exports of a module
- [Data binding in templates](#data-binding-in-templates): `{{attribute}}` and `props`
- [Form-associated components](#form-associated-components): `form-associated`, `form-control`
- [Scoped registries](#scoped-registries): `registry="scoped"` in a module
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

### Relative URLs

- **In a `<style>` (components and stylesheets):** `url(...)` resolves against the **module's URL** (a compiled
  module uses `import.meta.url`, so keep compiled output next to its assets). Browsers resolve a constructed or
  adopted sheet's relative URLs against the page and ignore `new CSSStyleSheet({ baseURL })` (checked in Chrome
  152), so html-modules rewrites each relative `url(...)` to an absolute URL before the CSS reaches the page: in
  constructed sheets, in the fallback `<style>`, and in `renderDeclarative()` output. Absolute URLs, `data:` URLs,
  fragment-only references (`url(#filter)`) and `url()` are left alone; `/root-relative` URLs resolve against the
  module's origin. `sheet.css` keeps the source text; `sheet.resolvedCss` is what is applied. URLs inside
  `image-set("…")` strings are not rewritten.
- **`@import` is not supported** in a `<style>`: `replaceSync()` silently drops `@import` rules, so it is a
  `SyntaxError` naming the export (identical in both readers) rather than a stylesheet that quietly does nothing. Link the
  stylesheet from the page, or inline its rules.
- **In a `<template>`:** the content is stamped into the page, so `<img src="./logo.png">`, `<a href>`, `<use href>`,
  `srcset` and inline `style="background:url(…)"` resolve against the **page's base URL**, not the module's. The
  library does not rewrite them (a correct rewrite needs a full HTML-aware pass over every URL-bearing attribute,
  and would break templates whose URLs are meant for the page). For a module served from another directory or
  origin, write absolute URLs, or put the image in a `<style>` as a `url(...)` of the stylesheet.

### Attributes

| Attribute | Applies to | Values | Meaning |
| --- | --- | --- | --- |
| `name` | all | a kebab name, `default`, or empty | The export name. A kebab name (`card`, `fancy-button`) is a **named export**; JavaScript sees it camelCased (`fancyButton`) and the `components` manifest keys it as written. `name="default"` or an empty `name` (`<html-export name>`) is the **default export** only. Required unless `src` is given. `components` is reserved (the manifest's name). |
| `default` | all but a star re-export | boolean, no value (`default` or `default="default"`) | Also make this named export the module's default: `name="card" default` is `export { card, card as default }`. Not allowed alone (use `name="default"`), with `name="default"` / an empty name, with `names`, or on a star re-export. |
| `shadow` | component only | `open` (default), `closed` | The shadow root mode. Overrides `<html-module-settings shadow>`. An empty value means "not set". On a non-component export it is an error. |
| `delegates-focus` | component only | [boolean](#boolean-attributes): present, `"true"`, `"false"` | `delegatesFocus` for `attachShadow()`. Overrides `<html-module-settings delegates-focus>`; `delegates-focus="false"` turns a module default off. **Default `true` for a `form-control` component** (see [Form-associated components](#form-associated-components)), `false` otherwise. On a non-component export it is an error. |
| `props` | component only | whitespace or comma separated `name` or `name:type` (`string`, `number`, `boolean`) | Declares attributes that are also **properties**: reflected, typed and observed (see [Data binding](#data-binding-in-templates)). `props="title count:number open:boolean"`. On a non-component export it is an error. |
| `form-associated` | component only | [boolean](#boolean-attributes) | The component takes part in forms: `static formAssociated = true` and `ElementInternals`. See [Form-associated components](#form-associated-components). On a non-component export it is an error. |
| `form-control` | component with `form-associated` | a CSS selector | The control in the template (an `<input>`, `<textarea>` or `<select>`) whose value is the form value. Without `form-associated` it is an error; the selector must match such an element in the template (checked at registration). |
| `src` | re-export | a module specifier | Makes this a re-export of another module (HTML or JS), resolved like an `<html-import src>` of this module (including its `<html-import-settings base>`). |
| `import` | re-export with `name` | an export name of the source module, `default`, or `*` | The export to take from `src`, when it differs from `name`. `import="*"` takes the whole namespace (`export * as ns from`). |
| `type` | re-export | `html`, `js` | As on `<html-import>`: load `src` as an HTML module or as JavaScript, whatever its extension (`<html-export src="./part.tpl" type="html">`). The compiler ignores it (compiled dependencies are static imports). On an export without `src` it is an error. |
| `integrity` | re-export | Subresource Integrity metadata | As on `<html-import>`: pins the re-exported HTML module. On an export without `src` it is an error. |
| `names` | re-export | a comma-separated list of `<export>` or `<export> as <name>` | Re-export several names in one element (`export { a, b as c } from`). Replaces `name`, `import` and `default`, which it cannot be combined with. |

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

Every ESM re-export form has an `<html-export src>` counterpart:

```html
<html-export src="./more.html"></html-export>                                   <!-- export * from "./more.html"                -->
<html-export src="./b.html" name="button"></html-export>                        <!-- export { button } from …                   -->
<html-export src="./b.html" name="button" import="fancy-button"></html-export>  <!-- export { fancyButton as button } from …     -->
<html-export src="./b.html" names="card, fancy-button as button"></html-export> <!-- export { card, fancyButton as button } from … -->
<html-export src="./icons.html" name="icon" import="*"></html-export>           <!-- export * as icon from …                    -->
<html-export src="./b.html" name="default"></html-export>                       <!-- export { default } from …                  -->
<html-export src="./b.html" name="default" import="card"></html-export>         <!-- export { card as default } from …          -->
<html-export src="./b.html" name="card" default></html-export>                  <!-- export { card, card as default } from …    -->
<html-export src="./widgets.js" name="counter" import="Counter"></html-export>  <!-- a JS module's export, too                 -->
```

- **Star** (`src` without `name` or `names`) follows ESM `export *`: every named export of the source enters this
  module's namespace (components, stylesheets, data and namespace re-exports alike) except `default` and
  `components`; this module's own names win; a name two star sources give different values is left out of the
  namespace. The `components` manifest merges the source's components; a component name two star sources disagree on
  is a `SyntaxError` (`Conflicting star exports for 'x' from 'a' and 'b'`). A star re-export is never the default.
- **Named** (`src` + `name`, optional `import`): the export is looked up in the source by the name used in markup:
  its `components` manifest first, then the name as written, then its camelCase form (`import="default"` takes the
  source's default). A missing name is a `SyntaxError: The requested module '…' does not provide an export named
  '…'`. Identity is preserved: the re-export *is* the source's definition, not a copy. A named re-export that is a
  component enters this module's manifest.
- **List** (`src` + `names`): one named re-export per entry, exactly as if each were its own element: `names="card,
  fancy-button as button"` is the same as two `<html-export src name [import]>`s. Entries are `<export>` or
  `<export> as <name>`, separated by commas (a trailing comma is fine); `<export>` may be any export name of the
  source (a JS `Counter`, `default`), `<name>` is a kebab name or `default`. `"*"` is not an entry (ESM doesn't allow
  `export { * as ns }` either): use `name="ns" import="*"`.
- **Namespace** (`import="*"`): the named export is the source's whole namespace object, as `export * as icon from`.
  The source's components also enter this module's manifest as `<name>--<export>` (`icon--star`), so importing this
  module with `as="ui"` registers `<ui--icon--star>`, and `<html-binding export="icon--star">` finds it. `--` cannot
  occur in an export name, so these keys never collide with the module's own. A source with no components (a plain
  JS module) adds nothing to the manifest.
- **Default**: `name="default"` (or an empty `name`) re-exports as this module's default: the source's default by
  default, or the export `import` names. Like any default-only export it stays out of the manifest and is not
  registered by an `as=` import; bind it with `<html-binding export="default" element="…">`. `name="card" default`
  re-exports `card` both named and as the default. The one-default-per-module rule counts re-exports.
- Circular re-exports (and imports) are rejected: `Circular HTML module dependency: a -> b -> a`.

## Data binding in templates

A component's template can read the attributes of its host element with `{{name}}`. This is the whole feature:

```html
<html-export name="user-card" props="name count:number open:boolean">
  <template>
    <h3>{{name}}</h3>
    <a href="/users/{{name}}" title="{{ name }} ({{count}} posts)">profile</a>
    <button disabled="{{off}}">Follow</button>
  </template>
</html-export>

<pf--user-card name="Ada" count="3"></pf--user-card>
```

**Syntax.** `{{attribute-name}}`, optional spaces inside the braces. The name is a host **attribute**: letters,
digits, `_` and `-` (`{{aria-label}}` is fine; `{{a.b}}`, `{{a + b}}`, `{{fn()}}` and `{{x | filter}}` are
`SyntaxError`s: there are no expressions, filters or calls, and no JavaScript is evaluated: no `eval`, no
`new Function`, no `innerHTML`, so it works under a strict CSP and Trusted Types). `\{{` is a literal `{{`. An
unterminated `{{` is a `SyntaxError`.

**Where it binds.**

| Site | Behavior |
| --- | --- |
| a **text node** (`<h3>{{name}}</h3>`) | sets the node's data. The value is always text, never markup: `name="<img onerror=…>"` shows those characters. An absent attribute is empty text. |
| an **attribute value** (`href="/users/{{name}}"`) | the attribute is set to the interpolated string. If the value is exactly one binding and the host attribute is absent, the target attribute is **removed** (so `disabled="{{off}}"` follows a boolean `off` attribute). |
| `<script>` and `<style>` text, comments, nested `<template>` content | never bound. |

**Escaping rules (always on).**

- Text is written with the text node's `data`, never `innerHTML`.
- In a URL attribute (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `data`, `background`, `longdesc`,
  `usemap`, `ping`, `codebase`, `xlink:href`) a value that is a `javascript:` or `vbscript:` URL, or a `data:` HTML,
  XHTML or SVG document (matched after the whitespace, control and invisible characters a URL parser ignores are
  removed), is **refused**: the attribute is removed, never set. This is checked on every update. A static
  `href="javascript:…"` written by the module's author is their own markup and is not touched.
- `on*` attributes, `style` and `srcdoc` are **never bound**: `<b onclick="{{x}}">` is a `SyntaxError` when the
  component is registered (`<b onclick="{{x}}">: "onclick" is an event handler attribute; …`), and nothing is
  registered. A `props` name starting with `on` is rejected too.

**`props`.** `props="title count:number open:boolean"` on the export declares attributes that are also properties of
the element, named in camelCase (`aria-label` → `ariaLabel`): a `string` reads the attribute (`""` when absent), a
`number` is `Number(attribute)` (`0` when absent or not a number), a `boolean` is whether the attribute is present.
Setting the property sets the attribute (`el.count = 3` → `count="3"`; a boolean toggles it). The **attribute is the
single source of truth**, and every attribute a template mentions, declared or not, is in `observedAttributes`. A
property assigned before the element upgraded is taken over by the accessor. `props` is for the template's inputs;
objects and arrays are not supported (see Non-goals).

**Updates.** The template is stamped once per element. A changed attribute patches only the text nodes and attributes
that mention it (and not at all when the new string equals the last one written): the shadow root's elements are
never re-created, so focus, selection and event listeners inside survive.

**Where errors come from.** A malformed binding is found when the component is **registered** (the template is
analysed once per definition and window, before anything is registered), not at record time: it needs the parsed
template, and the DOM reader and scanner see template text differently (entities, quoting), so a text-level check in
`record.js` would disagree between them. Declaring `props` is validated in `record.js`, identically for both
readers. The record carries `props` (`[{ name, type }]`); compiled output passes them to `defineHTMLComponent()`, so a
compiled module binds exactly as the runtime-loaded one.

**Non-goals.** No expressions of any kind; no loops or conditionals (a list or an `if` needs a template per item,
which is exactly what JavaScript is for: render lists in a JS component that extends the definition's `.element`);
no two-way binding (a bound node never writes back to the host); no property-only (non-attribute) inputs; no bindings
inside nested `<template>`s; no bindings in server-rendered shadow roots (`renderDeclarative()` rejects a template
that has `{{`; an upgrading element re-stamps a declarative root when the definition has bindings, keeping its leading
`<style>` elements); attribute values only reach the DOM as strings.

## Form-associated components

```html
<html-export name="text-field" form-associated form-control="input">
  <template><label><slot></slot> <input></label></template>
</html-export>

<form>
  <ui--text-field name="who" value="Ada" required>Name</ui--text-field>
</form>
```

`form-associated` makes the registered class `static formAssociated = true` and attaches `ElementInternals`, so the
element is a real form control: it appears in `form.elements` and `FormData` under its `name`, is validated by the
form, matches `:valid` / `:invalid` / `:disabled`, is disabled by a disabled `<fieldset>`, and is reset and restored
with its form.

**Where the value comes from.**

- With **`form-control="selector"`**: the control inside the template. Its value is the element's value (the `value`
  attribute is its initial value), its validity and `validationMessage` are the element's (so `required` works with
  the browser's own messages: `required`, `disabled` on the host are passed to the control), and typing in it
  updates the form value. The control must exist in the template (a `SyntaxError` at registration otherwise).
- Without it, **the element is the control**: assign `el.value` (or call `el.internals.setFormValue()` yourself);
  `required` on the host makes an empty value `valueMissing`.

**Focus.** A component with a `form-control` has `delegates-focus` **on by default** (write `delegates-focus="false"`, or set it so in
`<html-module-settings>`, to opt out). The host is not focusable on its own, so without delegation a browser cannot focus the
invalid control when its form is validated (Firefox logged *The invalid form control with name='x' is not focusable* and showed
no message), and `focus()` and a click on the host never reached the input. A component *without* a `form-control` is its own
control and keeps `delegates-focus` off unless you write it.

**What the class provides**, besides the platform's: `name`, `disabled` and `required` (reflected attributes),
`value` (current), `defaultValue` (the `value` attribute), `type` (the tag), `form`, `labels`, `validity`,
`validationMessage`, `willValidate`, `checkValidity()`, `reportValidity()`, `setCustomValidity(message)` and
`internals` (the `ElementInternals`). These names cannot be `props` of the same component. `formResetCallback` restores the
initial value (the `value` attribute, or the control's initial value); `formStateRestoreCallback` writes the saved
string back; `formDisabledCallback` disables the control; `formAssociatedCallback` is an empty hook. A subclass may
override any of them and call `super`.

**`attachInternals()` coexists.** The platform allows one `attachInternals()` per element, and a component's base class
may need it already (a *closed* declarative shadow root is only visible through it). On every template class,
`attachInternals()` is memoized: the runtime, a subclass (`this.attachInternals()`), and `el.internals` all get the
same object.

**Not supported:** a form value that is not a string (`File`, `FormData`: call `el.internals.setFormValue()`), a
`form-control` that is a custom element or a group of controls (radio groups), `<label for>` clicks reaching the
control inside the shadow root (use `<slot>`-ed labels inside the component), and engines without
`ElementInternals` form association (the element then throws a `TypeError` when constructed). Linkedom, the unit-test
DOM, has none either, so the behaviour is proven in real browsers.

## Scoped registries

Custom element names are global, so two versions of a library that both use `<icon--star>` *inside* their components
collide. `registry="scoped"` on a **module's** import (or on its `<html-import-settings>`, for all of them) gives that
module's own imports a registry of their own:

```html
<!-- lib.html -->
<html-import-settings registry="scoped"></html-import-settings>
<html-import src="./icons.html" as="icon"></html-import>
<html-export name="rating"><template><icon--star></icon--star><slot></slot></template></html-export>
```

```html
<!-- the page -->
<html-import src="./v1/lib.html" as="lib1"></html-import>
<html-import src="./v2/lib.html" as="lib2"></html-import>      <!-- also says <icon--star>: no conflict -->
<lib1--rating></lib1--rating> <lib2--rating></lib2--rating>
```

- **What is scoped.** Each component definition with a scoped import gets one `new CustomElementRegistry()` per window.
  Its scoped imports are bound into it (`icon--star` is defined there and not in `customElements`), its shadow roots are
  attached with `attachShadow({ customElementRegistry })`, and its template is stamped with
  `document.importNode(content, { deep: true, customElementRegistry })`, which is how elements in the template upgrade
  against the scoped registry. Registering the component under several tags shares the one registry. An import of the
  same module without `registry="scoped"` stays in the registry the component itself is registered in.
- **Only inside modules.** A page's tags must be defined where the document upgrades them (the global registry), so
  `registry` on a page's `<html-import>` / `<html-import-settings>`, or in `HTMLModules.import()`, is a `SyntaxError`.
- **Where it is unsupported** (checked in CI: Firefox 155 and the Linux WebKit build (26.6) Playwright ships do not have
  it; Chromium 153 and WebKit 26.6 on macOS do), the page can ask:
  `supportsScopedRegistries(window)` (it *tries* `new CustomElementRegistry()` and `attachShadow({ customElementRegistry })`
  rather than trusting the constructor). A scoped import then **falls back to the registry the component is registered in**
  and logs one `console.warn` per window naming the component; two versions with the same inner tag then conflict as they
  always did. A compiled module behaves the same.
- **Not covered:** a server-rendered (declarative) root keeps the registry it was created with (use
  `shadowrootcustomelementregistry` and initialize it yourself); `registry` does not scope the *page's* elements, only what
  the module's components use; hot reload keeps the registry (its imports may not change).

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
| `type` | `html`, `js` | by extension | `html` loads the URL as an HTML module; any other value loads it as JavaScript (native `import()`). Without `type`, `.html` / `.htm` (before any `?` or `#`) are HTML and everything else is JavaScript. The loader's cache is keyed by kind and URL, so one URL can be loaded both ways. |
| `integrity` | Subresource Integrity metadata | none | Pins the fetched HTML: `sha384-<base64>` (sha256, sha384 or sha512; several tokens separated by spaces). The bytes are checked with SubtleCrypto; a mismatch is an error. HTML modules only (a JavaScript module cannot be verified). Also valid on a module's own `<html-import>`; the compiler ignores it, since compiled dependencies are static imports. |
| `delimiter` | a [delimiter](names.md#isvaliddelimiterdelimiter) | `--` | Namespace delimiter for this import's tags. |
| `conflict` | `error`, `reuse` | `error` | When a tag this import wants is already defined by a *different* definition: `error` fails the binding (naming the tag and who defined it); `reuse` keeps the existing definition and records the binding with `reused: true`. The same definition under the same tag again is always a no-op. |
| `load` | `eager`, `lazy` | `eager` | `lazy`: fetch nothing until one of the import's tags is used; see [Lazy loading](javascript.md#lazy-loading). |
| `errors` | `event`, `throw` | `event` | `throw`: failures are also passed to `reportError()` (the console, `window.onerror`), in addition to `error` events and rejections. For development. |
| `registry` | `global`, `scoped` | `global` | **In an HTML module only.** `scoped`: the tags this import binds are registered in a [scoped custom element registry](#scoped-registries) of the importing module's components instead of the global one. On a page it is a `SyntaxError`. |

- `delimiter`, `conflict`, `load` and `errors` default from the document's `<html-import-settings>`, then (pages
  only) the instance options; see [Precedence](#precedence-of-import-options).
- `base` is **not** allowed on `<html-import>` (it is document-level): `SyntaxError: "base" cannot be set on
  <html-import> …`.
- Any other attribute (`id`, `class`, …) is ignored.
- Empty `as`, `type` or `src` values count as absent.
- In a page, `delimiter`, `conflict`, `load` and `errors` are resolved once, when the import starts (on
  connection, or on first access of `.ready` / `.module` / `.load()`); `src` and `type` are read when loading
  begins, and `as` when the module is bound. Changing attributes after that has no effect, except that changing `src`
  after loading has started fires an `error` event (the module is not reloaded; create a new `<html-import>`). The
  element also has properties for these attributes: see [Elements](elements.md#htmlimport-html-import).

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

A direct child of an `<html-import>`: anywhere else it is an error (a `SyntaxError` in a module, an `error` event on the
binding in a page), because HTML has no self-closing tags. `<html-binding export="a" />` does **not** close the
element, so the binding that follows it is parsed as its **child**, and used to be dropped silently. Write
`<html-binding export="a"></html-binding>`. Any other element child of an `<html-import>` is an error in a module too
(only whitespace, comments and `<html-binding>` belong there). With any `<html-binding>` children, only
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
| `registry` | `global`, `scoped` | `global` | **In an HTML module only** (on a page it is a `SyntaxError`): as on `<html-import>`, for every import of the module. See [Scoped registries](#scoped-registries). |

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
| `delegates-focus` | [boolean](#boolean-attributes) | `false` (`true` for a `form-control` component, when the module sets none) | the default `delegatesFocus` |

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
  template content, which is allowed.) The message also says that `/>` does not close an element in HTML, the usual
  cause (`<html-import … />` swallows what follows).
- `<html-binding>` must be a direct child of `<html-import>` (anywhere else is a `SyntaxError`, see above), an
  `<html-import>` has no element children but bindings, and template/style/script count only as direct children of
  `<html-export>`.

## Boolean attributes

`delegates-focus` (on `<html-export>` and `<html-module-settings>`) accepts, case-insensitively: present with no
value, `""`, `"true"` or its own name (`delegates-focus="delegates-focus"`) for true, and `"false"` for false. Any
other value is a `SyntaxError: Invalid delegates-focus="…": it is a boolean attribute; write delegates-focus,
delegates-focus="true" or delegates-focus="false"`.

`default` (on `<html-export>`) takes no value: present, `""` or `"default"`. `adopt` (on `<html-binding>`) is true
whenever present, whatever its value.
