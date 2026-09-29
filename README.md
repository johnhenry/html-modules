# html-modules

Declarative HTML modules for the browser. Write Web Components in ordinary HTML files, export them with
`<html-export>`, and import them into a page with `<html-import src="./ui.html" as="ui">`. Each export becomes a
native custom element under the import's namespace: `<ui--card>`, `<ui--button>`. There is no build step and no
custom JavaScript module loader. The same modules can be used from JavaScript, mixed with JS-authored components,
and optionally compiled to plain ES modules.

```html
<script type="module" src="/node_modules/html-modules/src/browser.js"></script>

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

This implements the PRD *Declarative HTML Modules*. [`docs/GAP.md`](docs/GAP.md) maps each PRD section onto the code.

> **Renamed.** This project was called `web-module-graph`. That version grew out of a different conversation, about
> routing JavaScript imports across CDNs, and carried routers, import-map compilation and lockfiles. Those are gone.
> Package and CDN routing is a separate concern, handled by [mport](../../mport).

- Plain JavaScript ES modules, no runtime dependencies, Node 20+ for the compiler and tests.
- Examples: serve the package root (`python3 -m http.server`) and open `/examples/`. They work offline.

## Contents

- [Writing HTML modules](#writing-html-modules)
- [Importing](#importing)
- [Namespaces and delimiters](#namespaces-and-delimiters)
- [Selective imports: `<html-binding>`](#selective-imports-html-binding)
- [Identity vs registration name](#identity-vs-registration-name)
- [JavaScript API](#javascript-api)
- [JavaScript-authored components](#javascript-authored-components)
- [The compiler](#the-compiler)
- [Resolution and caching](#resolution-and-caching)
- [Errors](#errors)
- [Non-goals](#non-goals)
- [Project layout](#project-layout)

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

A component export holds exactly one `<template>`, which is stamped into a shadow root, so native `<slot>`,
named slots and `part` work as usual. Its attributes:

- `shadow="open"` (default) or `shadow="closed"`
- `delegates-focus`

`<style>` elements *beside* the template become the component's `styles`. They are built into one constructed
stylesheet per definition and adopted by every instance's shadow root. (`<style>` inside the template works too,
but is cloned into each instance.)

### Default exports

`name="default"` is the default export. It mirrors JavaScript's `export default`, and pairs with
`<html-binding export="default" element="…">` on the importing side:

```html
<html-export name="default"><template>…</template></html-export>        <!-- export default -->
<html-export name><template>…</template></html-export>                  <!-- the same: an empty name -->
<html-export name="card" default><template>…</template></html-export>   <!-- export { card, card as default } -->
```

- A **bare `name`** (an empty value) also means the default. Watch out for templating: a variable that renders
  as `name=""` silently becomes a default export. Write `name="default"` when you mean it.
- The **`default` attribute** is a modifier for a real name. On its own (`<html-export default>`) it is an error
  that points to `name="default"`, and `name="default" default` is an error too.
- A missing `name` (with no `src`) is an error. A module has at most one default, however it is spelled.
  `default` and `components` cannot be named exports. Re-exports (`src`) are never the default.
- A default-only export has no identity of its own (its definition's `name` is `null`), is not in the
  `components` manifest, and is not registered by `as=`: the importer names it with `element=`. A named default is
  registered under its name as usual. Star re-exports never pass a default through, as in ESM.
- Components, stylesheets and data can all be defaults: bind them with `export="default"` plus `element=`,
  `adopt`, or nothing (the value lands on `el.bindings.default`).

Modules can import other modules with the same `<html-import>` element a page uses. Those imports are private to
the module: they are bound when one of the module's components is registered, and a stylesheet the module adopts
applies inside the module's components only.

```html
<!-- rating.html -->
<html-import src="./icons.html" as="icon"></html-import>
<html-import src="./themes.html"><html-binding export="gold" adopt></html-binding></html-import>

