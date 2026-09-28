# web-module-graph

One module graph for JavaScript **and** HTML in the browser.

- **HTML modules**: an `.html` file exports named/default values (`<template export="Card">`, `<style export="theme">`, …), just like an ES module.
- **Declarative imports**: `<module-import>` / `<module-binding>` Web Components import from JS *or* HTML modules, with named, aliased, default, namespace, and side-effect imports.
- **Importing is separate from using**: `as` is only a local alias. Registering a custom element (`element="ui-card"` or `<define-element>`) and adopting a stylesheet (`adopt`) are explicit, separate steps.
- **Routing underneath**: bare specifiers resolve through an import map, a pluggable **Router** (multi-CDN via [`mport`](https://github.com/johnhenry/mport)), or the host's `import.meta.resolve`.
- **Import maps as the compile target**: a CLI resolves specifiers ahead of time and emits a standard import map and a lockfile.

Plain ESM, no runtime dependencies, no build step.

> Origin: designed in the ChatGPT conversation "JavaScript Import Routing" (extracted to `../_chat-shares/6ab9f756/`). The design rule it settled on:
> *A module is a resource with a namespace of named exports. JavaScript and HTML are module formats that produce that namespace. Importing creates bindings to exports; it does not prescribe what consumers do with those bindings.*

## Install

```bash
npm install @johnhenry/web-module-graph   # (not yet published)
```

In a page, one script sets up the elements. Bare specifiers then resolve through the page's import map:

```html
<script type="module" src="/node_modules/@johnhenry/web-module-graph/src/browser.js"></script>
```

## HTML modules

```html
<!-- ui.html -->
<template id="helper">private: not exported</template>

<template export="Card"><article><slot></slot></article></template>
<template export="default"><main>…</main></template>
<style export="theme">.card { border: 1px solid }</style>
<script type="application/json" export="config">{ "size": 3 }</script>
<script type="module" export="controller">export const greet = (n) => `hi ${n}`;</script>
<svg export="logo">…</svg>
```

| Exported node | Value |
|---|---|
| `<template>` | the `HTMLTemplateElement` |
| `<style>` | a constructed `CSSStyleSheet` (or `{ kind: 'stylesheet', cssText }` where none is available) |
| `<script type="module">` | that script's module namespace (inline scripts load through a `data:` URL, so relative imports inside them won't resolve; use `src=`) |
| `<script type="application/json">` | parsed JSON |
| anything else | the element |

You can override this per loader with `interpret(element, ctx)`.

**Re-exports (barrels)** use the same shape as JS. You can write `<module-export>`/`<module-binding>`, or the future native spelling `<export>`/`<binding>`:

```html
<module-export from="./controls.html">
  <module-binding name="Card" as="Panel"></module-binding>  <!-- export { Card as Panel } from … -->
</module-export>
<module-export from="./dialogs.js" name="Dialog"></module-export>  <!-- export { Dialog } from … -->
<module-export from="./icons.js" all></module-export>          <!-- export * from … -->
<module-export from="./icons.html" namespace="icons"></module-export> <!-- export * as icons from … -->
```

The semantics follow ESM: `export *` skips `default`, local exports shadow star exports, names that conflict between star exports are dropped, and duplicate exports (including a `namespace` name) are a `SyntaxError`. An HTML module's namespace is built only after every module it re-exports from has loaded, so a circular re-export chain between HTML modules can never complete. The loader rejects it with `Circular HTML module re-export: a.html -> b.html -> a.html`, whether the modules are loaded one after another or concurrently. (ESM itself tolerates some `export *` cycles; this implementation does not.) Modules that share a dependency (diamonds) are not cycles.

## Declarative imports

```html
<!-- import { Card, Button as B } from "./ui.js"; customElements.define("ui-card", Card) -->
<module-import from="./ui.js">
  <module-binding name="Card" element="ui-card"></module-binding>
  <module-binding name="Button" as="B"></module-binding>
</module-import>

<module-import from="./ui.html" default="Main"></module-import>     <!-- import Main from -->
<module-import from="./ui.html" namespace="UI"></module-import>     <!-- import * as UI from -->
<module-import from="./setup.js"></module-import>                   <!-- import "./setup.js" -->
<module-import from="./ui.html" name="theme" adopt></module-import> <!-- shorthand + adopt stylesheet -->
<module-import from="@foo/ui" type="html" …>                        <!-- force module format -->
```

- A `<template>` export registered with `element=` becomes an element that stamps the template into an open shadow root.
- A constructor export registers as-is. It must extend `HTMLElement`; anything else fails at registration with a clear `TypeError`. You can register the same export under several names, and each extra name gets a subclass.
- Bindings go into a per-document `ModuleScope` (`scopeFor(document)`), with `get`, `has`, and `whenDeclared(name)`. Declaring the same name again with a different value throws, as a duplicate `import` would.
- `el.module` is a promise of the namespace, and `el.bindings` holds the created locals. The element fires `load` and `error` events.
- Use `defineModuleElements({ prefix: 'esm' })` to get `<esm-import>`/`<esm-binding>`/`<esm-define>`.

### Registering as a separate step: `<define-element>`

`element=` is shorthand. The long form registers a binding that some import declared:

```html
<!-- import { Card } from "./ui.js"; customElements.define("ui-card", Card) -->
<module-import from="./ui.js"><module-binding name="Card"></module-binding></module-import>
<define-element name="ui-card" component="Card"></define-element>
```

`component` names a local binding in the document's `ModuleScope`, not an export. So it can be an alias (`as`), a `default=` local, or a binding from any import on the page. The binding can come from an import before or after the `<define-element>`, including one inserted later: the element waits on `scope.whenDeclared(component)`. It never times out, so a misspelled `component` just never registers. `el.defined` is a promise of the registered constructor. The element fires `load` (`detail: { name, constructor }`) or `error`.

## Loader

```js
import { createLoader, mportRouter, basicRouter, chainRouters } from '@johnhenry/web-module-graph';

const loader = createLoader({
  importMap: { imports: { react: 'https://esm.sh/react@19.2.0' } }, // 1. explicit pins
  router: chainRouters(                                               // 2. routing policy
    basicRouter({ routes: { '@internal/*': 'https://modules.example.com/' } }),
    mportRouter(),                                                    //    race npm CDNs via mport
  ),
  hostResolve: (s) => import.meta.resolve(s),                         // 3. page import map
  onEvent: (e) => console.debug(e.type, e),                           // resolve / load / error
});

const ns = await loader.load('./ui.html');   // HTML module namespace
const js = await loader.load('lodash-es@4');  // routed through mport
```

The loader picks the module format from `resolution.type`, then the `.html`/`.htm` extension, then a `type` override. Namespaces are cached by URL, and failed loads are evicted from the cache so they can be retried.

## Routers: the CDN-routing seam

This package does **not** implement CDN selection itself. A Router is just:

```ts
interface Router {
  resolve(specifier: string, ctx?: { referrer?: string; signal?: AbortSignal }):
    Resolution | null | Promise<Resolution | null>; // null = "not mine"
}
interface Resolution { url: string; provider?: string; type?: 'js' | 'html'; version?: string; integrity?: string; module?: object }
```

| Router | Purpose |
|---|---|
| `mportRouter({ MPortURL?, mport?: { cdns, useCache, cacheKey }, match? })` | **Live multi-CDN routing via `mport`.** Races jsDelivr/JSPM/unpkg (or your CDN list) and returns the winning URL and the already-evaluated module, which the loader reuses. Scoped packages are passed to mport in object form. |
| `basicRouter({ routes, probe? })` | Deterministic pattern → URL mapping (`'*'`, `'@std/*'`, `'react*'`, `'npm:'`, exact). An array of targets plus a `probe` (e.g. `httpProbe()`) gives resolution-time ordered fallback. It does not race and does not track provider health. |
| `importMapRouter(map)` | Router from a static or locked import map. |
| `chainRouters(...)`, `toRouter(fn)` | Composition helpers. |

`mport` is an optional peer dependency. Pass `MPortURL` explicitly, or it is loaded with `import('mport')`.

## CLI: compile to an import map

```js
// modules.config.js
import { basicRouter, httpProbe } from '@johnhenry/web-module-graph/routers';
export default {
  router: basicRouter({ routes: { '*': ['https://esm.sh/', 'https://cdn.jsdelivr.net/npm/'] }, probe: httpProbe() }),
  specifiers: ['react@19.2.0', 'lit/'],
  scopes: { 'https://legacy.example.com/': ['react@18'] },
  importMap: { imports: { app: '/app.js' } }, // merged in
};
```

```bash
web-module-graph build --out importmap.json --lock modules.lock.json   # or --html for a <script type="importmap">
web-module-graph resolve react lit
```

`mportRouter` resolves by importing from https CDNs, which Node can't do, so use it at runtime in the browser. For build-time compilation, use `basicRouter` with a probe.

## Examples

- `examples/index.html` runs offline. It uses an import map, a barrel that re-exports from HTML and JS, a JS component registered under two tag names, `<define-element>` placed before its import, `adopt`, and a namespace import. Serve the package root (for example `python3 -m http.server`) and open `/examples/index.html`.
- `examples/cdn.html` routes bare npm specifiers through `mportRouter`, so it needs network access.

## Development

```bash
npm test        # node:test (linkedom provides the DOM; HTML modules need no doctype or <html> wrapper)
npm run build   # syntax-check all sources + import entry points (no compile step)
```

The test suite includes an end-to-end run of the real `mport` package, with a `node:module` loader hook serving fake CDN responses offline.

## Not implemented (yet)

These parts of the design are deferred:

- Race, weighted/adaptive, and health-aware (circuit breaker) routing strategies. Racing is delegated to `mport`, and the rest belongs in the CDN router.
- Integrity (SRI) verification and content-addressed artifact identity ("same artifact, many mirrors").
- Semver range resolution ("^19" → 19.2.0) and package.json-driven dependency graphs.
- Runtime fallback after the browser's native loader has already picked a URL. There is no standard hook for this.
- JS importing `.html` natively (`import { Card } from "./ui.html"`). This needs a bundler plugin or future platform support. For now, use `loader.load()`.
- HTML expressions that use namespace bindings (`UI.Card`), and SSR.
- Cyclic `export *` between HTML modules (rejected; see Re-exports).

## License

MIT
