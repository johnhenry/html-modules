/**
 * ModuleScope: the local bindings created by declarative HTML imports,
 * analogous to the top-level bindings of a JS module.
 */
export class ModuleScope {
  #bindings = new Map();
  #waiters = new Map();

  /**
   * Declare a local binding. Re-declaring the same name to a different value
   * is an error, mirroring ESM's duplicate-declaration rule.
   * @param {string} name
   * @param {unknown} value
   * @param {string} [source]
   */
  declare(name, value, source) {
    if (this.#bindings.has(name)) {
      const prev = this.#bindings.get(name);
      if (prev.value === value) return;
      throw new SyntaxError(`Identifier '${name}' has already been declared (from ${prev.source ?? 'unknown'})`);
    }
    this.#bindings.set(name, { value, source });
    for (const resolve of this.#waiters.get(name) ?? []) resolve(value);
    this.#waiters.delete(name);
  }

  has(name) {
    return this.#bindings.has(name);
  }

  get(name) {
    return this.#bindings.get(name)?.value;
  }

  /** Resolves when `name` is declared. */
  whenDeclared(name) {
    if (this.#bindings.has(name)) return Promise.resolve(this.get(name));
    return new Promise((resolve) => {
      const list = this.#waiters.get(name) ?? [];
      list.push(resolve);
      this.#waiters.set(name, list);
    });
  }

  names() {
    return [...this.#bindings.keys()];
  }
}

const scopes = new WeakMap();

/** The shared scope for a document (or any object key). */
export function scopeFor(doc) {
  if (!scopes.has(doc)) scopes.set(doc, new ModuleScope());
  return scopes.get(doc);
}