<html-export name="stars">
  <template><icon--star></icon--star><icon--star></icon--star><icon--star></icon--star></template>
</html-export>
```

## Importing

```html
<html-import src="./ui.html" as="ui"></html-import>
```

is the HTML counterpart of `import * as ui from "./ui.js"`. `as` names a namespace: every component export is
registered as `<as>--<export>`. Stylesheet and data exports are not elements and are not registered.

The tag is `<as><delimiter><export>`, and the delimiter is `--` unless you choose another; see
[Namespaces and delimiters](#namespaces-and-delimiters).

**Asynchronous upgrade.** Elements may appear before, or long after, the import that defines them. Until then
they are ordinary unknown elements (style them with `:not(:defined)`); when the module arrives, the browser
upgrades them in place. No `MutationObserver` is involved.

The same module can be imported under several namespaces (`as="shop"`, `as="admin"`); it is fetched and parsed
once. An import with no `as` and no bindings only loads the module, for its side effects or to warm the cache.

`<html-import>` attributes and API:

| | |
| --- | --- |
| `src` | module URL: relative to the document, absolute, or a bare specifier resolved through the page's import map |
| `as` | namespace |
| `delimiter` | namespace delimiter for this import (default: the instance's, normally `--`) |
| `type` | `html` or `js`, to override detection by extension (`.html`/`.htm` are HTML; anything else is JS) |
| `el.module` | Promise of the module namespace |
| `el.ready` | Promise of `{ module, elements, bindings }` once bound; rejects on failure |
| `el.elements` | tags registered so far → classes |
| `el.bindings` | bound export names → values (components, stylesheets, data) |
| `el.tags` | registered tags → `{ tag, namespace, export }` (`namespace` is `null` for `element=`) |
| `el.delimiter` | the delimiter in use |
| `load` / `error` events | on the import; `error` has `detail.error` and bubbles |

## Namespaces and delimiters

A namespace import registers each component as `<namespace><delimiter><export>`. The delimiter is `--` by default,
and can be changed per import, per call, or for a whole `HTMLModules` instance:

```html
<html-import src="./ui.html" as="ui"></html-import>                  <!-- <ui--custom-card> -->
<html-import src="./ui.html" as="ui" delimiter="-"></html-import>    <!-- <ui-custom-card> -->
```

```js
const modules = createHTMLModules({ delimiter: '-' });               // this instance's default
await modules.import('./ui.html', { as: 'ui' });                      // <ui-custom-card>
await modules.import('./ui.html', { as: 'ui', delimiter: '--' });     // an override: <ui--custom-card>
modules.bind(ns, { as: 'ui', delimiter: '-' });
```

**Why `--` is the default.** A registered tag must be a valid custom element name, or native upgrade is lost.
Namespaces and export names are lower-case words joined by *single* hyphens, so `--` can never appear inside
one: every tag splits exactly one way. And `--` always supplies the hyphen a custom element name needs, so
one-word exports stay valid (`<ui--card>`). It also echoes CSS custom properties.

**Other delimiters.** A delimiter is one or more characters allowed in custom element names: lower-case letters,
digits, `-`, `.`, `_`, and the non-ASCII ranges of the spec. Whitespace, upper case and characters such as `:`
are rejected. What changes:

- **`-`** is compact and always valid, but ambiguous: `ui-custom-card` could be `custom-card` in `ui` or `card`
  in `ui-custom`. That is fine when you control the names. The runtime never parses a tag back into its parts:
  every binding records `{ tag, namespace, export }` (`el.tags`, and `tags` in the results of `bind()` and
  `import()`).
- **`.`** reads well, but `ui.card` has no hyphen, so **one-word exports become invalid**. Binding one is an error
  naming the tag and the reason (`<ui.card> is not a valid custom element name (it has no hyphen)`), reported the
  usual way: an `error` event on the import or binding, or a rejection. A namespace import checks every tag before
  registering any. Two-word exports (`ui.custom-card`) work.

**Inside modules**, an `<html-import>` uses `--` unless it has its own `delimiter`; the page's instance default
does not apply there, so a module's templates always know the tags they were written with. The delimiter is part
of the module record, so the DOM reader and the compiler's scanner agree on it.

`parseBindingName(tag, delimiter = '--')` remains as a display helper: it returns `{ namespace, name }` when a tag
splits into two kebab names exactly one way, and `null` otherwise (for example `ui-custom-card` with `-`).

## Selective imports: `<html-binding>`

The PRD specifies the whole-namespace import. As a deliberate extension, an `<html-import>` may have
`<html-binding>` children. With any children, **only** those exports are bound, which keeps the global,
permanent custom element registry free of components the page never uses.

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

- `element=` sets the tag, overriding `<as>--<export>`. It is the markup form of `definition.define(tag)`.
- `adopt` adopts a stylesheet export into the root that contains the import: the document, or a shadow root.
- A binding can be added at any time, before or after its module loads; it fires `load` (with
  `detail.tag`, `detail.element`, `detail.value`) or `error` (bubbling through the import). A failing binding
  does not stop the others.

## Identity vs registration name

A component's exported identity is not its tag. `ui.html`'s `card` has the identity `"card"` wherever it is
bound; the importer chooses the tag. A registry accepts a constructor only once, so every registration is a fresh
subclass of the definition's one base element:

```js
const ui = await HTMLModules.load('./ui.html');
ui.card.name;                          // "card"
ui.card.define('profile-card');        // one tag
ui.card.define('invoice-card');        // another; a different class, the same component
customElements.get('profile-card').component === ui.card;   // true
customElements.define('fancy-card', class extends ui.card.element { /* behaviour */ });
```

Defining the same definition under the same tag again is a no-op; defining a *different* component under a
taken tag throws.

## JavaScript API

`src/browser.js` defines the elements and exposes the shared instance as `HTMLModules` (exported, and on
`globalThis`). `<html-import>` is a thin layer over it, so both share one cache and one set of rules.

```js
import { HTMLModules } from 'html-modules/browser';

