/**
 * Define the html-modules elements over an HTMLModules instance.
 * @param {{ modules: ReturnType<typeof import('./html-modules.js').createHTMLModules>, window?: any, registry?: CustomElementRegistry }} options
 * @returns {import('./types.js').HTMLModuleElements}
 */
export declare function defineHTMLModuleElements({ modules, window: win, registry }?: {
    modules: ReturnType<typeof import('./html-modules.js').createHTMLModules>;
    window?: any;
    registry?: CustomElementRegistry;
}): import('./types.js').HTMLModuleElements;
