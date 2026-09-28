// A tiny store. Exported through data.html as a module-script export.
const ORDER = ['todo', 'doing', 'done'];

export function createStore(seed, { key = 'wmg-task-board' } = {}) {
  let tasks = load() ?? structuredClone(seed.tasks);
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(tasks));
    } catch {}
  }
  function commit(next) {
    tasks = next;
    save();
    for (const l of listeners) l(tasks);
  }

  return {
    get tasks() {
      return tasks;
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(tasks);
      return () => listeners.delete(fn);
    },
    add(title, tag = 'general') {
      commit([...tasks, { id: `t${Date.now().toString(36)}`, title, tag, status: 'todo' }]);
    },
    move(id, dir) {
      commit(tasks.map((t) => {
        if (t.id !== id) return t;
        const i = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(t.status) + dir));
        return { ...t, status: ORDER[i] };
      }));
    },
    remove(id) {
      commit(tasks.filter((t) => t.id !== id));
    },
    reset() {
      commit(structuredClone(seed.tasks));
    },
  };
}
