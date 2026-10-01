/**
 * The programmatic API (PRD §20). `<html-import>` is a thin layer over one of
 * these, so both share the same cache, parser and binding rules.
 *
 *   const ui = await HTMLModules.load('./ui.html');        // { customCard, fancyButton, components, … }
 *   ui.customCard.define('my-card');                        // identity ≠ registration name
 *   await HTMLModules.import('./ui.html', { as: 'ui' });    // <html-import src="./ui.html" as="ui">
 *   await HTMLModules.import('./ui.html', { as: 'ui', bindings: [{ export: 'custom-card', element: 'x-card' }] });
 *   await HTMLModules.import('./ui.html', { as: 'ui', delimiter: '-' });   // <ui-custom-card>
 *   await HTMLModules.import('./ui.html', { as: 'ui', conflict: 'reuse' }); // keep tags that are already defined
 *   const h = HTMLModules.import('./ui.html', { as: 'ui', load: 'lazy' }); // a handle: nothing fetched yet
 *   await h.ready;                                           // …until a <ui--…> element appears, or h.load()
 */
import { createLoader } from './loader.js';
import { bindModule, hotReplaceModule } from './runtime.js';
import { IMPORT_DEFAULTS, checkFetchOptions, checkOptions, reportLoudly } from './settings.js';
import { lazyTargets, watchLazy } from './lazy.js';
import { lazyImportProblem } from './record.js';

/**
 * `options`: loader options (`fetch`, `parseHTML`, `hostResolve`, `baseURL`, `importModule`, `onEvent`, `credentials`,
 * `mode`, `trustedTypes`, `nonce`, `sanitize`) plus these defaults for this instance's imports (lowest precedence: `<html-import>`
 * attributes and the page's `<html-import-settings>` override them; they never apply inside modules): `delimiter`,
 * `base`, `conflict`, `load` (the default for `<html-import>` elements; `import()` is lazy only when the call says
 * `load: 'lazy'`) and `errors`. See `CreateHTMLModulesOptions`.
 * @param {import('./types.js').CreateHTMLModulesOptions} [options]
 * @returns {import('./types.js').HTMLModulesInstance}
 */
