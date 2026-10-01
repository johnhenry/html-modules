/**
 * The declarative layer: <html-import>, <html-binding>, <html-export> and the
 * settings elements <html-import-settings> and <html-module-settings>.
 *
 *   <html-import-settings delimiter="-" base="./vendor/ui@2/" load="lazy"></html-import-settings>
 *                                                                   defaults for this document's imports
 *   <html-import src="./ui.html" as="ui"></html-import>             every component as <ui--…>
 *   <html-import src="./ui.html" as="ui" delimiter="-"></html-import>   … as <ui-…>
 *   <html-import src="./ui.html" as="ui" load="lazy"></html-import>  fetched when a <ui--…> is first used
 *   <html-import src="./ui.html" as="ui">                           only these:
 *     <html-binding export="card"></html-binding>                     <ui--card>
 *     <html-binding export="button" element="brand-button"></html-binding>
 *     <html-binding export="theme" adopt></html-binding>              a stylesheet, adopted
 *   </html-import>
 *   <html-import src="./counter.js">                                a JS-authored class
 *     <html-binding export="Counter" element="x-counter"></html-binding>
 *   </html-import>
 *   <html-import src="./setup.html"></html-import>                  load only (side effects, warm cache)
 *
 * Elements that use a binding may appear anywhere, before or after the import:
 * they upgrade natively when their tag is defined (PRD §17).
 *
 * Options for each import, most specific first: its own attribute
 * (`delimiter`, `conflict`, `load`, `errors`), the document's
 * <html-import-settings>, the instance's createHTMLModules() options, the
 * built-in defaults. `base` is document-level only.
 *
 * Events: `load` (detail: { module, elements, bindings, tags }) and `error`
 * (detail: { error }) on <html-import>; `load` / `error` on each
 * <html-binding>, where `error` bubbles through its import; `error` on a
 * misplaced, duplicate or invalid settings element.
 */
import { applyBinding, bindModule, unadoptStylesheet } from './runtime.js';
import { bindingPlacementProblem, bindingRecord, lazyImportProblem } from './record.js';
import { assertNamespace } from './names.js';
import { readImportOptions, readImportSettings, resolveImportOptions, reportLoudly } from './settings.js';
import { lazyTargets, watchLazy } from './lazy.js';

const BIND = Symbol('html-modules.bind');
const adoptions = new WeakMap(); // <html-binding> → a function that undoes its stylesheet adoption
const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

function domReady(doc) {
  if (!doc || doc.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}

const attrsOf = (el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));

/** True when `a` comes before `b` in tree order (including when `a` contains `b`). */
const precedes = (a, b) => a !== b && Boolean(a.compareDocumentPosition(b) & FOLLOWING);

/**
 * Define the html-modules elements over an HTMLModules instance.
 * @param {{ modules: ReturnType<typeof import('./html-modules.js').createHTMLModules>, window?: any, registry?: CustomElementRegistry }} options
 * @returns {import('./types.js').HTMLModuleElements}
 */
