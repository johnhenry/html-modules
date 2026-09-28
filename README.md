# web-module-graph

One module graph for JavaScript **and** HTML in the browser.

- **HTML modules**: an `.html` file exports named/default values (`<template export="Card">`, `<style export="theme">`, …), just like an ES module.
- **Declarative imports**: `<module-import>` / `<module-binding>` Web Components import from JS *or* HTML modules, with named, aliased, default, namespace, and side-effect imports.
- **Importing is separate from using**: `as` is only a local alias. Registering a custom element (`element="ui-card"` or `<define-element>`) and adopting a stylesheet (`adopt`) are explicit, separate steps.
- **Routing underneath**: bare specifiers resolve through an import map, a pluggable **Router**, or the host's `import.meta.resolve`. Package and CDN routing (`react@^19`, `npm:`, `jsr:`, `github:`, mirrors, strategies, health, lockfiles) is delegated to [mport v2](https://github.com/johnhenry/mport) through `fromMport()`.
- **Import maps as the compile target**: a CLI resolves specifiers ahead of time and emits a standard import map and an mport-format lockfile.

Plain ESM, no runtime dependencies, no build step. mport is an optional peer dependency (`^2.0.0`), needed only for package routing.

> Origin: designed in the ChatGPT conversation "JavaScript Import Routing" (extracted to `../_chat-shares/6ab9f756/`). The design rule it settled on:
> *A module is a resource with a namespace of named exports. JavaScript and HTML are module formats that produce that namespace. Importing creates bindings to exports; it does not prescribe what consumers do with those bindings.*

## Install

```bash
npm install @johnhenry/web-module-graph   # (not yet published)
npm install mport@^2                      # optional: package/CDN routing
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
- A constructor export registers as-is. It must extend `HTMLElement`; anything else fails at registration with a clear `TypeError`. You can register the same export under several names, and each extra name gets a subclass (with the same `name`).
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
import { createRouter, fallback, race, esmSh, jsDelivr, unpkg, jsr } from 'mport';
import { createLoader, fromMport, basicRouter, chainRouters } from '@johnhenry/web-module-graph';

const packages = createRouter({
  '*': fallback(race(esmSh(), jsDelivr({ esm: true })), unpkg()),
  '@std/*': jsr(),
});

const loader = createLoader({
  importMap: { imports: { react: 'https://esm.sh/react@19.2.0' } }, // 1. explicit pins
  router: chainRouters(                                               // 2. routing policy
    basicRouter({ routes: { '@ui': '/components/all.html' } }),       //    static aliases (not packages)
    fromMport(packages),                                              //    packages: mport v2
  ),
  hostResolve: (s) => import.meta.resolve(s),                         // 3. page import map
  onEvent: (e) => console.debug(e.type, e),                           // resolve / load / error
});

const ns = await loader.load('./ui.html');          // HTML module namespace
const js = await loader.load('npm:lodash-es@^4');   // routed by mport; e.resolution.trace shows how
const std = await loader.load('jsr:@std/text@^1', undefined, { signal: AbortSignal.timeout(5000) });
```

The loader resolves a specifier through `importMap` first (which can also remap URLs, via URL keys), then loads fetchable URLs (`http:`, `https:`, `file:`, `data:`, `blob:`) directly. Bare specifiers and other schemes such as `npm:` or `jsr:` go to the `router`, then `hostResolve`. A `signal` passed to `load()`/`resolve()` reaches the router. It picks the module format from a `type` override, then `resolution.type`, then the `.html`/`.htm` extension. Namespaces are cached by URL, and failed loads are evicted from the cache so they can be retried. When the router already evaluated the module (mport with `probe: "import"`), the loader reuses it instead of importing again.

## Architecture: what mport owns

```
 specifier ──► loader ──► 1. importMap        (pins, a compiled map, URL keys)        web-module-graph
                          2. router
                             ├─ basicRouter / functions / importMapRouter             web-module-graph
                             │    static aliases, HTML-module paths, app schemes,
                             │    targets that depend on the referrer
                             └─ fromMport(createRouter(routes))                         mport v2
                                  specifier parsing (react@^19, npm:, jsr:, github:),
                                  registry lookups, providers, strategies
                                  (fallback, race, adaptive, prefer, verified, cache),
                                  probing, health / circuit breaker, traces, lockfiles
                          3. hostResolve      (import.meta.resolve: the page's map)    web-module-graph
          ──► format (type → resolution.type → .html) ──► JS import() or HTML module    web-module-graph
```

web-module-graph keeps what is specific to it: HTML modules, the loader, the declarative elements, the resolution order (import map first), routers for things that are not packages, and HTML-module `type` in resolutions. Everything about packages and CDNs is mport's.

## Routers

A Router is just:

