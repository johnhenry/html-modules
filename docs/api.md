# API reference

The complete reference for `@johnhenry/html-modules`, checked against the source (`src/`) and the tests (`test/`).
The [README](../README.md) is the guided tour; this is the lookup table. It is split into pages:

| Page | Covers |
| --- | --- |
| [HTML syntax](api/html-syntax.md) | Every element and attribute an HTML module or a page can write: `<html-export>`, `<html-import>`, `<html-binding>`, `<html-import-settings>`, `<html-module-settings>`. Placement rules, option precedence, and what each validation error says. |
| [Elements (DOM API)](api/elements.md) | The properties, methods, states and events of the elements once `@johnhenry/html-modules/browser` has defined them: `.module`, `.ready`, `.load()`, `.state`, `.elements`, `.bindings`, `.tags`, `.settings`, `.delimiter`, and the `load` / `error` event detail shapes. |
| [JavaScript API: `HTMLModules`](api/javascript.md) | `createHTMLModules()` and its options, the instance (`load`, `import`, `bind`, `resolve`, `cache`, `options`, `base`, `delimiter`, `loader`), the lazy-loading handle, `defineHTMLModuleElements()`, and the lower-level loader (`createLoader`, `linkHTMLModule`, `createNamespace`) and lazy-loading primitives (`lazyTargets`, `watchLazy`, `componentRoot`). |
| [Runtime: definitions and binding](api/runtime.md) | `HTMLComponent` / `defineHTMLComponent`, `HTMLStylesheet` / `defineHTMLStylesheet`, registration (`defineElement`, `toComponent`), binding (`bindModule`, `applyBinding`, `registerComponents`), and the helpers compiled output uses (`manifest`, `namespaceComponents`, `lookupExport`, `componentsOf`, `adoptStylesheet`, the `is*` predicates). |
| [Module records and settings](api/records.md) | The module record JSON shape, `readHTMLModule` / `scanHTMLModule` / `recordFromRaw` / `moduleImportOptions`, and the settings vocabulary (`IMPORT_DEFAULTS`, `EXPORT_DEFAULTS`, `readImportSettings`, `readModuleSettings`, `readImportOptions`, `resolveImportOptions`). |
| [Names](api/names.md) | `DELIMITER`, `bindingName`, `parseBindingName`, `isValidDelimiter`, `isValidElementName`, `elementNameProblem`, `isKebabName`, `camelCase`, `kebabCase`: the naming rules for exports, namespaces, delimiters and tags. |
| [Compiler and CLI](api/compiler.md) | `compileHTMLModule`, `compileRecord`, `rewriteSpecifier`, `rebaseSpecifier`, the `html-module` CLI and its flags, and the `esm` and `register` output formats with a full generated example. |
| [Errors](api/errors.md) | Every error the library raises: its type, its message, and where it is reported (thrown, a rejection, or an `error` event on which element). |

## Entry points

The package is plain ES modules with no runtime dependencies. `package.json` `exports`:

| Specifier | File | What it is |
| --- | --- | --- |
| `@johnhenry/html-modules` | `src/index.js` | Everything below except the browser bootstrap. **Side-effect free**: importing it defines no elements and registers nothing. |
| `@johnhenry/html-modules/browser` | `src/browser.js` | The one-script bootstrap. **Has side effects**: creates the shared instance `HTMLModules` (bare specifiers resolved with `import.meta.resolve`, so through the page's import map), defines the five elements on `customElements`, and sets `globalThis.HTMLModules` if it is not already set. Exports `HTMLModules`, `HTMLImport`, `HTMLBinding`, `HTMLExport`, `HTMLImportSettings`, `HTMLModuleSettings`. |
| `@johnhenry/html-modules/runtime` | `src/runtime.js` | Only the runtime: what compiled modules import. Exports `HTMLComponent`, `HTMLStylesheet`, `defineHTMLComponent`, `defineHTMLStylesheet`, `isHTMLComponent`, `isHTMLStylesheet`, `isStylesheet`, `isElementLike`, `toComponent`, `defineElement`, `adoptStylesheet`, `lookupExport`, `componentsOf`, `applyBinding`, `bindModule`, `registerComponents`, `manifest`, `namespaceComponents`, `configureRuntime`, `renderDeclarative`. |
| `@johnhenry/html-modules/compiler` | `src/compiler.js` | `compileHTMLModule`, `compileRecord`, `rewriteSpecifier`, `rebaseSpecifier`. Runs anywhere (Node, a dev server, a browser): no DOM needed. |
| `@johnhenry/html-modules/package.json` | `package.json` | For tools that read the version. |

The bin is `html-module` (`bin/html-module.js`); see [Compiler and CLI](api/compiler.md#the-html-module-cli).

The root entry point exports exactly these 51 names (`npm run check` prints the count):

```
DELIMITER EXPORT_DEFAULTS HTMLComponent HTMLStylesheet IMPORT_DEFAULTS adoptStylesheet applyBinding bindModule
bindingName camelCase compileHTMLModule compileRecord componentRoot componentsOf configureRuntime createHTMLModules createLoader
createNamespace defineElement defineHTMLComponent defineHTMLModuleElements defineHTMLStylesheet elementNameProblem
isElementLike isHTMLComponent isHTMLStylesheet isKebabName isStylesheet isValidDelimiter isValidElementName
kebabCase lazyTargets linkHTMLModule lookupExport manifest moduleImportOptions namespaceComponents parseBindingName
readHTMLModule readImportOptions readImportSettings readModuleSettings rebaseSpecifier recordFromRaw
registerComponents renderDeclarative resolveImportOptions rewriteSpecifier scanHTMLModule toComponent watchLazy
```

Everything else in `src/` (for example `assertDelimiter`, `bindingRecord`, `scanRawElements`, `reportLoudly`,
`componentRootCreated`) is internal: not exported from any entry point, and not reachable through `exports`.

## Conventions used in this reference

- **Kebab name**: lower-case ASCII words of letters and digits, each starting with a letter, joined by single
  hyphens: `card`, `fancy-button`, `v2-card`. Export names and namespaces are kebab names.
- **Tag**: a custom element name, `<namespace><delimiter><export>` for a namespace import (`ui--card`).
- **Namespace** (the module namespace object): what `HTMLModules.load()` resolves to, and what a compiled module's
  `import * as` gives: camelCase named exports, `components`, and `default` when there is one.
- **Definition**: an `HTMLComponent`, the module-local identity and rendering of a component; registered under any
  number of tags.
- Defaults are written `= value` in signatures. "Throws" means synchronously; "rejects" means the returned promise.
