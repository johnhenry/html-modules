// Browsers cannot `import` an .html file. The optional compiler turns an HTML
// module into an ordinary ES module that imports only the runtime and exports
// the same definitions the runtime loader builds. Importing it registers
// nothing (unless you ask for the register format). This example compiles
// examples/components/rating.html and its two dependencies, then imports the
// result in plain Node: no DOM is needed to create definitions.
//
//   node examples/03-compiled-output-is-a-plain-es-module.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileHTMLModule, isHTMLComponent, isHTMLStylesheet } from '@johnhenry/html-modules';

const read = (name) => readFile(new URL(`./components/${name}`, import.meta.url), 'utf8');

// 1. By default, compiled code imports the runtime from this package's published subpath.
const defaultOutput = compileHTMLModule(await read('rating.html'), { url: 'rating.html' });
assert.match(defaultOutput, /^\/\/ Compiled from rating\.html by html-module\. Do not edit; recompile instead\./);
assert.match(defaultOutput, /^import \{ defineHTMLComponent, manifest \} from "@johnhenry\/html-modules\/runtime";$/m);
// Dependencies become static imports with .html rewritten to .js: compile those too.
assert.match(defaultOutput, /^import \* as \$m0 from "\.\/icons\.js";$/m);
assert.match(defaultOutput, /^import \* as \$m1 from "\.\/themes\.js";$/m);
assert.doesNotMatch(defaultOutput, /registerComponents|customElements/, 'the esm format never registers');

// 2. Compile the three modules into a temporary folder. `runtime` can be any specifier;
//    here it is the resolved file URL of this package's runtime, so the output runs from /tmp.
const runtime = import.meta.resolve('@johnhenry/html-modules/runtime');
// realpath: on macOS the temp folder is a symlink, and import.meta.url reports the real path.
const dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-example-')));
try {
  for (const name of ['icons', 'themes', 'rating']) {
    const js = compileHTMLModule(await read(`${name}.html`), { url: `${name}.html`, runtime });
    await writeFile(join(dir, `${name}.js`), js);
  }
  const rating = await import(pathToFileURL(join(dir, 'rating.js')).href);

  // The namespace: camelCase named exports plus a `components` manifest keyed by export name.
  assert.deepEqual(Object.keys(rating).sort(), ['components', 'stars']);
  assert.ok(isHTMLComponent(rating.stars));
  assert.equal(rating.stars.name, 'stars', 'a definition keeps its module-local identity');
  assert.deepEqual(Object.keys(rating.components), ['stars']);
  assert.equal(rating.stars.url, pathToFileURL(join(dir, 'rating.js')).href, 'url is import.meta.url of the compiled file');

  // The module's own imports travel with each definition; they are bound when it is registered.
  assert.deepEqual(rating.stars.imports.map((i) => [i.from, i.as ?? null, i.bindings]), [
    ['./icons.html', 'icon', []],
    ['./themes.html', null, [{ export: 'gold', adopt: true }]],
  ]);
  const icons = rating.stars.imports[0].module;
  assert.deepEqual(Object.keys(icons.components), ['star', 'heart', 'check', 'plus']);
  const themes = rating.stars.imports[1].module;
  assert.ok(isHTMLStylesheet(themes.gold), 'a <style>-only export compiles to an HTMLStylesheet');

  // 3. The register format: sugar that registers every component when the module is imported.
  const iconsSource = await read('icons.html');
  const register = compileHTMLModule(iconsSource, { url: 'icons.html', runtime, format: 'register', as: 'ico', delimiter: '-' });
  assert.match(register, /registerComponents\(\{ components: \$components \}, \{ as: "ico", delimiter: "-", from: import\.meta\.url \}\);/);
  // Its tags are checked at compile time: "." would give <ico.star>, which has no hyphen.
  assert.throws(
    () => compileHTMLModule(iconsSource, { format: 'register', as: 'ico', delimiter: '.' }),
    /<ico\.star> is not a valid custom element name \(it has no hyphen\)/,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('ok: rating.html + icons.html + themes.html compiled to ES modules; definitions import cleanly in Node; nothing registered');