const ui = await HTMLModules.load('./ui.html');
// { card, button, theme, config, default, components } — shaped like a compiled ES module

await HTMLModules.import('./ui.html', { as: 'ui' });                                    // = <html-import as="ui">
await HTMLModules.import('./ui.html', { as: 'ui', delimiter: '-' });                    // = <html-import as="ui" delimiter="-">
await HTMLModules.import('./ui.html', { bindings: [{ export: 'card', element: 'x-card' }] });
HTMLModules.bind(ui, { as: 'admin' });                                                  // bind a loaded module
HTMLModules.resolve('./ui.html');                                                       // → absolute URL
HTMLModules.cache;                                                                      // Map<URL, Promise<namespace>>
```

A loaded namespace is frozen and has a null prototype. Named exports are camelCase (`fancy-button` →
`fancyButton`), `default` is present when the module has one, and `components` maps export names to component
definitions.

**Definitions** (`src/runtime.js`, also `html-modules/runtime`) are the shared representation. The loader and
the compiler both produce them with `defineHTMLComponent()`:

```js
import { defineHTMLComponent } from 'html-modules/runtime';

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

| Export | Purpose |
| --- | --- |
| `createHTMLModules({ window, registry, delimiter, baseURL, hostResolve, fetch, parseHTML, importModule, onEvent })` | a runtime instance; `delimiter` is its default namespace delimiter (`--`); the hooks serve tests and server-side use. `onEvent` receives `fetch`, `load` and `error` events |
| `defineHTMLModuleElements({ modules, window, registry })` | define `<html-import>`, `<html-binding>`, `<html-export>` over an instance |
| `defineHTMLComponent(spec \| Class)`, `HTMLComponent` | component definitions |
| `defineHTMLStylesheet({ name, css })`, `HTMLStylesheet` | stylesheet exports: `.sheetFor(window)`, `.adopt(root)` |
| `bindModule(ns, { as, delimiter, bindings, root })` → `{ elements, values, tags }`, `applyBinding`, `registerComponents`, `defineElement` | binding and registration |
| `lookupExport`, `componentsOf`, `manifest`, `adoptStylesheet` | helpers used by the loader and compiled output |
| `readHTMLModule(doc)`, `scanHTMLModule(source)` | read a module into its JSON record, from a DOM or from text |
| `bindingName(ns, name, delimiter?)`, `parseBindingName(tag, delimiter?)`, `DELIMITER`, `isValidDelimiter`, `isValidElementName`, `elementNameProblem` | the naming rules |
| `compileHTMLModule`, `compileRecord` | the compiler |

