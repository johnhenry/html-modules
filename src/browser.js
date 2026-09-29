/**
 * One-script bootstrap for browsers:
 *   <script type="module" src=".../html-modules/src/browser.js"></script>
 * Bare specifiers resolve through the page's import map (import.meta.resolve).
 */
import { createLoader } from './loader.js';
import { defineModuleElements } from './elements.js';

export const loader = createLoader({
  hostResolve: (specifier) => import.meta.resolve(specifier),
});
export const { scope, ModuleImport, ModuleBinding, DefineElement } = defineModuleElements({ loader });
