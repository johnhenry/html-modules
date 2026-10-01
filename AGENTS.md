# Agent playbook

`@johnhenry/html-modules`: declarative HTML modules (`<html-export>`, `<html-import src as>`) with a shared runtime and
an optional compiler to ES modules. Single package, Node >= 26, `node:test` (`npm test`) with linkedom as the test
DOM and parse5 as the spec-parser oracle for the reader-agreement tests (`test/spec-dom.js`), ships source (`src/`, `bin/`); no build step. The library is browser code; Node runs only the tests, the
compiler/CLI and the numbered examples, so a green `npm test` does not prove anything about real rendering.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm ci`
2. `npm run check`: every file under `src/` and `bin/` parses, and the root entry point imports (it prints the export
   count; `docs/api.md` lists the exports, so update it when the count changes).
3. `npm test`: 0 failed, **0 skipped**. `test/examples.test.js` is part of it and is also the drift gate for
   `examples/compiled/`.
4. `npm run examples`: the numbered Node examples, each self-verifying.
5. `npm pack --dry-run`: read the file list (`src/`, `types/`, `bin/`, README, LICENSE, CHANGELOG, package.json; no tests,
   examples or docs). `npm run types:check` compiles a strict typed consumer of every entry point against `types/`.
6. For anything that changes rendering, styles, shadow DOM, registries, forms, security, hot reload or lazy loading:
   `npm run test:browser` (Playwright: Chromium, Firefox and WebKit over every `examples/*.html` page and the targeted
   specs in `test/browser/`; `npx playwright install --with-deps` once; `--project=chromium` for one engine; the run
   loads the pinned safe-fragment from `node_modules`: see the gotcha below), and look at
   the change in a real browser (`node scripts/test-server.js`, cache disabled). Features an engine lacks must be
   reported by the page as *unsupported* (`renderChecks` takes `'unsupported'`), not as a failure.
7. A genuinely fresh clone: `git clone . /tmp/html-modules-verifyN && cd $_ && npm ci && npm test && npm run examples`.

CI (`.github/workflows/ci.yml`) runs steps 1-5 in this order on Node 26, plus a `browsers` job (step 6, all three engines). Locally, Node 24 also works (npm prints an
`EBADENGINE` warning only); the floor is a contract, not an install gate.

## Repo-specific gotchas

- **The DOM reader and the scanner must produce the same record.** The loader reads modules with `readHTMLModule`
  (DOM), the compiler with `scanHTMLModule` (text); both feed `recordFromRaw`, and `test/examples.test.js` compares
  them over every example module. Put new validation in `record.js`, never in one reader. Corpus
  comparison can't see edge cases the corpus lacks: nested `<html-export>` / `<html-import>` once diverged (the DOM
  reader collected them, the scanner didn't) until both started recording `nestedIn` and `recordFromRaw` rejected
  it; `test/format.test.js` now probes that edge directly. Add a direct probe for every new structural rule.
- **A runtime copy and a compiled copy of the same module are different definitions.** Registering both under one
  tag is a conflict error unless `conflict="reuse"` (see `examples/settings/conflict-*.html`). Two copies of
  `runtime.js` at different URLs also split the registration bookkeeping and lazy-loading watchers: compiled examples
  import `../../src/runtime.js`, the same URL `browser.js` uses, on purpose.
- **Codegen emits this package's name.** The compiler's default `runtime` is `@johnhenry/html-modules/runtime`; a test
  pins it to `package.json`'s `name` and `./runtime` export. A rename must update `src/compiler.js`,
  `bin/html-module.js` and that test together.
- **Browsers cache modules while you verify.** After `npm run examples:compile` or a `src/` edit, a normal reload can
  run the old ES modules (HTTP cache, and the module map for the page's lifetime). Use DevTools "Disable cache" or a
  hard reload; `examples/compiler.html` fetches `compiled/tip.js` with `cache: 'no-cache'` for this reason.
- **linkedom is not a spec parser either.** Its parser shares the scanner's blind spots, so tests that compare the DOM
  reader with the scanner read through `specParse()` (parse5, `test/spec-dom.js`), never `shared.DOMParser`. parse5
  follows the pre-"customizable select" parsing rules: a real current browser finds `<html-export>` inside
  `<select>`, parse5 does not, so keep `<select>` out of fuzz alphabets.
- **`types/` is generated from JSDoc.** After changing a public signature or typedef run `npm run types`; `test/types.test.js`
  fails on a stale `types/`. Shared shapes live in `src/types.js` (typedefs only). Compiled output and `examples/compiled/` are
  separate: a compiler change needs `npm run examples:compile`.
- **Hot reload rests on slots.** Registered classes delegate to `slotOf(def).def`; a replacement definition shares the
  slot of the one it replaces (`sameDefinition`). Anything fixed when an element is created (shadow mode, observed
  attributes, props, form association, imports) cannot change under live elements, so `planComponentSwap` reports it and
  the page reloads. Keep `viewOf`, `stamp` and `planComponentSwap` in step when adding per-definition state.
- **`@johnhenry/safe-fragment` is a pinned git devDependency, built by its own `prepare` script.** Pin: `99ac557` (safe-fragment
  #10, `1817d79`: a git install runs `prepare`, which builds `dist/` with tsup after installing safe-fragment's devDependencies).
  Browser tests and `examples/sanitize.html` import `node_modules/@johnhenry/safe-fragment/dist/index.js` directly; there is no
  vendoring script. `dist/index.js` is unbundled and reaches its fallback engine with `import("dompurify")`, a bare specifier, so
  every page that loads it carries `<script type="importmap">` mapping `dompurify` to `/node_modules/dompurify/dist/purify.es.mjs`
  (WebKit, and Firefox before it ships a Sanitizer, use it; Chromium does not need it, so a missing map only shows in WebKit/Firefox).
  The pin lives in `package.json` and `package-lock.json` as `git+https://…#<sha>`: `npm install` rewrites the lockfile's `resolved`
  to `git+ssh://`, which CI cannot clone, so after any `npm install` change it back to `git+https` (and keep the `package.json`
  spec the same string; leave the `integrity` npm wrote). To move the pin, edit both, `npm install`,
  fix `resolved`, commit. An older safe-fragment has no `component-template-v1`: `registerTemplateProfile()` then says so.
- **Native-engine reports are incomplete by design** (safe-fragment ADR 0007, `f1e2647`): the Sanitizer API does not say what it
  strips on its own (`<script>`, `<iframe>`, `on*`, `javascript:`), so Chromium's `sanitize` events list only what the profile
  removed; DOMPurify's (WebKit) list everything. A test that expects a particular removal note must branch on `details.engine`
  (see `test/browser/sanitize.spec.js`); asserting on *what is gone from the DOM* is engine-independent.
- **Template ids are kept, not prefixed, because every template is stamped into a shadow root.** The adapter's `idPolicy` defaults
  to `keep-in-shadow` (safe-fragment ADR 0005), and only when the loader passes a component (`context.def`). The reasoning breaks
  the day anything stamps a template into light DOM: such a path must force `idPolicy: 'prefix'` (or the adapter must stop
  defaulting). `<style>` is not part of a template (safe-fragment ADR 0006): a module's CSS is `<html-export><style>`.
- **`sanitize` runs in the loader, never in `viewOf()`.** Templates must already be sanitized when a component is registered,
  because stamping is synchronous. Anything new that creates definitions from a record (a new loader path, a reader) must go
  through `loadHTML()`'s `sanitizeRecord()`, and a new thing a sanitized module can import must inherit the importer's
  sanitizer (`loadDependency`), or a trusted-looking dependency becomes a hole. A sanitized module is cached under
  `#sanitize=<n>`: a new place that builds cache keys must use `cacheKey()`.
- **The sandbox here cannot launch Firefox** (its profile folder is not found); Chromium and WebKit run locally, Firefox in CI.
  Do not work around that with a sandbox bypass.
- **linkedom is not a browser.** It does not upgrade custom elements inside shadow roots (`test/lazy.test.js`
  upgrades them by hand with `upgradeIn`), does not carry events out of shadow roots, and has no constructable
  stylesheets (styles fall back to `<style>`). Do not "fix" the tests by removing those workarounds; check the real
  behavior in a browser.
- **`</script>` ends a script element, even inside a string.** In an example page's inline `<script type="module">`,
  a template literal containing `</script>` terminates the script; write `<\/script>`. The same applies to a JSON
  data export: `{"s": "</script>"}` breaks the element (an "invalid JSON" `SyntaxError`); write `"<\/script>"`, which
  is valid JSON.
- **`examples/` is under test.** Every page must be in `examples/shared/catalog.js`, carry `data-page`, load
  `shared/site.js` and the site nav, reference only local files, and `examples/compiled/` must match
  `npm run examples:compile`. Frames live in `compiler/` and `settings/`; intentionally broken modules in `errors/`
  must fail with the message the test expects.
- **Tag names are permanent within a test window.** Tests share the `shared` linkedom window; reuse a tag and the
  second registration hits the conflict rule. Use fresh tags or `makeWindow()`.

## Definition of done

A change is done when all of the following hold, not just when tests pass:
- A regression test exists for any bug fixed; a new error message is also added to
  `examples/04-invalid-modules-fail-with-a-named-syntax-error.mjs` (module errors) and `docs/api/errors.md`.
- The API reference (`docs/api/*.md`) and the README describe the change, including what it does **not** do.
- `CHANGELOG.md` has an entry citing the commit.
- `examples/compiled/` is regenerated if a compiled source or the compiler changed, and the examples catalog covers
  any new capability.

## Non-goals

No custom JavaScript module loader, no `import "./x.html"` from JavaScript, no service worker, no bundler, no
framework, and no package or CDN routing (that is `@johnhenry/mport`). The dev server (`html-module dev`) is a static
server with a change feed and the Vite plugin only compiles `.html` imports with the existing compiler: dev tooling, not a
loader or a bundler, and with no runtime dependencies. See the README's `## Non-goals` and
`docs/GAP.md` (`## Deferred`) for what was deliberately left out and why.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry, merge, then `gh release create v<version>`:
the release event triggers `.github/workflows/publish.yml`, which runs the same gate and is idempotent (skips if the
version is already on npm). It needs a scope-capable `NPM_TOKEN` secret on the repo.