export function createHTMLModules({
  window: win = globalThis, registry, delimiter, base, conflict, load, errors, ...loaderOptions
} = {}) {
  checkOptions({ delimiter, base, conflict, load, errors }, ' in createHTMLModules()');
  const loader = createLoader({ window: win, ...loaderOptions });
  const reg = () => registry ?? win.customElements;
  const options = Object.freeze({
    delimiter: delimiter ?? IMPORT_DEFAULTS.delimiter,
    conflict: conflict ?? IMPORT_DEFAULTS.conflict,
    load: load ?? IMPORT_DEFAULTS.load,
    errors: errors ?? IMPORT_DEFAULTS.errors,
  });
  let resolvedBase;
  const instanceBase = () => {
    if (base === undefined) return undefined;
    resolvedBase ??= loader.baseURL ? new URL(base, loader.baseURL).href : new URL(base).href;
    return resolvedBase;
  };

  const bind = (module, { as, delimiter: d = options.delimiter, bindings, from, root, conflict: c = options.conflict } = {}) =>
    bindModule(module, { as, delimiter: d, bindings, from, conflict: c, registry: reg(), window: win, root: root ?? win.document });

  async function importNow(src, { as, delimiter: d, bindings, base: b, type, root, conflict: c, integrity, credentials, mode, sanitize }) {
    const module = await api.load(src, { base: b, type, integrity, credentials, mode, sanitize });
    return { module, ...bind(module, { as, delimiter: d, bindings, from: src, root, conflict: c }) };
  }

  const api = {
    loader,
    /** The module cache: `<kind>:<resolved URL>` (`html:https://…/ui.html`) → Promise of the namespace. */
    cache: loader.cache,

    /** The default namespace delimiter of this instance. */
    delimiter: options.delimiter,

    /** This instance's import defaults: `{ delimiter, conflict, load, errors }`. */
    options,

    /**
     * The sanitizer applied to the component templates of every HTML module this instance loads, or undefined.
     * Assigning it affects loads that start afterwards (a module already cached unsanitized stays that way; a
     * sanitized load is cached apart). `false` or `undefined` clears it.
     */
    get sanitize() {
      return loader.sanitize;
    },
    set sanitize(value) {
      loader.sanitize = value;
    },

    /** This instance's base URL for import specifiers (absolute), or undefined. */
    get base() {
      return instanceBase();
    },

    /** Resolve a specifier as `<html-import src>` would. */
    resolve: (src, b) => loader.resolve(src, b ?? instanceBase()),

    /**
     * Load an HTML (or JS) module and return its namespace, without registering anything.
     * @param {string} src
     * @param {{ base?: string, type?: 'html'|'js', integrity?: string, credentials?: 'omit'|'same-origin'|'include', mode?: 'cors'|'same-origin'|'no-cors', sanitize?: import('./types.js').Sanitizer | false }} [options]
     *        `integrity` is Subresource Integrity metadata checked against the fetched bytes (HTML modules only);
     *        `credentials` and `mode` are the fetch options for this module, over the instance's; `sanitize` runs
     *        the component templates of this module and of the HTML modules it imports through that function
     *        (`false`: through none, even if the instance has one). A module is cached per sanitizer.
     */
    load: (src, { base: b, type, integrity, credentials, mode, sanitize } = {}) => loader.load(src, b ?? instanceBase(), { type, integrity, credentials, mode, sanitize }),

    /**
     * Evict a module from the cache so the next `load()` / `import()` fetches it again. Without `type`, every kind
     * of that URL is evicted. Returns whether anything was. Registered tags stay registered and namespaces
     * already loaded are unchanged; a JavaScript module also stays in the browser's own module map.
     * @param {string} src
     * @param {{ base?: string, type?: 'html'|'js' }} [options]
     * @returns {boolean}
     */
    unload: (src, { base: b, type } = {}) => loader.unload(src, b ?? instanceBase(), { type }),

    /**
     * Hot reload an HTML module: fetch it again (bypassing the HTTP cache), replace its cache entry, and swap its
     * components and stylesheets under the elements already registered: live elements are re-stamped in place
     * (template changes) and get their styles swapped, keeping their classes, listeners and light DOM. Custom
     * element definitions cannot be replaced, so registered classes delegate to a swappable definition.
     * Resolves to `{ reload, reasons, updated, elements }`: `reload` is true (and nothing was swapped) when the
     * change cannot be applied to live elements (exports added or removed, changed data, shadow mode, new observed
     * attributes, changed imports): reload the page then. `{ skipped: true }` when the module was never loaded here.
     * Rejects, leaving everything as it was, when the new source is invalid.
     * @param {string} src
     * @param {{ base?: string, sanitize?: import('./types.js').Sanitizer | false }} [options]  `sanitize`: the sanitizer the module was imported with (default: the instance's)
     * @returns {Promise<{ reload: boolean, reasons: string[], updated: string[], elements: number, skipped?: true }>}
     */
    async hotReload(src, { base: b, sanitize } = {}) {
      const referrer = b ?? instanceBase();
      const url = loader.resolve(src, referrer);
      if (!loader.cached(url, referrer, { sanitize })) return { reload: false, reasons: [], updated: [], elements: 0, skipped: true };
      const { previous, next } = await loader.reload(url, referrer, { sanitize });
      if (!previous) return { reload: true, reasons: ['the module had not finished loading'], updated: [], elements: 0 };
      return hotReplaceModule(previous, next);
    },

    /**
     * Bind a loaded namespace: see `bindModule()`.
     * @param {object} module
     * @param {{ as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>, from?: string, root?: Document|ShadowRoot, conflict?: 'error'|'reuse' }} [options]
     */
    bind,

    /**
     * Load and bind in one step: the programmatic `<html-import>`.
     *
     * Eager (the default) returns a Promise of `{ module, elements, values, tags }`.
     * With `load: 'lazy'` nothing is fetched yet: it returns a handle
     * `{ ready, load(), cancel(), state }` right away (not a Promise, so `await`
     * does not wait for use). `ready` settles when the module has been loaded
     * and bound: when an element with one of its tags appears in the document
     * or a component's shadow root, or when `load()` is called.
     * @param {string} src
     * @param {{ as?: string, delimiter?: string, bindings?: object[], base?: string, type?: 'html'|'js', root?: Document|ShadowRoot,
     *           conflict?: 'error'|'reuse', load?: 'eager'|'lazy', errors?: 'event'|'throw',
     *           integrity?: string, credentials?: string, mode?: string, sanitize?: import('./types.js').Sanitizer | false }} [options]
     */
    import(src, { as, delimiter: d = options.delimiter, bindings, base: b, type, root, conflict: c = options.conflict, load: l = 'eager', errors: e = options.errors, integrity, credentials, mode, sanitize, registry: moduleRegistry } = {}) {
      const call = { as, delimiter: d, bindings, base: b, type, root, conflict: c, integrity, credentials, mode, sanitize };
      const loud = (promise) => {
        if (e === 'throw') promise.catch((error) => reportLoudly(error, win));
        return promise;
      };
      try {
        if (moduleRegistry !== undefined) {
          throw new SyntaxError('"registry" cannot be set in HTMLModules.import(): it applies to the imports of an HTML module\'s own components (write <html-import-settings registry="scoped"> in the module); a page\'s tags always live in the document\'s registry');
        }
        checkOptions({ delimiter: d, conflict: c, load: l, errors: e }, ' in HTMLModules.import()');
        checkFetchOptions({ integrity, credentials, mode }, ' in HTMLModules.import()');
      } catch (error) {
        return loud(Promise.reject(error));
      }
      if (l !== 'lazy') return loud(importNow(src, call));
      return lazyImport(src, call, loud);
    },
  };

  function lazyImport(src, call, loud) {
    let resolve;
    let reject;
    const ready = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    let state = 'waiting';
    let started = false;
    let watcher = null;
    const start = () => {
      if (!started) {
        started = true;
        watcher?.cancel();
        state = 'loading';
        loud(importNow(src, call)).then(
          (result) => { state = 'loaded'; resolve(result); },
          (error) => { state = 'error'; reject(error); },
        );
      }
      return ready;
    };
    const handle = {
      src,
      ready,
      /** Load now, whether or not a tag has been used. Returns `ready`. */
      load: start,
      /** Stop watching (only before loading starts); `ready` then stays pending until `load()`. */
      cancel() {
        if (state !== 'waiting') return;
        watcher?.cancel();
        state = 'cancelled';
      },
      /** "waiting" | "cancelled" | "loading" | "loaded" | "error" */
      get state() {
        return state;
      },
    };
    const problem = lazyImportProblem({ src, as: call.as, bindings: call.bindings ?? [] });
    if (problem) {
      state = 'error';
      started = true;
      const error = new SyntaxError(problem);
      reject(error);
      ready.catch(() => {}); // the caller sees it on `ready`; this only stops an unhandled-rejection report
      loud(Promise.reject(error)).catch(() => {});
      return handle;
    }
    watcher = watchLazy(win, lazyTargets({ as: call.as, delimiter: call.delimiter, bindings: call.bindings }), () => start());
    return handle;
  }

  return api;
}

