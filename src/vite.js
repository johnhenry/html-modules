// @ts-self-types="../types/vite.d.ts"
/**
 * A Vite plugin: import HTML modules from JavaScript, compiled to ES modules, with HMR.
 *
 *   // vite.config.js
 *   import htmlModules from '@johnhenry/html-modules/vite';
 *   export default { plugins: [htmlModules()] };
 *
 *   // main.js
 *   import { customCard } from './ui.html';     // a definition, as in `html-module ui.html`
 *   customCard.define('x-card');
 *
 * An `.html` file imported **from JavaScript** (or from another HTML module) is compiled with the same compiler as
 * the CLI (`compileHTMLModule`) so it behaves exactly like the runtime-loaded module. An `.html` entry page is not
 * touched: Vite keeps handling pages. Dependencies (`<html-import src>`, `<html-export src>`) stay `.html` imports and
 * are compiled the same way, so the bundle contains each module once.
 *
 * In `vite dev` the compiled module accepts itself (`import.meta.hot`): an edit swaps the new components and styles
 * under live elements (`hotReplaceModule()`: templates re-stamped, adopted sheets swapped, classes, listeners and
 * light DOM kept) and invalidates (a full reload) when that cannot be done in place.
 *
 * Needs `@johnhenry/html-modules/runtime` resolvable from the project (it is, once the package is installed).
 */
import { readFile } from 'node:fs/promises';
import { compileHTMLModule } from './compiler.js';

const MARK = 'html-module';
const HTML = /\.html?$/i;

const split = (id) => {
  const at = id.indexOf('?');
  return at < 0 ? [id, ''] : [id.slice(0, at), id.slice(at)];
};
const isMarked = (id) => new URLSearchParams(split(id)[1]).has(MARK);

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
export default function htmlModules({ runtime, format, as, delimiter, conflict, hot = true } = {}) {
  let serving = false;
  return {
    name: 'html-modules',
    enforce: 'pre',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    async resolveId(source, importer, options) {
      if (!HTML.test(split(source)[0]) || isMarked(source)) return null;
      // An HTML entry page is Vite's own; only imports from JavaScript or from compiled HTML modules are modules.
      if (!importer || (HTML.test(split(importer)[0]) && !isMarked(importer) && !new URLSearchParams(split(importer)[1]).has('html-proxy'))) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return resolved;
      const [file, query] = split(resolved.id);
      return { ...resolved, id: `${file}${query ? `${query}&` : '?'}${MARK}` };
    },
    async load(id) {
      if (!isMarked(id)) return null;
      const [file] = split(id);
      this.addWatchFile(file);
      const source = await readFile(file, 'utf8');
      const code = compileHTMLModule(source, {
        url: file,
        ...(runtime && { runtime }),
        ...(format && { format }),
        ...(as !== undefined && { as }),
        ...(delimiter !== undefined && { delimiter }),
        ...(conflict && { conflict }),
        // Dependencies stay ".html" imports: this plugin compiles them in turn.
        rewrite: (src) => src,
        hot: hot && serving,
      });
      return { code, map: null };
    },
  };
}
