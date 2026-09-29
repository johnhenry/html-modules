/**
 * The programmatic API (PRD §20). `<html-import>` is a thin layer over one of
 * these, so both share the same cache, parser and binding rules.
 *
 *   const ui = await HTMLModules.load('./ui.html');        // { customCard, fancyButton, components, … }
 *   ui.customCard.define('my-card');                        // identity ≠ registration name
 *   await HTMLModules.import('./ui.html', { as: 'ui' });    // <html-import src="./ui.html" as="ui">
 *   await HTMLModules.import('./ui.html', { as: 'ui', bindings: [{ export: 'custom-card', element: 'x-card' }] });
 *   await HTMLModules.import('./ui.html', { as: 'ui', delimiter: '-' });   // <ui-custom-card>
 */
import { createLoader } from './loader.js';
import { bindModule } from './runtime.js';
import { DELIMITER, assertDelimiter } from './names.js';

/**
 * @param {object} [options]  loader options (`fetch`, `parseHTML`, `hostResolve`, `baseURL`,
 *                            `importModule`, `onEvent`) plus:
 * @param {any} [options.window]                   the window whose DOM and registry to use
 * @param {CustomElementRegistry} [options.registry]
 * @param {string} [options.delimiter]            namespace delimiter for this instance's imports (default "--");
 *                                                `<html-import delimiter>` and the `delimiter` option override it
 */
export function createHTMLModules({ window: win = globalThis, registry, delimiter = DELIMITER, ...loaderOptions } = {}) {
  assertDelimiter(delimiter);
  const loader = createLoader({ window: win, ...loaderOptions });
  const reg = () => registry ?? win.customElements;

  const api = {
    loader,
    /** The module cache: resolved URL → Promise of the namespace. */
    cache: loader.cache,

    /** The default namespace delimiter of this instance. */
    delimiter,

    /** Resolve a specifier as `<html-import src>` would. */
    resolve: (src, base) => loader.resolve(src, base),

    /**
     * Load an HTML (or JS) module and return its namespace, without registering anything.
     * @param {string} src
     * @param {{ base?: string, type?: 'html'|'js' }} [options]
     */
    load: (src, { base, type } = {}) => loader.load(src, base, { type }),

    /**
     * Bind a loaded namespace: see `bindModule()`.
     * @param {object} module
     * @param {{ as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>, from?: string, root?: Document|ShadowRoot }} [options]
     */
    bind: (module, { as, delimiter: d = delimiter, bindings, from, root } = {}) =>
      bindModule(module, { as, delimiter: d, bindings, from, registry: reg(), window: win, root: root ?? win.document }),

    /**
     * Load and bind in one step: the programmatic `<html-import>`.
     * @param {string} src
     * @param {{ as?: string, delimiter?: string, bindings?: object[], base?: string, type?: 'html'|'js', root?: Document|ShadowRoot }} [options]
     * @returns {Promise<{ module: object, elements: Record<string, Function>, values: Record<string, unknown>, tags: Record<string, { tag: string, namespace: string|null, export: string }> }>}
     */
    async import(src, { as, delimiter: d = delimiter, bindings, base, type, root } = {}) {
      if (d !== delimiter) assertDelimiter(d);
      const module = await api.load(src, { base, type });
      return { module, ...api.bind(module, { as, delimiter: d, bindings, from: src, root }) };
    },
  };
  return api;
}
