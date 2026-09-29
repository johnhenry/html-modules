# Gap analysis: web-module-graph → html-modules

The authoritative spec is the PRD **"Declarative HTML Modules"** (and the conversation that produced it).
This document maps each PRD section onto the code as it stood at the start of the refocus
(commit `2e04caa`, the rename), and says what to **keep**, **change**, **remove** or **add**.

## Where the code started

The library had grown out of a different conversation, about routing JavaScript imports across CDNs
(which became the separate [mport](../../../mport) library). Its source was about 1,900 lines:

| Area | Files | What it did |
| --- | --- | --- |
| HTML module format | `html-module.js`, `namespace.js` | Any element with an `export="…"` attribute was an export: `<template export>` → `HTMLTemplateElement`, `<style export>` → `CSSStyleSheet`, `<script type=module export>` → a JS namespace, JSON scripts, `<svg export>`. Re-exports through `<module-export from>`. Produced a frozen, ESM-like namespace. |
| Declarative imports | `declarations.js`, `elements.js`, `scope.js`, `interpret.js` | `<module-import from>` with `<module-binding name as element adopt>` children, `default=` and `namespace=` locals held in a per-document `ModuleScope`, `<define-element name component>` for later registration, template → shadow-stamping class, one export registered under several tags via subclasses. |
| Loader | `loader.js` | Resolution through an import map, then a **router**, then `hostResolve`; a URL-keyed promise cache; `onEvent`; deadlock-free re-export cycle detection. |
| Package routing | `routers/*` (basic, import-map, mport adapter `fromMport`), `import-map.js` | Import-map resolution and compilation, an mport-format lockfile, router chaining. |
| CLI | `bin/…` | `build` (import map + lockfile + `--html`) and `resolve`. |
| Demo | 13 pages | Mostly routing, CDN, import-map, lockfile and loader-hook pages. |

There was **no namespaced registration, no component-definition object, no compiler** and no
JS-authored component protocol.

## Section by section

