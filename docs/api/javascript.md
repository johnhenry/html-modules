# JavaScript API: `HTMLModules`

[API reference](../api.md) › JavaScript API

`<html-import>` is a thin layer over an `HTMLModules` instance, so markup and script share one module cache, one
parser and one set of binding rules. In a browser, `@johnhenry/html-modules/browser` creates the shared instance and
exports it as `HTMLModules` (also `globalThis.HTMLModules`). Anywhere else, or for a second, isolated instance, call
`createHTMLModules()`.

- [`createHTMLModules(options)`](#createhtmlmodulesoptions)
- [The instance](#the-instance): [`load`](#load), [`import`](#import), [`bind`](#bind), [`resolve`](#resolve),
  [`cache`](#cache), [`options` / `delimiter` / `base`](#options-delimiter-base), [`loader`](#loader)
- [Lazy loading](#lazy-loading) and [the lazy handle](#the-lazy-handle)
- [Resolution](#resolution), [caching and cycles](#caching-and-cycles), [the namespace shape](#the-namespace-shape)
- [`defineHTMLModuleElements()`](#definehtmlmoduleelements)
- Lower level: [`createLoader`](#createloaderoptions), [`linkHTMLModule`](#linkhtmlmodulerecord-modules-options),
  [`createNamespace`](#createnamespaceentries), [`lazyTargets`](#lazytargetsspec),
  [`watchLazy`](#watchlazywindow-targets-fire), [`componentRoot`](#componentroothost)

```js
import { HTMLModules } from '@johnhenry/html-modules/browser';

const ui = await HTMLModules.load('./ui.html');                     // a namespace; registers nothing
await HTMLModules.import('./ui.html', { as: 'ui' });                // = <html-import src="./ui.html" as="ui">
await HTMLModules.import('./ui.html', { bindings: [{ export: 'card', element: 'x-card' }] });
const lazy = HTMLModules.import('./ui.html', { as: 'ui', load: 'lazy' });  // a handle, not a promise
HTMLModules.bind(ui, { as: 'admin', delimiter: '-' });              // bind a namespace you already have
HTMLModules.resolve('./ui.html');                                   // → "https://example.com/ui.html"
HTMLModules.cache;                                                  // Map<URL, Promise<namespace>>
```

## `createHTMLModules(options)`

```ts
createHTMLModules(options?: {
  window?: Window;                       // = globalThis
  registry?: CustomElementRegistry;      // = window.customElements
  // this instance's import defaults (validated; see "Precedence" below)
  delimiter?: string;                    // = "--"
  base?: string;                         // no default
  conflict?: 'error' | 'reuse';          // = "error"
  load?: 'eager' | 'lazy';               // = "eager" (applies to <html-import> elements only)
  errors?: 'event' | 'throw';            // = "event"
  // loader hooks (see createLoader)
  baseURL?: string;                      // = document.baseURI ?? location.href
  hostResolve?: (specifier: string) => string | URL | null | undefined;
  fetch?: typeof fetch;                  // = globalThis.fetch
  parseHTML?: (html: string, url: string) => Document;   // = new window.DOMParser().parseFromString(html, 'text/html')
  importModule?: (url: string) => Promise<object>;       // = (url) => import(url)
  onEvent?: (event: { type: 'fetch' | 'load' | 'error', url: string, kind?: 'html' | 'js', error?: unknown }) => void;
}): HTMLModulesInstance
```

| Option | Default | Meaning |
| --- | --- | --- |
| `window` | `globalThis` | The window whose `HTMLElement`, `DOMParser`, `CustomEvent`, `MutationObserver` and `document` are used. Pass a test DOM's window (linkedom, jsdom) in Node. |
| `registry` | `window.customElements` | Where `bind()` and `import()` register tags. (The elements use their own `registry` option; see [`defineHTMLModuleElements`](#definehtmlmoduleelements).) Reserved for scoped registries later; see the README's limitations. |
| `delimiter` | `"--"` | Default namespace delimiter for this instance's `<html-import>` elements, `import()` and `bind()`. |
| `base` | none | A base URL for this instance's import specifiers, resolved against `baseURL`. Exposed (absolute) as `instance.base`. |
| `conflict` | `"error"` | Default for tags already defined by a different definition. |
| `load` | `"eager"` | Default for `<html-import>` elements. `import()` is lazy only when the call says `load: 'lazy'`. |
| `errors` | `"event"` | `throw` also passes failures to `reportError()`. |
| `baseURL` | `document.baseURI`, else `location.href` | The referrer for top-level relative specifiers. |
| `hostResolve` | none | Resolves bare specifiers. `/browser` passes `(s) => import.meta.resolve(s)`, which applies the page's import map. Return a falsy value for "unresolvable". |
| `fetch` | `globalThis.fetch` | Fetches HTML modules. Only `ok`, `status` and `text()` of the response are used. |
| `parseHTML` | the window's `DOMParser` | Parses fetched HTML into a `Document`. Without either, loading an HTML module throws `` TypeError: No DOMParser available; pass `parseHTML` to createLoader() ``. |
| `importModule` | native `import()` | Loads JavaScript modules. |
| `onEvent` | no-op | Observes the loader: `{ type: 'fetch', url }` before an HTML module is fetched; `{ type: 'load', url, kind }` and `{ type: 'error', url, kind, error }` when any module (HTML or JS) settles. |

Precedence: these import defaults sit **below** each `<html-import>` attribute and its document's
`<html-import-settings>`, and **never apply inside HTML modules** (whose imports use their own settings or the
built-in defaults). For `import()` and `bind()`, the call options override them.

Throws `SyntaxError` for an invalid `delimiter`, `base` (blank), `conflict`, `load` or `errors`, with ` in
createHTMLModules()` in the message: `Invalid load="soon" in createHTMLModules(): use "eager" or "lazy"`.

## The instance

### `load`

```ts
instance.load(src: string, options?: { base?: string, type?: 'html' | 'js' }): Promise<namespace>
```

Resolve, fetch, parse and link a module, and resolve with its namespace, **without registering anything**. HTML
modules (`.html` / `.htm`, or `type: 'html'`) are fetched and read; anything else is imported with `importModule`.
`base` overrides the instance `base` as the referrer for a relative `src`. Cached by resolved URL (see
[caching](#caching-and-cycles)). Rejects on a fetch failure (`Error: Failed to fetch HTML module <url>: <status>`),
any module `SyntaxError`, a dependency failure, or a cycle.

A loaded HTML module's dependencies are loaded too (eager ones), but its components are only registered, and their
dependencies bound, when something registers them: `ns.card.define('my-card')`, `bind()`, `import()`, or an
`<html-import>`.

### `import`

```ts
instance.import(src: string, options?: {
  as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>,
  base?: string, type?: 'html' | 'js', root?: Document | ShadowRoot,
  conflict?: 'error' | 'reuse', load?: 'eager' | 'lazy', errors?: 'event' | 'throw',
}): Promise<{ module, elements, values, tags }> | LazyHandle
```

The programmatic `<html-import>`: `load()` then `bind()`. Options default to the instance options (`delimiter`,
`conflict`, `errors`); `load` defaults to `'eager'` whatever the instance says; `root` (where `adopt` bindings go)
defaults to `window.document`.

- **Eager** (default): returns a `Promise` of `{ module, elements, values, tags }` (see [`bind`](#bind) for the shape).
- **`load: 'lazy'`**: returns a [lazy handle](#the-lazy-handle) **synchronously**, not a promise (so `await` does
  not wait for first use).
- An invalid `delimiter`, `conflict`, `load` or `errors` is a **rejected promise** (never a throw, and never a
  handle), with ` in HTMLModules.import()` in the message.
- `errors: 'throw'`: a rejection is also passed to `reportError()`.
- Document settings never apply to `import()`: it is not in any document.

### `bind`

```ts
instance.bind(module: object, options?: {
  as?: string, delimiter?: string, bindings?: Array<{ export, element?, adopt? }>,
  from?: string, root?: Document | ShadowRoot, conflict?: 'error' | 'reuse',
}): { elements: Record<tag, Class>, values: Record<exportName, unknown>, tags: Record<tag, { tag, namespace, export, reused? }> }
```

Bind a namespace you already have (runtime-loaded, compiled, or any JS module), synchronously: the same rules as
`<html-import>` ([What gets bound](html-syntax.md#what-gets-bound)). Uses the instance registry and window;
`delimiter` and `conflict` default to the instance options; `root` defaults to `window.document`; `from` names the
module in error messages (default `"module"`). Throws on the first failure. This is
[`bindModule()`](runtime.md#bindmodule) with the instance's defaults.

### `resolve`

```ts
instance.resolve(src: string, base?: string): string
```

Resolve a specifier the way `<html-import src>` would, against `base`, else the instance `base`, else `baseURL`.
See [Resolution](#resolution). Throws `TypeError` for an unresolvable bare specifier.

### `cache`

`Map<string, Promise<namespace>>`: resolved URL → the load promise. Shared with every `<html-import>` of the
instance. A failed load is removed so it can be retried. Deleting an entry forces the next load to fetch again (it
does not unregister anything already registered).

### `options`, `delimiter`, `base`

- `options`: the instance's import defaults after validation, frozen: `{ delimiter, conflict, load, errors }`.
- `delimiter`: `options.delimiter`.
- `base`: the instance `base` option resolved to an absolute URL (against `baseURL`), or `undefined`.

### `loader`

The underlying [`createLoader()`](#createloaderoptions) object: `{ load, resolve, cache, baseURL }`.

## Lazy loading

With `load="lazy"` (or `load: 'lazy'`), nothing is fetched until one of the import's tags is used.

- **What it waits for** ([`lazyTargets`](#lazytargetsspec)): a namespace import waits for **any tag starting with
  `<as><delimiter>`** (the export names are unknown before loading, so the prefix is matched: with
  `delimiter="-"`, `ui-` also matches `ui-kit-card`). With bindings, it waits for **exactly** the tags they bind
  (`element=`, or `<as><delimiter><export>`); bindings that register no tag (`adopt`, data, `export="default"`
  without `element=`) add nothing. An import with nothing to wait for (no `as`, no element-producing binding) loads
  only when `load()` is called.
- **Where it looks**: one `MutationObserver` per window (`childList` + `subtree`) on the document, plus a scan of
  what is already there when a watcher is added; and every shadow root created by an html-modules component, open or
  **closed** (the runtime reports each one as it stamps it). The observer runs only while some lazy import is
  waiting.
- **What it does not see**: shadow roots created by other code (a JS component's own `attachShadow()`), other
  documents (iframes), elements not yet inserted (`document.createElement('ui--card')` counts only once attached),
  and `<template>` content until it is cloned into a watched tree. Call `load()` for those.
- **Element API**: `ready` resolves after load and bind; `load()` forces it; `module` waits; `state` is `waiting`
  until then. Disconnecting a waiting import cancels the watching (`idle`); reconnecting resumes it.
- **Inside modules**: a module's own lazy import loads when one of its tags first appears (usually inside one of the
  module's components' shadow roots). A failure fires `error` (bubbling, composed, `detail.lazy === true`) on the
  element that used the tag. A lazy module import may not `adopt`.
- **Compiled code is never lazy**: compiled dependencies are static `import`s. `load` is carried in `$imports` for
  fidelity only.
- Throws `TypeError: load="lazy" needs MutationObserver, which this window does not have` when a lazy import has
  something to watch in a window without `MutationObserver`.

### The lazy handle

`instance.import(src, { load: 'lazy', … })` returns:

| Member | Type | Description |
| --- | --- | --- |
| `src` | `string` | The `src` as passed. |
| `ready` | `Promise<{ module, elements, values, tags }>` | Settles when the module has been loaded and bound: after one of its tags appears, or after `load()`. Stays pending forever if neither happens (for example after `cancel()`). |
| `load()` | `() => Promise` (returns `ready`) | Load now. Works after `cancel()` too. Idempotent. |
| `cancel()` | `() => void` | Stop watching. Only while `waiting`; a no-op afterwards. |
| `state` | `"waiting"` \| `"cancelled"` \| `"loading"` \| `"loaded"` \| `"error"` | Getter. |

```js
const ui = HTMLModules.import('./ui.html', { as: 'ui', load: 'lazy' });
ui.state;            // "waiting": nothing fetched
await ui.ready;      // once a <ui--…> appears in the document or a component's shadow root, or after ui.load()
```

## Resolution

`src` resolves like a module specifier, in this order:

1. **Relative** (`./`, `../` or `/` at the start): against the referrer (a page's `<html-import-settings base>`,
   else the instance `base`, else the document base URL; inside a module, its `<html-import-settings base>` resolved
   against the module URL, else the module URL). `TypeError: Cannot resolve "…" without a base URL` when there is no
   referrer.
2. **Absolute URL** (anything `new URL()` accepts on its own): used as is.
3. **Bare** (everything else): `hostResolve(specifier)`; in the browser, the page's import map via
   `import.meta.resolve`. Import maps only map URLs: html-modules still fetches and parses the HTML. A falsy result is
   `TypeError: Unable to resolve bare specifier "…" from <referrer>`.

Note that `ui.html` (no `./`) is a **bare** specifier, exactly as in JavaScript: write `./ui.html`.

## Caching and cycles

- Modules are cached by resolved URL as promises, so repeated and concurrent loads share one fetch and one parse,
  and every `<html-import>` of the same URL gets the same namespace (and the same definitions: identity is
  preserved).
- A failed load is evicted; the next import retries.
- Circular dependencies between HTML modules (imports or re-exports, including self-references) are rejected with
  the cycle in the message (`Error: Circular HTML module dependency: …/a.html -> …/b.html -> …/a.html`), whether the
  modules load one after another or concurrently. Detection uses a wait graph, so concurrent loads of a cycle reject
  rather than deadlock.
- JavaScript modules are additionally cached by the browser's own module map for the life of the page.

## The namespace shape

What `load()` resolves to for an HTML module, and what `import * as ns` of the compiled module gives:

- a **frozen**, **null-prototype** object tagged `[object Module]`, keys sorted;
- one key per named export, **camelCased** (`fancy-button` → `fancyButton`);
- star re-exported names ([ESM `export *` rules](html-syntax.md#re-exports));
- `components`: a frozen manifest, export name as written → component (local components and named re-exports that
  are components, a namespace re-export's components as `<name>--<export>`, then star-re-exported components);
- `default`, when the module has one.

For a JavaScript module, `load()` returns its native module namespace unchanged.

## `defineHTMLModuleElements()`

```ts
defineHTMLModuleElements(options: {
  modules: HTMLModulesInstance,          // required
  window?: Window,                       // = globalThis
  registry?: CustomElementRegistry,      // = window.customElements; where bindings register tags
}): { HTMLImport, HTMLBinding, HTMLExport, HTMLImportSettings, HTMLModuleSettings }
```

Define the five elements over an instance. The elements are always defined on `window.customElements`; `registry`
is where their bindings register tags. Each element is defined only if its name is not taken, and the classes
actually registered are returned, so a second call is harmless. The settings elements are defined first, so that
when the elements are defined after the page has parsed, the settings are seen before any import starts. Throws
`TypeError: defineHTMLModuleElements: pass { modules } (from createHTMLModules())` without `modules`.

This is what `/browser` runs. To use the elements with your own instance (a custom `fetch`, a test DOM, other
defaults), import from the root entry point instead and call it yourself:

```js
import { createHTMLModules, defineHTMLModuleElements } from '@johnhenry/html-modules';

const modules = createHTMLModules({ delimiter: '-', errors: 'throw', hostResolve: (s) => import.meta.resolve(s) });
defineHTMLModuleElements({ modules });
```

## `createLoader(options)`

```ts
createLoader(options?: { baseURL?, hostResolve?, fetch?, parseHTML?, importModule?, window?, onEvent? }):
  { load(specifier, referrer?, { type? }?): Promise<namespace>, resolve(specifier, referrer?): string,
    cache: Map<string, Promise<namespace>>, baseURL: string | undefined }
```

The loader alone: resolve → fetch → parse → read the record → load dependencies → link. Options as in
[`createHTMLModules`](#createhtmlmodulesoptions). `load(specifier, referrer)` resolves against `referrer` (default
`baseURL`). No registration happens here.

## `linkHTMLModule(record, modules, options)`

```ts
linkHTMLModule(record: ModuleRecord, modules: Map<string, object>,
               options?: { lazy?: (src: string, type?: string) => () => Promise<object> }): namespace
```

Build a namespace from a [module record](records.md#the-module-record) and its loaded dependencies (`modules` maps
each `src` **as written** to its namespace). Creates one definition per component (each carrying the module's
imports with their options, per `moduleImportOptions()`), one `HTMLStylesheet` per stylesheet, the data values,
re-exports, the `components` manifest and `default`. A lazy import with no loaded module gets `lazy: options.lazy(src,
type)` instead of `module`. Throws for a missing re-exported name or conflicting star components.

## `createNamespace(entries)`

```ts
createNamespace(entries: Iterable<[string, unknown]>): object
```

A module-namespace-like object: null prototype, keys sorted, each property enumerable and non-writable, tagged
`Module`, frozen.

## `lazyTargets(spec)`

```ts
lazyTargets(spec?: { as?: string, delimiter?: string, bindings?: Array<{ export, element?, adopt? }> }):
  { tags: string[], prefixes: string[] }
```

The tags a lazy import waits for. With bindings: `element` tags, plus `<as><delimiter><export>` for bindings with
no `element`, not `adopt`, not `default` (an invalid tag is skipped here and reported when the binding is applied).
Without bindings but with `as`: the prefix `<as><delimiter>`. `delimiter` defaults to `"--"`.

```js
lazyTargets({ as: 'ui' });                                          // { tags: [], prefixes: ['ui--'] }
lazyTargets({ as: 'ui', bindings: [{ export: 'card' }, { export: 'x', element: 'my-x' }] });
                                                                    // { tags: ['ui--card', 'my-x'], prefixes: [] }
lazyTargets({});                                                    // { tags: [], prefixes: [] }: only load() loads it
```

## `watchLazy(window, targets, fire)`

```ts
watchLazy(window: Window, targets: { tags?: string[], prefixes?: string[] }, fire: (element: Element) => void):
  { cancel(): void, readonly active: boolean }
```

Call `fire(element)` **once**, the first time an element whose tag is in `tags` or starts with one of `prefixes`
is present in the window's document or in an html-modules component's shadow root, now or later. With no targets,
nothing is watched, `fire` is never called and `active` is `false`. `cancel()` stops watching. Throws the
`MutationObserver` `TypeError` above when needed and missing.

## `componentRoot(host)`

```ts
componentRoot(host: Element): ShadowRoot | null
```

The shadow root html-modules stamped for a component instance, **including a closed one**, or `null` for any other
element. Useful for tests and tooling that need to look inside closed components you own.