```ts
interface Router {
  resolve(specifier: string, ctx?: { referrer?: string; signal?: AbortSignal; onEvent?(e): void }):
    Resolution | null | Promise<Resolution | null>; // null = "not mine"
}
interface Resolution {
  url: string; provider?: string; type?: 'js' | 'html'; version?: string; integrity?: string; module?: object;
  build?: string; trace?: object[]; // from mport
}
```

| Router | Purpose |
|---|---|
| `fromMport(router, { match?, type?, resolveOptions?, onEvent?, name? })` | **The recommended way to route bare, `npm:`, `jsr:` and `github:` specifiers.** Wraps a router from mport v2's `createRouter()`. The resolution is mport's, unchanged (`url`, `provider`, `version`, `build`, `integrity`, `module`, `trace`, …), plus `type: "js"` when mport already evaluated the module. `signal` and `onEvent` pass through. By default (`isPackageSpecifier`) relative paths, URLs and unknown schemes such as `partial:` are left to other routers. `router.mport` is the wrapped mport router (for `health`, `lock`, `build`). |
| `basicRouter({ routes })` | Static aliases for things that are not packages: `'*'`, `'@x/*'`, `'x*'`, `'scheme:'` and exact patterns mapped to a base URL or a function `(specifier, { referrer }) => url`. |
| `importMapRouter(map)` | Router from a static or compiled import map. |
| `chainRouters(...)`, `toRouter(fn)`, `isRouter(x)` | Composition helpers: the first non-null resolution wins. |
| `mportRouter(options)` | **Deprecated.** See the migration notes. |

mport is not imported by web-module-graph itself: you import it, create the router, and hand it to `fromMport()`. In a browser, map `mport` in the page's import map (for example to `/node_modules/mport/src/index.mjs`) or import it from a CDN.

```js
import { createRouter, fallback, custom, local } from 'mport';

// Traces: every registry lookup, probe, skip and failure.
const r = await loader.resolve('npm:react@^19');
r.trace; // [{ type: 'lookup', provider: 'npm registry' }, { type: 'resolved', version: '19.2.0' }, { type: 'probe', provider: 'esm.sh' }, …]

// Health: shared by every resolution of this mport router.
const packages = createRouter(routes, { circuitBreaker: { failures: 3, reset: '30s' } });
fromMport(packages).mport.health.snapshot();

// Lockfile pinning: versions and builds come back without registry lookups.
const pinned = fromMport(createRouter(routes, { lock: JSON.parse(lockText) }));
```

## CLI: compile to an import map

```js
// modules.config.js — a config object, or ({ lock }) => config
import { createRouter, fallback, esmSh, jsDelivr, unpkg, jsr } from 'mport';
import { basicRouter, chainRouters, fromMport } from '@johnhenry/web-module-graph/routers';

export default ({ lock }) => ({
  router: chainRouters(
    basicRouter({ routes: { '@ui': () => '/components/all.html' } }),
    fromMport(createRouter({ '*': fallback(esmSh(), jsDelivr(), unpkg()), '@std/*': jsr() }, { lock })),
  ),
  specifiers: ['@ui', 'react@^19', 'lit/', 'jsr:@std/path@^1'],
  scopes: { 'https://legacy.example.com/': ['react@18'] }, // or mport's form: { react: 'react@18' }
  importMap: { imports: { app: '/app.js' } },              // merged in
});
```

```bash
web-module-graph build --out importmap.json --lock modules.lock.json   # --html for a <script type="importmap">; --relock
web-module-graph resolve react@^19 --trace
```

