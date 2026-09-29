/**
 * The programmatic API (PRD §20). `<html-import>` is a thin layer over one of
 * these, so both share the same cache, parser and binding rules.
 *
 *   const ui = await HTMLModules.load('./ui.html');        // { customCard, fancyButton, components, … }
 *   ui.customCard.define('my-card');                        // identity ≠ registration name
 *   await HTMLModules.import('./ui.html', { as: 'ui' });    // <html-import src="./ui.html" as="ui">
 *   await HTMLModules.import('./ui.html', { as: 'ui', bindings: [{ export: 'custom-card', element: 'x-card' }] });
 */
import { createLoader } from './loader.js';
import { bindModule } from './runtime.js';

/**
 * @param {object} [options]  loader options (`fetch`, `parseHTML`, `hostResolve`, `baseURL`,
 *                            `importModule`, `onEvent`) plus:
 * @param {any} [options.window]                   the window whose DOM and registry to use
 * @param {CustomElementRegistry} [options.registry]
 */
export function createHTMLModules({ window: win = globalThis, registry, ...loaderOptions } = {}) {
  const loader = createLoader({ window: win, ...loaderOptions });
  const reg = () => registry ?? win.customElements;

  const api = {
    loader,
    /** The module cache: resolved URL → Promise of the namespace. */
    cache: loader.cache,

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
     * @param {{ as?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>, from?: string, root?: Document|ShadowRoot }} [options]
     */
    bind: (module, { as, bindings, from, root } = {}) =>
      bindModule(module, { as, bindings, from, registry: reg(), window: win, root: root ?? win.document }),

    /**
     * Load and bind in one step: the programmatic `<html-import>`.
     * @param {string} src
     * @param {{ as?: string, bindings?: object[], base?: string, type?: 'html'|'js', root?: Document|ShadowRoot }} [options]
     * @returns {Promise<{ module: object, elements: Record<string, Function>, values: Record<string, unknown> }>}
     */
    async import(src, { as, bindings, base, type, root } = {}) {
      const module = await api.load(src, { base, type });
      return { module, ...api.bind(module, { as, bindings, from: src, root }) };
    },
  };
  return api;
}
