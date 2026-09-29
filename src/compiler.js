/**
 * The optional compiler: an HTML module → an ordinary ES module.
 *
 *   compileHTMLModule(source, { url: 'ui.html' })
 *
 * The output imports only the runtime, and exports one HTML Component
 * Definition per component (camelCase: "custom-card" → `customCard`), one
 * stylesheet or value per stylesheet or data export, a `components` manifest
 * keyed by export name, and `default` when the module has one. It registers
 * nothing (PRD, compiler §6): call `customCard.define('my-card')`, or import
 * it declaratively with `<html-import src="./ui.js" as="ui">`. The `register`
 * format adds a call that registers every component on import.
 *
 * Dependencies (`<html-import>` and `<html-export src>`) become static imports
 * with ".html" rewritten to ".js", so compile them too.
 */
import { scanHTMLModule } from './scan.js';
import { readHTMLModule } from './record.js';
import { camelCase, assertNamespace } from './names.js';

const str = (v) => JSON.stringify(v);

/** "./icons.html" → "./icons.js"; other specifiers are left alone. */
export const rewriteSpecifier = (src) => src.replace(/\.html?(?=[?#]|$)/i, '.js');

const basename = (url) => String(url).split(/[\\/]/).pop();

/**
 * @param {string} source HTML module source
 * @param {object} [options]
 * @param {string} [options.url]            the module's URL or file name (for messages and the header)
 * @param {string} [options.runtime]        specifier the output imports the runtime from (default "html-modules/runtime")
 * @param {'esm'|'register'} [options.format]
 * @param {string} [options.as]             register format: namespace to register under (default: the export names)
 * @param {(src: string) => string} [options.rewrite]   dependency specifier rewrite (default ".html" → ".js")
 * @param {(html: string, url: string) => Document} [options.parse]  use a DOM parser instead of the built-in scanner
 * @returns {string} JavaScript module source
 */
export function compileHTMLModule(source, { url = 'module.html', parse, ...options } = {}) {
  const record = parse ? readHTMLModule(parse(source, url), url) : scanHTMLModule(source, url);
  return compileRecord(record, options);
}

/**
 * Generate an ES module from a module record.
 * @param {import('./record.js').ModuleRecord} record
 */
export function compileRecord(record, { runtime = 'html-modules/runtime', format = 'esm', as, rewrite = rewriteSpecifier } = {}) {
  if (format !== 'esm' && format !== 'register') throw new TypeError(`Unknown format "${format}": use "esm" or "register"`);
  if (as != null) assertNamespace(as);
  const helpers = new Set(['manifest']);
  const deps = new Map(); // src → identifier
  const dep = (src) => {
    if (!deps.has(src)) deps.set(src, `$m${deps.size}`);
    return deps.get(src);
  };
  for (const i of record.imports) dep(i.src);

  const body = [];
  const exported = []; // [local, exportName]
  const manifestEntries = [];
  const stars = [];
  const starLines = [];
  let defaultLocal = null;

  if (record.imports.length) {
    const items = record.imports.map((i) => `  { module: ${dep(i.src)}, from: ${str(i.src)}${i.as ? `, as: ${str(i.as)}` : ''}, bindings: ${str(i.bindings)} }`);
    body.push(`const $imports = [\n${items.join(',\n')},\n];`);
  }
  const imports = record.imports.length ? '$imports' : '[]';

  let anon = 0;
  for (const e of record.exports) {
    const local = e.name ? `$x_${camelCase(e.name)}` : `$default${anon++ || ''}`;
    let expr;
    switch (e.kind) {
      case 'component':
        helpers.add('defineHTMLComponent');
        expr = `defineHTMLComponent({\n  name: ${str(e.name)},\n  template: ${str(e.template)},\n  shadow: ${str(e.shadow)},\n  delegatesFocus: ${e.delegatesFocus},\n  styles: ${str(e.styles)},\n  imports: ${imports},\n  url: import.meta.url,\n})`;
        break;
      case 'stylesheet':
        helpers.add('defineHTMLStylesheet');
        expr = `defineHTMLStylesheet({ name: ${str(e.name)}, css: ${str(e.css)}, url: import.meta.url })`;
        break;
      case 'data':
        expr = str(e.value);
        break;
      case 'reexport':
        if (!e.name) {
          stars.push(`[${dep(e.src)}, ${str(e.src)}]`);
          starLines.push(`export * from ${str(rewrite(e.src))};`);
          continue;
        }
        helpers.add('lookupExport');
        expr = `lookupExport(${dep(e.src)}, ${str(e.import ?? e.name)}, ${str(e.src)})`;
        break;
    }
    body.push(`const ${local} = ${expr};`);
    if (e.name) {
      exported.push([local, camelCase(e.name)]);
      // Components, and named re-exports (which may be components); manifest() skips the rest.
      if (e.kind === 'component' || e.kind === 'reexport') manifestEntries.push(`  ${str(e.name)}: ${local},`);
    }
    if (e.default) defaultLocal = local;
  }

  body.push(`const $components = manifest({${manifestEntries.length ? `\n${manifestEntries.join('\n')}\n` : ''}}, [${stars.join(', ')}]);`);
  exported.push(['$components', 'components']);
  if (defaultLocal) exported.push([defaultLocal, 'default']);
  if (format === 'register') {
    helpers.add('registerComponents');
    body.push(`registerComponents({ components: $components }, { ${as != null ? `as: ${str(as)}, ` : ''}from: import.meta.url });`);
  }

  const out = [
    `// Compiled from ${basename(record.url || 'module.html')} by html-module. Do not edit; recompile instead.`,
    `import { ${[...helpers].sort().join(', ')} } from ${str(runtime)};`,
    ...[...deps].map(([src, id]) => `import * as ${id} from ${str(rewrite(src))};`),
    ...starLines,
    '',
    ...body,
    '',
    `export {\n${exported.map(([local, name]) => `  ${local} as ${name},`).join('\n')}\n};`,
    '',
  ];
  return out.join('\n');
}
