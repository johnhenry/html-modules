export type HTMLModulesPluginOptions = {
    /**
     * where compiled modules import the runtime from (default "@johnhenry/html-modules/runtime")
     */
    runtime?: string;
    format?: 'esm' | 'register';
    as?: string;
    delimiter?: string;
    conflict?: 'error' | 'reuse';
    /**
     * HMR code in dev (default true)
     */
    hot?: boolean;
};
/**
 * @typedef {object} HTMLModulesPluginOptions
 * @property {string} [runtime]  where compiled modules import the runtime from (default "@johnhenry/html-modules/runtime")
 * @property {'esm' | 'register'} [format]
 * @property {string} [as]
 * @property {string} [delimiter]
 * @property {'error' | 'reuse'} [conflict]
 * @property {boolean} [hot]     HMR code in dev (default true)
 */
/**
 * @param {HTMLModulesPluginOptions} [options]
 * @returns {import('vite').Plugin}
 */
export default function htmlModules({ runtime, format, as, delimiter, conflict, hot }?: HTMLModulesPluginOptions): import('vite').Plugin;
