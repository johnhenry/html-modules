# Elements (DOM API)

[API reference](../api.md) › Elements

Importing `@johnhenry/html-modules/browser` (or calling [`defineHTMLModuleElements()`](javascript.md#definehtmlmoduleelements))
defines five custom elements. Their classes are exported from `/browser` as `HTMLImport`, `HTMLBinding`,
`HTMLExport`, `HTMLImportSettings` and `HTMLModuleSettings`. Attribute syntax is on the [HTML syntax](html-syntax.md)
page; this page is what script sees.

- [`HTMLImport` (`<html-import>`)](#htmlimport-html-import)
- [`HTMLBinding` (`<html-binding>`)](#htmlbinding-html-binding)
- [`HTMLImportSettings` (`<html-import-settings>`)](#htmlimportsettings-html-import-settings)
- [`HTMLModuleSettings` (`<html-module-settings>`)](#htmlmodulesettings-html-module-settings)
- [`HTMLExport` (`<html-export>`)](#htmlexport-html-export)
- [Events](#events)
- [Lifecycle](#lifecycle)

## `HTMLImport` (`<html-import>`)

| Member | Type | Description |
| --- | --- | --- |
| `ready` | `Promise<{ module, elements, bindings, tags }>` | Settles once the module is loaded **and** bound. Resolves with the same object as the `load` event's `detail`. Rejects with the first failure: an invalid option or settings, a failed load, an invalid namespace, or the first failing `<html-binding>` (the other bindings are still applied). Reading it starts the import if it has not started. |
| `module` | `Promise<namespace>` | The module namespace. For an eager or already-loading import, resolves as soon as the module has loaded (before binding). For a lazy import that is still waiting, it **waits** for the load rather than triggering it. Rejects like `ready` for configuration errors. |
| `load()` | `() => Promise` (returns `ready`) | Load now, even a lazy import none of whose tags has been used, or one with nothing to wait for. A no-op if loading has started, finished or failed. |
| `state` | `"idle"` \| `"waiting"` \| `"loading"` \| `"loaded"` \| `"error"` | `idle`: not started, or a lazy import that is disconnected; `waiting`: lazy and watching for its tags; `loading`: fetching or binding; `loaded`: bound; `error`: failed. |
| `elements` | `Record<tag, CustomElementConstructor>` | Tags this import has registered so far, mapped to their registered classes. A copy on every read. |
| `bindings` | `Record<exportName, unknown>` | Export name → value for every applied `<html-binding>` (definitions, stylesheets, data). Empty for a plain namespace import. A copy. |
| `tags` | `Record<tag, { tag, namespace, export, reused? }>` | What each registered tag was made from: `namespace` is the import's `as`, or `null` when `element=` chose the tag; `export` is the export name; `reused: true` when `conflict="reuse"` kept a different, existing definition. The runtime never parses tags; this is how a tag maps back to its export (with `delimiter="-"`, `ui-custom-card` cannot be split reliably). A deep-enough copy. |
| `settings` | `{ delimiter, conflict, load, errors, base }` | The options this import uses, after [precedence](html-syntax.md#precedence-of-import-options). `base` is the absolute base URL for its `src` (the document's `<html-import-settings base>`, else the instance `base`, else `document.baseURI`). Before the import starts this is a preview (invalid attributes are skipped rather than thrown); once started, the resolved configuration. |
| `delimiter` | `string` | `settings.delimiter`. |

```js
const imp = document.querySelector('html-import[as="ui"]');
imp.state;                                   // "loading"
const { module, elements, bindings, tags } = await imp.ready;
Object.keys(elements);                       // ["ui--card", "ui--button", …]
tags['ui--card'];                            // { tag: "ui--card", namespace: "ui", export: "card" }
imp.settings;                                // { delimiter: "--", conflict: "error", load: "eager", errors: "event", base: "https://…/" }
```

Note the name difference with the JavaScript API: the element's result has **`bindings`**, while
`HTMLModules.import()` and `bind()` return **`values`** for the same export → value map.

## `HTMLBinding` (`<html-binding>`)

No properties or methods of its own. When it connects as a direct child of an `<html-import>`, it asks its import to
apply it: immediately if the module is already bound, in the initial pass otherwise, and, for a lazy import that is
still waiting, by adding its tag to what the import waits for. It fires its own `load` / `error` events.

## `HTMLImportSettings` (`<html-import-settings>`)

| Member | Type | Description |
| --- | --- | --- |
| `error` | `Error \| null` | Why this element is ignored, or why its document's imports fail: misplaced, a duplicate, or invalid. `null` when it is fine. |
| `active` | `boolean` | True when this is the document's settings element and its attributes are valid. |
| `values` | `{ delimiter?, base?, conflict?, load?, errors? }` | The options it sets (only those written), or `{}` when its attributes are invalid. `base` is as written, not resolved. |

## `HTMLModuleSettings` (`<html-module-settings>`)

| Member | Type | Description |
| --- | --- | --- |
| `error` | `SyntaxError` | Always set once connected in a page: `<html-module-settings> only applies inside an HTML module …`. (Inside a module it is read from the module's source and never upgraded.) |

## `HTMLExport` (`<html-export>`)

Inert. Exports are read from a module's source when it is loaded (`readHTMLModule`), never executed in place; an
`<html-export>` in a page does nothing.

## Events

All events are `CustomEvent`s dispatched on the element named.

| Event | Target | Bubbles / composed | `detail` | When |
| --- | --- | --- | --- | --- |
| `load` | `<html-import>` | no / no | `{ module, elements, bindings, tags }` (the `ready` value) | the module is loaded and every binding applied; not fired when a binding failed |
| `error` | `<html-import>` | yes / yes | `{ error }` | the import failed: bad options or settings, fetch or parse failure, invalid namespace, a failing namespace registration. Not fired again for a binding's failure, which already bubbled through the import from the `<html-binding>`. |
| `load` | `<html-binding>` | no / no | `{ export, value, tag, namespace, element, adopted, reused? }`: the [`applyBinding()`](runtime.md#applybinding) result (`tag`, `namespace` and `element` are `null` when nothing was registered; `adopted` is `true` when a stylesheet was adopted) | the binding was applied |
| `error` | `<html-binding>` | yes / yes | `{ error, binding }` (`binding` is the element) | the binding failed; it bubbles through its `<html-import>` |
| `error` | `<html-import-settings>` | yes / yes | `{ error }` | misplaced, a second one, arrived after imports started, or invalid |
| `error` | `<html-module-settings>` | yes / yes | `{ error }` | connected in a page |
| `error` | the element that used a tag | yes / yes | `{ error, from, lazy: true }` (`from` is the dependency's `src` as written) | a **module's own lazy import** failed to load or bind after one of its tags appeared (usually inside a component's shadow root) |

Error events are dispatched in a microtask, so a listener added right after inserting the element hears them. With
`errors: 'throw'` (the import's resolved option; for settings elements, their own `errors` attribute, else the
instance option; for `<html-module-settings>`, the instance option), each failure is also passed to
`reportError()`, or thrown from a timer where `reportError` is missing.

```js
document.addEventListener('error', (e) => {
  if (e.target.localName?.startsWith('html-')) console.warn(e.target, e.detail.error);
}, true);
```

## Lifecycle

1. **Connect.** The import resolves its options (reading the document's settings the first time any import of
   that document starts; from then on the document is "started"). An invalid configuration rejects `ready`
   (state `error`).
2. **Eager:** loading starts at once, in parallel with the rest of the document parsing. **Lazy:** state becomes
   `waiting` and, after `DOMContentLoaded`, the import watches for its tags ([what it waits for](javascript.md#lazy-loading)).
3. **Bind.** After the module has loaded *and* the document has finished parsing (so all `<html-binding>`
   children exist), the import reads `as` and binds: its bindings, or the whole namespace. Elements already in the
   page upgrade natively when their tag is defined; elements written later upgrade on insertion.
4. **Later bindings** are applied as they connect.
5. **Disconnect.** A lazy import that is still waiting stops watching and returns to `idle`; reconnecting resumes
   it. An import that has started loading carries on; registered tags stay registered (custom element definitions
   are permanent).