| PRD section | Status before | Decision |
| --- | --- | --- |
| §1 Executive summary: HTML format, declarative import, namespacing, JS runtime, compiler, shared definition, JS interop | Only the first two, under different names | **Change / add** everything below. |
| §3 Design philosophy: loading → parsing → export discovery → namespace binding → definition → registration → instantiation as separate stages | Loading and binding existed; definition and registration were fused in `interpret.js` | **Change**: separate `record` (parse output), `definition` (`defineHTMLComponent`), binding (`bindModule`) and registration (`definition.define(tag)`). |
| §4 Goals | Partly | See rows below. |
| §5 Non-goals: no custom JS loader, no service worker, no bundler, import maps not responsible for HTML | **Violated in spirit**: routers, CDN routing, import-map compilation and lockfiles were core features | **Remove** `src/routers/*`, `fromMport`, `compileImportMap`, lockfiles, the mport peer and dev dependency, the CLI build. Resolution becomes standard: relative to the importing document or module, bare specifiers through the page's own import map (`import.meta.resolve`) via a `hostResolve` hook. mport stays a separate library for package/CDN routing. |
| §6 No direct `import "./ui.html"` from JS | Held | **Keep**. JS gets `HTMLModules.load()` and the compiler instead. |
| §7 Core concepts: module, export, import, component definition, import binding (include later) | Module, export, import only | **Add** the component definition and the binding as first-class objects. HTML Include is deferred (see below). |
| §8 HTML module = ordinary HTML with one or more exports | Held (any HTML) | **Keep**. |
| §9 Export syntax `<html-export name="…"><template>…</template></html-export>`, preferred over `<template export>` and `data-*`; metadata such as `shadow` only with concrete semantics | Used `export="…"` attributes on built-in elements, which §9.1 explicitly rejects | **Change** to `<html-export name>`. Implemented metadata with concrete semantics only: `shadow="open\|closed"`, `delegates-focus`, `default`. `<style>` children of an export become the definition's `styles` (one constructed sheet shared by every instance). |
| §10 Templates as the V1 payload, native `<slot>` | Held (template stamped into an open shadow root) | **Keep**, moved into the shared runtime. |
| §11 `<html-import src as>` = `import * as ui`; `as` is a namespace, not a rename | `<module-import from namespace=>` bound a JS-style local, not elements | **Change**: `<html-import src="./ui.html" as="ui">` registers every component export as `ui--<export>`. |
| §12 `--` namespace delimiter | Absent | **Add**. Namespaces and export names are lower-case kebab words, so neither can contain `--` and every tag splits unambiguously. Note: §12 says `.` is not permitted in custom element names; it is (`ui.custom-card` registers in current browsers, as the namespaces example shows live). The real problem with `.` is one-word exports: `ui.card` has no hyphen. `--` is still the right choice, and the docs give that reason instead. |
| §13 Identity vs registration name | Partly (`element=` chose the tag, but a template had no identity of its own) | **Add**: a definition carries its module-local `name`; the importer chooses the tag. The same definition can be bound as `ui--custom-card` and `admin--custom-card`. |
| §14 One constructor cannot be registered twice; use generated subclasses | Held (`renamedSubclass`) | **Keep**, moved into `definition.define()`: every registration is a fresh subclass of the definition's base element. |
| §15 Runtime loading: resolve, fetch, DOMParser, discover exports, create definitions, bind, register | Held, apart from definitions and namespaces | **Change** the pipeline to produce definitions. |
| §16 Module cache: `Map<ResolvedURL, Promise<HTMLModule>>` | Held | **Keep** (failed loads are evicted so they can be retried). |
| §17 Asynchronous upgrade: elements may appear before their import finishes; native upgrade, no MutationObserver | Implicitly held | **Keep and test** explicitly, including `customElements.whenDefined` and `:not(:defined)`. |
| §18 HTML Component Definition `{ name, template, shadow, styles }` shared by runtime and compiler | Absent | **Add** `defineHTMLComponent()` in `src/runtime.js`, the only place component semantics live. |
| §19 Shared runtime architecture: browser loader and compiler both feed the same runtime | Absent | **Add**: both paths produce the same JSON-able module record (`readHTMLModule` from a DOM, `scanHTMLModule` from source text) and the same `defineHTMLComponent()` calls. |
| §20 Programmatic API `HTMLModules.load()`, sharing the cache and parser with `<html-import>` | `createLoader().load()` existed | **Change**: `HTMLModules.load / import / bind / resolve / cache`; `<html-import>` is a thin layer over the same instance. |
| §21 JS-authored components; a `components` manifest; never assume every JS export is a component | Any class could be bound, but there was no manifest protocol | **Add**: `<html-import src="./ui.js" as="ui">` registers the module's `components` manifest, or failing that its exports made with `defineHTMLComponent()`. Other exports (`VERSION`, `formatDate`) are never registered. JS classes can also be wrapped with `defineHTMLComponent(Class)`, and can extend an HTML definition's `.element`. |
| Compiler (conversation §3–§8, PRD §1, §6): `html-module ui.html -o ui.js`; exports are definitions and do not self-register; `.define(name)`; `--format register` as sugar; `compileHTMLModule(source)` in memory | Absent (the CLI compiled import maps instead) | **Add** `compileHTMLModule()` and the `html-module` CLI with `esm` (default) and `register` formats. The output imports only the runtime, exports one definition per component, a `components` manifest (so `<html-import src="./ui.js">` works on it too) and a default export when there is one. |

## Old capabilities: kept, renamed or removed

