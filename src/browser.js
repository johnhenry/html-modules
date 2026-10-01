// @ts-self-types="../types/browser.d.ts"
/**
 * One-script bootstrap for browsers:
 *
 *   <script type="module" src="/node_modules/@johnhenry/html-modules/src/browser.js"></script>
 *   <html-import src="./ui.html" as="ui"></html-import>
 *   <ui--custom-card>Hello!</ui--custom-card>
 *
 * Defines <html-import>, <html-binding>, <html-export>, <html-import-settings>
 * and <html-module-settings>, and exposes the
 * shared programmatic API as `HTMLModules` (also on globalThis). Bare
 * specifiers resolve through the page's import map (import.meta.resolve).
 */
import { createHTMLModules } from './html-modules.js';
import { defineHTMLModuleElements } from './elements.js';

/** @typedef {import('./types.js').HTMLModulesInstance} HTMLModulesInstance */
/** @typedef {import('./types.js').HTMLModuleElements} HTMLModuleElements */
/** @typedef {import('./types.js').HTMLImportElement} HTMLImportElement */
/** @typedef {import('./types.js').HTMLImportSettingsElement} HTMLImportSettingsElement */
/** @typedef {import('./types.js').HTMLModuleSettingsElement} HTMLModuleSettingsElement */
/** @typedef {import('./types.js').ModuleNamespace} ModuleNamespace */
/** @typedef {import('./types.js').ImportResult} ImportResult */
/** @typedef {import('./types.js').ImportOptions} ImportOptions */
/** @typedef {import('./types.js').LazyImportHandle} LazyImportHandle */
/** @typedef {import('./types.js').HotReloadResult} HotReloadResult */

export const HTMLModules = createHTMLModules({
  hostResolve: (specifier) => import.meta.resolve(specifier),
});
export const {
  HTMLImport, HTMLBinding, HTMLExport, HTMLImportSettings, HTMLModuleSettings,
} = defineHTMLModuleElements({ modules: HTMLModules });
globalThis.HTMLModules ??= HTMLModules;
