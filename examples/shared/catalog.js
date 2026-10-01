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
    ['fmt.default', 'default export: name="default", a bare name, or name="x" default'],
    ['fmt.private', 'unexported markup stays private'],
    ['fmt.reexport-all', '<html-export src> re-exports every component (barrels)'],
    ['fmt.reexport-one', '<html-export src name import> re-exports one, renamed'],
    ['fmt.nested', 'modules import modules; imports are private to the module'],
  ] },
  { group: 'Importing', items: [
    ['imp.namespace', '<html-import src as> registers every component as <as>--<export>'],
    ['imp.delimiter', 'why -- is the default delimiter'],
    ['imp.custom-delimiter', 'delimiter="-" on an import, createHTMLModules({ delimiter }), and inside modules'],
    ['imp.tags', 'el.tags records { tag, namespace, export }; tags are never parsed'],
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
  { group: 'Settings', items: [
    ['set.import-settings', '<html-import-settings> sets defaults for the imports of its document'],
    ['set.precedence', 'precedence: attribute > document settings > createHTMLModules() options > defaults'],
    ['set.delimiter', 'delimiter for a whole document'],
    ['set.base', 'base: resolve every import against a versioned folder, and nothing else'],
    ['set.conflict', 'conflict="reuse" vs "error" (a compiled and a runtime copy on one page)'],
    ['set.errors', 'errors="throw" reports failures to reportError() / window.onerror'],
    ['set.scope', 'settings are lexical: page settings never reach modules; module settings stay inside'],
    ['set.placement', 'placement rules: before any <html-import>, at most one, validated attributes'],
    ['set.module-settings', '<html-module-settings> shadow / delegates-focus defaults, overridden per export'],
  ] },
  { group: 'Lazy loading', items: [
    ['lazy.first-use', 'load="lazy": nothing is fetched until a tag is used'],
    ['lazy.prefix', 'a lazy namespace import waits for any <as><delimiter>… tag'],
    ['lazy.shadow', 'tags inside component shadow roots trigger a load'],
    ['lazy.bindings', '<html-binding element=> children: exactly those tags'],
    ['lazy.module', 'a module\'s own lazy imports'],
    ['lazy.load', 'el.load() and el.state'],
    ['lazy.disconnect', 'disconnecting before load cancels the watching'],
    ['lazy.api', 'HTMLModules.import(src, { load: "lazy" }) handles'],
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
  { group: 'Data binding', items: [
    ['bind.text', '{{attribute}} in text nodes: set as text, never markup'],
    ['bind.attr', '{{attribute}} in attribute values, with interpolation; URL attributes refuse javascript:'],
    ['bind.props', 'props="name count:number open:boolean": reflected, typed, observed properties'],
    ['bind.patch', 'a changed attribute patches its bound nodes; the shadow root is not re-stamped'],
    ['bind.compiled', 'compiled modules bind identically to runtime-loaded ones'],
  ] },
  { group: 'Form-associated components', items: [
    ['frm.associated', 'form-associated: static formAssociated and ElementInternals; name and value reach FormData'],
    ['frm.control', 'form-control="selector": a control in the template supplies the value and validity'],
    ['frm.validity', 'required, setCustomValidity(), :invalid and form.checkValidity()'],
    ['frm.disabled', 'a disabled fieldset disables the component'],
    ['frm.reset', 'form.reset() restores the default value; state restore after navigation'],
    ['frm.internals', 'one ElementInternals, shared with a closed shadow root and with subclasses'],
    ['frm.implicit', 'Enter in a form-control input submits the form: the default button, a disabled one blocks it'],
    ['frm.buttons', 'form-role="submit"|"reset": a component that is a submit or reset button (and the default button)'],
  ] },
  { group: 'Scoped registries', items: [
    ['reg.scoped', 'registry="scoped" in a module: its own imports register in a registry its components\' shadow roots use'],
    ['reg.coexist', 'two versions of a library using the same inner tag coexist on one page'],
    ['reg.fallback', 'where unsupported: reported (supportsScopedRegistries), and a warned fallback to the global registry'],
  ] },
  { group: 'Dev tooling', items: [
    ['dev.server', 'html-module dev [dir]: a static server that watches the directory and pushes changes over SSE'],
    ['dev.hot', 'HTMLModules.hotReload(): a module edit re-stamps live elements and swaps their styles in place'],
    ['dev.vite', '@johnhenry/html-modules/vite: HTML modules imported from JS, compiled, with HMR'],
  ] },
  { group: 'Compiler', items: [
    ['cmp.esm', 'html-module ui.html → ui.js exporting definitions and a manifest'],
    ['cmp.no-register', 'compiled modules do not register on import'],
    ['cmp.define', 'import { card } from "./ui.js"; card.define(tag)'],
    ['cmp.html-import', '<html-import src="ui.js" as> on compiled output'],
    ['cmp.register', '--format register (registers on import)'],
    ['cmp.delimiter', '--delimiter for the register format'],
    ['cmp.default', 'export default in compiled output'],
    ['cmp.same', 'compiled and runtime-loaded modules render the same'],
    ['cmp.in-browser', 'compileHTMLModule() in the browser'],
    ['cmp.settings', 'settings compile too: export defaults in definitions, import settings in $imports'],
  ] },
  { group: 'Scripting and lifecycle', items: [
    ['scr.element-props', 'a scripted <html-import>: createElement, append, then set src/as; reflected properties; src changed after loading is an error'],
    ['scr.unadopt', 'removing an adopt <html-binding> un-adopts its stylesheet'],
    ['scr.unload', 'HTMLModules.unload(src) evicts a module from the cache'],
    ['scr.dsd', 'server-rendered (declarative) shadow DOM, open and closed, kept and styled; renderDeclarative()'],
    ['scr.markup', 'a self-closed <html-binding /> and a lazy import with nothing to wait for are errors, not silence'],
    ['scr.security', 'integrity (SRI), credentials, mode and a Trusted Types policy'],
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
    ['err.default', '<html-export default> without a name, or two default exports'],
    ['err.delimiter', 'an invalid delimiter, or a tag the delimiter makes invalid (ui.card)'],
    ['err.settings', 'misplaced, duplicate or invalid settings, and invalid per-import options'],
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
    summary: 'The source of a small library next to what it renders: templates, styles, slots and parts, a default export, data, stylesheets, a module that imports another, and barrels using every re-export form (list, namespace, default).',
    covers: ['fmt.component', 'fmt.styles', 'fmt.shadow', 'fmt.slots', 'fmt.stylesheet', 'fmt.data', 'fmt.default', 'fmt.private', 'fmt.reexport-all', 'fmt.reexport-one', 'fmt.nested', 'js.reexport', 'api.load', 'rt.cache', 'sty.scoped'],
  },
  {
    id: 'namespaces', href: 'namespaces.html', title: 'Namespaces and delimiters',
    summary: 'as="ui" makes <ui--card>; delimiter="-" makes <ui-card>. The same module under several namespaces and delimiters, a module choosing its own delimiter, the tag records, a bare specifier through the import map, and a live test of which delimiters the registry accepts.',
    covers: ['imp.namespace', 'imp.delimiter', 'imp.custom-delimiter', 'imp.tags', 'imp.two-namespaces', 'imp.bare', 'id.subclass', 'rt.cache', 'err.namespace', 'err.delimiter'],
  },
  {
    id: 'bindings', href: 'bindings.html', title: 'Selective imports and custom tag names',
    summary: '<html-binding> children: bind only what the page uses, pick tag names, adopt stylesheets, read data, bind a default export, load for side effects, and add bindings later.',
    covers: ['imp.selective', 'imp.element', 'imp.multi-tag', 'imp.adopt', 'imp.data', 'imp.default', 'imp.side-effect', 'imp.late', 'imp.element-api', 'api.import'],
  },
  {
    id: 'identity', href: 'identity.html', title: 'Component identity vs registration name',
    summary: 'One definition, many tags: define() in JS, element= in markup and two namespaces, each a subclass of one base element. A default export has no name at all: the importer names it.',
    covers: ['id.identity', 'id.define', 'id.subclass', 'imp.multi-tag', 'api.load', 'api.bind', 'api.define-js', 'fmt.default', 'imp.default'],
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
    id: 'data', href: 'data.html', title: 'Data binding',
    summary: '{{attribute}} in a template\'s text and attribute values, props that reflect as typed properties, escaping (text only, javascript: URLs refused), in-place patching, and the compiled module rendering the same. No eval; strict CSP and Trusted Types safe.',
    covers: ['bind.text', 'bind.attr', 'bind.props', 'bind.patch', 'bind.compiled', 'fmt.component', 'cmp.same'],
  },
  {
    id: 'forms', href: 'forms.html', title: 'Form-associated components',
    summary: 'form-associated on an export: components that take part in <form>: FormData, validity and :invalid, disabled fieldsets, reset, a closed shadow root, and a subclass sharing the same ElementInternals. Enter submits a form of components, and form-role makes a component a submit or reset button.',
    covers: ['frm.associated', 'frm.control', 'frm.validity', 'frm.disabled', 'frm.reset', 'frm.internals', 'frm.implicit', 'frm.buttons', 'fmt.shadow'],
  },
  {
    id: 'scoped', href: 'scoped.html', title: 'Scoped registries',
    summary: 'registry="scoped" in a module: its own imports are registered in a registry its components\' shadow roots use, so two versions of a library with the same inner tag names coexist. Reports itself unsupported where the browser has no scoped registries.',
    covers: ['reg.scoped', 'reg.coexist', 'reg.fallback', 'set.module-settings', 'fmt.nested'],
  },
  {
    id: 'errors', href: 'errors.html', title: 'Errors',
    summary: 'Every error, triggered on purpose, with the event it fires and its message.',
    covers: ['err.fetch', 'err.missing-export', 'err.bad-tag', 'err.not-element', 'err.not-stylesheet', 'err.conflict', 'err.namespace', 'err.format', 'err.cycle', 'err.js-nothing', 'err.default-tag', 'err.default', 'err.delimiter', 'err.settings', 'set.placement', 'rt.retry', 'rt.events', 'imp.element-api'],
  },
  {
    id: 'compiler', href: 'compiler.html', title: 'The compiler',
    summary: 'An HTML module next to the ES module html-module compiled from it, both registered and rendered side by side, export default, register builds with and without a custom delimiter, plus a live in-browser compiler.',
    covers: ['cmp.esm', 'cmp.no-register', 'cmp.define', 'cmp.html-import', 'cmp.register', 'cmp.delimiter', 'cmp.default', 'cmp.same', 'cmp.in-browser'],
  },
  {
    id: 'app', href: 'app.html', title: 'A small app: reading list',
    summary: 'A reading-list app assembled from HTML modules: a component module, icons, seed data as JSON, a theme, and one JS component for behaviour.',
    covers: ['fmt.component', 'fmt.data', 'fmt.nested', 'imp.namespace', 'imp.selective', 'imp.adopt', 'imp.data', 'js.extend', 'js.manifest', 'sty.custom-props', 'sty.parts', 'rt.cache'],
  },
  {
    id: 'settings', href: 'settings.html', title: 'Settings',
    summary: '<html-import-settings> for a whole page: delimiter, a base that switches a vendored library between versions, conflict="reuse" letting a compiled and a runtime copy share a page, errors="throw" reaching window.onerror; lexical scope; and <html-module-settings> giving a module closed shadow roots by default.',
    covers: ['set.import-settings', 'set.precedence', 'set.delimiter', 'set.base', 'set.conflict', 'set.errors', 'set.scope', 'set.placement', 'set.module-settings', 'fmt.shadow', 'fmt.reexport-all', 'imp.custom-delimiter', 'imp.tags', 'cmp.register', 'cmp.settings', 'err.settings', 'err.conflict'],
  },
  {
    id: 'lazy', href: 'lazy.html', title: 'Lazy loading',
    summary: 'load="lazy": a live network panel shows each module fetched only when its first element appears, including a tag inside a component\'s shadow root, a binding\'s exact tag, a module\'s own lazy import, el.load(), disconnecting before load, and a lazy HTMLModules.import() handle.',
    covers: ['lazy.first-use', 'lazy.prefix', 'lazy.shadow', 'lazy.bindings', 'lazy.module', 'lazy.load', 'lazy.disconnect', 'lazy.api', 'set.import-settings', 'set.precedence', 'up.async', 'up.defined', 'imp.element-api'],
  },
  {
    id: 'scripting', href: 'scripting.html', title: 'Scripting and lifecycle',
    summary: 'Live checks for driving the library from script: a scripted <html-import>, un-adopting a stylesheet, unload(), server-rendered shadow DOM (open and closed), markup mistakes that used to be silent, and the security options.',
    covers: ['scr.element-props', 'scr.unadopt', 'scr.unload', 'scr.dsd', 'scr.markup', 'scr.security', 'imp.element-api', 'imp.adopt', 'rt.cache'],
  },
];

/** Items no page covers, with the reason. */
export const uncovered = {
  'dev.server': 'needs a running server and a file to edit: proven against real browsers by test/browser/hot.spec.js, and by examples/07',
  'dev.hot': 'needs a file to edit while the page is open: proven by test/browser/hot.spec.js (and examples/07 in Node)',
  'dev.vite': 'needs a Vite project: proven by test/vite.test.js (build) and test/browser/vite-hmr.spec.js (dev HMR)',
};

export const allItems = checklist.flatMap((g) => g.items.map(([id, label]) => ({ id, label, group: g.group })));
