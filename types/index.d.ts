export type ModuleNamespace = import('./types.js').ModuleNamespace;
export type TagRecord = import('./types.js').TagRecord;
export type BindResult = import('./types.js').BindResult;
export type ImportResult = import('./types.js').ImportResult;
export type ImportElementResult = import('./types.js').ImportElementResult;
export type ImportOptions = import('./types.js').ImportOptions;
export type LazyImportHandle = import('./types.js').LazyImportHandle;
export type HotReloadResult = import('./types.js').HotReloadResult;
export type Loader = import('./types.js').Loader;
export type HTMLModulesInstance = import('./types.js').HTMLModulesInstance;
export type HTMLImportElement = import('./types.js').HTMLImportElement;
export type HTMLImportSettingsElement = import('./types.js').HTMLImportSettingsElement;
export type HTMLModuleSettingsElement = import('./types.js').HTMLModuleSettingsElement;
export type HTMLModuleElements = import('./types.js').HTMLModuleElements;
export type PropSpec = import('./types.js').PropSpec;
export type ComponentImport = import('./types.js').ComponentImport;
export type ComponentSpec = import('./types.js').ComponentSpec;
export type CompileOptions = import('./types.js').CompileOptions;
export type Sanitizer = import('./types.js').Sanitizer;
export type ModuleRecord = import('./record.js').ModuleRecord;
export type ImportRecord = import('./record.js').ImportRecord;
export type ExportRecord = import('./record.js').ExportRecord;
export type BindingRecord = import('./record.js').BindingRecord;
export type RawElement = import('./record.js').RawElement;
/** @typedef {import('./types.js').ModuleNamespace} ModuleNamespace */
/** @typedef {import('./types.js').TagRecord} TagRecord */
/** @typedef {import('./types.js').BindResult} BindResult */
/** @typedef {import('./types.js').ImportResult} ImportResult */
/** @typedef {import('./types.js').ImportElementResult} ImportElementResult */
/** @typedef {import('./types.js').ImportOptions} ImportOptions */
/** @typedef {import('./types.js').LazyImportHandle} LazyImportHandle */
/** @typedef {import('./types.js').HotReloadResult} HotReloadResult */
/** @typedef {import('./types.js').Loader} Loader */
/** @typedef {import('./types.js').HTMLModulesInstance} HTMLModulesInstance */
/** @typedef {import('./types.js').HTMLImportElement} HTMLImportElement */
/** @typedef {import('./types.js').HTMLImportSettingsElement} HTMLImportSettingsElement */
/** @typedef {import('./types.js').HTMLModuleSettingsElement} HTMLModuleSettingsElement */
/** @typedef {import('./types.js').HTMLModuleElements} HTMLModuleElements */
/** @typedef {import('./types.js').PropSpec} PropSpec */
/** @typedef {import('./types.js').ComponentImport} ComponentImport */
/** @typedef {import('./types.js').ComponentSpec} ComponentSpec */
/** @typedef {import('./types.js').CompileOptions} CompileOptions */
/** @typedef {import('./types.js').Sanitizer} Sanitizer */
/** @typedef {import('./record.js').ModuleRecord} ModuleRecord */
/** @typedef {import('./record.js').ImportRecord} ImportRecord */
/** @typedef {import('./record.js').ExportRecord} ExportRecord */
/** @typedef {import('./record.js').BindingRecord} BindingRecord */
/** @typedef {import('./record.js').RawElement} RawElement */
export { HTMLComponent, HTMLStylesheet, defineHTMLComponent, defineHTMLStylesheet, isHTMLComponent, isHTMLStylesheet, isStylesheet, isElementLike, toComponent, defineElement, adoptStylesheet, lookupExport, componentsOf, applyBinding, bindModule, registerComponents, manifest, namespaceComponents, configureRuntime, renderDeclarative, unadoptStylesheet, hotReplaceComponent, hotReplaceStylesheet, hotReplaceModule, supportsScopedRegistries, } from './runtime.js';
export { DELIMITER, bindingName, parseBindingName, camelCase, kebabCase, isKebabName, isValidElementName, isValidDelimiter, elementNameProblem, } from './names.js';
export { readHTMLModule, recordFromRaw, moduleImportOptions } from './record.js';
export { IMPORT_DEFAULTS, EXPORT_DEFAULTS, readImportSettings, readModuleSettings, readImportOptions, resolveImportOptions, } from './settings.js';
export { lazyTargets, watchLazy, componentRoot } from './lazy.js';
export { scanHTMLModule } from './scan.js';
export { createLoader, linkHTMLModule, createNamespace } from './loader.js';
export { createHTMLModules } from './html-modules.js';
export { defineHTMLModuleElements } from './elements.js';
export { compileHTMLModule, compileRecord, rewriteSpecifier, rebaseSpecifier } from './compiler.js';
