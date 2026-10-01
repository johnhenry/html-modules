# html-modules examples

Two kinds of example live here. The numbered `NN-*.mjs` files are runnable, self-verifying Node scripts: each one
asserts the behavior it demonstrates and exits 0 on success, so `npm run examples` is a smoke test (CI runs it). The
`*.html` pages are a browser demo site with live checks on every page. Nothing is simulated in either: the Node
scripts run the real scanner, compiler, loader and runtime, and use [linkedom](https://github.com/WebReflection/linkedom)
(a dev dependency) only as the DOM where one is needed.

## Node examples

| Example | Demonstrates |
| --- | --- |
| [`01-a-module-reads-into-a-json-record.mjs`](./01-a-module-reads-into-a-json-record.mjs) | `scanHTMLModule()` reads `components/ui.html` into a plain-JSON module record (four components, one of them the default, and a JSON data export; the unexported paragraph is absent), and `readHTMLModule()` over a parsed DOM produces the **same** record. That agreement is what keeps compiled and runtime-loaded modules identical. |
| [`02-tags-are-namespace-delimiter-export.mjs`](./02-tags-are-namespace-delimiter-export.mjs) | `bindingName()` makes `<ui--card>` by default and `<ui-card>` with `"-"`; `"."` with a one-word export is **rejected** with a `SyntaxError` naming `<ui.card>` and "it has no hyphen"; `parseBindingName()` returns `null` for an ambiguous tag; `isValidDelimiter()` rejects `""`, `" "`, `":"` and upper case; `elementNameProblem()` explains, in words, why a name is invalid. |
| [`03-compiled-output-is-a-plain-es-module.mjs`](./03-compiled-output-is-a-plain-es-module.mjs) | `compileHTMLModule()` turns `rating.html` (which imports `icons.html` and `themes.html`) into an ES module whose only library import is `@johnhenry/html-modules/runtime` and whose `.html` dependencies are rewritten to `.js`; the compiled files import in plain Node and export definitions that keep their identity and their module's imports, and **nothing is registered**. The `register` format emits a `registerComponents()` call, and an invalid tag is rejected at compile time. |
| [`04-invalid-modules-fail-with-a-named-syntax-error.mjs`](./04-invalid-modules-fail-with-a-named-syntax-error.mjs) | 55 kinds of broken module (missing `name`, bad names, duplicate and double defaults, two templates, bad `shadow`/`delegates-focus`, invalid JSON, a lazy import that adopts, misplaced or duplicate settings, …) each fail with the documented `SyntaxError`, naming the module, **identically** through the scanner, the DOM reader and the compiler. |
| [`05-html-import-registers-and-upgrades-in-place.mjs`](./05-html-import-registers-and-upgrades-in-place.mjs) | In a linkedom window, `<html-import src as="ui">` registers `<ui--card>` and friends (not the data export), and an element written **before** the import upgrades in place with its light DOM slotted; `el.tags` records `{ tag, namespace, export }`; one definition is registered under several tags as distinct subclasses; a second namespace reuses the cached module (**one fetch**); a tag already held by a different definition is an error unless `conflict: 'reuse'`, which records `reused: true`; `<html-binding>` children bind only what they name. |
| [`06-lazy-import-fetches-on-first-use.mjs`](./06-lazy-import-fetches-on-first-use.mjs) | Under `<html-import-settings load="lazy">`, imports fetch **nothing** until one of their tags appears (another namespace's tags do not count), while `load="eager"` on one import overrides the setting; the first `<ui--…>` loads, registers and upgrades; `el.load()` forces a load; `HTMLModules.import(src, { load: 'lazy' })` returns a handle (not a promise) with `state`, `load()` and `cancel()`. |
| [`07-hot-reload-swaps-components-under-live-elements.mjs`](./07-hot-reload-swaps-components-under-live-elements.mjs) | `HTMLModules.hotReload()` re-fetches an edited module and re-stamps a live element **in place** (same shadow root, light DOM kept, bindings re-bound), while a shadow-mode change, which cannot be applied under live elements, comes back as `reload: true` and changes nothing. |

## Browser pages

Serve the package root and open `/examples/` (for example `python3 -m http.server`, then
`http://localhost:8000/examples/`). Every page works offline and shows pass/fail checks for what it demonstrates;
[`index.html`](./index.html) is a hub with a coverage checklist (`shared/catalog.js`) mapping every capability to
the pages that cover it.

| Example | Demonstrates |
| --- | --- |
| [`index.html`](./index.html) | The hub: every page, and a checklist of every capability with the pages that prove it. |
| [`quickstart.html`](./quickstart.html) | One script and one `<html-import src as>`; namespaced elements written before the import upgrade in place when the module arrives. |
| [`library.html`](./library.html) | A component library written in HTML (`components/`): templates, styles, slots and parts, a default export, data, stylesheets, a module importing another, and barrels using every re-export form (list, namespace, default); one cache entry per URL. |
| [`namespaces.html`](./namespaces.html) | `as="ui"` makes `<ui--card>`, `delimiter="-"` makes `<ui-card>`; one module under several namespaces; a bare specifier resolved through the page's import map; which delimiters the live registry accepts. |
| [`bindings.html`](./bindings.html) | `<html-binding>`: bind only what the page uses, choose tags, adopt stylesheets, read data, bind a default export, load for side effects, and add bindings after load. |
| [`identity.html`](./identity.html) | One definition, many tags (`define()`, `element=`, two namespaces), each a subclass of one base element; a default export has no name, so the importer names it. |
| [`interop.html`](./interop.html) | JS modules (`interop/`): a `components` manifest, `defineHTMLComponent()` exports, a plain class bound by name, JS behaviour on an HTML template, and HTML re-exporting JS. |
| [`styles.html`](./styles.html) | Component styles, theming through custom properties and `::part`, switching adopted theme stylesheets, and stylesheets a module adopts only for its own components. |
| [`data.html`](./data.html) | Data binding: `{{attribute}}` in a template's text and attribute values, `props` reflected as typed properties, escaping (text only, `javascript:` URLs refused), in-place patching, and the compiled module rendering the same (`components/profile.html`, `compiled/profile.js`). |
| [`forms.html`](./forms.html) | Form-associated components (`components/fields.html`): `FormData`, validity and `:invalid`, a disabled fieldset, reset and history restore, a closed shadow root and a subclass sharing one `ElementInternals`. Restore checks are reported as unsupported where the browser restores nothing. |
| [`scoped.html`](./scoped.html) | Scoped registries (`components/scoped/`): two versions of a library using the same inner `<icon--star>` coexist through `registry="scoped"`; reported as unsupported where the browser has no scoped registries. |
| [`errors.html`](./errors.html) | Every error, triggered on purpose (the broken modules in `errors/`), with the event it fires and its message. |
| [`compiler.html`](./compiler.html) | `compiled/*.js` (from `npm run examples:compile`) next to their HTML sources; a runtime frame and a compiled frame (`compiler/`) render **identical** shadow roots and styles; `export default`; register builds with and without `--delimiter`; an in-browser compiler. |
| [`app.html`](./app.html) | A reading-list app (`app/`) assembled from HTML modules: components, icons, JSON seed data, a theme, and one JS component. |
| [`settings.html`](./settings.html) | `<html-import-settings>` (`settings/` frames): a page-wide delimiter, a `base` switching a vendored library between `vendor/ui@1/` and `vendor/ui@2/`, `conflict="reuse"` letting a compiled and a runtime copy share a page, `errors="throw"` reaching `window.onerror`, lexical scope, and `<html-module-settings>` (closed shadow roots by default). |
| [`lazy.html`](./lazy.html) | `load="lazy"` with a live network panel: each module fetched only when its first element appears, including inside a component's shadow root, a binding's exact tag, a module's own lazy import, `el.load()`, disconnecting before load, and a lazy `HTMLModules.import()` handle. |
| [`scripting.html`](./scripting.html) | Live checks for driving the library from script: a scripted `<html-import>` (`createElement`, `append`, then set `src` and `as`; reflected properties; changing `src` after loading started is an error), un-adopting a stylesheet, `HTMLModules.unload()`, server-rendered (declarative) shadow DOM, open and closed, with `renderDeclarative()`, markup mistakes that used to be silent (a self-closed `<html-binding />`, a lazy import with nothing to wait for), and the security options (`integrity`, `credentials`, `mode`, a Trusted Types policy). |
| [`sanitize.html`](./sanitize.html) | The opt-in `sanitize` hook for modules from less-trusted origins (`components/untrusted.html` carries `<img onerror>`, a `javascript:` link, `<iframe srcdoc>`, a handler and a `<script>` in its templates): a function you write, returning a string or a `DocumentFragment`; async, at load time; per import, `false` to opt out, cached per sanitizer; reports as events; a sanitized module cannot import JavaScript (`components/untrusted-importer.html`); and `safeFragmentSanitizer()` over `@johnhenry/safe-fragment` (a bundle of the pinned commit, made by `npm run vendor:safe-fragment`; the section reports itself unsupported without it). |

Supporting folders, used by the pages above (not pages themselves): `components/` (the HTML component library),
`app/`, `interop/`, `errors/` (intentionally broken modules), `vendor/` (two versions of a vendored library),
`compiler/` and `settings/` (framed sub-pages), `compiled/` (generated; do not edit), and `shared/` (site script,
stylesheet and the coverage catalog).

## Running

```sh
npm run examples      # run every Node example in sequence
npm run example:01    # run one
node examples/01-a-module-reads-into-a-json-record.mjs
npm run examples:compile   # regenerate examples/compiled/ after changing a compiled source
npm run test:browser       # every page above, in Chromium, Firefox and WebKit (npx playwright install first)
```

## Runtime requirements (honest edition)

The Node examples run under **plain Node >= 26** with the dev dependencies installed (`npm ci`), and need no
network: example files import the package by its own name (`@johnhenry/html-modules`, a package self-reference), and
examples 01, 04, 05 and 06 use linkedom as the DOM. linkedom is a stand-in, not a browser. It has no constructable
stylesheets (component styles fall back to a `<style>` per shadow root), it does not upgrade custom elements inside
shadow roots, and it does not carry events out of shadow roots, so nothing here proves real-browser rendering,
adopted stylesheets or composed events.

The browser pages cover exactly that, and are **not** part of `npm run examples`: they need a browser and a static
server. Their logic is covered headlessly by [`test/examples.test.js`](../test/examples.test.js), which checks that
every example HTML module reads the same through the DOM and the scanner and loads (the ones in `errors/` fail with
the documented messages), that `compiled/` is up to date, that the catalog covers every checklist item, and that
every page references only local files. This exception is intentional, not an oversight.
