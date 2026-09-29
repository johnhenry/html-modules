// The capability checklist and the example pages that cover it.
// The hub (examples/index.html) renders this; test/examples.test.js checks that
// every item is covered by at least one page and every page exists.

/** @type {Array<{ group: string, items: Array<[id: string, label: string]> }>} */
export const checklist = [
  { group: 'Export format', items: [
    ['fmt.component', '<html-export name><template> exports a component'],
    ['fmt.styles', '<style> children become component styles (one shared sheet)'],
    ['fmt.shadow', 'shadow="open|closed" and delegates-focus'],
    ['fmt.slots', 'native <slot>, named slots and ::part'],
    ['fmt.stylesheet', 'stylesheet export: <html-export> with only <style>'],
    ['fmt.data', 'data export: <script type="application/json">'],
    ['fmt.default', 'default export (<html-export default>)'],
    ['fmt.private', 'unexported markup stays private'],
    ['fmt.reexport-all', '<html-export src> re-exports every component (barrels)'],
    ['fmt.reexport-one', '<html-export src name import> re-exports one, renamed'],
    ['fmt.nested', 'modules import modules; imports are private to the module'],
  ] },
  { group: 'Importing', items: [
    ['imp.namespace', '<html-import src as> registers every component as <as>--<export>'],
    ['imp.delimiter', 'why the -- delimiter'],
    ['imp.two-namespaces', 'the same module under two namespaces'],
    ['imp.selective', '<html-binding> children bind only the listed exports'],
    ['imp.element', 'element= chooses the tag'],
    ['imp.multi-tag', 'one export under several tags'],
    ['imp.adopt', 'adopt a stylesheet export into the page or shadow root'],
    ['imp.data', 'data exports exposed on el.bindings'],
    ['imp.default', 'export="default" with element='],
    ['imp.side-effect', 'an import with no as and no bindings only loads'],
    ['imp.late', 'imports and bindings inserted later'],
    ['imp.bare', 'bare specifiers through the page import map'],
    ['imp.element-api', 'el.ready / el.module / el.elements / el.bindings, load and error events'],
  ] },
  { group: 'Upgrade and identity', items: [
    ['up.async', 'elements written before their import upgrade natively'],
    ['up.defined', ':not(:defined) styling and customElements.whenDefined()'],
    ['id.identity', 'a definition keeps its module-local name; the importer picks the tag'],
    ['id.define', 'definition.define(tag)'],
    ['id.subclass', 'every registration is a fresh subclass; Tag.component'],
  ] },
  { group: 'Runtime and JS API', items: [
    ['rt.cache', 'one fetch and parse per URL, shared by concurrent imports'],
    ['rt.events', 'createHTMLModules({ onEvent }): fetch / load / error'],
    ['rt.retry', 'failed loads are evicted and can be retried'],
    ['api.load', 'HTMLModules.load(): a namespace of definitions'],
    ['api.import', 'HTMLModules.import(src, { as, bindings })'],
    ['api.bind', 'HTMLModules.bind(module, …)'],
    ['api.define-js', 'defineHTMLComponent({ name, template, … }) in JS'],
  ] },
  { group: 'JS-authored components', items: [
    ['js.manifest', 'a JS module\'s components manifest'],
    ['js.definitions', 'defineHTMLComponent() exports without a manifest'],
    ['js.never', 'other JS exports are never registered'],
    ['js.binding', 'a plain class bound with <html-binding element>'],
    ['js.extend', 'a JS class extending an HTML definition\'s .element'],
    ['js.reexport', 'an HTML module re-exporting a JS component'],
  ] },
  { group: 'Styles and theming', items: [
    ['sty.custom-props', 'theming through inherited custom properties'],
    ['sty.parts', 'styling internals with ::part()'],
    ['sty.switch', 'switching adopted theme stylesheets'],
    ['sty.scoped', 'a module\'s own adopt applies inside its components only'],
  ] },
  { group: 'Compiler', items: [
    ['cmp.esm', 'html-module ui.html → ui.js exporting definitions and a manifest'],
    ['cmp.no-register', 'compiled modules do not register on import'],
    ['cmp.define', 'import { card } from "./ui.js"; card.define(tag)'],
    ['cmp.html-import', '<html-import src="ui.js" as> on compiled output'],
    ['cmp.register', '--format register (registers on import)'],
    ['cmp.same', 'compiled and runtime-loaded modules render the same'],
    ['cmp.in-browser', 'compileHTMLModule() in the browser'],
  ] },
  { group: 'Errors', items: [
    ['err.fetch', 'missing module (404)'],
    ['err.missing-export', 'binding an export the module does not have'],
    ['err.bad-tag', 'invalid tag in element='],
    ['err.not-element', 'a stylesheet or data bound to element='],
    ['err.not-stylesheet', 'adopt on something that is not a stylesheet'],
    ['err.conflict', 'a tag already bound to a different component'],
    ['err.namespace', 'invalid namespace (upper case, or containing --)'],
    ['err.format', 'invalid module: no template, duplicate or bad export name'],
    ['err.cycle', 'circular module dependency'],
    ['err.js-nothing', 'a JS module with no components imported as a namespace'],
    ['err.default-tag', 'binding the default export without element='],
  ] },
];