| Old capability | Decision |
| --- | --- |
| `<module-import>` / `<module-binding>` | **Renamed** to `<html-import>` / `<html-binding>` (see the extension below). |
| `<define-element name component>` | **Removed**. Its job (choosing a tag for one export) is `<html-binding export element>`, or `definition.define(tag)` in JS. |
| `<module-export from>` re-exports (barrels) | **Kept** as `<html-export src="…">` (re-export every component) and `<html-export src="…" name="x" import="y">` (one export, optionally renamed). Sources may be HTML or JS modules. Cycle detection kept. |
| `<style export>` + `adopt` | **Kept** as a stylesheet export, `<html-export name="theme"><style>…</style></html-export>`, adopted with `<html-binding export="theme" adopt>` into the import's root (the document, or the shadow root that contains the import). |
| `<script type="application/json" export>` | **Kept** as a data export, `<html-export name="config"><script type="application/json">…</script></html-export>`. |
| `<script type="module" export>` inline scripts, `<svg export>`, arbitrary-element exports | **Removed**. Behaviour comes from JS modules (§21), not scripts embedded in HTML modules; the conversation defers hybrid script semantics past V1. |
| `ModuleScope`, `default=` / `namespace=` locals | **Removed**. HTML imports bind element names, not JS-style identifiers; values are exposed on the import element (`el.module`, `el.bindings`) and through `HTMLModules.load()`. |
| Loader cache, events, `fetch` / `parseHTML` hooks | **Kept** for tests and SSR, with events renamed to the new pipeline (`fetch`, `load`, `error`). |
| Import-map resolver, compiler, merge, script, routers, mport adapter, lockfile, CLI build/resolve | **Removed**. |

## Deliberate extension beyond the PRD: `<html-binding>`

The PRD specifies only the whole-namespace form, `<html-import src as>`. The user asked to keep the
capabilities of the old `<module-binding>` under the spec's vocabulary, as optional children of the
one import element:

```html
<html-import src="./ui.html" as="ui">
  <html-binding export="card"></html-binding>                          <!-- only this one: ui--card -->
  <html-binding export="button" element="brand-button"></html-binding>  <!-- an explicit tag -->
  <html-binding export="theme" adopt></html-binding>                   <!-- a stylesheet, adopted -->
</html-import>
<html-import src="./counter.js">
  <html-binding export="Counter" element="x-counter"></html-binding>
</html-import>
```

Rationale:

- **Registry pollution.** Custom-element names are global and permanent. Importing a large library
  as a namespace registers every export forever; selective bindings register only what the page uses.
- **Identity vs registration name (§13), declaratively.** `element=` is the markup form of
  `definition.define(tag)`, which the PRD already specifies for JS.
- **Non-element exports.** Stylesheets and data need a way to be used from markup (`adopt`,
  `el.bindings`) without being mistaken for components.
- **JS interop (§21).** Binding a named class from a plain JS module needs no manifest.

Rules: with no `<html-binding>` children, every component export is registered as `<as>--<export>`
(the PRD's behaviour). With any children, only those exports are bound. `element=` overrides the tag;
the same export may be bound to several tags (a subclass per tag). `export="default"` binds a default
export (it needs `element=`). An import with no `as` and no bindings still loads the module, for its
side effects and to warm the cache. Bindings added later, or before the module has loaded, are
applied when it is ready; elements already in the page upgrade natively. Failures (a missing export,
an invalid tag, a non-element bound to `element=`) fire an `error` event on the binding, which bubbles
through the import.

## Deferred

| Item | Why |
| --- | --- |
| **HTML Include** (§7, optional sixth concept; `<html-include src="./layout.html#header">`) | The PRD marks it optional and "may later be provided"; it composes DOM rather than defining components, and deserves its own design pass (slot projection, re-rendering, fragments). |
| **Further export metadata** (§9.3: registration behaviour, version, hydration hints, lifecycle modules) | §9.3 forbids adding metadata before it has concrete semantics. |
| **Compiler `--format bundle`** (conversation §7) | Mentioned as a possibility; a bundle needs a dependency walk over the file system and adds nothing to semantics. Dependencies compile file by file today (the CLI accepts several inputs). |
| **Scoped custom-element registries** | Not in the PRD; native support is still arriving. The runtime takes a `registry` option so a scoped registry can be passed in later. |
| **Hybrid script semantics** (a `<script>` inside an export that supplies the class) | The conversation explicitly leaves it out of V1. JS behaviour attaches by extending a definition's `.element` in a JS module instead. |
