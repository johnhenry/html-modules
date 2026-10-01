// The optional compiler (PRD §1, §6, §18, §19): HTML module → ordinary ES module.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileHTMLModule, bindModule, isHTMLComponent, rewriteSpecifier } from '../src/index.js';
import { main } from '../bin/html-module.js';
import { setup, fixtures, shared, normalizeHTML, makeWindow } from './helpers.js';
import { specParse } from './spec-dom.js';

const runtime = new URL('../src/runtime.js', import.meta.url).href;
const fixture = (name) => readFile(new URL(name, fixtures), 'utf8');
let dir;
let url;

before(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-')));
  url = (name) => pathToFileURL(join(dir, name)).href;
  for (const name of ['ui', 'icons', 'profile', 'barrel']) {
    await writeFile(join(dir, `${name}.js`), compileHTMLModule(await fixture(`${name}.html`), { url: `${name}.html`, runtime }));
  }
  await copyFile(new URL('widgets.js', fixtures), join(dir, 'widgets.js'));
});

test('compiled output: definitions, data, stylesheets, a manifest and a default; nothing registered', async () => {
  const source = await readFile(join(dir, 'ui.js'), 'utf8');
  assert.match(source, /^\/\/ Compiled from ui\.html by html-module/);
  assert.doesNotMatch(source, /customElements|registerComponents/, 'compiled modules do not register themselves');
  const ui = await import(url('ui.js'));
  assert.deepEqual(Object.keys(ui).sort(), ['components', 'config', 'customCard', 'default', 'fancyButton', 'note', 'theme']);
  assert.ok(isHTMLComponent(ui.customCard));
  assert.equal(ui.customCard.url, url('ui.js'));
  assert.deepEqual(ui.config, { size: 3, brand: 'Acme' });
  assert.equal(ui.default, ui.note);
  assert.deepEqual(Object.keys(ui.components), ['custom-card', 'fancy-button', 'note']);
  assert.equal(shared.customElements.get('custom-card'), undefined);
});

test('runtime and compiled definitions are equivalent (§18)', async () => {
  const { modules } = setup();
  for (const name of ['ui', 'profile', 'barrel']) {
    const rt = await modules.load(new URL(`${name}.html`, fixtures).href);
    const cp = await import(url(`${name}.js`));
    assert.deepEqual(Object.keys(cp).sort(), Object.keys(rt).sort(), name);
    assert.deepEqual(Object.keys(cp.components).sort(), Object.keys(rt.components).sort(), `${name} manifest`);
    for (const key of Object.keys(rt.components)) {
      const [a, b] = [rt.components[key], cp.components[key]];
      if (!isHTMLComponent(a)) continue;
      const view = (d) => ({
        name: d.name, template: d.template && normalizeHTML(d.template), shadow: d.shadow, delegatesFocus: d.delegatesFocus, styles: d.styles,
        imports: d.imports.map((i) => ({ from: i.from, as: i.as, bindings: i.bindings })),
      });
      assert.deepEqual(view(b), view(a), `${name}: ${key}`);
    }
  }
});

