# Dev server, hot reload and Vite

[API reference](../api.md) › Dev server, hot reload and Vite

Editing an HTML module should update the page without a manual reload and, where possible, without losing the page's
state. Two tools do it: the `html-module dev` server (no build step, for pages that load modules at runtime) and a Vite
plugin (for HTML modules imported from JavaScript). Both rest on one runtime mechanism, [hot replacement](#hot-replacement).

- [`html-module dev [dir]`](#html-module-dev-dir)
- [`HTMLModules.hotReload(src)`](#htmlmoduleshotreloadsrc)
- [Hot replacement: what is swapped, and what is not](#hot-replacement)
- [`@johnhenry/html-modules/vite`](#johnhenryhtml-modulesvite)
- [`createDevServer(options)`](#createdevserveroptions) (`@johnhenry/html-modules/dev`)

## `html-module dev [dir]`

```sh
html-module dev ./site                 # http://127.0.0.1:5173/
html-module dev --port 8080 --host 0.0.0.0 -q
```

Serves `dir` (default `.`) as static files and watches it with `fs.watch` (recursive; `node_modules`, `.git` and editor
swap files are ignored). Only `node:http` and `node:fs`: no dependencies. Every response is `Cache-Control: no-store`.

| Flag | Meaning |
| --- | --- |
| `-p, --port <n>` | Port (default `5173`; `0` picks a free one) |
| `--host <host>` | Interface (default `127.0.0.1`) |
| `--no-watch` | Serve only |
| `-q, --quiet` | Do not log changes |

Exit with Ctrl-C. Exit code `2` for bad arguments, `1` when `dir` is not a directory.

**What reaches the page.** Every HTML *page* it serves (a navigation: `Sec-Fetch-Dest: document` / `iframe`, or an
`Accept` header asking for `text/html`) gets one `<script type="module" src="/@html-modules/client.js">` before
`</body>`. HTML modules fetched by the loader are served untouched, so `integrity` pins keep working. The client
opens a Server-Sent Events stream (`/@html-modules/events`) and reacts to each change:

| Changed file | The page does |
| --- | --- |
| an `.html` file the page loaded as an HTML module | `HTMLModules.hotReload(url)`: components and styles are swapped under live elements. If that [cannot be done in place](#hot-replacement), the page reloads. |
| an `.html` file the page never loaded as a module | nothing |
| the page itself, or any other file (script, stylesheet, compiled module, image) | a full reload |
| a module with a syntax error | nothing changes. The message is shown in an overlay (and `console.error`), and clears on the next good save. |

The page also gets a `html-modules:hot` event on `document` after each in-place update
(`detail: { path, reload, reasons, updated, elements }`). The client uses the page's own `globalThis.HTMLModules`
(set by `@johnhenry/html-modules/browser`), so it shares the page's module cache and registry; a page without it
simply reloads on every change. If the server restarts, connected pages reload.

Not a goal: a production server, HTTPS, proxies, bundling, or transforming files (compiled `.js` modules reload the page;
for in-place updates of those use the [Vite plugin](#johnhenryhtml-modulesvite)).

## `HTMLModules.hotReload(src)`

```ts
HTMLModules.hotReload(src: string, options?: { base?: string }): Promise<{
  reload: boolean,        // true: nothing was swapped; reload the page
  reasons: string[],      // why, when `reload`
  updated: string[],      // export names (camelCase) swapped
  elements: number,       // live elements re-stamped or restyled
  skipped?: true,         // the module was never loaded by this instance: nothing to do
}>
```

Fetches the module again with `cache: 'no-cache'` (the loader's new `cache` fetch option), replaces its entry in the
module cache, and applies [hot replacement](#hot-replacement) of the old namespace by the new one. It **rejects**,
leaving the old module cached and live, when the new source is invalid (a `SyntaxError` as in
[Errors](errors.md#module-source-exports)) or the fetch fails. A binding error in the new template (an `{{ expression }}`)
is a `reload: true` reason, not a half-applied swap. Related additions: `loader.reload(specifier, referrer?)` and
`load(src, { cache })`, where `cache` is any fetch `RequestCache` value.

## Hot replacement

A custom element definition cannot be replaced, so `customElements.define` classes made by html-modules **delegate to a
swappable definition**: each template-backed class holds a slot, and its instances read their template, styles and
settings from the slot's current `HTMLComponent`. Replacing a definition under a slot:

- **re-stamps** each live element's shadow root when the template changed: the root, host element, class, event listeners
  on the host, attributes and light DOM are kept; the shadow content is rebuilt and its bindings re-bound (focus inside the
  shadow root is lost). A form-associated component keeps its value;
- **swaps adopted stylesheets** when styles changed, without re-stamping: the old constructed sheets are removed and the
  new ones adopted (or the `<style>` fallback replaced);
- makes elements created later use the new definition, and lets the replacement be registered under the same tag again (it
  is the same component, so `conflict` does not fire);
- swaps a **stylesheet export** in every root that adopted it (a page's `<html-binding adopt>`, another module's components).

**What cannot be applied in place** (the page reloads, and nothing was changed): `<html-export>`s added or removed, a
data export whose value changed, a changed `shadow`, `delegates-focus`, `form-associated`, `form-control` or `form-role`; a template
that needs observed attributes or `props` the registered class does not have (`observedAttributes` and property
accessors are fixed when the tag is defined); changed `<html-import>`s of the module; a JavaScript-authored class. Scoped
registries and `registry`-bound imports follow the same rules.

The same functions are exported for tooling: `hotReplaceModule(previousNamespace, nextNamespace)` (what `hotReload()` and
the Vite plugin call), `hotReplaceComponent(previous, next)` and `hotReplaceStylesheet(previous, next)`; see
[Runtime](runtime.md#hot-replacement).

## `@johnhenry/html-modules/vite`

```js
// vite.config.js
import htmlModules from '@johnhenry/html-modules/vite';
export default { plugins: [htmlModules()] };
```

```js
// main.js
import { customCard } from './ui.html';    // a definition, exactly as `html-module ui.html` compiles it
customCard.define('x-card');
```

An `.html` file imported **from JavaScript** (or from another compiled HTML module) is compiled by the same
`compileHTMLModule()` the CLI uses, so it behaves exactly like the runtime-loaded module (bindings, props, settings,
re-exports, form association). An `.html` *entry page* is left to Vite. Dependencies (`<html-import src>`,
`<html-export src>`) stay `.html` imports and are compiled in turn, so a bundle contains each module once and a
production `vite build` has no `.html` left. The module is watched (`addWatchFile`).

In `vite dev` the compiled module also accepts itself: after an edit it calls `hotReplaceModule()` with the module's
previous exports, which swaps components and stylesheets under live elements ([above](#hot-replacement)), and calls
`import.meta.hot.invalidate(reasons)` (a full reload) when that cannot be done in place. `vite build` emits no HMR code.

| Option | Meaning |
| --- | --- |
| `runtime` | Where compiled modules import the runtime from (default `@johnhenry/html-modules/runtime`; alias it in `resolve.alias` in a monorepo) |
| `format`, `as`, `delimiter`, `conflict` | As for [`compileHTMLModule`](compiler.md#compilehtmlmodulesource-options) (`register` format registers on import) |
| `hot` | `false` turns the HMR code off in dev (default `true`) |

A broken module fails the build (or shows Vite's error overlay in dev) with the same `SyntaxError` the CLI would print.
`vite` is a dev dependency of this package only: the plugin imports nothing from it, and `src/vite.js` ships as plain
ESM. Not covered: CSS `url()` rewriting beyond what the runtime does (compiled modules resolve against `import.meta.url`,
which Vite rewrites for bundled assets only if the URL is a literal import), and `.html` files imported with `?raw` or `?url`.

## `createDevServer(options)`

`@johnhenry/html-modules/dev` exports the server behind the CLI:

```ts
createDevServer(options?: {
  dir?: string,                       // = "."
  port?: number,                      // = 5173; 0 picks a free port
  host?: string,                      // = "127.0.0.1"
  watch?: boolean,                    // = true
  log?: (line: string) => void,
}): Promise<{
  server: http.Server, url: string, port: number, dir: string,
  clients: Set<ServerResponse>,       // open event streams
  notify(path: string, kind?: string): void,   // push a change event by hand
  close(): Promise<void>,
}>
```

It rejects when `dir` is not a directory or the port is taken. `injectClient(html)` is exported too. The event stream's
`change` events carry `{ path, kind }` with `path` a `/`-rooted URL path.