- Package keys drop the version, as in mport (`react@^19` → `react`); other keys are the specifier as written.
- The lockfile is mport's format, `{ lockfileVersion: 1, packages }`, keyed like mport: by the specifier as written (`react@^19`, or `npm:react@^19` if you wrote the prefix), with the serving registry in each entry's `registry`. Entries from non-package routers are keyed by the specifier (`"<scope> <specifier>"` inside scopes); mport ignores them.
- If the `--lock` file exists, the CLI reads it and passes it to a config function, so a rebuild pins the same versions and builds without asking the registry. `--relock` ignores it.
- If `router` is a plain mport router (and scopes use mport's object form), the CLI calls mport's `router.build()` directly. Otherwise it uses `compileImportMap()`, with mport's own `compileImportMap` and `mergeImportMaps` when mport is installed.
- mport's default `probe: "head"` works in Node, so live CDN configs work at build time too.

`compileImportMap(router, specifiers, { scopes, signal, compile })` is also exported for use in code; its output matches mport's `router.build()` for the same mport router.

## Migrating from the built-in CDN routing

The CDN pieces that duplicated mport are gone or reduced to thin wrappers:

| Before | Now |
|---|---|
| `mportRouter({ MPortURL, mport: { cdns }, match })` (mport 1.x race) | **Deprecated.** Use `fromMport(createRouter(routes, options))`. `mportRouter({ routes, module, ...createRouterOptions })` still works as a thin wrapper (default routes `{ '*': [esmSh(), jsDelivr(), unpkg()] }`, `probe: "import"`), and the 1.x form with `MPortURL` still calls mport's v1 API. |
| `basicRouter({ routes: { '*': [a, b] }, probe })`: ordered fallback with a probe | **Removed.** `basicRouter` is for static aliases; several targets or a `probe` throw a `TypeError` that explains the migration. Use `fromMport(createRouter({ '*': fallback(custom(a), custom(b)) }, { probe }))`. |
| `httpProbe({ fetch, timeout })` | **Removed.** mport's default `probe: "head"` (HEAD, then GET on 405/501), or `probe: fn`. |
| `parsePackageSpecifier(s)` → `{ name, version, path }` | **Removed.** Use mport's `parseSpecifier(s)` → `{ registry, name, range, path, prefix }` (`version` is `range`). It also handles `jsr:` and `github:`. |
| Lockfile `{ "<specifier>": { specifier, url, provider, route } }` | mport's `{ lockfileVersion: 1, packages: { "react@^19": { registry: "npm", … } } }`. |
| Import-map keys were the specifier as written (`react@19`) | Resolutions with a `key` (mport) use it (`react`). |
| `mport` peer `>=1.0.0` | `^2.0.0` (still optional). |

## Examples

Run `npm install`, serve the package root (for example `python3 -m http.server`) and open `/examples/`. The hub lists every page with the
capability-checklist items it covers; together they cover the whole checklist. All pages except `cdn.html` work offline.

Pages that route packages load mport v2 through a page import map, `{ "mport": "../node_modules/mport/src/index.mjs" }`. `node_modules/mport` is a symlink to the local mport checkout, created by `npm install` from the `file:` devDependency, so it is always current; after switching mport branches there is nothing to refresh. (Loading mport from a second local server, such as mport's own `python3 -m http.server 8712`, does not work: module scripts need CORS headers across origins, and Python's server sends none.)

| Page | Shows |
|---|---|
| `quickstart.html` | The one-script bootstrap (`src/browser.js`), a page import map, a barrel, `<define-element>` before its import. |
| `component-library.html` | A component library written as HTML modules: templates, tokens, icons, JSON, module scripts, a nested barrel. |
| `barrels.html` | Barrels of barrels using every re-export form, with checks for shadowing, ambiguity, `default` and diamonds. |
| `registration.html` | One class under several tags, `<define-element>` before/after/late, custom prefixes, `registry`/`scope`/`window` options. |
| `theming.html` | Adopted stylesheets, theme switching, one sheet shared with shadow roots, the `cssText` fallback. |
| `import-maps.html` | An editable import-map playground: exact, prefix, scopes, URL keys, merging, and loader scopes in re-exports. |
| `routers.html` | A traced chain ending in `fromMport()`: `npm:`/`jsr:` ranges, fallback, race and adaptive strategies, health and the circuit breaker, lockfile pinning and `verified()` integrity, against local mirrors and a local registry. |
| `loader-timeline.html` | Every loader event on a live timeline: nesting, cache hits, de-duplication, eviction and retry. |
| `loader-hooks.html` | A module graph served from memory through every loader hook. |
| `errors.html` | Every error path, triggered on purpose and shown on the page. |
| `app.html` | A task board app built from HTML modules. |
| `cli.html` | An import map and mport-format lockfile compiled by the CLI (`examples/cli/`), used at runtime and fed back to mport to pin versions. |
| `cdn.html` | Live routing of `npm:` and `jsr:` specifiers across public CDNs with mport v2, with traces and provider health (needs network access). |

## Development

```bash
npm test        # node:test (linkedom provides the DOM; HTML modules need no doctype or <html> wrapper)
npm run build   # syntax-check all sources + import entry points (no compile step)
```

mport is a `file:` devDependency pointing at the local checkout (`../../mport`), so the tests run the real mport v2 offline, with a fake `fetch` for registries and CDNs.

## Not implemented (yet)

These parts of the design are deferred:

- package.json-driven dependency graphs (resolving a package's own dependencies). Ranges, strategies, health, integrity and lockfiles are mport's.
- Runtime fallback after the browser's native loader has already picked a URL. There is no standard hook for this; mport's `router.import()` retries mirrors for JS it imports itself.
- JS importing `.html` natively (`import { Card } from "./ui.html"`). This needs a bundler plugin or future platform support. For now, use `loader.load()`.
- HTML expressions that use namespace bindings (`UI.Card`), and SSR.
- Cyclic `export *` between HTML modules (rejected; see Re-exports).

## License

MIT
