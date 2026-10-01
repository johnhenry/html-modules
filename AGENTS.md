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
7. `npm run size` (the size budgets, below), and `npm run jsr-dry-run` when you touched an entry point, `exports`, `types/` or `jsr.json`
   (JSR, below).
8. A genuinely fresh clone: `git clone . /tmp/html-modules-verifyN && cd $_ && npm ci && npm test && npm run examples`.

CI (`.github/workflows/ci.yml`) calls the family's reusable `johnhenry/workflows` `ci.yml@v1` for steps 2-5 (Node 26; `npm ci` is its default install) plus local jobs: `browsers` (step 6, all three engines), `size` and `jsr-dry-run` (step 7). Locally, Node 24 also works (npm prints an
`EBADENGINE` warning only); the floor is a contract, not an install gate.

## Size budgets and the bench

`npm run size` (`scripts/size.mjs`, gating in the CI `size` job) measures the packed tarball (`npm pack --dry-run --json`: compressed
and unpacked bytes) and the **gzip size of every entry point of `exports`**, counted as the entry file plus everything it reaches
through relative static imports (what a no-bundler page downloads). The limits are `package.json` `sizeBudget`
(`tarball`, `unpacked`, `entries: { "<export key>": <gzip bytes> }`), set at today's measurement plus about 10%. It exits 1 when a
measure is over its budget, when an export has no budget, or when a budget names an export that is gone, and `-- --json <file>`
writes the report (CI uploads it as the `size-report` artifact). Raise a limit deliberately, in the commit that grows the package,
with the reason in the message; never to turn a red build green. A new entry point needs its `sizeBudget.entries` row.

`npm run bench` stays non-gating (it is the last step of the `browsers` job); `-- --out <file>` also writes the rows as JSON. CI stores
that file as the `bench-results` artifact and runs `node scripts/bench-compare.mjs bench-results.json` against the committed
`bench/baseline.json`: a row more than 3x worse prints a `::warning::` annotation and never fails the build (runners differ).
Refresh the baseline on purpose, ideally from a CI run's artifact (`gh run download <id> -n bench-results`, then copy it to
`bench/baseline.json`; it has the Firefox rows too, which this sandbox cannot produce).

## JSR (prepared, not published)

`jsr.json` names `@johnhenry/html-modules` at the package version, exports the same entry points as `package.json` (minus
`./package.json`), and publishes `src/**/*.js`, `types/**/*.d.ts`, README, LICENSE, CHANGELOG. JSR needs types for a JavaScript entry
point, so each entry file starts with `// @ts-self-types="../types/<its>.d.ts"` (the generated declaration of that export; run
`npm run types` first). `test/jsr.test.js` fails when `jsr.json` drifts from `package.json` (name, version, exports, the
self-types comment), so a version bump touches both. `npm run jsr-dry-run` (`npx jsr@0.14.3 publish --dry-run --allow-dirty`) must
say `Success Dry run complete`; the CI `jsr-dry-run` job runs it. Its one `unanalyzable-dynamic-import` warning is expected: the default
`importModule` is `import(url)`. **Never run a real `jsr publish` from here.** Creating the `@johnhenry/html-modules` package on
jsr.io is a **manual browser step for the owner** (JSR has no API or CLI for creating a scope or package; sign in at
https://jsr.io/new as `johnhenry`); see `~/Projects/@johnhenry/ecosystem/jsr-packages/README.md`. After it exists, publishing from
CI uses GitHub OIDC (no token).

## Repo-specific gotchas

- **The integrity manifest is `{ [absolute url]: "sha384-…" }`, the shape of an import map's `integrity`; do not invent another.**
  `createLoader({ integrity, strict })` normalizes it once (keys resolved against `baseURL`, `#fragment` dropped, every value parsed
  as SRI). It is consulted in `start()`, so every fetch of a graph (root, imports, re-exports, lazy imports, `hotReload()`) goes through
  it; keep new load paths on `start()`. `strict` refuses before the network. An attribute and a manifest entry must both match.
  `@johnhenry/mport`'s `htmlGraph()` / `build({ html })` produce the manifest from `scanHTMLModule`; the unit tests build it by hand.
- **A JavaScript import's `integrity` is checked against the page's import map, never against bytes.** `import()` is the browser's, so
  `checkImportMapPin()` reads the inline `<script type="importmap">` `integrity` entries (`pageImportMapIntegrity()`) and requires the
  same digest set; the browser then enforces it. The browser test says `enforced` or `unsupported in this engine` per engine rather
  than assuming. Do not "fix" this by fetching the module to hash it (non-goal: no custom module loader).

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

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry, merge, then `gh release create v<version>`.
`.github/workflows/publish.yml` calls the shared `johnhenry/workflows` `npm-publish.yml@v1` (install, the full gate
including the three-engine browser suite, then the `npm view` guard and `npm publish --provenance --access public`). It
fires on `release: published`, on `push: tags: v*` (a redundant second chance: a release created right after a push can
drop the release event for a job that is only `uses:`) and on `workflow_dispatch`, which is how to retry. The `npm view`
guard skips a version already on npm and treats the E404 of a never-published package as "publish it".

First release checklist (nothing has been published yet; `package.json` is `0.0.0`):
1. The `NPM_TOKEN` repo secret exists and can publish to the `@johnhenry` scope (never put it in a file or a command).
2. `package.json` `repository.url` is `git+https://github.com/johnhenry/html-modules.git` (provenance checks it against the
   publishing repo) and `homepage`, `exports`/`types`, `files`, `engines` (>=26) are as shipped; `@johnhenry/safe-fragment` is an
   optional peer, and its git devDependency is the only non-registry dependency (dev only, not installed by consumers).
3. The first release is `0.0.0` itself (family convention: a new `@johnhenry/*` address starts at 0.0.0, and `CHANGELOG.md`
   already has its dated `0.0.0` entry), so there is no bump; just make sure `main` is green.
4. `npm pack --dry-run` and `npm publish --dry-run`: only `src/`, `types/`, `bin/`, README, LICENSE, CHANGELOG, package.json.
5. `gh release create v0.0.0`; watch the Publish run (`gh run watch <id> --exit-status`); then `npm view @johnhenry/html-modules`.
6. If two runs race on a first publish, one may show a red `403 cannot publish over`; the other published, so check npm first.