/** @type {Array<{ id: string, href: string, title: string, summary: string, covers: string[] }>} */
export const pages = [
  {
    id: 'quickstart', href: 'quickstart.html', title: 'Quickstart',
    summary: 'One script, one <html-import src as>, and namespaced elements that upgrade when their module arrives.',
    covers: ['fmt.component', 'fmt.styles', 'fmt.slots', 'imp.namespace', 'up.async', 'up.defined', 'imp.element-api'],
  },
  {
    id: 'library', href: 'library.html', title: 'Writing a component library in HTML',
    summary: 'The source of a small library next to what it renders: templates, styles, slots and parts, a default export, data, stylesheets, a module that imports another, and a barrel.',
    covers: ['fmt.component', 'fmt.styles', 'fmt.shadow', 'fmt.slots', 'fmt.stylesheet', 'fmt.data', 'fmt.default', 'fmt.private', 'fmt.reexport-all', 'fmt.reexport-one', 'fmt.nested', 'js.reexport', 'api.load', 'rt.cache', 'sty.scoped'],
  },
  {
    id: 'namespaces', href: 'namespaces.html', title: 'Namespaces and the -- delimiter',
    summary: 'as="ui" makes <ui--card>. The same module under two namespaces, a bare specifier through the import map, and a live test of which delimiters the Custom Elements registry accepts.',
    covers: ['imp.namespace', 'imp.delimiter', 'imp.two-namespaces', 'imp.bare', 'id.subclass', 'rt.cache', 'err.namespace'],
  },
  {
    id: 'bindings', href: 'bindings.html', title: 'Selective imports and custom tag names',
    summary: '<html-binding> children: bind only what the page uses, pick tag names, adopt stylesheets, read data, bind a default export, load for side effects, and add bindings later.',
    covers: ['imp.selective', 'imp.element', 'imp.multi-tag', 'imp.adopt', 'imp.data', 'imp.default', 'imp.side-effect', 'imp.late', 'imp.element-api', 'api.import'],
  },
  {
    id: 'identity', href: 'identity.html', title: 'Component identity vs registration name',
    summary: 'One definition, many tags: define() in JS, element= in markup and two namespaces, each a subclass of one base element.',
    covers: ['id.identity', 'id.define', 'id.subclass', 'imp.multi-tag', 'api.load', 'api.bind', 'api.define-js'],
  },
  {
    id: 'interop', href: 'interop.html', title: 'Mixing HTML and JS-authored components',
    summary: 'A JS module\'s components manifest, defineHTMLComponent() exports, a plain class bound by name, JS behaviour on an HTML template, and HTML re-exporting JS.',
    covers: ['js.manifest', 'js.definitions', 'js.never', 'js.binding', 'js.extend', 'js.reexport', 'api.define-js', 'err.js-nothing'],
  },
  {
    id: 'styles', href: 'styles.html', title: 'Styles and theming',
    summary: 'Component styles, theming through custom properties and ::part, switching adopted theme stylesheets, and stylesheets a module adopts only for its own components.',
    covers: ['fmt.styles', 'fmt.stylesheet', 'fmt.slots', 'sty.custom-props', 'sty.parts', 'sty.switch', 'sty.scoped', 'imp.adopt', 'up.defined'],
  },
  {
    id: 'errors', href: 'errors.html', title: 'Errors',
    summary: 'Every error, triggered on purpose, with the event it fires and its message.',
    covers: ['err.fetch', 'err.missing-export', 'err.bad-tag', 'err.not-element', 'err.not-stylesheet', 'err.conflict', 'err.namespace', 'err.format', 'err.cycle', 'err.js-nothing', 'err.default-tag', 'rt.retry', 'rt.events', 'imp.element-api'],
  },
  {
    id: 'compiler', href: 'compiler.html', title: 'The compiler',
    summary: 'An HTML module next to the ES module html-module compiled from it, both registered and rendered side by side, plus a live in-browser compiler.',
    covers: ['cmp.esm', 'cmp.no-register', 'cmp.define', 'cmp.html-import', 'cmp.register', 'cmp.same', 'cmp.in-browser'],
  },
  {
    id: 'app', href: 'app.html', title: 'A small app: reading list',
    summary: 'A reading-list app assembled from HTML modules: a component module, icons, seed data as JSON, a theme, and one JS component for behaviour.',
    covers: ['fmt.component', 'fmt.data', 'fmt.nested', 'imp.namespace', 'imp.selective', 'imp.adopt', 'imp.data', 'js.extend', 'js.manifest', 'sty.custom-props', 'sty.parts', 'rt.cache'],
  },
];

/** Items no page covers, with the reason. */
export const uncovered = {};

export const allItems = checklist.flatMap((g) => g.items.map(([id, label]) => ({ id, label, group: g.group })));
