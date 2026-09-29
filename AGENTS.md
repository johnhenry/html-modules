# Agent playbook

`@johnhenry/html-modules`: declarative HTML modules (`<html-export>`, `<html-import src as>`) with a shared runtime and
an optional compiler to ES modules. Single package, Node >= 26, `node:test` (`npm test`) with linkedom as the test
DOM, ships source (`src/`, `bin/`); no build step. The library is browser code; Node runs only the tests, the
compiler/CLI and the numbered examples, so a green `npm test` does not prove anything about real rendering.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm ci`
2. `npm run check`: every file under `src/` and `bin/` parses, and the root entry point imports (it prints the export
   count; `docs/api.md` lists the exports, so update it when the count changes).
3. `npm test`: 0 failed, **0 skipped**. `test/examples.test.js` is part of it and is also the drift gate for
   `examples/compiled/`.
4. `npm run examples`: the numbered Node examples, each self-verifying.
5. `npm pack --dry-run`: read the file list (`src/`, `bin/`, README, LICENSE, CHANGELOG, package.json; no tests,
   examples or docs).
6. For anything that changes rendering, styles, events or lazy loading: serve the root (`python3 -m http.server`),
   open `/examples/` in a real browser **with the cache disabled**, and check the page's pass/fail list.
7. A genuinely fresh clone: `git clone . /tmp/html-modules-verifyN && cd $_ && npm ci && npm test && npm run examples`.

CI (`.github/workflows/ci.yml`) runs steps 1-5 in this order on Node 26. Locally, Node 24 also works (npm prints an
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
framework, and no package or CDN routing (that is `@johnhenry/mport`). See the README's `## Non-goals` and
`docs/GAP.md` (`## Deferred`) for what was deliberately left out and why.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry, merge, then `gh release create v<version>`:
the release event triggers `.github/workflows/publish.yml`, which runs the same gate and is idempotent (skips if the
version is already on npm). It needs a scope-capable `NPM_TOKEN` secret on the repo.