test('round trip: compiled output registers and renders the same components as runtime loading', async () => {
  // Two pages: one loads the HTML modules at runtime, the other imports the compiled ES modules.
  const names = ['user-profile', 'custom-card', 'fancy-button', 'note'];
  const markup = names.map((n) => `<x--${n}><b slot="title">t</b>x</x--${n}>`).join('');
  const runtimePage = makeWindow();
  const { modules } = setup({ window: runtimePage });
  await modules.import(new URL('profile.html', fixtures).href, { as: 'x' });
  await modules.import(new URL('ui.html', fixtures).href, { as: 'x' });
  runtimePage.document.body.innerHTML = markup;
  const compiledPage = makeWindow();
  bindModule(await import(url('profile.js')), { as: 'x', window: compiledPage });
  bindModule(await import(url('ui.js')), { as: 'x', window: compiledPage });
  compiledPage.document.body.innerHTML = markup;
  const render = (win) => win.document.body.innerHTML + [...win.document.querySelectorAll('*')]
    .filter((el) => el.shadowRoot).map((el) => `${el.localName}:${el.shadowRoot.innerHTML}`).join('|');
  const deep = (win, sel) => win.document.querySelector(sel).shadowRoot.querySelector('icon--star').shadowRoot.innerHTML;
  assert.equal(normalizeHTML(render(compiledPage)), normalizeHTML(render(runtimePage)));
  for (const n of names) assert.ok(runtimePage.document.querySelector(`x--${n}`).shadowRoot.innerHTML.length > 0, n);
  assert.equal(deep(compiledPage, 'x--user-profile'), deep(runtimePage, 'x--user-profile'), 'dependencies render the same too');
  for (const tag of ['x--user-profile', 'x--custom-card', 'x--fancy-button', 'x--note', 'icon--star', 'icon--heart']) {
    assert.ok(runtimePage.customElements.get(tag) && compiledPage.customElements.get(tag), tag);
  }
});

test('a compiled module is importable with <html-import>, through its manifest', async () => {
  const { document, window } = setup({ elements: true, window: shared });
  document.body.innerHTML = `<html-import src="${url('barrel.js')}" as="cb"></html-import>`;
  const { elements } = await document.querySelector('html-import').ready;
  assert.deepEqual(Object.keys(elements).sort(), ['cb--button', 'cb--counter', 'cb--custom-card', 'cb--fancy-button', 'cb--note']);
  assert.ok(window.customElements.get('cb--counter').prototype instanceof (await import(url('widgets.js'))).Counter);
  document.body.innerHTML = '';
});

test('definition.define() on compiled exports (PRD compiler §6)', async () => {
  const { customCard } = await import(url('ui.js'));
  const win = makeWindow();
  const Card = customCard.define('app-custom-card', { window: win });
  assert.equal(win.customElements.get('app-custom-card'), Card);
});

test('register format: importing the module registers its components', async () => {
  const source = '<html-export name="reg-card"><template>r</template></html-export><html-export name="reg-note"><template>n</template></html-export>';
  const plain = compileHTMLModule(source, { url: 'reg.html', runtime, format: 'register' });
  await writeFile(join(dir, 'reg.register.js'), plain);
  await import(url('reg.register.js'));
  assert.ok(shared.customElements.get('reg-card') && shared.customElements.get('reg-note'));
  await writeFile(join(dir, 'ns.register.js'), compileHTMLModule(await fixture('icons.html'), { url: 'icons.html', runtime, format: 'register', as: 'regicon' }));
  const ns = await import(url('ns.register.js'));
  assert.ok(isHTMLComponent(ns.star), 'register modules still export their definitions');
  assert.ok(shared.customElements.get('regicon--star'));
  await writeFile(join(dir, 'bad.register.js'), compileHTMLModule(await fixture('icons.html'), { url: 'icons.html', runtime, format: 'register' }));
  await assert.rejects(import(url('bad.register.js')), /"star" is not a valid custom element name/);
});

test('compiler options and errors', async () => {
  assert.equal(rewriteSpecifier('./a.html'), './a.js');
  assert.equal(rewriteSpecifier('@ui/a.htm?x=1'), '@ui/a.js?x=1');
  assert.equal(rewriteSpecifier('./a.js'), './a.js');
  const js = compileHTMLModule('<html-import src="./a.html" as="a"></html-import><html-export name="class"><template>x</template></html-export>', { rewrite: (s) => s.replace('.html', '.mjs') });
  assert.match(js, /import \* as \$m0 from "\.\/a\.mjs";/);
  assert.match(js, /\$x_class as class,/, 'reserved words are fine as export names');
  assert.match(js, /from "@johnhenry\/html-modules\/runtime"/);
  const viaDOM = compileHTMLModule(await fixture('ui.html'), { url: 'ui.html', parse: (html) => specParse(html) });
  assert.equal(viaDOM, compileHTMLModule(await fixture('ui.html'), { url: 'ui.html' }), 'the DOM reader and the scanner compile identically');
  assert.throws(() => compileHTMLModule('<html-export name="a"></html-export>', { url: 'bad.html' }), /needs a <template>.* in bad\.html/);
  assert.throws(() => compileHTMLModule('', { format: 'bundle' }), /Unknown format "bundle"/);
  assert.throws(() => compileHTMLModule('', { format: 'register', as: 'A' }), /Invalid namespace/);
});

