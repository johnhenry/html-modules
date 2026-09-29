/**
 * One-script bootstrap for browsers:
 *   <script type="module" src=".../html-modules/src/browser.js"></script>
 * Bare specifiers resolve through the page's import map (import.meta.resolve).
 * For package/CDN routing, import mport v2 yourself and call
 *   defineModuleElements({ loader: createLoader({ router: fromMport(createRouter(routes)) }) })
 * instead of importing this file.
 */
import { createLoader } from './loader.js';
import { defineModuleElements } from './elements.js';

export const loader = createLoader({
  hostResolve: (specifier) => import.meta.resolve(specifier),
});
export const { scope, ModuleImport, ModuleBinding, DefineElement } = defineModuleElements({ loader });
