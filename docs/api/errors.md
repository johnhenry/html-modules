# Errors

[API reference](../api.md) › Errors

Every error html-modules raises, with its exact message (placeholders in `<angle brackets>`) and where it surfaces.
Nothing is silently ignored: a mistake is an exception, a rejection, or an `error` event.

**How errors surface:**

- **JavaScript** (`load`, `import`, `bind`, `define`, the compiler, the record readers): thrown synchronously, or a
  rejected promise for the async APIs. `HTMLModules.import()` never throws for bad options; it returns a rejected
  promise.
- **Markup**: an `error` event (bubbling, composed, `detail.error`) on the element named in the "Reported on" column,
  and a rejected `el.ready`. A failing `<html-binding>` fires on the binding and bubbles through its import; the
  import does not fire a second event for it. See [Events](elements.md#events).
- **`errors="throw"`** (or `errors: 'throw'`): additionally passed to `reportError()`, so it reaches the console and
  `window.onerror`.
- **Inside a module**, every error below that concerns the module's source is a `SyntaxError` raised when the
  module loads (reported on the page's `<html-import>` of it, or rejecting `HTMLModules.load()`) or compiles
  (thrown by `compileHTMLModule`, or `<input>: SyntaxError: …` from the CLI). Messages then end with ` in <url>`.

## Module source (exports)

| Error | Message |
| --- | --- |
| `SyntaxError` | `<html-export> requires a "name" attribute: name="card", or name="default" for the default export (or "src" for a re-export) in <url>` |
| `SyntaxError` | `Invalid export name "<name>" in <url>: use lower-case words joined by single hyphens, e.g. "custom-card"` |
| `SyntaxError` | `"components" is reserved and cannot be used as an export name in <url>` |
| `SyntaxError` | `Duplicate export "<name>" in <url>` |
| `SyntaxError` | `<html-export name="<b>"> is nested inside <html-export name="<a>"> in <url>: <html-export> and <html-import> must not be nested` (also for `<html-import>` in either position) |
| `SyntaxError` | `<html-export name="<n>"> needs a <template> (a component), <style> (a stylesheet) or <script type="application/json"> (data) in <url>` |
| `SyntaxError` | `<html-export name="<n>"> has <N> <template> elements; an export has one in <url>` |
| `SyntaxError` | `<html-export name="<n>">: shadow="<value>" must be "open" or "closed" in <url>` |
| `SyntaxError` | `Invalid delegates-focus="<value>" on <html-export name="<n>"> in <url>: it is a boolean attribute; write delegates-focus, delegates-focus="true" or delegates-focus="false"` |
| `SyntaxError` | `<html-export name="<n>">: "shadow" only applies to an export with a <template> in <url>` (same for `"delegates-focus"`) |
| `SyntaxError` | `<html-export name="<n>">: a data export has exactly one <script type="application/json"> and nothing else in <url>` |
| `SyntaxError` | `<html-export name="<n>">: invalid JSON in <url>: <JSON.parse message>` |

## Module source (defaults and re-exports)

| Error | Message |
| --- | --- |
| `SyntaxError` | `<html-export default>: "default" needs a name to go with it; write name="default" for a default-only export, or name="card" default to export card as the default too in <url>` |
| `SyntaxError` | `<html-export name="default" default>: name="default" is already the default export; drop the "default" attribute in <url>` (also for `name=""`) |
| `SyntaxError` | `<html-export name="<n>" default>: "default" is a boolean attribute and takes no value in <url>` |
| `SyntaxError` | `More than one default export: <html-export …> and <html-export …> in <url>` |
| `SyntaxError` | `<html-export src="<src>" default>: a star re-export (src without a name) is never the default; write name="default" to re-export the source's default in <url>` |
| `SyntaxError` | `<html-export src="<src>" import="<x>">: import="<x>" needs a name="…" to export it as in <url>` |
| `SyntaxError` | `<html-export src="<src>" names="">: names="" lists no exports; write names="card, button" (or drop "names" to re-export every component) in <url>` |
| `SyntaxError` | `<html-export src="<src>" names="…">: "<entry>" in names is not "<export>" or "<export> as <name>" in <url>` |
| `SyntaxError` | `<html-export src="<src>" names="…">: "*" cannot appear in names; write name="<ns>" import="*" for a namespace re-export in <url>` |
| `SyntaxError` | `<html-export … names="…">: "names" lists every re-exported name; it cannot be combined with "name" (or "import" / "default") in <url>` |
| `SyntaxError` | `<html-export name="<n>" import="<x>">: "import" only applies to a re-export (an <html-export> with "src") in <url>` (same for `"names"`) |
| `SyntaxError` | `The requested module '<src>' does not provide an export named '<name>'` (a named, listed or default re-export, when the dependency loads) |
| `SyntaxError` | `Conflicting star exports for '<name>' from '<a>' and '<b>'` (two star sources with different components of one name) |
| `Error` | `Circular HTML module dependency: <url> -> <url> -> …` (imports or re-exports; including a module re-exporting itself) |

## Module source (imports, bindings and settings)

| Error | Message |
| --- | --- |
| `SyntaxError` | `<html-import> requires a "src" attribute in <url>` |
| `SyntaxError` | `Invalid namespace "<as>": use lower-case words joined by single hyphens (no "--"), e.g. "ui" in <url>` |
| `SyntaxError` | `Invalid delimiter "<d>": use one or more characters allowed in custom element names (lower-case letters, digits, "-", ".", "_", …), e.g. "--" or "-" on <html-import> in <url>` |
| `SyntaxError` | `Invalid <conflict\|load\|errors>="<value>" on <html-import> in <url>: use "<a>" or "<b>"` |
| `SyntaxError` | `"base" cannot be set on <html-import> in <url>: it is document-level only; use <html-import-settings base="…">, or write the full path in src` |
| `SyntaxError` | `Invalid integrity "<value>" on <html-import src="<src>"> in <url>: use Subresource Integrity metadata such as "sha384-<base64 digest>" (sha256, sha384 or sha512; several may be separated by spaces)` |
| `SyntaxError` | `<html-binding> requires an "export" attribute in <url>` |
| `SyntaxError` | `<html-import src="<src>"> is lazy but adopts a stylesheet in <url>: a module's components need their stylesheets when they render, so write load="eager" on this import` |
| `SyntaxError` | `More than one <html-import-settings> in <url>: a module has at most one` (same for `<html-module-settings>`) |
| `SyntaxError` | `<html-import-settings> must come before any <html-import> in <url>` / `<html-module-settings> must come before any <html-export> in <url>` |
| `SyntaxError` | `Unknown attribute "<x>" on <html-import-settings> in <url>: use "delimiter", "base", "conflict", "load", "errors"` / `… on <html-module-settings> in <url>: use "shadow", "delegates-focus"` |
| `SyntaxError` | `Invalid <option>="<value>" on <html-import-settings> in <url>: use "<a>" or "<b>"`, `Invalid shadow="<value>" on <html-module-settings> in <url>: use "open" or "closed"`, `Invalid delegates-focus="<value>" on <html-module-settings> in <url>: it is a boolean attribute; …` |
| `SyntaxError` | `Invalid base "<value>" on <html-import-settings> in <url>: use a URL, relative to the document, e.g. "./vendor/ui@2/"` (a blank `base`) |

## Pages (elements)

| Situation | Error and message | Reported on |
| --- | --- | --- |
| No `src` | `SyntaxError: <html-import> requires a "src" attribute` | `<html-import>` |
| Bad `as` | `SyntaxError: Invalid namespace "<as>": …` | `<html-import>` |
| Bad `delimiter`, `conflict`, `load` or `errors` attribute | `SyntaxError: Invalid delimiter "<d>": … on <html-import>` / `Invalid <option>="<v>" on <html-import>: use "<a>" or "<b>"` | `<html-import>` |
| `base` on the import | `SyntaxError: "base" cannot be set on <html-import>: it is document-level only; …` | `<html-import>` |
| `<html-import-settings>` after an `<html-import>` | `SyntaxError: <html-import-settings> must come before any <html-import> in its document; this one comes after one, so it is ignored (it cannot change imports that have started)` | the settings element (it is ignored) |
| `<html-import-settings>` inserted after imports started | `SyntaxError: <html-import-settings> must come before any <html-import> in its document: it arrived after imports had started, so it is ignored` | the settings element |
| A second `<html-import-settings>` | `SyntaxError: More than one <html-import-settings> in this document: a document has at most one, so this one is ignored` | the second settings element |
| Unknown attribute or bad value on `<html-import-settings>` | `SyntaxError: Unknown attribute "<x>" on <html-import-settings>: use …` / `Invalid load="soon" on <html-import-settings>: use "eager" or "lazy"` | the settings element, **and every `<html-import>` of that document** |
| `base` that does not resolve | `SyntaxError: Invalid base "<b>" on <html-import-settings>: it does not resolve to a URL against <document URL>` | every `<html-import>` of that document |
| `<html-module-settings>` in a page | `SyntaxError: <html-module-settings> only applies inside an HTML module (a file loaded with <html-import>); in a page it has no exports to configure. For this page's imports, use <html-import-settings>` | the element |
| Module fetch fails | `Error: Failed to fetch HTML module <url>: <status>` | `<html-import>` |
| `integrity` does not match | `Error: Integrity check failed for HTML module <url>: its <alg> digest is <alg>-<digest>, which matches none of integrity="<metadata>"` | `<html-import>` |
| Malformed `integrity` | `SyntaxError: Invalid integrity "<value>" …: use Subresource Integrity metadata such as "sha384-<base64 digest>" …` | `<html-import>` |
| Unresolvable bare `src` | `TypeError: Unable to resolve bare specifier "<s>" from <referrer>` | `<html-import>` |
| JS module with no components, imported with `as` | `` TypeError: The module '<src>' does not export any HTML components: export a `components` manifest or definitions made with defineHTMLComponent(), or bind exports explicitly with <html-binding> `` | `<html-import>` |
| A tag the delimiter makes invalid (namespace import) | `SyntaxError: Cannot bind '<export>' under namespace "<as>" with delimiter "<d>": <<tag>> is not a valid custom element name (<reason>)` (checked for every tag before any is registered) | `<html-import>` |
| Tag already defined by a different definition (`conflict="error"`) | `Error: Cannot bind <<tag>>: it is already defined by "<name>" from <url> (conflict="reuse" keeps the existing definition instead)` | `<html-import>` (namespace) or `<html-binding>` |
| Missing export | `SyntaxError: The requested module '<src>' does not provide an export named '<name>'` | `<html-binding>` |
| No `export` attribute | `SyntaxError: <html-binding> requires an "export" attribute` | `<html-binding>` |
| Invalid `element=` | `SyntaxError: "<tag>" is not a valid custom element name: <reason>` | `<html-binding>` |
| Stylesheet or data with `element=` | `TypeError: Cannot register '<export>' from '<src>' as <<tag>>: it is a stylesheet, not a component` (or `data (an object)`, …) | `<html-binding>` |
| `adopt` on a non-stylesheet | `TypeError: Cannot adopt '<export>' from '<src>': it is <kind>, not a stylesheet` | `<html-binding>` |
| `export="default"` without `element=` under a namespace | `SyntaxError: Binding the default export of '<src>' needs element="…"` | `<html-binding>` |
| A module's own lazy import fails | the load error | the element that used its tag (`detail.lazy === true`) |
| `load="lazy"` in a window without `MutationObserver` | `TypeError: load="lazy" needs MutationObserver, which this window does not have` | not reported on the element: it escapes as an unhandled rejection (every browser has `MutationObserver`; this concerns test DOMs) |

## JavaScript API

| Where | Error and message |
| --- | --- |
| `createHTMLModules()` | `SyntaxError: Invalid credentials="<v>" in createLoader(): …` / `Invalid mode="<v>" …` (from the loader it builds); `SyntaxError: Invalid delimiter "<d>": … in createHTMLModules()`, `Invalid <option>="<v>" in createHTMLModules(): use "<a>" or "<b>"`, `Invalid base "<v>" in createHTMLModules(): …` (thrown) |
| `HTMLModules.import()` | the same, ending ` in HTMLModules.import()` (a rejected promise), plus everything `load()` and `bind()` raise |
| `HTMLModules.load()`, `createLoader().load()` | `Error: Integrity check failed for HTML module <url>: …`; `TypeError: integrity applies to HTML modules only: <url> is loaded with import(), which cannot verify it (…)`; `TypeError: Cannot verify the integrity of <url>: this environment has no crypto.subtle (…)`; `SyntaxError: Invalid integrity "<v>" in load(): …`, `Invalid credentials="<v>" in load(): use "omit" or "same-origin" or "include"`, `Invalid mode="<v>" …`; `Error: Failed to fetch HTML module <url>: <status>`; `TypeError: Unable to resolve bare specifier "<s>" from <referrer>`; `TypeError: Cannot resolve "<s>" without a base URL`; `` TypeError: No DOMParser available; pass `parseHTML` to createLoader() ``; every module `SyntaxError`; `Error: Circular HTML module dependency: …`; a JS module's own import error (rejected) |
| `bind()`, `bindModule()` | `SyntaxError: Invalid namespace …`, `Invalid delimiter …`, `Invalid conflict="<v>": use "error" or "reuse"`, and everything `applyBinding()` / `registerComponents()` raise (thrown) |
| `applyBinding()` | `SyntaxError: <html-binding> requires an "export" attribute`; missing export; invalid tag; `Binding the default export of '<from>' needs element="…"`; the `adopt` / `element` `TypeError`s; the conflict `Error` |
| `registerComponents()` | as `bindModule()` with `as`; without `as`, `SyntaxError: "<name>" is not a valid custom element name: <reason>` for an export name that is not a valid tag |
| `defineElement()`, `definition.define()` | `SyntaxError: "<tag>" is not a valid custom element name: <reason>`; `SyntaxError: Invalid conflict="<v>": …`; `TypeError: Cannot register <<tag>> as a custom element: it is <kind>, not a component`; the conflict `Error`; any failure binding the definition's own imports |
| `defineHTMLComponent()`, `new HTMLComponent()` | `` TypeError: defineHTMLComponent: pass a `template` string or an `element` class ``; `` TypeError: defineHTMLComponent: `element` must be a class extending HTMLElement ``; `SyntaxError: Invalid shadow mode "<s>": use "open" or "closed"` |
| `adoptStylesheet()`, `stylesheet.adopt()` | `TypeError: adoptStylesheet: not a stylesheet`; `TypeError: This document cannot adopt a CSSStyleSheet` |
| `lookupExport()` | `SyntaxError: The requested module '<from>' does not provide an export named '<name>'` |
| `componentsOf()` | `TypeError: The module '<from>' does not export any HTML components: …` |
| `manifest()` | `SyntaxError: Conflicting star exports for '<name>' from '<a>' and '<b>'` |
| `bindingName()` | `SyntaxError: Invalid namespace …`; `Invalid delimiter …`; `Cannot bind '<export>' under namespace "<ns>" with delimiter "<d>": <<tag>> is not a valid custom element name (<reason>)` |
| `readImportSettings()`, `readModuleSettings()`, `readImportOptions()` | the settings `SyntaxError`s above, with ` on <html-import-settings>` / ` on <html-module-settings>` / ` on <html-import>` and the `where` suffix |
| `defineHTMLModuleElements()` | `TypeError: defineHTMLModuleElements: pass { modules } (from createHTMLModules())` |
| `watchLazy()`, lazy `import()` | `TypeError: load="lazy" needs MutationObserver, which this window does not have` |

Functions that return a status instead of throwing: `parseBindingName()` (`null`), `elementNameProblem()` (a reason
or `null`), and the `is*` predicates.

## Compiler and CLI

| Where | Error and message |
| --- | --- |
| `compileHTMLModule()`, `compileRecord()` | every module `SyntaxError` above; `TypeError: Unknown format "<f>": use "esm" or "register"`; `SyntaxError: Invalid namespace …` (bad `as`); `Invalid delimiter …`; `Invalid conflict="<v>": use "error" or "reuse"`; for `register` with `as`, the `bindingName()` error for a component's tag |
| A compiled `register` module, when imported | the registration errors of `registerComponents()` (for example `"star" is not a valid custom element name: it has no hyphen` without `--as`, or a tag conflict) |
| `html-module` | exit `1` with `<input>: <ErrorName>: <message>` on stderr for a read or compile failure (stops at the first); exit `2` with the usage for a usage error |
