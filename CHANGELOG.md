# Changelog

## Unreleased

Fixes found by an audit of the first build. Nothing is published yet, so these are folded into `0.0.0` when it ships.

### Features

- **An integrity manifest and a strict mode pin a whole module graph (#2).** `createHTMLModules({ integrity: { [url]: "sha384-…" }, strict })`:
  every HTML module fetched, at any depth (root, `<html-import>`, `<html-export src>`, lazy imports), is verified against its entry, and
  `strict: true` refuses an HTML fetch that has neither an entry nor an `integrity` attribute, before the request. The manifest is the shape of
  an import map's `integrity` object, so one object can drive both; `@johnhenry/mport` generates it (`build({ html })`, `htmlGraph()`,
  `mport build --html`, using `scanHTMLModule`). The per-import `integrity` attribute keeps working, and attribute and entry must both match.
  Unit tests (`test/integrity.test.js`) and browser tests on Chromium, Firefox and WebKit (`test/browser/integrity.spec.js`: a tampered
  module anywhere in a pinned graph is refused; strict refuses unpinned fetches and never requests them). `4558a7a`.
- **JavaScript imports are verified through the page's import map `integrity` (#1).** An `integrity` on an `<html-import src="*.js">` (or a
  manifest entry for a `.js` URL) is checked against the page's inline `<script type="importmap">` `integrity` entry for the resolved URL: a
  matching entry proceeds (the browser enforces it for `import()`), a missing or different one rejects with the entry to add and a pointer to
  mport's `build({ graph })`. It used to be a `TypeError` (`integrity applies to HTML modules only`). Browser tests on all three engines
  record per engine whether the tampered module was refused by the engine (`enforced`) or ran (`unsupported`). `4558a7a`.
- **Size budgets and bench tracking in CI.** `npm run size` fails the new CI `size` job when the packed tarball or the gzip size of any entry
  point (the file plus its relative imports) passes `package.json` `sizeBudget`; the bench stores its numbers as an artifact and warns (never
  fails) when a row is more than 3x worse than `bench/baseline.json`. `beae40a`.
- **JSR readiness (nothing is published).** `jsr.json` mirrors `package.json`, every entry point carries `@ts-self-types`, a test keeps the two in
  step, and CI runs `jsr publish --dry-run` (`npm run jsr-dry-run`). Creating the package on jsr.io is a manual step for the owner. `beae40a`.
- **README `## Family` lists `@johnhenry/workbench`.** `4558a7a`.