## JavaScript-authored components

`<html-import>` takes JS modules too, loaded with native `import()`. A JS module says which exports are
components; nothing else is ever registered, so `export const VERSION = "2.1"` never becomes `<ui--version>`.

```js
// ui.js — either a components manifest …
export const components = { 'custom-card': CustomCard, 'fancy-button': FancyButton };

// … or exports made with defineHTMLComponent()
export const customCard = defineHTMLComponent(CustomCard);
```

```html
<html-import src="./ui.js" as="ui"></html-import>   <!-- <ui--custom-card>, <ui--fancy-button> -->
```

A plain class needs no manifest when the page names it: `<html-binding export="Counter" element="x-counter">`.
To give an HTML template JavaScript behaviour, extend its definition's `element` and export the result:

```js
const { likeView } = await HTMLModules.load(new URL('./like-view.html', import.meta.url).href);
export class LikeButton extends likeView.element { connectedCallback() { /* … */ } }
export const components = { 'like-button': defineHTMLComponent({ element: LikeButton, imports: likeView.imports }) };
```

HTML modules can re-export JS components too: `<html-export src="./widgets.js" name="counter" import="Counter">`.

## The compiler

Browsers cannot `import` an `.html` file, and this library does not try to make them (no service worker, no
custom loader). Instead, an optional compiler turns an HTML module into an ordinary ES module:

```sh
npx html-module ui.html                         # → ui.js
npx html-module ui.html -o dist/ui.js
npx html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
npx html-module ui.html --format register --as ui    # → ui.register.js, registers <ui--…> on import
npx html-module ui.html --format register --as ui --delimiter -    # registers <ui-…>
npx html-module ui.html --stdout
```

```js
import { compileHTMLModule } from 'html-modules/compiler';
const js = compileHTMLModule(source, { url: 'ui.html', runtime: 'html-modules/runtime', format: 'esm' });
const reg = compileHTMLModule(source, { format: 'register', as: 'ui', delimiter: '-' });
```

The output imports only the runtime and exports the same definitions the runtime loader would build:

```js
// ui.js (abridged)
import { defineHTMLComponent, manifest } from "html-modules/runtime";
const $x_card = defineHTMLComponent({ name: "card", template: "<article>…</article>", shadow: "open", … });
const $components = manifest({ "card": $x_card }, []);
export { $x_card as card, $components as components };
```

- **Nothing registers on import.** `import { card } from './ui.js'; card.define('my-card')`, or
  `<html-import src="./ui.js" as="ui">`, which reads the `components` manifest. `--format register` is the
  sugar that registers every component on import (under `--as`, or under the export names, which must then
  be valid custom element names). `--delimiter` sets its namespace delimiter; the module's own component tags
  are checked when compiling.
- **Default exports** compile to `export default`: `<html-export name="default">` → `export default $default;`,
  and `name="card" default` → `export default $x_card;` next to the named export.
- **Dependencies** (`<html-import>`, `<html-export src>`) become static imports with `.html` rewritten to `.js`
  (`rewrite` option), so compile those modules too. Star re-exports become `export * from`.
- The compiler reads source with a small dependency-free scanner that produces the same module record as the
  browser's DOM reader (tested against every example). Pass `parse` to use a DOM parser instead.
- Runtime-loaded and compiled modules render identically; the test suite and the compiler example check this.

