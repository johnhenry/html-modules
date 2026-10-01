/**
 * Scan HTML source into raw `<html-export>` / `<html-import>` elements, and the
 * settings elements `<html-import-settings>` / `<html-module-settings>`.
 * @param {string} src
 * @returns {{ imports: import('./record.js').RawElement[], exports: import('./record.js').RawElement[], importSettings: import('./record.js').RawElement[], moduleSettings: import('./record.js').RawElement[], bindings: any[] }}
 */
export declare function scanRawElements(src: string): {
    imports: import('./record.js').RawElement[];
    exports: import('./record.js').RawElement[];
    importSettings: import('./record.js').RawElement[];
    moduleSettings: import('./record.js').RawElement[];
    bindings: any[];
};
/**
 * Scan an HTML module's source into a module record.
 * @param {string} source
 * @param {string} [url]
 * @returns {import('./record.js').ModuleRecord}
 */
export declare function scanHTMLModule(source: string, url?: string): import('./record.js').ModuleRecord;