test('the default runtime specifier is this package\'s own published ./runtime subpath', async () => {
  // Codegen emits the package name into every compiled module: after a rename,
  // a stale default would make every compiled file import a package that is
  // not installed (or, unscoped, someone else's).
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.exports['./runtime'], './src/runtime.js');
  assert.match(compileHTMLModule(''), new RegExp(`from "${pkg.name}/runtime";`));
});

test('CLI: html-module input.html [-o out] [--format] [--as] [--runtime] [--stdout]', async () => {
  const io = () => {
    const out = { text: '', write: (s) => (out.text += s) };
    return out;
  };
  const input = join(dir, 'cli.html');
  await writeFile(input, await fixture('icons.html'));
  let stdout = io();
  assert.equal(await main([input, '--runtime', runtime], { stdout, stderr: io() }), 0);
  assert.match(stdout.text, /cli\.html → .*cli\.js/);
  assert.ok((await import(pathToFileURL(join(dir, 'cli.js')).href)).star);
  assert.equal(await main([input, '-o', join(dir, 'out', 'icons.js'), '-f', 'register', '--as', 'cli'], { stdout: io(), stderr: io() }), 0);
  assert.match(await readFile(join(dir, 'out', 'icons.js'), 'utf8'), /registerComponents\(\{ components: \$components \}, \{ as: "cli"/);
  assert.equal(await main([input, '--format', 'register'], { stdout: io(), stderr: io() }), 0);
  assert.ok((await readdir(dir)).includes('cli.register.js'));
  stdout = io();
  assert.equal(await main([input, '--stdout'], { stdout, stderr: io() }), 0);
  assert.match(stdout.text, /^\/\/ Compiled from cli\.html/);
  assert.match(stdout.text, /from "@johnhenry\/html-modules\/runtime";/, 'the CLI default runtime is the published subpath');
  const stderr = io();
  await writeFile(join(dir, 'broken.html'), '<html-export name="x"></html-export>');
  assert.equal(await main([join(dir, 'broken.html')], { stdout: io(), stderr }), 1);
  assert.match(stderr.text, /SyntaxError: <html-export name="x"> needs a <template>/);
  assert.equal(await main([], { stdout: io(), stderr: io() }), 2);
  assert.equal(await main(['a.html', 'b.html', '-o', 'x.js'], { stdout: io(), stderr: io() }), 2);
  stdout = io();
  assert.equal(await main(['--help'], { stdout, stderr: io() }), 0);
  assert.match(stdout.text, /Usage: html-module/);
});

test('data exports compile to JSON.parse, so a "__proto__" key stays an own key as it is at runtime', async () => {
  const source = '<html-export name="cfg"><script type="application/json">{"__proto__": {"admin": true}, "n": {"__proto__": 1}, "a": [1, {"b": null}]}</script></html-export>';
  const js = compileHTMLModule(source, { url: 'cfg.html', runtime });
  assert.match(js, /JSON\.parse\(/);
  await writeFile(join(dir, 'cfg.js'), js);
  const compiled = (await import(url('cfg.js'))).cfg;
  const { modules } = setup({ files: { 'cfg.html': source } });
  const runtimeValue = (await modules.load('./cfg.html')).cfg;
  for (const value of [compiled, runtimeValue]) {
    assert.ok(Object.hasOwn(value, '__proto__'), 'an own "__proto__" key');
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(value.admin, undefined, 'the prototype was not replaced');
    assert.ok(Object.hasOwn(value.n, '__proto__'));
  }
  assert.deepEqual(JSON.stringify(compiled), JSON.stringify(runtimeValue));
});
