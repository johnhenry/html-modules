/**
 * One-script bootstrap for browsers:
 *   <script type="module" src=".../web-module-graph/src/browser.js"></script>
 * Bare specifiers resolve through the page's import map (import.meta.resolve).
 * For CDN routing, call defineModuleElements({ loader: createLoader({ router: mportRouter() }) })
 * yourself instead of importing this file.
 */
import { createLoader } from './loader.js';
import { defineModuleElements } from './elements.js';

export const loader = createLoader({
  hostResolve: (specifier) => import.meta.resolve(specifier),
});
export const { scope, ModuleImport, ModuleBinding, DefineElement } = defineModuleElements({ loader });
