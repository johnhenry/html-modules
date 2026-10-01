# html-modules

[![npm version](https://img.shields.io/npm/v/%40johnhenry%2Fhtml-modules.svg)](https://www.npmjs.com/package/@johnhenry/html-modules)
[![CI](https://github.com/johnhenry/html-modules/actions/workflows/ci.yml/badge.svg)](https://github.com/johnhenry/html-modules/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40johnhenry%2Fhtml-modules.svg)](LICENSE)

Full documentation: [opensource.johnhenry.me/html-modules](https://opensource.johnhenry.me/html-modules/)

Declarative HTML modules for the browser. Write Web Components in ordinary HTML files, export them with
`<html-export>`, and import them into a page with `<html-import src="./ui.html" as="ui">`. Each export becomes a
native custom element under the import's namespace: `<ui--card>`, `<ui--button>`. There is no build step and no
custom JavaScript module loader. The same modules can be used from JavaScript, mixed with JS-authored components,
and optionally compiled to plain ES modules.

```html
<script type="module" src="/node_modules/@johnhenry/html-modules/src/browser.js"></script>

<html-import src="./ui.html" as="ui"></html-import>

<ui--card>
  <h2 slot="title">Hello!</h2>
  An ordinary HTML file defined this element.
</ui--card>
```

```html
<!-- ui.html -->
<html-export name="card">
  <style>:host { display: block; border: 1px solid; padding: 1rem; }</style>
  <template>
    <article>
      <header><slot name="title"></slot></header>
      <slot></slot>
    </article>
  </template>
</html-export>
```

This implements the PRD *Declarative HTML Modules*; [`docs/GAP.md`](docs/GAP.md) maps each PRD section onto the code
and records the deliberate extensions (`<html-binding>`, a configurable delimiter, the settings elements, lazy
loading). The complete reference is [`docs/api.md`](docs/api.md). Plain JavaScript ES modules, no runtime
dependencies.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Writing HTML modules](#writing-html-modules)
- [Importing](#importing)
- [Namespaces and delimiters](#namespaces-and-delimiters)
- [Selective imports: `<html-binding>`](#selective-imports-html-binding)
- [Identity vs registration name](#identity-vs-registration-name)
- [Settings](#settings)
- [Lazy loading](#lazy-loading)
- [JavaScript API](#javascript-api)
- [JavaScript-authored components](#javascript-authored-components)
- [The compiler](#the-compiler)
- [Resolution and caching](#resolution-and-caching)
- [Errors](#errors)
- [Non-goals](#non-goals)
- [Project layout](#project-layout)
- [Adding a new export kind](#adding-a-new-export-kind)
- [Honest limitations](#honest-limitations)
- [Security model](#security-model)
- [Family](#family)
- [License](#license)

## Install

```sh
npm install @johnhenry/html-modules
```

**Provenance.** `@johnhenry/html-modules` is a new package: it was developed locally as `web-module-graph` and
renamed before it was ever published, so `0.0.0` is the first version under any name. The **unscoped**
`html-modules` on npm is an unrelated package by another author; install the scoped name. (Pre-1.0, `^0.0.0` matches
only `0.0.0`: pin exactly until a deliberate `0.1.0`.)

- **Browsers:** any browser with custom elements and shadow DOM. Constructable stylesheets are used where available;
  elsewhere component styles fall back to a `<style>` per shadow root. Nothing needs a bundler.
- **Node >= 26** (`engines`) for the compiler, the CLI, the tests and the Node examples. The browser code itself has
  no Node requirement.

Load the bootstrap once per page. Served from `node_modules`:

```html
<script type="module" src="/node_modules/@johnhenry/html-modules/src/browser.js"></script>
```

or through an import map, which is also what lets compiled modules (which import
`@johnhenry/html-modules/runtime`) share the page's runtime:

```html
<script type="importmap">
  { "imports": {
      "@johnhenry/html-modules/browser": "/node_modules/@johnhenry/html-modules/src/browser.js",
      "@johnhenry/html-modules/runtime": "/node_modules/@johnhenry/html-modules/src/runtime.js"
  } }
</script>
<script type="module">import '@johnhenry/html-modules/browser';</script>
```

`browser.js` imports `./runtime.js`, so both entries above resolve to one copy of the runtime. Keep it that way
(see [Honest limitations](#honest-limitations)).

## Quick start

**1. Author an HTML module.** Any `.html` file; each `<html-export>` is a public export, everything else is
private.

```html
<!-- ui.html -->
<html-export name="card">
  <style>:host { display: block; border: 1px solid #ddd; border-radius: 10px; padding: 1rem; }</style>
  <template>
    <article>
      <header part="title"><slot name="title"></slot></header>
      <slot></slot>
    </article>
  </template>
</html-export>

<html-export name="button" delegates-focus>
  <template><button part="button" type="button"><slot></slot></button></template>
</html-export>

<html-export name="theme"><style>:root { --brand: #5b4bd6; }</style></html-export>

<html-export name="meta"><script type="application/json">{ "version": "1.2.0" }</script></html-export>
```

**2. Import it with `<html-import as>`.** Every component export is registered as `<as>--<export>`.

```html
<script type="module" src="/node_modules/@johnhenry/html-modules/src/browser.js"></script>
<html-import src="./ui.html" as="ui"></html-import>
```

**3. Use the tags.** Anywhere, before or after the import: elements upgrade in place when the module arrives.

```html
<ui--card>
  <b slot="title">Hello</b>
  <ui--button>Click me</ui--button>
</ui--card>
<style>ui--card:not(:defined) { visibility: hidden; }</style>
```

**4. Pick only what you need**, choose tag names, adopt the stylesheet, read the data:

```html
<html-import src="./ui.html" as="ui">
  <html-binding export="card"></html-binding>                          <!-- <ui--card> only -->
  <html-binding export="button" element="brand-button"></html-binding>  <!-- a tag you choose -->
  <html-binding export="theme" adopt></html-binding>                   <!-- adopted into the document -->
  <html-binding export="meta"></html-binding>                          <!-- el.bindings.meta -->
</html-import>
```

**5. Or from JavaScript**, sharing the same cache:

```js
import { HTMLModules } from '@johnhenry/html-modules/browser';

const ui = await HTMLModules.load('./ui.html');     // { button, card, components, meta, theme }: registers nothing
ui.card.define('profile-card');                    // one definition, any number of tags
await HTMLModules.import('./ui.html', { as: 'admin' });   // = <html-import src="./ui.html" as="admin">
```

Runnable, self-verifying versions of all of this are in [`examples/`](examples/README.md) (`npm run examples`), and
a browser demo site with live checks on every page is at `/examples/` when you serve the package root
(`python3 -m http.server`).

## Writing HTML modules

An HTML module is an ordinary HTML file. Each `<html-export>` in it is a public export; everything else is private
to the file. Export names are lower-case words joined by single hyphens (`card`, `fancy-button`).

| Export | Markup | Value |
| --- | --- | --- |
| Component | `<html-export name="card"><template>…</template></html-export>` | an HTML Component Definition |
| Stylesheet | `<html-export name="dark"><style>…</style></html-export>` | an `HTMLStylesheet` |
| Data | `<html-export name="config"><script type="application/json">…</script></html-export>` | the parsed JSON |
| Default | `<html-export name="default">…</html-export>` (or a bare `name`) | the `default` export, like `export default` |
| Named and default | `<html-export name="card" default>…</html-export>` | `card`, and also `default`, like `export { card, card as default }` |
| Every component of another module | `<html-export src="./more.html"></html-export>` | like `export * from` |
| One export of another module | `<html-export src="./b.html" name="button" import="fancy-button"></html-export>` | like `export { fancyButton as button } from` |
| Several exports of another module | `<html-export src="./b.html" names="card, fancy-button as button"></html-export>` | like `export { card, fancyButton as button } from` |
| Another module as a namespace | `<html-export src="./icons.html" name="icon" import="*"></html-export>` | like `export * as icon from` |
| Another module's export as the default | `<html-export src="./b.html" name="default" import="card"></html-export>` | like `export { card as default } from` |

All the ESM re-export forms are covered; see [Re-exports](#re-exports).

A component export holds exactly one `<template>`, which is stamped into a shadow root, so native `<slot>`, named
slots and `part` work as usual. Its attributes are `shadow="open"` (default) or `shadow="closed"`, and
`delegates-focus`. `<style>` elements *beside* the template become the component's `styles`: one constructed
stylesheet per definition, adopted by every instance's shadow root. (`<style>` inside the template works too, but
is cloned into each instance.)

### Default exports

`name="default"` is the default export. It mirrors JavaScript's `export default`, and pairs with
`<html-binding export="default" element="…">` on the importing side:

```html
<html-export name="default"><template>…</template></html-export>        <!-- export default -->
<html-export name><template>…</template></html-export>                  <!-- the same: an empty name -->
<html-export name="card" default><template>…</template></html-export>   <!-- export { card, card as default } -->
```

- A **bare `name`** (an empty value) also means the default. Watch out for templating: a variable that renders as
  `name=""` silently becomes a default export. Write `name="default"` when you mean it.
- The **`default` attribute** is a modifier for a real name. On its own (`<html-export default>`) it is an error that
  points to `name="default"`, and `name="default" default` is an error too.
- A module has at most one default, however it is spelled. `default` and `components` cannot be named exports.
  A named re-export can be the default (see [Re-exports](#re-exports)); star re-exports never pass a default
  through, as in ESM.
- A default-only export has no identity of its own (its definition's `name` is `null`), is not in the `components`
  manifest, and is not registered by `as=`: the importer names it with `element=`.

### Re-exports

`<html-export src>` re-exports another module (HTML or JS), with a counterpart for every ESM form:

| ESM | HTML module |
| --- | --- |
| `export * from "./more.html"` | `<html-export src="./more.html"></html-export>` |
| `export { card } from "./b.html"` | `<html-export src="./b.html" name="card"></html-export>` |
| `export { fancyButton as button } from "./b.html"` | `<html-export src="./b.html" name="button" import="fancy-button"></html-export>` |
| `export { card, fancyButton as button } from "./b.html"` | `<html-export src="./b.html" names="card, fancy-button as button"></html-export>` |
| `export * as icon from "./icons.html"` | `<html-export src="./icons.html" name="icon" import="*"></html-export>` |
| `export { default } from "./b.html"` | `<html-export src="./b.html" name="default"></html-export>` |
| `export { card as default } from "./b.html"` | `<html-export src="./b.html" name="default" import="card"></html-export>` |
| `export { default as card } from "./b.html"` | `<html-export src="./b.html" name="card" import="default"></html-export>` |
| `export { card, card as default } from "./b.html"` | `<html-export src="./b.html" name="card" default></html-export>` |

- Re-exports keep identity: `barrel.button === b.fancyButton`. A missing name fails with ESM's message, `The
  requested module './b.html' does not provide an export named 'nope'`, and circular re-exports are rejected.
- A **namespace** re-export's components also join this module's manifest as `<name>--<export>`, so importing the
  barrel with `as="ui"` registers `<ui--icon--star>`, just as `<html-import as="icon">` writes `<icon--star>` inside
  a module.
- A **default** re-export works like any default-only export: it is not registered by `as=`, and the importer names
  it with `<html-binding export="default" element="…">`.
- Star re-exports follow `export *`: no `default`, local names win, and names two sources disagree on are left out.

### Modules that import modules

Modules can import other modules with the same `<html-import>` element a page uses. Those imports are private to the
module: they are bound when one of the module's components is registered, and a stylesheet the module adopts
applies inside the module's components only.

```html
<!-- rating.html -->
<html-import src="./icons.html" as="icon"></html-import>
<html-import src="./themes.html"><html-binding export="gold" adopt></html-binding></html-import>

<html-export name="stars">
  <template><icon--star></icon--star><icon--star></icon--star><icon--star></icon--star></template>
</html-export>
```

Every element and attribute, with its validation rules, is in [HTML syntax](docs/api/html-syntax.md).

## Importing

```html
<html-import src="./ui.html" as="ui"></html-import>
```

is the HTML counterpart of `import * as ui from "./ui.js"`. `as` names a namespace: every component export is
registered as `<as>--<export>`. Stylesheet and data exports are not elements and are not registered.

**Asynchronous upgrade.** Elements may appear before, or long after, the import that defines them. Until then they
are ordinary unknown elements (style them with `:not(:defined)`); when the module arrives, the browser upgrades them
in place. No `MutationObserver` is involved (except for [lazy imports](#lazy-loading), which watch for their first
element).

The same module can be imported under several namespaces (`as="shop"`, `as="admin"`); it is fetched and parsed once.
An import with no `as` and no bindings only loads the module, for its side effects or to warm the cache.

| `<html-import>` | |
| --- | --- |
| `src` | module URL: relative to the document (or its [`base`](#settings)), absolute, or a bare specifier resolved through the page's import map |
| `as` | namespace |
| `delimiter` | namespace delimiter for this import (default `--`) |
| `conflict` | `error` (default) or `reuse`: what to do when a tag is already defined by something else |
| `load` | `eager` (default) or `lazy`: fetch only when one of its tags is used |
| `errors` | `event` (default) or `throw`: also `reportError()` failures |
| `type` | `html` or `js`, to override detection by extension (`.html`/`.htm` are HTML; anything else is JS) |
| `el.ready` | Promise of `{ module, elements, bindings, tags }` once bound; rejects on failure |
| `el.module` | Promise of the module namespace (a lazy import waits rather than loading) |
| `el.load()` | load now, even a lazy import none of whose tags is in use; returns `el.ready` |
| `el.state` | `idle`, `waiting`, `loading`, `loaded` or `error` |
| `el.elements` / `el.bindings` / `el.tags` | registered tags → classes; bound export names → values; tags → `{ tag, namespace, export, reused? }` |
| `el.settings` / `el.delimiter` | the options in use, after precedence |
| `el.src` / `as` / `type` / `integrity`, `el.delimiter` / `conflict` / `loadMode` / `errors` | properties for the attributes (`loadMode` is `load`, whose name the method has); a script can `createElement`, `append`, then set `src`: it starts after the script. Changing `src` after loading started fires an `error` event |
| `load` / `error` events | on the import; `error` has `detail.error` and bubbles |

Full detail: [Elements (DOM API)](docs/api/elements.md).

## Namespaces and delimiters

A namespace import registers each component as `<namespace><delimiter><export>`. The delimiter is `--` by default,
and can be changed per import, for a whole document (`<html-import-settings delimiter="-">`), per call, or for a
whole `HTMLModules` instance:

```html
<html-import src="./ui.html" as="ui"></html-import>                  <!-- <ui--custom-card> -->
<html-import src="./ui.html" as="ui" delimiter="-"></html-import>    <!-- <ui-custom-card> -->
```

**Why `--` is the default.** A registered tag must be a valid custom element name, or native upgrade is lost.
Namespaces and export names are lower-case words joined by *single* hyphens, so `--` can never appear inside one:
every tag splits exactly one way. And `--` always supplies the hyphen a custom element name needs, so one-word
exports stay valid (`<ui--card>`). It also echoes CSS custom properties.

**Other delimiters.** A delimiter is one or more characters allowed in custom element names: lower-case letters,
digits, `-`, `.`, `_`, and the non-ASCII ranges of the spec. Whitespace, upper case and characters such as `:` are
rejected.

- **`-`** is compact and always valid, but ambiguous: `ui-custom-card` could be `custom-card` in `ui` or `card` in
  `ui-custom`. The runtime never parses a tag back into its parts: every binding records `{ tag, namespace, export }`
  (`el.tags`, and `tags` in the results of `bind()` and `import()`).
- **`.`** reads well, but `ui.card` has no hyphen, so **one-word exports become invalid** (see
  [Honest limitations](#honest-limitations)).

**Inside modules**, an `<html-import>` uses `--` unless it (or the module's own `<html-import-settings>`) says
otherwise; the page's settings and the instance default do not apply there, so a module's templates always know the
tags they were written with. Every naming function is in [Names](docs/api/names.md).

## Selective imports: `<html-binding>`

The PRD specifies the whole-namespace import. As a deliberate extension, an `<html-import>` may have `<html-binding>`
children. With any children, **only** those exports are bound, which keeps the global, permanent custom element
registry free of components the page never uses.

```html
<html-import src="./ui.html" as="ui">
  <html-binding export="card"></html-binding>                          <!-- <ui--card> only -->
  <html-binding export="button" element="brand-button"></html-binding>  <!-- a tag you choose -->
  <html-binding export="button" element="save-button"></html-binding>   <!-- the same export, again -->
  <html-binding export="default" element="tip-box"></html-binding>      <!-- a default export needs element= -->
  <html-binding export="theme" adopt></html-binding>                   <!-- a stylesheet, adopted -->
  <html-binding export="config"></html-binding>                        <!-- data, on el.bindings.config -->
</html-import>

<html-import src="./counter.js">                                     <!-- a JS module -->
  <html-binding export="Counter" element="x-counter"></html-binding>
</html-import>
```

- **Always write the end tag.** HTML has no self-closing tags: `<html-binding export="card" />` does not close the
  element, so the binding after it becomes its child. That is an error (a `SyntaxError` in a module, an `error` event in
  a page), not a silent drop, and so is any other element child of an `<html-import>`.
- `element=` sets the tag, overriding `<as>--<export>`. It is the markup form of `definition.define(tag)`.
- `adopt` adopts a stylesheet export into the root that contains the import: the document, or a shadow root.
- A binding can be added at any time, before or after its module loads; it fires `load` (with `detail.tag`,
  `detail.element`, `detail.value`) or `error` (bubbling through the import). A failing binding does not stop the
  others.

## Identity vs registration name

A component's exported identity is not its tag. `ui.html`'s `card` has the identity `"card"` wherever it is bound;
the importer chooses the tag. A registry accepts a constructor only once, so every registration is a fresh subclass
of the definition's one base element:

```js
const ui = await HTMLModules.load('./ui.html');
ui.card.name;                          // "card"
ui.card.define('profile-card');        // one tag
ui.card.define('invoice-card');        // another; a different class, the same component
customElements.get('profile-card').component === ui.card;   // true
customElements.define('fancy-card', class extends ui.card.element { /* behaviour */ });
```

Defining the same definition under the same tag again is a no-op; defining a *different* component under a taken
tag throws (or, with `conflict: 'reuse'`, keeps the existing one).

## Settings

Two optional elements set defaults for one document. They are an extension beyond the PRD (which fixes `--` and has
no settings element).

```html
<html-import-settings delimiter="-" base="./vendor/ui@2/" conflict="reuse" load="lazy" errors="throw"></html-import-settings>

<html-import src="./kit.html" as="ui"></html-import>                     <!-- ./vendor/ui@2/kit.html, <ui-button>, lazy, … -->
<html-import src="./icons.html" as="icon" load="eager"></html-import>   <!-- an attribute overrides the settings -->
```

```html
<!-- inside an HTML module -->
<html-module-settings shadow="closed" delegates-focus></html-module-settings>
<html-export name="safe"><template>…</template></html-export>                                     <!-- closed, delegates focus -->
<html-export name="glass" shadow="open" delegates-focus="false"><template>…</template></html-export>
```

- **`<html-import-settings>`** (`delimiter`, `base`, `conflict`, `load`, `errors`): defaults for the `<html-import>`
  elements of the document it is in. `base` is a base URL for resolving every relative `<html-import src>` (and
  `<html-export src>` re-exports, in a module), resolved against the document's own URL (not `<base href>`); nothing
  else is affected.
- **`<html-module-settings>`** (`shadow`, `delegates-focus`): defaults for a module's component exports, baked into
  each definition so runtime-loaded and compiled modules agree. In a page it is an error: a page has no exports.
- **Scope is lexical.** A page's settings apply only to that page's imports; a module's only to that module. Page
  settings and instance options never leak into modules.
- **Placement.** Before every `<html-import>` (or `<html-export>`), at most one of each per document. In a page a
  late or second one is an `error` event on that element and is ignored; in a module it is a `SyntaxError`.
- **Invalid values** are errors that list the valid values. In a page, an invalid `<html-import-settings>` fails
  every import of that page rather than letting them run with other options.
- **Precedence**, for each option:

  | | Pages | Inside modules |
  | --- | --- | --- |
  | 1 | the `<html-import>` attribute | the `<html-import>` attribute |
  | 2 | the document's `<html-import-settings>` | the module's `<html-import-settings>` |
  | 3 | `createHTMLModules({ delimiter, base, conflict, load, errors })` | (never) |
  | 4 | built-in defaults: `--`, no base, `error`, `eager`, `event` | built-in defaults |

  The JavaScript API (`HTMLModules.import()`, `bind()`) is not in any document: its call options override the
  instance options, and document settings do not apply to it.

The full rules are in [HTML syntax](docs/api/html-syntax.md#html-import-settings).

## Lazy loading

With `load="lazy"` (on an import, or for a document in `<html-import-settings>`), nothing is fetched until one of the
import's tags is actually used. Then the module loads, its tags are registered, and the waiting elements upgrade in
place.

```html
<html-import-settings load="lazy"></html-import-settings>
<html-import src="./ui.html" as="ui"></html-import>                  <!-- fetched when the first <ui--…> appears -->
<html-import src="./tip.html">                                     <!-- fetched when a <my-tip> appears -->
  <html-binding export="default" element="my-tip"></html-binding>
</html-import>
```

- **What it waits for.** A namespace import waits for any tag starting with `<as><delimiter>`; an import with
  `<html-binding>` children waits for exactly the tags they bind. An import with nothing to wait for
  (no `as`, or only `adopt`, data and default-without-`element` bindings) could never load, so it is an error
  (`<html-import src="…"> is lazy but has no tag to wait for`); write `load="eager"`.
- **Where it looks.** The document (one `MutationObserver` per window, plus a scan of what is already there), and
  every shadow root created by an html-modules component, open or closed. What it does *not* see is listed under
  [Honest limitations](#honest-limitations).
- **API.** `el.ready` resolves when the module has been loaded and bound; `el.load()` forces loading; `el.module`
  waits; `el.state` is `waiting` until then. Disconnecting a waiting import cancels the watching; reconnecting
  resumes it.
- **In modules**, a module's own lazy import loads when one of its tags first appears (typically in one of its
  components' shadow roots). A lazy module import cannot `adopt` a stylesheet.
- **JavaScript.** `HTMLModules.import(src, { as, load: 'lazy' })` returns a handle right away instead of a promise:
  `{ ready, load(), cancel(), state }`.
- **The compiler does not lazy-load**: compiled dependencies are static `import`s.

Full detail: [Lazy loading](docs/api/javascript.md#lazy-loading).

## JavaScript API

`@johnhenry/html-modules/browser` defines the elements and exposes the shared instance as `HTMLModules` (exported,
and on `globalThis`). `<html-import>` is a thin layer over it, so both share one cache and one set of rules. The
side-effect-free root entry point, `@johnhenry/html-modules`, exports everything else.

```js
import { HTMLModules } from '@johnhenry/html-modules/browser';

const ui = await HTMLModules.load('./ui.html');
// { card, button, theme, config, default, components }: shaped like a compiled ES module

await HTMLModules.import('./ui.html', { as: 'ui' });                                    // = <html-import as="ui">
await HTMLModules.import('./ui.html', { as: 'ui', delimiter: '-' });                    // = <html-import as="ui" delimiter="-">
await HTMLModules.import('./ui.html', { as: 'ui', conflict: 'reuse', errors: 'throw' });
const lazy = HTMLModules.import('./ui.html', { as: 'ui', load: 'lazy' });               // a handle: { ready, load(), cancel(), state }
await HTMLModules.import('./ui.html', { bindings: [{ export: 'card', element: 'x-card' }] });
HTMLModules.bind(ui, { as: 'admin' });                                                  // bind a loaded module
HTMLModules.resolve('./ui.html');                                                       // → absolute URL
HTMLModules.cache;                                                                      // Map<`<kind>:<URL>`, Promise<namespace>>
HTMLModules.unload('./ui.html');                                                        // evict it from the cache: the next load fetches again
```

A loaded namespace is frozen and has a null prototype. Named exports are camelCase (`fancy-button` →
`fancyButton`), `default` is present when the module has one, and `components` maps export names to component
definitions.

The API at a glance; every entry links to its reference:

| Area | Exports | Reference |
| --- | --- | --- |
| Instances | `createHTMLModules(options)`, the instance's `load`, `unload`, `import`, `bind`, `resolve`, `cache`, `options`, `base`; `defineHTMLModuleElements()` | [JavaScript API](docs/api/javascript.md) |
| Elements | `HTMLImport`, `HTMLBinding`, `HTMLExport`, `HTMLImportSettings`, `HTMLModuleSettings` (from `/browser`) | [Elements](docs/api/elements.md) |
| Definitions | `defineHTMLComponent`, `HTMLComponent`, `defineHTMLStylesheet`, `HTMLStylesheet`, `isHTMLComponent`, `isHTMLStylesheet`, `isStylesheet`, `isElementLike` | [Runtime](docs/api/runtime.md) |
| Binding and registration | `bindModule`, `applyBinding`, `registerComponents`, `defineElement`, `toComponent`, `lookupExport`, `componentsOf`, `manifest`, `adoptStylesheet` | [Runtime](docs/api/runtime.md) |
| Module records | `readHTMLModule`, `scanHTMLModule`, `recordFromRaw`, `moduleImportOptions` | [Records](docs/api/records.md) |
| Settings | `IMPORT_DEFAULTS`, `EXPORT_DEFAULTS`, `readImportSettings`, `readModuleSettings`, `readImportOptions`, `resolveImportOptions` | [Records](docs/api/records.md#settings-vocabulary) |
| Names | `DELIMITER`, `bindingName`, `parseBindingName`, `isValidDelimiter`, `isValidElementName`, `elementNameProblem`, `isKebabName`, `camelCase`, `kebabCase` | [Names](docs/api/names.md) |
| Lazy loading | `lazyTargets`, `watchLazy`, `componentRoot` | [JavaScript API](docs/api/javascript.md#lazy-loading) |
| Loader | `createLoader`, `linkHTMLModule`, `createNamespace` | [JavaScript API](docs/api/javascript.md#createloaderoptions) |
| Compiler | `compileHTMLModule`, `compileRecord`, `rewriteSpecifier`, `rebaseSpecifier`, the `html-module` CLI | [Compiler](docs/api/compiler.md) |

**Definitions** (`src/runtime.js`, also `@johnhenry/html-modules/runtime`) are the shared representation. The loader
and the compiler both produce them with `defineHTMLComponent()`:

```js
import { defineHTMLComponent } from '@johnhenry/html-modules/runtime';

const card = defineHTMLComponent({
  name: 'card',                        // identity
  template: '<article><slot></slot></article>',
  shadow: 'open',                      // or 'closed'
  delegatesFocus: false,
  styles: [':host { display: block }'],
  imports: [],                         // [{ module, from, as?, bindings? }] bound before registration
});
card.define('my-card');                // → the registered class
card.element;                          // the base class, to extend
```

## JavaScript-authored components

`<html-import>` takes JS modules too, loaded with native `import()`. A JS module says which exports are components;
nothing else is ever registered, so `export const VERSION = "2.1"` never becomes `<ui--version>`.

```js
// ui.js: either a components manifest …
export const components = { 'custom-card': CustomCard, 'fancy-button': FancyButton };

// … or exports made with defineHTMLComponent()
export const customCard = defineHTMLComponent(CustomCard);
```

```html
<html-import src="./ui.js" as="ui"></html-import>   <!-- <ui--custom-card>, <ui--fancy-button> -->
```

A plain class needs no manifest when the page names it: `<html-binding export="Counter" element="x-counter">`. To
give an HTML template JavaScript behaviour, extend its definition's `element` and export the result:

```js
const { likeView } = await HTMLModules.load(new URL('./like-view.html', import.meta.url).href);
export class LikeButton extends likeView.element { connectedCallback() { /* … */ } }
export const components = { 'like-button': defineHTMLComponent({ element: LikeButton, imports: likeView.imports }) };
```

HTML modules can re-export JS components too: `<html-export src="./widgets.js" name="counter" import="Counter">`.

## The compiler

Browsers cannot `import` an `.html` file, and this library does not try to make them (no service worker, no custom
loader). Instead, an optional compiler turns an HTML module into an ordinary ES module:

```sh
npm install --save-dev @johnhenry/html-modules
npx html-module ui.html                                              # → ui.js
npx html-module ui.html -o dist/ui.js
npx html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
npx html-module ui.html --format register --as ui                    # → ui.register.js, registers <ui--…> on import
npx html-module ui.html --format register --as ui --delimiter -      # registers <ui-…>
npx html-module ui.html --format register --as ui --conflict reuse   # keeps tags that are already defined
npx html-module ui.html --stdout
```

(Without installing first: `npx -p @johnhenry/html-modules html-module ui.html`. A bare `npx html-module` outside a
project that has the package installed would look for an npm package *named* `html-module`, which is not this one.)

```js
import { compileHTMLModule } from '@johnhenry/html-modules/compiler';
const js = compileHTMLModule(source, { url: 'ui.html' });                       // runtime: "@johnhenry/html-modules/runtime"
const reg = compileHTMLModule(source, { format: 'register', as: 'ui', delimiter: '-' });
```

The output imports only the runtime and exports the same definitions the runtime loader would build:

```js
// ui.js (abridged)
import { defineHTMLComponent, manifest } from "@johnhenry/html-modules/runtime";
const $x_card = defineHTMLComponent({ name: "card", template: "<article>…</article>", shadow: "open", … });
const $components = manifest({ "card": $x_card }, []);
export { $x_card as card, $components as components };
```

- **Nothing registers on import.** `import { card } from './ui.js'; card.define('my-card')`, or
  `<html-import src="./ui.js" as="ui">`, which reads the `components` manifest. `--format register` is the sugar
  that registers every component on import (under `--as`, or under the export names, which must then be valid custom
  element names).
- **Default exports** compile to `export default`.
- **Dependencies** (`<html-import>`, `<html-export src>`) become static imports with `.html` rewritten to `.js`, so
  compile those modules too. A module's `<html-import-settings base>` is applied first, keeping specifiers
  relative. Star re-exports become `export * from`.
- **Settings.** `<html-module-settings>` defaults are baked into each definition; `<html-import-settings>` options
  are carried into `$imports`, which the runtime binds with. `load="lazy"` does not make compiled code lazy.
- The compiler reads source with a small dependency-free scanner that follows the HTML tokenizer (comments, raw-text
  elements, script escapes, character references, end-tag scoping) and produces the same module record as the
  browser's DOM reader. It is tested against every example and, with a seeded fuzz, against parse5. Pass `parse` to
  use a DOM parser instead.
- Runtime-loaded and compiled modules render identically; the test suite and the compiler example check this.

Every option, the CLI flags and exit codes, and a full generated module: [Compiler and CLI](docs/api/compiler.md).

## Resolution and caching

- `src` resolves like a module specifier: relative to the importing document (or, inside a module, the importing
  module), or absolute. Bare specifiers go to `hostResolve`; in the browser that is `import.meta.resolve`, so the
  page's own `<script type="importmap">` applies. Import maps only map URLs; they never parse HTML. As in
  JavaScript, `ui.html` without `./` is a bare specifier.
- A document's `<html-import-settings base>` replaces the document (or module) URL as the base for its relative
  specifiers.
- Modules are cached by kind (HTML or JavaScript) and resolved URL as promises, so repeated and concurrent imports
  share one fetch and parse. Failed loads are evicted and can be retried; `HTMLModules.unload(src)` evicts one on
  purpose (registered tags stay registered, and a JavaScript module stays in the browser's module map).
- Circular dependencies between HTML modules are rejected with the cycle in the message, whether the modules load
  one after another or concurrently.

## Errors

Nothing fails silently. In markup, a failure is an `error` event (bubbling, composed, with `detail.error`) on the
element concerned, and a rejected `el.ready`; a failing `<html-binding>` fires on the binding and bubbles through its
import. In JavaScript it is a throw or a rejection. With `errors="throw"` it also reaches `reportError()` (the
console and `window.onerror`). Mistakes in a module's source are `SyntaxError`s naming the module, identical whether
the module is loaded or compiled. Some common ones:

| Situation | Error |
| --- | --- |
| Module fetch fails | `Error: Failed to fetch HTML module …: 404` |
| Invalid module (no template/style/JSON, duplicate or non-kebab name, two templates, bad `shadow`) | `SyntaxError` naming the module |
| A tag the delimiter makes invalid (`as="ui" delimiter="."` + `card`) | `SyntaxError: … <ui.card> is not a valid custom element name (it has no hyphen)` |
| Circular dependency | `Error: Circular HTML module dependency: a -> b -> a` |
| Tag already bound to a different component | `Error: Cannot bind <ui--card>: it is already defined by "card" from … (conflict="reuse" keeps the existing definition instead)` |
| Missing export | `SyntaxError: The requested module '…' does not provide an export named '…'` |
| `<html-import-settings>` after an `<html-import>` | `SyntaxError: <html-import-settings> must come before any <html-import> …` |

Every error, its exact message and where it is reported: [Errors](docs/api/errors.md).

## Non-goals

From the PRD: no custom JavaScript module loader; no direct `import … from "./ui.html"` in JavaScript (use
`HTMLModules.load()` or the compiler); no service workers; no bundler requirement; no framework; import maps are not
responsible for HTML. Package and CDN routing (version ranges, mirrors, lockfiles) is out of scope: use
[`@johnhenry/mport`](https://github.com/johnhenry/mport), and point a page import map at what it resolves (see
[Family](#family)).

Deferred PRD items (HTML Include, further export metadata, a `bundle` compiler format, scoped registries) are
listed with reasons in [`docs/GAP.md`](docs/GAP.md#deferred).

## Project layout

```
src/
  names.js         export names, namespaces and delimiters
  settings.js      the settings vocabulary, validation and precedence
  runtime.js       HTML Component Definitions → custom elements; binding (shared by runtime and compiled code)
  record.js        module records; readHTMLModule() from a DOM
  scan.js          scanHTMLModule() from source text
  loader.js        resolve, fetch, parse, cache, link dependencies
  lazy.js          lazy loading: what an import waits for, and the watcher
  html-modules.js  createHTMLModules(): load / import / bind
  elements.js      <html-import>, <html-binding>, <html-export>, and the settings elements
  compiler.js      compileHTMLModule()
  index.js         the side-effect-free root entry point
  browser.js       the one-script bootstrap
bin/html-module.js the compiler CLI
examples/          numbered Node examples (npm run examples) and the browser demo site (open /examples/)
test/              node:test suites (npm test), with linkedom as the test DOM
docs/api.md        the API reference (docs/api/*.md)
docs/GAP.md        the PRD mapped onto the code
```

```sh
npm test                    # node:test, with linkedom as the test DOM
npm run check               # every source file parses; entry points import
npm run examples            # the numbered Node examples, each self-verifying
npm run examples:compile    # regenerate examples/compiled/
```

## Adding a new export kind

An HTML module has four export kinds: **component** (a `<template>`), **stylesheet** (only `<style>`), **data**
(one JSON `<script>`) and **re-export** (`src`). The export kind is this library's real extension point: elements,
naming and binding are fixed by the PRD, but what an `<html-export>` can *hold* is decided in one function and
consumed by two back ends. The stylesheet kind is the best worked example in the package's history (it shipped with
the PRD implementation in `e597271`), because it is the one kind that needed its own runtime value, its own binding
behaviour (`adopt`) and its own exclusion from registration, all of which a new kind may need.

**Smallest: a new attribute or payload on an existing kind.** `record.js`'s `exportRecord()` is a chain of branches
by children shape; a new component attribute with concrete semantics (as `delegates-focus` was) is one more field in
the component branch, passed through `defineHTMLComponent()` by the loader and emitted by the compiler. A new JSON
MIME type is a change to one regular expression. And if the new thing is just a value, it is already a **data**
export: no new kind. The test that separates the two: *does the value need its own runtime type that bindings must
treat differently* (registered, adopted, or refused), which a JSON value cannot express?

**A genuinely new kind.** Every existing kind follows one pattern, so a new one does too:

1. **`src/record.js`**: a branch in `exportRecord()` that recognizes the new children shape and returns
   `{ kind: '<x>', name, default?, … }` (copy the stylesheet branch), plus its entry in the `ExportRecord` typedef.
   Its validation errors are `SyntaxError`s built with `describe(raw)` and `where`, like every other.
2. **`src/scan.js`**, only if the payload lives somewhere the scanner does not already capture (it keeps a direct
   child's `text` for raw-text elements and `html` for `<template>`). `rawOf()` in `record.js` is the DOM-side
   equivalent and must capture the same thing.
3. **`src/runtime.js`**: a value class and `define<X>()` (copy `HTMLStylesheet` / `defineHTMLStylesheet`), branded
   with a `Symbol.for('html-modules.<x>')` so copies of the library recognize each other, an `is<X>()` predicate, and
   a label in `kindOf()` so binding errors name the kind. If bindings treat it specially, that is a branch in
   `applyBinding()` (as `adopt` is for stylesheets). `manifest()` and `componentsOf()` exclude non-element values
   already.
4. **The one part that isn't boilerplate: the two back ends must build the same value.** `linkHTMLModule()` in
   `src/loader.js` (runtime) and `compileRecord()` in `src/compiler.js` (compiled output) each have a `switch
   (e.kind)`; add the case to both, and add the new `define<X>` to the compiler's helper imports. The module record is
   the contract between them: neither back end looks at HTML, so if the record is right and both cases construct the
   value from the same record fields, runtime-loaded and compiled modules cannot disagree. The `<html-export>`
   element itself needs nothing: exports are read from a module's source, never executed in place.

**Tests**, all against local files and linkedom, no browser or network: a record test in `test/format.test.js`
(both readers, and every new error message with the module URL), a case in `test/compiler.test.js`'s "runtime and
compiled definitions are equivalent", and an example module using the new kind under `examples/components/`, which
`test/examples.test.js` automatically runs through the DOM reader / scanner agreement check and the loader. Add a
line to `examples/04-invalid-modules-fail-with-a-named-syntax-error.mjs` for each new error.

Contrast with `@johnhenry/fileable`'s "Adding a new tag" section, where a new tag relabels itself so the rest of
the pipeline never learns it exists. Here the opposite holds: both back ends *must* learn the new kind, and the
shared record, plus the equivalence test, is what keeps them in step.

## Honest limitations

- **Custom element names are global and permanent, and scoped registries are not supported yet.** Once a tag is
  defined in a window it cannot be undefined or redefined: removing an `<html-import>` unregisters nothing (it only un-adopts the stylesheets its `adopt` bindings adopted), and a
  second version of a library needs its own namespace (or `conflict="reuse"`, which keeps the first). The runtime
  takes a `registry` option, but a component's shadow root is attached without one, so the tags inside its template
  resolve against the global registry. Scoped custom element registries are deferred until native support settles
  ([`docs/GAP.md`](docs/GAP.md#deferred)); selective `<html-binding>` imports are the way to keep the global registry
  small meanwhile.
- **Lazy loading only sees trees it can observe.** It watches the document and the shadow roots html-modules itself
  creates (open or closed). A tag used inside a shadow root made by other code (a JS component's own
  `attachShadow()`), in another document (an iframe), in `<template>` content not yet cloned into a watched tree, or
  in an element created but never inserted does not trigger the load. Call `el.load()` (or the handle's `load()`)
  for those; this is a property of `MutationObserver`, which cannot see into shadow roots it was not given.
- **A runtime copy and a compiled copy of the same module conflict.** Loading `ui.html` at runtime and importing a
  compiled `ui.js` gives two *different* definitions, so registering both under the same tags fails with `Cannot
  bind <…>: it is already defined …` unless one import says `conflict="reuse"` (the first definition wins) or they
  use different namespaces. Relatedly, load **one copy of the runtime** per page: two copies of `runtime.js` at
  different URLs (say, the page's from `node_modules` and a compiled module's from a CDN) still recognize each
  other's definitions, but keep separate registration bookkeeping, lazy-loading watchers and stylesheet caches, so
  conflict messages lose the "defined by" detail and lazy imports stop seeing the other copy's shadow roots. Map
  `@johnhenry/html-modules/runtime` to the same file the bootstrap uses ([Install](#install)).
- **Relative URLs in a template resolve against the page.** A module's `<style>` resolves `url(...)` against the
  module (constructed stylesheets get `baseURL`), but its `<template>` is stamped into the page, so
  `<img src="./logo.png">` is relative to the page, not the module, and html-modules does not rewrite it. Use
  absolute URLs for assets of a module served from elsewhere. `@import` in a `<style>` is rejected (constructed
  stylesheets drop it silently).
- **Server-side rendering is supported by declarative shadow DOM, not by running the library on the server.**
  `renderDeclarative(def, innerHTML)` returns the `<template shadowrootmode>` markup for a component (styles
  included) to put inside its host tag; when the element upgrades, the runtime keeps that shadow root (open or
  closed), adopts the component's sheets and does not stamp the template again. It does not render nested
  components or run any script. A `shadow="closed"` component's base class calls `attachInternals()` (to see a closed
  declarative root), so a subclass of one cannot call it again; use `shadow="open"` for those.
- **The `.` (and `_`) delimiter cannot name one-word exports.** `.` is a legal custom element name character, but
  `ui.card` has no hyphen, so binding a one-word export under `delimiter="."` is a `SyntaxError` naming the tag; a
  namespace import checks every tag before registering any, so it fails whole. Two-word exports (`ui.custom-card`)
  work. `-` always works but makes tags ambiguous to read back (the runtime records `{ tag, namespace, export }`
  instead of parsing). `--` has neither problem, which is why it is the default.

## Security model

html-modules is a loader and a registrar, not a sandbox. It fetches markup you point it at, validates its shape, and
turns it into custom elements; whatever that markup (or a JavaScript module you import) does in the page is
done with your page's authority.

**What html-modules guarantees:**

- **Only declared exports are exports.** `readHTMLModule()` / `scanHTMLModule()` collect `<html-export>`,
  `<html-import>` and the settings elements, and `recordFromRaw()` rejects anything else a module could smuggle in
  (nesting, a second template, data mixed with a template). Everything else in the file is never evaluated:
  modules are parsed with `DOMParser` into an inert document, so a `<script>` in a module does not run.
- **JSON data is data.** A data export is read with `JSON.parse` (and compiled to `JSON.parse(...)`), so a
  `"__proto__"` key is an own key and never reaches a prototype.
- **Fetched HTML can be pinned.** `integrity` (an `<html-import integrity>` attribute, or the `integrity` option of
  `HTMLModules.load()` / `import()`) is Subresource Integrity metadata, checked with `crypto.subtle.digest` against the
  bytes actually received: the strongest algorithm listed decides, and a mismatch rejects with `Integrity check
  failed for HTML module <url>` and is not cached. It fails closed: without `crypto.subtle`, or for a JavaScript
  module (which `import()` cannot verify), the load is refused.
- **Requests carry what you configure.** `credentials` and `mode` (`createHTMLModules()` options, overridable per
  `load()`) are passed to `fetch()` for HTML modules; by default html-modules adds nothing to the platform's
  defaults.
- **Registration is all or nothing and never silent.** Tags are checked before any is registered, an existing tag is
  never redefined, and every failure is an `error` event, a rejection or a throw
  ([Errors](#errors)).
- **Trusted Types and CSP are supported.** The two HTML sinks (`DOMParser.parseFromString` for fetched modules,
  `template.innerHTML` for a component's template) go through a `trustedTypes` policy you pass, or a policy named
  `html-modules`; a `nonce` option covers the `<style>` fallback. html-modules inserts no `<script>` and uses no `eval`.
  See [Trusted Types and CSP](docs/api/javascript.md#trusted-types-and-csp).

**What is still yours:**

- **A module URL is as trusted as a `<script src>`.** Templates are stamped into the page as real DOM, so a module
  you import can do what its markup can do: `<img src=x onerror="…">`, `<a href="javascript:…">`,
  `<iframe srcdoc="…">` and inline event handlers all execute (subject to your CSP). Import only modules you would
  load as a script, from origins you control or have pinned with `integrity`; do not build a module's URL or source
  from user input.
- **Importing JavaScript runs code.** `<html-import src="./x.js">` is a native `import()`: the module's top level
  runs with full page authority, and html-modules cannot verify it (use an import map `integrity` field, or a CSP
  `script-src` allowlist).
- **`integrity` covers only what you give it.** Each import is pinned individually; a re-export or dependency
  without its own `integrity` is fetched unverified, and a module that is verified can still import a
  JavaScript module that is not. Compiled output is ordinary JavaScript: pin it as you pin any script.
- **CORS, cookies and CSP are the platform's.** `credentials: 'include'` sends cookies to whatever origin the
  module is on; html-modules does not add or relax any CORS check, and `connect-src` / `script-src` decide what may
  be fetched or imported.
- **Rendering untrusted data into a template is yours.** Templates are static markup; html-modules does not
  sanitize what your own scripts later put into a component's shadow DOM.

## Family

html-modules is the HTML-and-custom-elements layer of a browser stack whose neighbours each own one concern; it
depends on neither of these packages, and neither depends on it.

- **[`@johnhenry/mport`](https://github.com/johnhenry/mport)**: package and CDN routing is mport's job, not this
  library's. mport compiles package ranges to a standard import map (`router.build([...])` → `{ importMap, lock }`,
  or `npx mport build` → `importmap.json`). html-modules resolves a bare `<html-import src="@acme/ui/kit.html">`
  through `hostResolve`, which `/browser` sets to `import.meta.resolve`, so the page's import map applies: put the
  map mport generated (a prefix entry such as `"@acme/ui/": "https://…/"` covers HTML files too) in the page before
  `browser.js` loads, and bare HTML-module specifiers resolve through it. The same map can point
  `@johnhenry/html-modules/runtime` at one runtime copy. This library used to carry an mport adapter, routers and a
  lockfile; they were removed in `1c0c416` when it became html-modules. (mport's current line is not yet published
  under the scope.)
- **[`@johnhenry/window-algebra`](https://github.com/johnhenry/window-algebra)**: window-algebra's views host *surfaces*, `{ mount(target), unmount() }`, and its
  `htmlSurface(element)` simply appends an element. An html-modules component is a native custom element, so
  `htmlSurface(document.createElement('ui--card'))` is a window whose content upgrades when its import registers the
  tag. window-algebra's renderer creates no shadow roots, so when its stage is in the document's light DOM a lazy
  `<html-import>` sees the element as the window first mounts and loads the module then (a stage inside some other
  component's shadow root is out of lazy loading's sight; call `load()`). An `iframeSurface` is another document: the framed
  page needs its own `<html-import>`.

## License

MIT
