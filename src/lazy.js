/**
 * Lazy loading: fetch a module only when one of its tags is used.
 *
 * A lazy import watches for elements whose tag it would register:
 *   - a namespace import (`as`, no bindings): any tag starting with `<as><delimiter>`
 *     (the export names are not known before loading, so the prefix is matched);
 *   - `<html-binding>` children: exactly the tags they bind (`element=`, or
 *     `<as><delimiter><export>`).
 *
 * Where it looks, for each window: the document (one MutationObserver,
 * `childList` + `subtree`, plus a scan of what is already there), and every
 * shadow root created by an html-modules component (open or closed), which the
 * runtime reports here as it stamps them. Not covered: shadow roots created by
 * other code, elements in other documents (iframes), and template contents
 * (which are inert until cloned into one of the watched trees).
 *
 * The observer runs only while some lazy import is waiting.
 */
import { bindingName } from './names.js';

const componentRoots = new WeakMap(); // host element → the shadow root html-modules gave it
const hubs = new WeakMap(); // window → hub

/** Called by the runtime whenever a component instance's shadow root is ready. */
export function componentRootCreated(host, root, win = globalThis) {
  componentRoots.set(host, root);
  hubs.get(win)?.rootCreated(root);
}

/** The shadow root html-modules created for a component instance (also for closed roots), or null. */
export const componentRoot = (host) => componentRoots.get(host) ?? null;

/**
 * The tags a lazy import waits for: `{ tags: string[], prefixes: string[] }`.
 * Bindings that register no tag (adopt, data, invalid names) add nothing.
 * @param {{ as?: string, delimiter?: string, bindings?: Array<{ export: string, element?: string, adopt?: boolean }> }} spec
 */
export function lazyTargets({ as, delimiter = '--', bindings = [] } = {}) {
  const tags = [];
  const prefixes = [];
  if (bindings.length) {
    for (const b of bindings) {
      if (b.element) tags.push(b.element);
      else if (as && !b.adopt && b.export !== 'default') {
        try {
          tags.push(bindingName(as, b.export, delimiter));
        } catch {} // an invalid tag is reported when the binding is applied
      }
    }
  } else if (as) {
    prefixes.push(`${as}${delimiter}`);
  }
  return { tags, prefixes };
}

function hubFor(win) {
  let hub = hubs.get(win);
  if (hub) return hub;
  if (typeof win.MutationObserver !== 'function') throw new TypeError('load="lazy" needs MutationObserver, which this window does not have');
  const watchers = new Set();
  let observer = null;
  const observe = (target) => observer?.observe(target, { childList: true, subtree: true });

  const check = (el) => {
    const name = el.localName;
    for (const w of [...watchers]) if (w.matches(name) && !w.skip?.(el)) w.fire(el);
  };
  // Check `node` and everything under it, descending into component shadow roots.
  const visit = (node) => {
    if (!watchers.size) return;
    if (node.nodeType === 1) {
      check(node);
      const root = componentRoots.get(node);
      if (root) {
        observe(root);
        visit(root);
      }
    }
    for (const el of node.querySelectorAll?.('*') ?? []) {
      if (!watchers.size) return;
      check(el);
      const root = componentRoots.get(el);
      if (root) {
        observe(root);
        visit(root);
      }
    }
  };

  hub = {
    add(w) {
      watchers.add(w);
      if (!observer) {
        observer = new win.MutationObserver((records) => {
          for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) visit(n);
        });
        observe(win.document);
      }
      visit(win.document);
    },
    remove(w) {
      watchers.delete(w);
      if (!watchers.size && observer) {
        observer.disconnect();
        observer = null;
      }
    },
    rootCreated(root) {
      if (!observer) return;
      observe(root);
      visit(root);
    },
  };
  hubs.set(win, hub);
  return hub;
}

/**
 * Call `fire(element)` once, the first time an element with one of the
 * target tags is present in the window's document or in a component shadow
 * root (now or later). Returns `{ cancel() }`. With no targets nothing is
 * watched, and `fire` is never called.
 * @param {any} win
 * @param {{ tags: string[], prefixes: string[] }} targets
 * @param {(el: Element) => void} fire
 * @param {{ skip?: (el: Element) => boolean }} [options]  `skip` excludes elements that must not fire it (e.g. ones it already failed for)
 */
export function watchLazy(win, { tags = [], prefixes = [] }, fire, { skip } = {}) {
  if (!tags.length && !prefixes.length) return { cancel() {}, active: false };
  const hub = hubFor(win);
  const exact = new Set(tags);
  let done = false;
  const watcher = {
    skip,
    matches: (name) => exact.has(name) || prefixes.some((p) => name.startsWith(p)),
    fire(el) {
      if (done) return;
      done = true;
      hub.remove(watcher);
      fire(el);
    },
  };
  const handle = {
    get active() {
      return !done;
    },
    cancel() {
      if (done) return;
      done = true;
      hub.remove(watcher);
    },
  };
  hub.add(watcher);
  return handle;
}