export function defineHTMLModuleElements({ modules, window: win = globalThis, registry } = {}) {
  if (!modules) throw new TypeError('defineHTMLModuleElements: pass { modules } (from createHTMLModules())');
  const reg = () => registry ?? win.customElements;
  const reported = new WeakSet();
  const instance = modules.options ?? { delimiter: modules.delimiter };

  // -------------------------------------------------------------------------
  // Document settings. Each document's <html-import-settings> is read once,
  // when its first <html-import> starts; from then on the document is
  // "started" and a settings element that arrives is late.

  /** @type {WeakMap<Document, { started: boolean, el: Element|null, values: object, base?: string, error: Error|null }>} */
  const documents = new WeakMap();

  const documentURL = (doc) => (doc?.URL && doc.URL !== 'about:blank' ? doc.URL : modules.loader?.baseURL);
  // The page's base URL (honoring <base href>), unless the document has none (about:blank): then the loader's.
  const documentBase = (doc) => (doc?.baseURI && doc.baseURI !== 'about:blank' ? doc.baseURI : undefined);

  /** Why this settings element is not the document's settings, or null. */
  function placementProblem(el, doc) {
    const first = doc.querySelector('html-import-settings');
    if (first && first !== el && precedes(first, el)) {
      return 'More than one <html-import-settings> in this document: a document has at most one, so this one is ignored';
    }
    const imp = doc.querySelector('html-import');
    if (imp && precedes(imp, el)) {
      return '<html-import-settings> must come before any <html-import> in its document; this one comes after one, so it is ignored (it cannot change imports that have started)';
    }
    return null;
  }

  function documentSettings(doc) {
    let state = documents.get(doc);
    if (state) return state;
    state = { started: false, el: null, values: {}, error: null };
    const el = doc?.querySelector?.('html-import-settings');
    if (el && !placementProblem(el, doc)) {
      state.el = el;
      try {
        state.values = readImportSettings(attrsOf(el));
        if (state.values.base !== undefined) {
          try {
            state.base = new URL(state.values.base, documentURL(doc)).href;
          } catch {
            throw new SyntaxError(`Invalid base "${state.values.base}" on <html-import-settings>: it does not resolve to a URL against ${documentURL(doc)}`);
          }
        }
      } catch (error) {
        state.error = error;
      }
    }
    if (doc) documents.set(doc, state);
    return state;
  }

  /** The `errors` mode that applies to an element whose own options may not have resolved. */
  function errorsMode(el, doc) {
    const own = el.getAttribute('errors');
    if (own === 'throw' || own === 'event') return own;
    const v = doc ? documentSettings(doc).values.errors : undefined;
    return v ?? instance.errors ?? 'event';
  }

  function fail(el, error, mode) {
    // Asynchronously, so that listeners added right after insertion hear it.
    queueMicrotask(() => {
      el.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error } }));
      if (mode === 'throw') reportLoudly(error, win);
    });
  }

  class HTMLImportSettings extends win.HTMLElement {
    #error = null;

    /** The error that makes this element ignored or its document's imports fail, or null. */
    get error() {
      return this.#error;
    }

    /** True when this is the document's settings element and its attributes are valid. */
    get active() {
      const state = this.ownerDocument && documents.get(this.ownerDocument);
      if (state) return state.el === this && !state.error;
      return !this.#error && this.isConnected;
    }

    /** The options this element sets (only those written), once valid. */
    get values() {
      try {
        return readImportSettings(attrsOf(this));
      } catch {
        return {};
      }
    }

    connectedCallback() {
      const doc = this.ownerDocument;
      const state = documents.get(doc);
      if (state && !state.started) documents.delete(doc); // read before any import started: read again
      let error = null;
      if (state?.el === this) error = state.error;
      else if (state?.started) {
        error = new SyntaxError('<html-import-settings> must come before any <html-import> in its document: it arrived after imports had started, so it is ignored');
      } else {
        const problem = placementProblem(this, doc);
        if (problem) error = new SyntaxError(problem);
        else {
          try {
            readImportSettings(attrsOf(this));
          } catch (e) {
            error = e;
          }
        }
      }
      this.#error = error;
      if (error) fail(this, error, errorsMode(this, null));
    }
  }

  class HTMLModuleSettings extends win.HTMLElement {
    #error = null;

    get error() {
      return this.#error;
    }

    connectedCallback() {
      // Parsed module documents (DOMParser) never upgrade elements, so this
      // only runs for a settings element in a page, where it would do nothing.
      this.#error = new SyntaxError('<html-module-settings> only applies inside an HTML module (a file loaded with <html-import>); in a page it has no exports to configure. For this page\'s imports, use <html-import-settings>');
      fail(this, this.#error, instance.errors === 'throw' ? 'throw' : 'event');
    }
  }

  // -------------------------------------------------------------------------

  class HTMLImport extends win.HTMLElement {
    #module = null;
    #ready = null;
    #resolve = null;
    #reject = null;
    #phase = 'idle'; // idle | waiting | loading | loaded | error
    #sanitize; // the sanitizer function set on this element (undefined: the instance's)
    #started = false; // configured, and loading begun (or failed or, if lazy, watching)
    #scheduled = false; // a start is queued for after the current script
    #missingSrc = false; // failed only because it had no src; setting one starts it again
    #startedSignal = null;
    #config = null;
    #watcher = null;
    #state = null; // set once the module is loaded and the document parsed
    #applied = new WeakSet();
    #elements = {};
    #bindings = {};
    #tags = {};

    static get observedAttributes() {
      return ['src'];
    }

    /** Promise of the module namespace (loads an eager import if needed; waits for a lazy one). */
    get module() {
      this.#schedule();
      return this.#startedSignal.promise.then(() => (
        this.#phase === 'loading' || this.#phase === 'loaded' ? this.#loadModule() : this.#ready.then((detail) => detail.module)
      ));
    }

    /** Promise that settles once the module is bound: { module, elements, bindings, tags }. */
    get ready() {
      this.#schedule();
      return this.#ready;
    }

    /** Load now, even if this import is lazy and none of its tags has been used. Returns `ready`. */
    load() {
      this.#start();
      return this.#begin();
    }

    // Reflected attributes. The options read the value in effect (as `settings` does) and write the attribute;
    // `loadMode` is the `load` attribute (`load` itself is the method above).
    get src() {
      return this.getAttribute('src') ?? '';
    }

    set src(value) {
      this.setAttribute('src', value);
    }

    get as() {
      return this.getAttribute('as') ?? '';
    }

    set as(value) {
      this.setAttribute('as', value);
    }

    get type() {
      return this.getAttribute('type') ?? '';
    }

    set type(value) {
      this.setAttribute('type', value);
    }

    get integrity() {
      return this.getAttribute('integrity') ?? '';
    }

    set integrity(value) {
      this.setAttribute('integrity', value);
    }

    get conflict() {
      return this.settings.conflict;
    }

    set conflict(value) {
      this.#write('conflict', value);
    }

    get loadMode() {
      return this.settings.load;
    }

    set loadMode(value) {
      this.#write('load', value);
    }

    get errors() {
      return this.settings.errors;
    }

    set errors(value) {
      this.#write('errors', value);
    }

    #write(name, value) {
      if (value == null) this.removeAttribute(name);
      else this.setAttribute(name, value);
    }

    /** "idle" | "waiting" (lazy, watching for its tags) | "loading" | "loaded" | "error" */
    get state() {
      return this.#phase;
    }

    /** Registered tags → classes, so far. */
    get elements() {
      return { ...this.#elements };
    }

    /** Bound export names → values (components, stylesheets, data), so far. */
    get bindings() {
      return { ...this.#bindings };
    }

    /** Registered tags → `{ tag, namespace, export, reused? }`: what each tag was made from, so far. */
    get tags() {
      return Object.fromEntries(Object.entries(this.#tags).map(([k, v]) => [k, { ...v }]));
    }

    /** The options this import uses: `{ delimiter, conflict, load, errors, base }` (see the precedence above). */
    get settings() {
      if (this.#config) return { ...this.#config };
      const doc = this.ownerDocument;
      const state = doc ? documentSettings(doc) : { values: {} };
      let own = {};
      try {
        own = readImportOptions(attrsOf(this));
      } catch {}
      return { ...resolveImportOptions(own, state.values, instance), base: state.base ?? modules.base ?? documentBase(doc) };
    }

    /**
     * A function that sanitizes the component templates of this import's module (and of the HTML modules it
     * imports), over the instance's (`false`: none). It cannot be an attribute, so set it before the import starts:
     * on an element made with `document.createElement()` before it is inserted, or by a script that runs before this
     * element is upgraded. Setting it after loading started is an `error` event.
     * @type {Function | false | undefined}
     */
    get sanitize() {
      return this.#sanitize;
    }

    set sanitize(value) {
      if (value !== undefined && value !== false && typeof value !== 'function') {
        throw new TypeError('Invalid sanitize on <html-import>: pass a function (html, { def, url, window }) => string | DocumentFragment | TrustedHTML, or false for none');
      }
      if (this.#started && value !== this.#sanitize) {
        fail(this, new Error('<html-import sanitize> was set after loading started: a sanitizer is read when the module is requested; set it before the element is inserted, or sanitize with HTMLModules.import()'), this.#config?.errors ?? errorsMode(this, this.ownerDocument));
        return;
      }
      this.#sanitize = value;
    }

    /** The namespace delimiter this import uses. */
    get delimiter() {
      return this.settings.delimiter;
    }

    set delimiter(value) {
      this.#write('delimiter', value);
    }

    connectedCallback() {
      this.#schedule();
    }

    attributeChangedCallback(name, before, after) {
      if (name !== 'src' || before === after) return;
      if (this.#missingSrc && after) {
        // It failed only for want of a src: start over now that it has one.
        this.#missingSrc = false;
        this.#started = false;
        this.#ready = null;
        this.#config = null;
        this.#module = null;
        this.#phase = 'idle';
        this.#schedule();
      } else if (!this.#started) {
        if (this.isConnected) this.#schedule();
      } else if (this.#phase !== 'waiting') {
        const error = new Error(`<html-import src> was changed from "${before ?? ''}" to "${after ?? ''}" after loading started: an import's src is read once and the module is not reloaded; create a new <html-import> to import another module`);
        fail(this, error, this.#config?.errors ?? errorsMode(this, this.ownerDocument));
      }
    }

    /** Start after the current script, so attributes and children set right after insertion are seen. */
    #schedule() {
      this.#ensureReady();
      if (this.#scheduled || (this.#started && this.#phase !== 'idle')) return; // (idle after starting: a lazy import to resume)
      this.#scheduled = true;
      queueMicrotask(() => {
        this.#scheduled = false;
        this.#start();
      });
    }

    #ensureReady() {
      if (this.#ready) return;
      this.#ready = new Promise((resolve, reject) => {
        this.#resolve = resolve;
        this.#reject = reject;
      });
      this.#ready.catch((error) => {
        if (reported.has(error)) return; // already announced by its <html-binding>
        this.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error } }));
        if ((this.#config?.errors ?? errorsMode(this, this.ownerDocument)) === 'throw') reportLoudly(error, win);
      });
      if (!this.#startedSignal || this.#startedSignal.done) {
        let done;
        const promise = new Promise((resolve) => (done = resolve));
        this.#startedSignal = { promise, done: false, resolve: () => { this.#startedSignal.done = true; done(); } };
      }
    }

    disconnectedCallback() {
      // A lazy import that has not started loading stops watching.
      if (this.#phase === 'waiting') {
        this.#watcher?.cancel();
        this.#watcher = null;
        this.#phase = 'idle';
      }
    }

    #configure() {
      if (this.#config) return this.#config;
      const doc = this.ownerDocument;
      const state = documentSettings(doc);
      state.started = true;
      if (state.error) throw state.error;
      const own = readImportOptions(attrsOf(this));
      this.#config = { ...resolveImportOptions(own, state.values, instance), base: state.base ?? modules.base ?? documentBase(doc) };
      return this.#config;
    }

    #loadModule() {
      this.#module ??= (async () => {
        const src = this.getAttribute('src');
        if (!src) throw new SyntaxError('<html-import> requires a "src" attribute');
        return modules.load(src, { base: this.#config.base, type: this.getAttribute('type') || undefined, integrity: this.getAttribute('integrity') || undefined, sanitize: this.#sanitize });
      })();
      return this.#module;
    }

    #start() {
      this.#ensureReady();
      if (!this.#started) {
        this.#started = true;
        this.#startedSignal.resolve();
        let config;
        try {
          config = this.#configure();
        } catch (error) {
          this.#phase = 'error';
          this.#reject(error);
          return;
        }
        if (!this.getAttribute('src')) {
          this.#phase = 'error';
          this.#missingSrc = true;
          this.#reject(new SyntaxError('<html-import> requires a "src" attribute'));
          return;
        }
        if (config.load !== 'lazy') {
          this.#begin();
          return;
        }
      }
      if (this.#phase === 'idle' && this.#config?.load === 'lazy' && this.isConnected) {
        this.#phase = 'waiting';
        domReady(this.ownerDocument).then(() => this.#watch());
      }
    }

    /** Lazy: watch for the tags this import would register. */
    #watch() {
      if (this.#phase !== 'waiting' || this.#watcher || !this.isConnected) return;
      const as = this.getAttribute('as') || undefined;
      try {
        if (as) assertNamespace(as);
      } catch (error) {
        this.#phase = 'error';
        this.#reject(error);
        return;
      }
      const bindings = [];
      for (const c of this.children) {
        if (c.localName !== 'html-binding') continue;
        try {
          bindings.push(bindingRecord(attrsOf(c)));
        } catch (error) {
          // A lazy import never applies its bindings until it loads, so this one is reported now.
          this.#phase = 'error';
          this.#reject(error);
          return;
        }
      }
      const problem = lazyImportProblem({ src: this.getAttribute('src'), as, bindings });
      if (problem) {
        this.#phase = 'error';
        this.#reject(new SyntaxError(problem));
        return;
      }
      this.#watcher = watchLazy(win, lazyTargets({ as, delimiter: this.#config.delimiter, bindings }), () => this.#begin());
    }

    #begin() {
      if (this.#phase === 'loading' || this.#phase === 'loaded' || this.#phase === 'error') return this.#ready;
      this.#watcher?.cancel();
      this.#watcher = null;
      this.#phase = 'loading';
      (async () => {
        const doc = this.ownerDocument;
        // Load while the rest of the document parses; decide what to bind once
        // this element's children exist.
        const [module] = await Promise.all([this.#loadModule(), domReady(doc)]);
        const as = this.getAttribute('as') || undefined;
        if (as) assertNamespace(as);
        const { delimiter, conflict } = this.#config;
        this.#state = { module, as, delimiter, conflict, from: this.getAttribute('src'), root: this.getRootNode?.() ?? doc };
        const children = [...this.children].filter((c) => c.localName === 'html-binding');
        let firstError = null;
        if (children.length) {
          for (const child of children) {
            const error = this.#apply(child);
            firstError ??= error;
          }
        } else if (as) {
          const bound = bindModule(module, { as, delimiter, conflict, from: this.#state.from, registry: reg(), window: win });
          Object.assign(this.#elements, bound.elements);
          Object.assign(this.#tags, bound.tags);
        }
        if (firstError) throw firstError;
        const detail = { module, elements: this.elements, bindings: this.bindings, tags: this.tags };
        this.dispatchEvent(new win.CustomEvent('load', { detail }));
        return detail;
      })().then(
        (detail) => {
          this.#phase = 'loaded';
          this.#resolve(detail);
        },
        (error) => {
          this.#phase = 'error';
          this.#reject(error);
        },
      );
      return this.#ready;
    }

    /** Called by a child <html-binding> when it connects. */
    [BIND](binding) {
      if (this.#state) this.#apply(binding); // otherwise the initial pass picks it up
      else if (this.#phase === 'waiting' && this.#watcher) {
        // Lazy and still waiting: watch for this binding's tag too.
        this.#watcher.cancel();
        this.#watcher = null;
        this.#watch();
      } else this.#start();
    }

    #apply(el) {
      if (this.#applied.has(el)) return null;
      this.#applied.add(el);
      const { module, as, delimiter, conflict, from, root } = this.#state;
      try {
        const result = applyBinding(module, bindingRecord(attrsOf(el)), {
          as, delimiter, conflict, from, registry: reg(), window: win, root,
        });
        this.#bindings[result.export] = result.value;
        if (result.tag) {
          this.#elements[result.tag] = result.element;
          this.#tags[result.tag] = { tag: result.tag, namespace: result.namespace, export: result.export, ...(result.reused && { reused: true }) };
        }
        if (result.adopted) {
          adoptions.set(el, () => {
            unadoptStylesheet(root, result.value, { window: win });
            this.#applied.delete(el); // reconnecting applies it again
          });
        }
        el.dispatchEvent(new win.CustomEvent('load', { detail: result }));
        return null;
      } catch (error) {
        reported.add(error);
        el.dispatchEvent(new win.CustomEvent('error', { bubbles: true, composed: true, detail: { error, binding: el } }));
        if (this.#config?.errors === 'throw') reportLoudly(error, win);
        return error;
      }
    }
  }

  class HTMLBinding extends win.HTMLElement {
    disconnectedCallback() {
      // An `adopt` binding that is removed gives its stylesheet back (registered tags stay: elements cannot be undefined).
      const undo = adoptions.get(this);
      if (undo) {
        adoptions.delete(this);
        undo();
      }
    }

    connectedCallback() {
      const parent = this.parentElement;
      if (parent?.localName === 'html-import') {
        if (typeof parent[BIND] === 'function') parent[BIND](this);
        return;
      }
      // Usually a self-closed `<html-binding … />` that swallowed the next binding: it would be silently dropped.
      const problem = bindingPlacementProblem(attrsOf(this), parent && { tag: parent.localName, attrs: attrsOf(parent) });
      fail(this, new SyntaxError(problem), errorsMode(this, this.ownerDocument));
    }
  }

  /** Inert: exports are read from module documents, never executed in place. */
  class HTMLExport extends win.HTMLElement {}

  // Settings first: when the elements are defined after the page has parsed,
  // upgrades run per definition, and the settings must be seen before imports start.
  const r = win.customElements;
  if (!r.get('html-import-settings')) r.define('html-import-settings', HTMLImportSettings);
  if (!r.get('html-module-settings')) r.define('html-module-settings', HTMLModuleSettings);
  if (!r.get('html-import')) r.define('html-import', HTMLImport);
  if (!r.get('html-binding')) r.define('html-binding', HTMLBinding);
  if (!r.get('html-export')) r.define('html-export', HTMLExport);
  return {
    HTMLImport: r.get('html-import'),
    HTMLBinding: r.get('html-binding'),
    HTMLExport: r.get('html-export'),
    HTMLImportSettings: r.get('html-import-settings'),
    HTMLModuleSettings: r.get('html-module-settings'),
  };
}

