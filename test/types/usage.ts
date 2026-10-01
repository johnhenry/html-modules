// Type-checks (tsc --noEmit, `npm run types:check`) a typed consumer of every entry point. Nothing here runs.
import {
  HTMLComponent, defineHTMLComponent, defineHTMLStylesheet, readHTMLModule, scanHTMLModule, compileHTMLModule, createHTMLModules,
  bindModule, hotReplaceModule, supportsScopedRegistries, camelCase, bindingName, IMPORT_DEFAULTS,
  type ModuleRecord, type ExportRecord, type ImportRecord, type ModuleNamespace, type HTMLModulesInstance, type ComponentSpec, type ImportResult,
} from '@johnhenry/html-modules';
import { HTMLModules, HTMLImport, type HTMLImportElement } from '@johnhenry/html-modules/browser';
import { defineElement, renderDeclarative, manifest, type BindResult } from '@johnhenry/html-modules/runtime';
import { compileRecord, rebaseSpecifier, type CompileOptions } from '@johnhenry/html-modules/compiler';
import { createDevServer } from '@johnhenry/html-modules/dev';
import htmlModules from '@johnhenry/html-modules/vite';

// Records.
const record: ModuleRecord = scanHTMLModule('<html-export name="card"><template>x</template></html-export>', 'ui.html');
const first: ExportRecord = record.exports[0];
if (first.kind === 'component') {
  const template: string = first.template;
  const shadow: 'open' | 'closed' = first.shadow;
  const props: Array<{ name: string; type: 'string' | 'number' | 'boolean' }> | undefined = first.props;
  const formAssociated: true | undefined = first.formAssociated;
  void [template, shadow, props, formAssociated];
}
const imports: ImportRecord[] = record.imports;
const fromDom: ModuleRecord = readHTMLModule(new DOMParser().parseFromString('', 'text/html'), 'x.html');
void [imports, fromDom];

// Definitions and the runtime.
const spec: ComponentSpec = { name: 'user-card', template: '<b>{{name}}</b>', props: [{ name: 'count', type: 'number' }], formAssociated: true, formControl: 'input' };
const def: HTMLComponent = defineHTMLComponent(spec);
const name: string | null = def.name;
const Registered: CustomElementConstructor = def.define('x-card');
const Base: CustomElementConstructor = def.element;
const sheet = defineHTMLStylesheet({ css: 'a { color: red }' });
const maybe: CSSStyleSheet | null = sheet.sheetFor(window);
const tag: string = bindingName('ui', 'card');
const cc: string = camelCase('fancy-button');
const delimiter: string = IMPORT_DEFAULTS.delimiter;
const ns: ModuleNamespace = { components: { card: def } };
const bound: BindResult = bindModule(ns, { as: 'ui' });
const classes: Record<string, CustomElementConstructor> = bound.elements;
const hot = hotReplaceModule(ns, ns);
const reload: boolean = hot.reload;
const html: string = renderDeclarative(def, '<p>light</p>');
defineElement('x-other', def, { conflict: 'reuse' });
const scoped: boolean = supportsScopedRegistries(window);
const m = manifest({ card: def });
void [name, Registered, Base, maybe, tag, cc, delimiter, classes, reload, html, scoped, m];

// The programmatic API.
const modules: HTMLModulesInstance = createHTMLModules({ baseURL: 'https://example.test/' });
const loaded: Promise<ModuleNamespace> = modules.load('./ui.html');
const eager: Promise<ImportResult> = modules.import('./ui.html', { as: 'ui', conflict: 'reuse' });
const handle = modules.import('./ui.html', { as: 'ui', load: 'lazy' });
const state: 'waiting' | 'cancelled' | 'loading' | 'loaded' | 'error' = handle.state;
const ready: Promise<ImportResult> = handle.ready;
const reloaded: Promise<{ reload: boolean; reasons: string[]; updated: string[]; elements: number }> = modules.hotReload('./ui.html');
void [loaded, eager, state, ready, reloaded];

// The browser entry point.
const loadedByPage: Promise<ModuleNamespace> = HTMLModules.load('./ui.html');
const el: HTMLImportElement = document.createElement('html-import') as HTMLImportElement;
const result = await el.ready;
const tags: string[] = Object.keys(result.tags);
const phase: 'idle' | 'waiting' | 'loading' | 'loaded' | 'error' = el.state;
const importClass: typeof HTMLImport = HTMLImport;
void [loadedByPage, tags, phase, importClass];

// The compiler.
const options: CompileOptions = { format: 'register', as: 'ui', delimiter: '-', conflict: 'reuse', hot: false };
const js: string = compileHTMLModule('<html-export name="a"><template>a</template></html-export>', { url: 'a.html', ...options });
const again: string = compileRecord(record, { runtime: './runtime.js' });
const rebased: string = rebaseSpecifier('./card.html', './vendor/');
void [js, again, rebased];

// The dev server and the Vite plugin.
const dev = await createDevServer({ dir: '.', port: 0 });
const url: string = dev.url;
await dev.close();
const plugin = htmlModules({ runtime: '/src/runtime.js', hot: true });
void [url, plugin];

// A mistake the types catch.
// @ts-expect-error `shadow` is "open" or "closed"
const bad: ComponentSpec = { template: 'x', shadow: 'none' };
void bad;
