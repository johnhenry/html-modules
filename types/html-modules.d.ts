/**
 * `options`: loader options (`fetch`, `parseHTML`, `hostResolve`, `baseURL`, `importModule`, `onEvent`, `credentials`,
 * `mode`, `trustedTypes`, `nonce`) plus these defaults for this instance's imports (lowest precedence: `<html-import>`
 * attributes and the page's `<html-import-settings>` override them; they never apply inside modules): `delimiter`,
 * `base`, `conflict`, `load` (the default for `<html-import>` elements; `import()` is lazy only when the call says
 * `load: 'lazy'`) and `errors`. See `CreateHTMLModulesOptions`.
 * @param {import('./types.js').CreateHTMLModulesOptions} [options]
 * @returns {import('./types.js').HTMLModulesInstance}
 */
export declare function createHTMLModules({ window: win, registry, delimiter, base, conflict, load, errors, ...loaderOptions }?: import('./types.js').CreateHTMLModulesOptions): import('./types.js').HTMLModulesInstance;
