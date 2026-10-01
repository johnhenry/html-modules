export type HTMLModulesInstance = import('./types.js').HTMLModulesInstance;
export type HTMLModuleElements = import('./types.js').HTMLModuleElements;
export type HTMLImportElement = import('./types.js').HTMLImportElement;
export type HTMLImportSettingsElement = import('./types.js').HTMLImportSettingsElement;
export type HTMLModuleSettingsElement = import('./types.js').HTMLModuleSettingsElement;
export type ModuleNamespace = import('./types.js').ModuleNamespace;
export type ImportResult = import('./types.js').ImportResult;
export type ImportOptions = import('./types.js').ImportOptions;
export type LazyImportHandle = import('./types.js').LazyImportHandle;
export type HotReloadResult = import('./types.js').HotReloadResult;
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
export declare const HTMLModules: import("./types.js").HTMLModulesInstance;
export declare const HTMLImport: {
    new (): import("./types.js").HTMLImportElement;
    prototype: import("./types.js").HTMLImportElement;
}, HTMLBinding: {
    new (): HTMLElement;
    prototype: HTMLElement;
}, HTMLExport: {
    new (): HTMLElement;
    prototype: HTMLElement;
}, HTMLImportSettings: {
    new (): import("./types.js").HTMLImportSettingsElement;
    prototype: import("./types.js").HTMLImportSettingsElement;
}, HTMLModuleSettings: {
    new (): import("./types.js").HTMLModuleSettingsElement;
    prototype: import("./types.js").HTMLModuleSettingsElement;
};