- **safe-fragment `99ac557`: the vendoring workaround is gone, `registerTemplateProfile()` derives from `component-template-v1`,
  and template ids are kept.** safe-fragment fixed its four issues: #10 (a git install now builds `dist/` through a `prepare`
  script, `1817d79`), #11 (the built-in `component-template-v1`, `idPolicy: "keep-in-shadow"`, `INVALID_OPTION`, `<style>` a
  documented non-goal, `77e5151`), #9 (reports list only genuinely removed nodes, `081f92c`) and #12 (zero Trusted Types
  violations, `f1e2647`), plus a whole-value `srcset` check (`5561b98`). Here: the devDependency pin moves to `99ac557`;
  `scripts/vendor-safe-fragment.js`, the Playwright `globalSetup`, `npm run vendor:safe-fragment` and `examples/vendor/safe-fragment/`
  are deleted, and the browser tests and `examples/sanitize.html` load `node_modules/@johnhenry/safe-fragment/dist/index.js`
  with an import map for `dompurify` (needed because safe-fragment's fallback engine does `import("dompurify")`; the test server
  already serves `node_modules`). `registerTemplateProfile()` now derives from `component-template-v1` by default (it was
  `ui-v1` plus a hand-built composition; `base: "ui-v1"` still works and is still completed by hand; the default profile name
  is `html-modules-component-template-v1`, and with nothing to add the built-in's own name is returned). New adapter option
  `idPolicy` (default `"keep-in-shadow"`): html-modules stamps every template into a shadow root (no light-DOM mode;
  `renderDeclarative()` emits `shadowrootmode`), where the clobbering that `user-content-` prefixing prevents cannot happen, so
  a component's `#id` selectors and `form-control="#id"` work in a sanitized module; the adapter keeps ids only for a component
  (`context.def`), never for a bare string, and `"prefix"` restores the old behavior. What a template still loses is
  documented (`<style>`, forms, SVG, `style=""`, `srcset`, most `data-*`, `http:`, unlisted custom elements). The native
  Sanitizer's report no longer lists what it strips itself (ADR 0007), so the browser tests branch on the engine.
  Tests: unit tests for the profile derivation and `idPolicy`; a browser test that kept ids clobber nothing and prefixed ids
  are prefixed. `bf3174e`; safe-fragment `99ac557`.
- **Data binding in templates.** `{{attribute}}` in a component template's text and attribute values reads the host
  element's attributes (no expressions, no `eval`, no `innerHTML`: strict CSP and Trusted Types safe); text is set as text,
  URL attributes refuse `javascript:` / `vbscript:` / HTML `data:` URLs, `on*`, `style` and `srcdoc` are never bound; a
  changed attribute patches only the bound nodes. `props="name count:number open:boolean"` on an export reflects typed
  properties and observes them. Records carry `props`; compiled output binds identically. Non-goals (loops, conditionals,
  two-way binding) are in the docs. `159d45e`.
- **Form-associated components.** `form-associated` (and `form-control="selector"`) on an export: `static formAssociated`,
  `ElementInternals`, form value from a control in the template or `el.value`, validity, `disabled`, reset and restore.
  `attachInternals()` is memoized on every template class, so a closed declarative shadow root and a subclass coexist.
  `847de70`.
- **Dev server, hot reload and a Vite plugin.** `html-module dev [dir]` (`node:http` + `fs.watch` + SSE, no dependencies);
  `HTMLModules.hotReload()` swaps a re-fetched module's components and styles under live elements because registered
  classes delegate to a swappable definition (template changes re-stamp in place, style changes swap adopted sheets; what
  cannot be applied in place reloads the page); `@johnhenry/html-modules/vite` compiles `.html` imports from JavaScript with
  the same HMR. `vite` is a dev dependency only. `bf19937`.
- **Scoped custom element registries.** `registry="scoped"` on a module's import or `<html-import-settings>` gives its
  components a registry of their own, so two versions of a library with the same inner tags coexist. Feature-detected
  (`supportsScopedRegistries()`), with a warned fallback to the global registry. `a4f5fa8`.
- **TypeScript declarations** for every entry point (`.`, `./browser`, `./runtime`, `./compiler`, `./dev`, `./vite`),
  generated from JSDoc, with a `types` condition per export, a drift test and a strict typed-consumer check in CI.
  `8c3265a`, `30deff8`.
- **Cross-browser tests and a benchmark.** A Playwright harness runs every example page and targeted specs (stylesheets and
  `url()`, declarative shadow DOM, Trusted Types under an enforced CSP, binding, forms, hot reload, scoped registries) in
  Chromium, Firefox and WebKit, in CI; pages report unsupported features as unsupported. `npm run bench` is non-gating.
  `f204992`, `aed133e`, `0d88700`, `884721a`, `5b73e76`.

### Fixes

- **The scanner follows the HTML tokenizer.** The compiler's text scanner now handles comment endings (`--!>`, `<!-->`),
  bogus comments, `<plaintext>`, script data escapes, EOF inside tags and templates, CRLF and NUL preprocessing,
  `<frameset>`, and end-tag scoping, so it records what a browser's parser would. A spec-parser edge-case table and a
  seeded fuzz test compare it with parse5. `78434b0`.
- **Character references are decoded per spec** (`src/charref.js`): the full named table with the legacy
  no-semicolon rules, numeric replacements and the C1 table; `&#x110000;` no longer throws a `RangeError`. `5121e21`.
- **Data exports compile as `JSON.parse(...)`**, so a `"__proto__"` key is an own key in compiled output, as it is
  when loaded at runtime. `76374b7`.
- **A failed lazy import inside a module is armed again** and retried on the next use of its tags (the loader had
  already evicted the failed load). `ee35618`.
- **Binding is all or nothing on tag conflicts.** A namespace or `<html-binding>` bind checks every tag before it
  registers any, so a conflict on the last tag no longer leaves the module half bound. `95d387a`.
- **A `form-control` component delegates focus by default.** The host of a component whose value lives in a control inside its shadow root is not focusable, so a browser could not focus the invalid control when its form was validated: Firefox logged *The invalid form control with name='x' is not focusable* and showed no message, and `focus()` and a click on the host never reached the input. `delegatesFocus` now defaults to `true` for an export with `form-control` (an explicit `delegates-focus`, or the module's `<html-module-settings>`, still decides); a regression test runs in all three engines. The README also says that `<html-import>` and friends are not hidden by default. Found by building the `workbench` integration app. `262fe1e`.
- **A `form-role` button with a native control inside has no host `role="button"`.** A submit or reset component whose template holds a native `<button>` takes its keyboard activation from it, but the host still got `internals.role = "button"`, so axe reported `nested-interactive` (serious). The role is now set only when there is no native control in the template. Found by building the `workbench` integration app. `71ac9ef`.
- **No `style-src-elem` CSP report for a module's `<style>`** (issue #4). Chromium evaluates the page's `style-src` for every `<style>` in a document's tree, so parsing a fetched module with `DOMParser` logged an error (and sent a `report-uri` report) per `<style>` under a strict `style-src`, though nothing was applied. The loader now parses into a detached `<body>` made by an empty `DOMParser` document (`parseModuleSource`), which uses the same fragment parse and insertion mode as a document after `<body>` but is never connected, so nothing is checked (a `createHTMLDocument()` document was tried first and is scripting-enabled in Firefox, which parsed `<noscript>` content as text; another DOM implementation such as linkedom keeps whole `DOMParser` documents); the Trusted Types policy still wraps the `innerHTML` assignment. `test/browser/parse.spec.js` reads every example module and a set of edge cases (full document, bare fragment, `<noscript>`, stray table tags, comments, entities, nested exports) through `DOMParser`, the new path and the scanner in each engine and requires identical records and no `style-src-elem` report. A `style="…"` attribute remains a `style-src-attr` report whichever way markup is parsed (documented). The `parseHTML` option may now return any parent node. A module whose source mentions `<noscript>` is parsed as a whole document, because Firefox parses `<noscript>` content in any fragment as text. `c84f467`, then `0f80953` and `feab842`.
- **Forms of components submit on Enter, and a component can be a submit or reset button** (issue #5). Enter in a text-like `<input>` that is a component's `form-control` now does implicit submission as the HTML Standard defines it: the form's default button is activated (a disabled one blocks it) and, with no button, the form is submitted only when at most one field blocks implicit submission; like the platform's it is the key's default action, so a `keydown` listener that cancels it wins. `form-role="submit"|"reset"` on a `form-associated` export makes it a button: click, Enter and Space activate it, it is the form's default button, takes no value and is never invalid, reports `type` `"submit"`/`"reset"`, and gets `tabindex="0"` and `internals.role = "button"` unless its template has a native control. A custom element cannot be `form.requestSubmit(button)`'s submitter (the platform throws a `TypeError` in Chromium and WebKit), so a submit button validates, fires `submit` with `event.submitter` set to the component and calls `form.submit()` unless cancelled; reset calls `form.reset()`. New record field `formRole` (both readers, the compiler and the loader), four new `SyntaxError`s (in example 04 and `docs/api/errors.md`), `formRole` in `defineHTMLComponent()`. Not supported: `formaction` and friends on a component. Tested in all three engines (`test/browser/form.spec.js`, `examples/forms.html`). `686ec51`.

### Security

- **An opt-in template sanitizer for modules from less-trusted origins** (issue #3). `sanitize` is a function every component
  template passes through at load time, before any definition exists (`(html, { def, url, window, report }) => string |
  TrustedHTML | DocumentFragment`, sync or async): `createHTMLModules({ sanitize })`, `HTMLModules.sanitize = fn`, the
  `sanitize` option of `import()` / `load()` / `hotReload()` (`false` opts out), and `<html-import>.sanitize` (a property: a
  function is not an attribute, so there is no `<html-import-settings sanitize>`). It runs in the loader, because the
  runtime stamps templates synchronously, and sees templates only, never module source (which would strip `<html-export>` and
  `<html-import>`). A `DocumentFragment` result is stamped without being parsed again (`HTMLComponent` accepts one as its
  `template`); a string still goes through the Trusted Types policy; `{{attr}}` bindings survive. A sanitized module
  sanitizes the HTML modules it imports with the same function and cannot import JavaScript (refused with a named error), a module
  is cached per sanitizer (`#sanitize=<n>`), and what a sanitizer removed is a `sanitize` event (`onEvent`, and
  `html-modules:sanitize` on the document). Stylesheets, compiled output and what scripts add later are not sanitized
  (README, `## Security model`). `@johnhenry/html-modules/safe-fragment` adapts `@johnhenry/safe-fragment` without depending on it
  (`safeFragmentSanitizer({ profile })`, `registerTemplateProfile()`: `ui-v1` plus `<slot>`, `part`, `slot` and `ui--*`
  custom elements); `docs/api/sanitize.md` says what a template loses under each profile. Tested against the real library in
  Chromium, Firefox and WebKit with a module served from a second origin (`img onerror`, `javascript:` links,
  `iframe srcdoc`, handlers and `<script>` run in a control and are gone sanitized; benign templates render unchanged; Trusted
  Types), and shown in `examples/sanitize.html`. safe-fragment is a devDependency pinned to a commit (first `ee01b49`, whose git
  install was empty, so `scripts/vendor-safe-fragment.js` bundled it for the tests; see the `99ac557` entry below). Filed upstream:
  safe-fragment#9 (report noise), #10 (git install), #11 (`<style>`, `<slot>`, ids), #12 (Trusted Types violations). `71bb40e`.
- **`## Security model` in the README**, and the options behind it: `integrity` (Subresource Integrity, verified with
  SubtleCrypto against the fetched bytes; on `<html-import>`, a module's own imports, `load()` and `import()`; HTML
  modules only, and fail-closed), and fetch `credentials` / `mode` on `createHTMLModules()` and `load()`. `653529c`.
- **Trusted Types and CSP.** `template.innerHTML` and `DOMParser.parseFromString` go through a `trustedTypes` policy
  option, or a policy named `html-modules` where `window.trustedTypes` exists; a `nonce` option covers the `<style>`
  fallback; `configureRuntime()` is the same for compiled-only pages. `a0fd1b3`.

### Behavior changes (breaking, before any release)

- **Relative `url()`s in a module's CSS resolve against the module.** The first attempt (`f850a2c`) passed the
  module URL as `CSSStyleSheet`'s `baseURL`, which browsers ignore (checked in Chrome 152); the CSS text is now
  rewritten to absolute URLs before it reaches the page, in constructed sheets, the `<style>` fallback and
  `renderDeclarative()`, with `sheet.resolvedCss` exposing the result. `da56fb2`. Also: `@import` in a `<style>` is a `SyntaxError` in both readers (`replaceSync()` dropped it silently). Relative
  URLs in a *template* still resolve against the page, now documented. `<html-import-settings base>`'s fallback also no
  longer passes through an `about:blank` `baseURI`. `f850a2c`.
- **A lazy import with no tag to wait for is an error**, in a page, in `HTMLModules.import()` and inside modules,
  instead of waiting forever with zero fetches. `a137d9d`.
- **`<html-import>` has properties and starts after the script.** `src`, `as`, `type`, `integrity`, `delimiter`,
  `conflict`, `loadMode` (the `load` attribute; `load` is the method) and `errors`; `createElement`, `append`, then
  `setAttribute('src')` now loads, and changing `src` after loading started fires an `error` event. `f0d58e3`.
- **A misplaced `<html-binding>` is an error.** A self-closed `<html-binding />` nests the next binding, which was
  dropped silently; `<html-binding>` outside a direct `<html-import>` parent, and any other element child of an
  `<html-import>`, is a `SyntaxError` in both readers and an `error` event in a page; the nested-element messages
  mention `/>`. The scanner also models `</p>`, `</br>` and the start tags that close `<p>`. `5f5ea3c`.
- **Declarative shadow DOM.** A server-rendered open root now gets the component's styles, a closed one is found
  through `attachInternals().shadowRoot`, a mode mismatch has a clear error, and `renderDeclarative(def, innerHTML)`
  produces the markup for server-side rendering. `fba69d2`.
- **The loader cache is keyed `<kind>:<url>`** (it was the bare URL), so one URL can be loaded as HTML and as
  JavaScript. `fe0ba38`.

### Counterparts

- `unadoptStylesheet()`, and a removed `adopt` binding un-adopts its stylesheet; `HTMLModules.unload(src)` evicts a
  cache entry; `type` and `integrity` on `<html-export src>` re-exports. `fe0ba38`.
- Example page `examples/scripting.html` checks all of the above in a browser (`7aeab92`).

### Tests

- parse5 is now the oracle for the DOM-reader/scanner agreement tests (`test/spec-dom.js`): linkedom's parser shares
  the scanner's blind spots, so comparing against it proved nothing. `e02dfa6`.

## 0.0.0 — first release, as `@johnhenry/html-modules` (2026-09-28)

The first published version under any name. The package was developed locally as `web-module-graph` (from
`e03cced`), renamed to `html-modules` in `2e04caa`, and never published under either name; `0.0.0` is not a
restart. The unscoped `html-modules` on npm is an unrelated package by another author: install
`@johnhenry/html-modules`.

### What it is

- **HTML modules.** Ordinary HTML files whose `<html-export name>` elements are public exports: components (a
  `<template>` stamped into a shadow root, with `shadow`, `delegates-focus` and `<style>` children as shared
  constructed stylesheets), stylesheets, JSON data, and re-exports (`<html-export src>`, whole or one export renamed,
  from HTML or JS modules). Everything else in the file is private. Implemented in `e597271`.
- **Every ESM re-export form.** Besides `export *` (`<html-export src>`) and one renamed export (`src name import`):
  lists (`names="card, fancy-button as button"`, `export { … } from`), namespaces (`name="icon" import="*"`,
  `export * as icon from`, whose components join the manifest as `icon--star`), and default re-exports
  (`name="default"`, `name="default" import="card"`, `name="card" default`). A star re-export is still never the
  default. `66dab2b`.
- **Declarative imports.** `<html-import src as>` registers every component as `<as>--<export>`, the HTML
  counterpart of `import * as`; elements written before their import upgrade in place. `<html-binding export element
  adopt>` children bind selectively, choose tags, adopt stylesheets and expose data (a deliberate extension beyond the
  PRD, recorded in `docs/GAP.md`). JS modules import through a `components` manifest or `defineHTMLComponent()`
  exports, never arbitrary exports. `e597271`.
- **One shared runtime.** `HTMLComponent` definitions keep their module-local identity; every registration is a fresh
  subclass, so one definition can have many tags; a module's own imports bind before its components register.
  Runtime loading and compiled output both go through it, so they cannot drift. `e597271`.
- **Module records** read identically from a DOM (`readHTMLModule`, the browser loader) or scanned from source text
  (`scanHTMLModule`, the compiler, no DOM needed); a URL-keyed promise cache; deadlock-free cycle detection with a
  wait graph (ported in `421e41b`). `e597271`.
- **`HTMLModules.load / import / bind / resolve / cache`**, the programmatic API that `<html-import>` is a thin layer
  over. `e597271`.
- **The compiler**, `compileHTMLModule()` and the `html-module` CLI: HTML modules to ES modules that import only the
  runtime and register nothing (the `register` format is opt-in sugar). `e597271`.
- **A configurable namespace delimiter** (`delimiter="-"`, instance and call options, `--delimiter`), with bindings
  that record `{ tag, namespace, export }` instead of parsing tags, and **`name="default"` default exports** compiled
  to `export default`. `a0c74c7`.
- **Settings elements and lazy loading**: `<html-import-settings delimiter base conflict load errors>`,
  `<html-module-settings shadow delegates-focus>`, lexical scope and precedence, `conflict="reuse"`,
  `errors="throw"`, and `load="lazy"` (fetch on first use of a tag, in the document or in html-modules shadow roots,
  with `el.load()`, `el.state` and lazy `HTMLModules.import()` handles). `d2ae182`.

### The rename from `web-module-graph`

`web-module-graph` grew out of a conversation about routing JavaScript imports across CDNs and carried routers, an
import-map compiler, lockfiles and an mport adapter. Refocused on the Declarative HTML Modules PRD, it was renamed
(`2e04caa`, with the gap analysis in `b82311d`) and the package routing removed (`1c0c416`): resolution is now
standard (relative, absolute, or bare through the page's own import map), and package and CDN routing belong to
`@johnhenry/mport`. Nothing from `web-module-graph` was ever published, so no old name needs deprecating.

### Fixes made while preparing the release

- **The compiler's default runtime specifier now names this package.** Compiled modules import their runtime from
  `options.runtime` / `--runtime`, which defaulted to the unscoped `html-modules/runtime`. Compiled output is code
  the package *emits*, so after the move to the scope every compiled file would have imported a package that is not
  installed, or, where the unscoped `html-modules` is installed, **a stranger's package**. The default is now
  `@johnhenry/html-modules/runtime`, and a test pins it to the package's own `name` and `./runtime` export. Fixed in
  `febaafc`.

### Tests

108 `node:test` tests (107 before the release preparation, plus the pinned runtime specifier), with linkedom as the
test DOM, including a compiled-vs-runtime round trip, a DOM-reader/scanner agreement check over every example module,
and a check that `examples/compiled/` is current. Six numbered, self-verifying Node examples run as a CI smoke test
(`5b3c4fe`).

### Documentation

The README follows the family standard (install and provenance, quick start, `## Adding a new export kind`,
`## Honest limitations`, `## Family`); `docs/api.md` and `docs/api/*.md` are the complete API reference (`11c3416`).
Writing it found one real divergence: an `<html-export>` or `<html-import>` nested inside another was collected by
the DOM reader but not by the scanner, so the runtime and the compiler saw different exports. Nesting is now a
`SyntaxError` in both, with a test that probes both readers directly. Fixed in the commit that adds this line.

### Housekeeping

- `package.json`: `@johnhenry/html-modules`, `homepage`, `repository`, `bugs`, `publishConfig.access: public`,
  `engines.node >=26.0.0` (with `.nvmrc` 26), `exports` for `.`, `./browser`, `./runtime`, `./compiler` and
  `./package.json`. `febaafc`.
- CI (`ci.yml`, Node 26, the family concurrency block, check, tests, examples smoke test, pack list) and a
  release-triggered `publish.yml` with the `npm view` idempotency guard and `--provenance --access public`.
  `abbf3e2`.
