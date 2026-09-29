# Changelog

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