## Resolution and caching

- `src` resolves like a module specifier: relative to the importing document (or, inside a module, the importing
  module), or absolute. Bare specifiers go to `hostResolve`; in the browser that is `import.meta.resolve`, so the
  page's own `<script type="importmap">` applies. Import maps only map URLs; they never parse HTML.
- Modules are cached by resolved URL as promises, so repeated and concurrent imports share one fetch and parse.
  Failed loads are evicted and can be retried.
- Circular dependencies between HTML modules are rejected with the cycle in the message, whether the modules
  load one after another or concurrently.

## Errors

| Situation | Error | Reported on |
| --- | --- | --- |
| Module fetch fails | `Error: Failed to fetch HTML module …: 404` | `<html-import>` |
| Invalid module (no template/style/JSON, duplicate or non-kebab name, two templates, bad `shadow`) | `SyntaxError` naming the module | `<html-import>` |
| Invalid namespace (`as="UI"`, `as="a--b"`) | `SyntaxError` | `<html-import>` |
| Invalid delimiter (`delimiter=""`, `"A"`, `" "`, `":"`) | `SyntaxError: Invalid delimiter …` | `<html-import>` |
| A tag the delimiter makes invalid (`as="ui" delimiter="."` + `card`) | `SyntaxError: … <ui.card> is not a valid custom element name (it has no hyphen)` | `<html-import>` or `<html-binding>` |
| `<html-export default>` with no name, `name="default" default`, a missing `name` | `SyntaxError` pointing to `name="default"` | `<html-import>` |
| Two default exports in one module | `SyntaxError: More than one default export: … and …` | `<html-import>` |
| Circular dependency | `Error: Circular HTML module dependency: a -> b -> a` | `<html-import>` |
| JS module with no components imported with `as` | `TypeError` | `<html-import>` |
| Tag already bound to a different component | `Error: Cannot bind <ui--card>: it is already defined by "card" from …` | `<html-import>` or `<html-binding>` |
| Missing export | `SyntaxError: The requested module '…' does not provide an export named '…'` | `<html-binding>` |
| Invalid tag in `element=` | `SyntaxError` | `<html-binding>` |
| Stylesheet or data bound with `element=` | `TypeError: … it is a stylesheet, not a component` | `<html-binding>` |
| `adopt` on a non-stylesheet | `TypeError` | `<html-binding>` |
| `export="default"` without `element=` under a namespace | `SyntaxError` | `<html-binding>` |

## Non-goals

From the PRD: no custom JavaScript module loader; no direct `import … from "./ui.html"` in JavaScript (use
`HTMLModules.load()` or the compiler); no service workers; no bundler requirement; no framework; import maps
are not responsible for HTML. Package and CDN routing (version ranges, mirrors, lockfiles) is out of scope:
use [mport](../../mport), and point a page import map at what it resolves.

Deferred PRD items (HTML Include, further export metadata, a `bundle` compiler format, scoped registries) are
listed with reasons in [`docs/GAP.md`](docs/GAP.md#deferred).

## Project layout

```
src/
  names.js         export names, namespaces and delimiters
  runtime.js       HTML Component Definitions → custom elements; binding (shared by runtime and compiled code)
  record.js        module records; readHTMLModule() from a DOM
  scan.js          scanHTMLModule() from source text
  loader.js        resolve, fetch, parse, cache, link dependencies
  html-modules.js  createHTMLModules(): load / import / bind
  elements.js      <html-import>, <html-binding>, <html-export>
  compiler.js      compileHTMLModule()
  browser.js       the one-script bootstrap
bin/html-module.js the compiler CLI
examples/          the demo site (open /examples/)
test/              node:test suites (npm test)
docs/GAP.md        the PRD mapped onto the code
```

```sh
npm test                    # node:test, with linkedom as the test DOM
npm run check               # every source file parses; entry points import
npm run examples:compile    # regenerate examples/compiled/
```

## License

MIT
