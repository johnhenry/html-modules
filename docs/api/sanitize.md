# Sanitizing templates

[API reference](../api.md) › Sanitizing templates

A module URL is as trusted as a `<script src>` (see the README's [Security model](../../README.md#security-model)):
a component's template is stamped into the page as real DOM, so `<img onerror>`, `<a href="javascript:…">`,
`<iframe srcdoc>`, inline handlers and `<script>` in it run. The `sanitize` option is the opt-in for modules from a
less-trusted origin: a function every component template passes through **at load time**, before any component is
defined. It is a hook, not a sanitizer: html-modules ships none, so the safety of the result is the function's.
[`@johnhenry/html-modules/safe-fragment`](#the-safe-fragment-adapter) adapts `@johnhenry/safe-fragment` to it.

- [The `sanitize` function](#the-sanitize-function)
- [Where it can be set](#where-it-can-be-set)
- [When it runs: load time](#when-it-runs-load-time)
- [What it covers, and what it does not](#what-it-covers-and-what-it-does-not)
- [Data binding, Trusted Types and caching](#data-binding-trusted-types-and-caching)
- [Reports](#reports)
- [The safe-fragment adapter](#the-safe-fragment-adapter)
- [What a template loses](#what-a-template-loses)
- [Errors](#errors)

## The `sanitize` function

```ts
type Sanitizer = (
  html: string,
  context: {
    def: Readonly<Record<string, any>>,   // the component's record: name, shadow, delegatesFocus, styles, props, … (template is the raw one)
    url: string,                           // the module's resolved URL
    window: Window,                        // the window the module is loaded for
    report(details: unknown): void,        // announce what was removed (see Reports)
  },
) => string | TrustedHTML | DocumentFragment | Promise<string | TrustedHTML | DocumentFragment>;
```

It is called once per **component template** (`<html-export><template>`), with the template's HTML exactly as the module
wrote it (bindings included), and returns what to stamp:

- a **string**: parsed when the component is registered, through the page's Trusted Types policy, as an unsanitized template is;
- a **`TrustedHTML`** (or anything else with a `toString()`): converted to its string and then handled as a string, so
  the page's own policy still wraps it at the sink;
- a **`DocumentFragment`**: kept as the template and **never parsed again**. It is copied (not moved) into each window
  that registers the component and cloned for every instance, so there is no `innerHTML` anywhere on the path
  (the right return value for a sanitizer that already built a DOM: no step serializes the sanitized tree and parses
  it again). The fragment is cloned when the sanitizer returns it: later changes the
  sanitizer's own code makes to it do not reach the component.
- anything else, or a throw, rejects the whole load: `TypeError: sanitize returned <type> for component "<name>" of
  <url>: return a string, a TrustedHTML or a DocumentFragment`. Nothing from that module is registered, and the failed
  load is not cached.

`def` is the record entry of the component (the same shape as `readHTMLModule()` returns), not a registered
`HTMLComponent`: at this point there is none. Only components are visited: stylesheets (`<html-export><style>`) and
data exports are not markup, and **the module source is never sanitized** (that would strip `<html-export>` and
`<html-import>`; only what a module chose to put in a `<template>` is).

## Where it can be set

| Where | Form | Scope |
| --- | --- | --- |
| `createHTMLModules({ sanitize })`, `createLoader({ sanitize })` | a function | every HTML module the instance loads, and what they import |
| `HTMLModules.sanitize = fn` / `instance.sanitize = fn` | a function, `false` or `undefined` | the loads that **start afterwards**; a module already cached unsanitized stays that way, and a sanitized load is cached apart |
| `HTMLModules.import(src, { sanitize })`, `HTMLModules.load(src, { sanitize })`, `loader.load()` | a function, or `false` | this module and the HTML modules it imports; `false` opts out even of the instance's |
| `<html-import>`'s `el.sanitize` property | a function or `false`; set before the import starts | this import. Setting it after loading started is an `error` event, like changing `src` |
| `HTMLModules.hotReload(src, { sanitize })` | a function or `false` | which cached copy to reload (default: the instance's) |

Precedence, most specific first: the call or element, then the instance. `false` is "none" at any level.

**There is no attribute and no `<html-import-settings sanitize>`.** Settings are strings that two readers (the DOM
reader and the compiler's scanner) and the compiler must agree on, and they stay lexical to a document; a function is
none of that. Name your sanitizer in script, before the imports start. On a page that uses `browser.js`, do it in the
module script that imports it, so it runs before the elements upgrade (their imports start in a microtask after the
script that defined them):

```html
<script type="module">
  import { HTMLModules } from '@johnhenry/html-modules/browser';
  import { safeFragmentSanitizer } from '@johnhenry/html-modules/safe-fragment';
  import * as safeFragment from '@johnhenry/safe-fragment';
  HTMLModules.sanitize = safeFragmentSanitizer({ safeFragment, profile: { namespaces: ['ui'] } });
</script>
<html-import src="https://cdn.example/ui.html" as="ui"></html-import>
```

For one import in markup, make the element in script (`createElement('html-import')`, set `src`, `as` and `sanitize`, then
append it), or use `HTMLModules.import()`.

## When it runs: load time

`viewOf()` in the runtime, which turns a template into DOM when a component is registered, is synchronous, and a
custom element definition cannot wait. So the sanitizer does not run there: the **loader** runs it after the module record
has been read and before the module's definitions are created. Consequences:

- **A sync and an async sanitizer are the same thing**: `await` is applied to whatever it returns. An async one (one
  that loads a library on first use, as safe-fragment's DOMPurify fallback does) delays the load, never the render.
- Templates are already sanitized when they are stamped; stamping adds no step and no sanitizer call per element.
- Nothing is registered until every template of the module (and of the modules it imports) is done, and a failure
  registers nothing.
- The templates of one module are sanitized concurrently.

The cost is that a sanitizer is part of **loading**: it is not applied to definitions made some other way
(`defineHTMLComponent({ template })`, a compiled module, `toComponent(<template>)`): those are your own code, not a
fetched module. See below.

## What it covers, and what it does not

Covered: every component template of an HTML module loaded with a sanitizer, **and of every HTML module it imports,
eagerly or lazily, and every module those import, with the same function**. A trusted module never pulls its
dependencies through a lesser path.

Not covered, and so yours:

- **A JavaScript module a sanitized module imports is refused.** `import()` runs a file with the page's authority and a
  sanitizer only vets markup, so `<html-import src="./x.js">` (or a re-export of one) inside a sanitized HTML module
  rejects with `Error: Refusing to import the JavaScript module <url> from a sanitized HTML module: …`. A JavaScript module
  the *page* imports is not affected by the sanitizer (it is the page's own choice).
- **Stylesheets.** `<html-export><style>` is outside the template and is not given to the sanitizer: CSS can still reveal
  state to a server (`url()` and `@font-face` requests keyed on attribute selectors) and redress the UI. Safe-fragment cannot
  carry `<style>` either (see [What a template loses](#what-a-template-loses)). Stylesheet exports from a module you do not
  trust are a decision for you.
- **Compiled modules.** The compiler's output is JavaScript that calls `defineHTMLComponent()` with the templates as
  strings; there is no load step to hook, and compiled code is as trusted as any script you ship.
- **What your scripts later put in a component**, the light DOM the page gives a component, and `{{attr}}` values (see
  below). A sanitized template is a static tree; what your code or your users' attributes add to it is not sanitized.
- **`renderDeclarative()` of a fragment-backed template** serializes the sanitized DOM to a string for a server; the browser
  parses that string again. Serialization is the step a `DocumentFragment` otherwise avoids: sanitize on the server too, or
  render from the unsanitized definition of your own module.
- **Hot reload** of a sanitized module compares fragments as trees (an unchanged template is not re-stamped); pass the same
  `sanitize` to `hotReload()` as the import used.

## Data binding, Trusted Types and caching

- **`{{attribute}}` survives, as long as the sanitizer leaves the text alone.** The sanitizer sees the raw template, binding
  syntax included, and the binding sites are found afterwards in what it returns. A sanitizer that rewrites `{{`…`}}` (DOMPurify's
  `SAFE_FOR_TEMPLATES`, say) removes the bindings. URL-valued attributes (`href="/u/{{name}}"`, even `href="{{url}}"`) pass a URL
  allowlist as relative URLs, and the runtime then refuses `javascript:`, `vbscript:` and HTML `data:` values when it binds
  them, never writes `on*`, `style` or `srcdoc`, and sets text as text (see [Data binding](html-syntax.md#data-binding-in-templates)).
  `test/browser/sanitize.spec.js` runs a benign template with bindings through safe-fragment in all three engines.
- **Trusted Types composes.** The sanitizer's result is parsed through the same policy as before (the configured
  `trustedTypes` policy, else `"html-modules"`); a `DocumentFragment` never reaches an HTML sink. A sanitizer may have its
  own policy and its own CSP needs (safe-fragment's DOMPurify fallback creates one named `dompurify`: list it next to
  `html-modules` in `trusted-types`). html-modules wraps only what it parses.
- **A module is cached per sanitizer.** The cache key gains `#sanitize=<n>` for a sanitized load (`n` identifies the
  function), next to `#integrity=…`, so the same URL imported plain and sanitized, or through two functions, is two entries
  and two fetches, and an unsanitized copy never satisfies a sanitized request. `unload(src)` evicts every variant. Use one
  function object for the whole page (assign it once) or the cache never hits.

## Reports

A sanitizer can say what it removed with `context.report(details)` (`details` is any object). Each call is one event:

```js
{ type: 'sanitize', url, name /* the component, or null */, details }
```

delivered to the loader's `onEvent` (`createHTMLModules({ onEvent })`) and, as a `CustomEvent` named
**`html-modules:sanitize`** whose `detail` is that event, on the window's `document` (so a page that uses only
`<html-import>` can listen: `document.addEventListener('html-modules:sanitize', (e) => console.warn(e.detail))`). Reports of a
module come before its `load` event. Reporting never changes the outcome; it is a warning channel. A failure is not a report:
it is the load's `error` event and rejection.

## The safe-fragment adapter

```js
import { safeFragmentSanitizer, registerTemplateProfile } from '@johnhenry/html-modules/safe-fragment';
```

`@johnhenry/html-modules` has **no dependency on `@johnhenry/safe-fragment`**: the adapter is a peer import (an optional
`peerDependency`), and takes the library as an argument or imports it lazily with the page's import map or your bundler.

### `safeFragmentSanitizer(options)`

```ts
safeFragmentSanitizer({
  profile: string | { name?, base?, namespaces?, delimiter?, attributes?, dataAttributes? },
  safeFragment?: typeof import('@johnhenry/safe-fragment'),   // default: import('@johnhenry/safe-fragment'), lazily
  onReport?: (report: SanitizationReport, context: { def, url }) => void,
  quiet?: boolean,                                             // = false: do not announce removals as sanitize events
  sanitizeOptions?: { maxInputLength?, baseUrl?, loadDOMPurify? },
}): Sanitizer
```

For each template it calls `sanitizeToFragment(html, { profile, document: window.document })` and returns the
`DocumentFragment` (so nothing is parsed again). If the profile removed or rewrote anything it calls `context.report()` with
`{ profile, engine, removed: [{ what: 'element' | 'attribute' | 'url', tag, attribute?, reason, snippet? }] }`; your
`onReport` gets the library's whole `SanitizationReport`. DOMPurify's own bookkeeping entries (`body`, `remove`, listed as
removed from every input: safe-fragment#9) are not treated as removals. Errors from safe-fragment (`SOURCE_TOO_LARGE`,
`SANITIZER_UNAVAILABLE`, …) reject the load: it fails closed.

`profile` is the name of a profile registered with safe-fragment (`"ui-v1"`), or an options object for
`registerTemplateProfile()`, which is run once, on the first template.

### `registerTemplateProfile(safeFragment, options)`

Registers (once, by name) a profile derived for component templates, and returns its name.
`deriveProfile(base, …)` keeps everything `base` keeps and adds what a template needs and the built-ins do not allow:

| Option | Default | |
| --- | --- | --- |
| `base` | `"ui-v1"` | The profile to derive from (`"article-v1"` for read-mostly content). Must parse markup (not `plain-text-v1`). |
| `name` | `html-modules-<base>` | The new profile's name (`html-modules-ui-v1`). Registering a name that exists returns it unchanged. |
| `namespaces` | `[]` | `['ui']` keeps custom elements `ui--*` (prefix pattern): the module's own components. Others are unwrapped, their text kept. |
| `delimiter` | `"--"` | The namespace delimiter of those tags. |
| `attributes` | `[]` | More attributes the namespaced elements may carry (their `props`: `tone`, `label`). They already may carry `id`, `class`, `title`, `lang`, `dir`, `role`, `tabindex`, `part`, `slot`, `exportparts` and the `aria-*` of `ui-v1`. |
| `dataAttributes` | `[]` | More `data-*` names (full names: `data-id`; there are no wildcards). |

and on every element: `part` and `slot`; plus `<slot name>`.

### `<safe-fragment>` inside a template

A different job: a component **you trust** renders untrusted text a page hands it. Put safe-fragment's element in the
template and feed it a binding: `<safe-fragment profile="article-v1" content="{{bio}}"></safe-fragment>` (after
`registerSafeFragment()`). The host's `bio` attribute is sanitized and rendered, and re-rendered when it changes
(`content` is safe-fragment's lowest-precedence source and logs a console note; it is the one a `{{binding}}` can feed). It
is tested in `test/browser/sanitize.spec.js`. In a module loaded **with** the `sanitize` hook the element is not one of the
profile's custom elements (`registerTemplateProfile()` keeps `<namespace>--*` only), so it is unwrapped: use it in modules
you trust.

### The recipe without the adapter

The adapter is the five lines below plus the report; use them if you want a different shape:

```js
import { sanitizeToFragment } from '@johnhenry/safe-fragment';
HTMLModules.sanitize = async (html, { window }) =>
  (await sanitizeToFragment(html, { profile: 'ui-v1', document: window.document })).fragment;
```

(`sanitizeToFragmentSync` after `await preloadSanitizer()` works too, where the native Sanitizer API exists or DOMPurify is
preloaded; it throws `SANITIZER_NOT_READY` otherwise, which fails the load closed.)

## What a template loses

What a **component template** loses under each safe-fragment profile (checked in Chromium, where safe-fragment uses the native
Sanitizer API, and in WebKit, where it uses DOMPurify, with the pinned commit; Firefox runs the same tests in CI). A "template"
below is the `<template>` of an `<html-export>`.

Always removed, under every profile: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<template>`, `<noscript>`,
`<textarea>`, `<select>`, `<svg>` and `<math>`, each **with its content**; every `on*` attribute, `srcdoc`, `formaction`
and the `style` attribute; `javascript:`, `vbscript:`, `data:`, `file:` and `blob:` URLs. And always **rewritten**: every
`id`, and the attributes that refer to one (`for`, `aria-controls`, `aria-labelledby`, `aria-describedby`, `aria-owns`), gets a
`user-content-` prefix (DOM-clobbering protection): references inside the template still match, but a component's own script,
`form-control="#id"` or a selector in the module's stylesheet that names the id does not.

| Profile | Template survives as | Also lost |
| --- | --- | --- |
| `plain-text-v1` | **escaped text**: the template's HTML source, shown literally | everything: it never parses markup. Not usable for components. |
| `article-v1` | headings, `p`, `div`, `span`, lists, `dl`, `table`s, `a`, `img`, `figure`, inline formatting, `blockquote`, `time`; only `id`, `title`, `lang`, `dir` (and each element's own, such as `href`) | `<slot>` (unwrapped), `part`, `slot`, `class`, `data-*`, `aria-*`, `role`, `<button>`, `<label>`, all custom elements (unwrapped, their text kept), `<details>`, `<video>`, forms, `http:` and `srcset` |
| `ui-v1` | `div`, `span`, `section`, `header`, `footer`, `nav`, `main`, `article`, `aside`, `p`, `h1`-`h6`, `ul`/`ol`/`li`, `pre`, `code`, `a`, `img`, `label`, `button` (forced to `type="button"`); `class`, `id`, `role`, `tabindex`, `aria-*` (on the interactive elements), `data-action` | `<slot>` (unwrapped), `part`, `slot`, custom elements (unwrapped), `table`, forms, `<details>`, media, other `data-*`, `http:` and `srcset` |
| `email-v1` (scaffold) | table layout, inline formatting, links, images | `class`, `<button>`, `<label>`, `<slot>`, `part`, custom elements, relative `img src`, `http:` |
| derived by `registerTemplateProfile()` | `ui-v1`, **plus** `<slot name>`, `part` and `slot` on every element, and custom elements `<ns>--*` with their allowlisted attributes | `<style>`, `table`, forms (`<input>`, `<form>`, so a `form-associated` component loses its control), `<details>`, media, `style=""`, `data-*` other than the ones you add, `http:` and `srcset` |

URLs: `https:`, `mailto:` and relative URLs only (protocol-relative `//host` takes the page's scheme, so it is dropped on an
`http:` page). A relative `img src` loads on render (safe-fragment#6).

**What safe-fragment cannot carry, and what we did about it:**

- **`<style>` in a template: not supportable today.** It is refused in every profile (including derived ones) and a `<style>` in
  the input is removed with its content. html-modules is unaffected only because a module's styles live outside the template
  (`<html-export><style>`), which the sanitizer does not see (see above). Filed as
  [safe-fragment#11](https://github.com/johnhenry/safe-fragment/issues/11).
- **`<slot>`, `part`, `slot`**: possible only through a derived profile, which `registerTemplateProfile()` writes for you
  (also in #11).
- **Under Trusted Types** safe-fragment's DOMPurify fallback needs `dompurify` in the CSP's `trusted-types` list, and on
  the native path every sanitization is a blocked-sink violation report in Chromium
  ([safe-fragment#12](https://github.com/johnhenry/safe-fragment/issues/12)); the sanitizer still works, and with a CSP that
  does not allow the policy it fails closed (the module does not load).
- **A git install of safe-fragment is empty** (no `dist/`, no `prepare`;
  [safe-fragment#10](https://github.com/johnhenry/safe-fragment/issues/10)); this repository bundles the pinned commit with
  `npm run vendor:safe-fragment` for its tests.

## Errors

| When | Error |
| --- | --- |
| `sanitize` is not a function, `false` or `undefined` | `TypeError: Invalid sanitize in createLoader(): pass a function (html, { def, url, window }) => string \| DocumentFragment \| TrustedHTML (it may return a Promise), or false for none` (the same with ` in load()`, ` (sanitize)` for the setter) |
| `<html-import>.sanitize` is set to something else | `TypeError: Invalid sanitize on <html-import>: pass a function …` (thrown by the setter) |
| `<html-import>.sanitize` is set after loading started | `Error: <html-import sanitize> was set after loading started: …`, an `error` event on the element |
| The sanitizer returns something unusable | `TypeError: sanitize returned <type> for component "<name>" of <url>: return a string, a TrustedHTML or a DocumentFragment` (rejects the load) |
| The sanitizer throws or rejects | its error, rejecting the load (an `error` event on the `<html-import>`, `errors="throw"` aware) |
| A sanitized module imports JavaScript | `Error: Refusing to import the JavaScript module <url> from a sanitized HTML module: import() runs it with the page's authority, and a sanitizer only vets templates. Remove that <html-import>, or import the module from the page` |
| `safeFragmentSanitizer()` without a usable `profile` | `TypeError: safeFragmentSanitizer: pass { profile }: the name of a registered safe-fragment profile (e.g. "ui-v1"), or options for registerTemplateProfile() (e.g. { namespaces: ["ui"] })` |
| `safeFragment` is not the library | `TypeError: safeFragmentSanitizer: the safe-fragment module has no sanitizeToFragment() (pass the namespace of @johnhenry/safe-fragment)` (rejects the load) |
| `registerTemplateProfile()` | `TypeError: registerTemplateProfile: pass the @johnhenry/safe-fragment module (it needs getProfile, deriveProfile and registerProfile)`; `Error: registerTemplateProfile: safe-fragment has no profile named "<base>"`; `Error: registerTemplateProfile: "<base>" does not parse markup (its mode is "text"), so it cannot sanitize a template` |
