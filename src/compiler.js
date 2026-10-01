/**
 * The optional compiler: an HTML module → an ordinary ES module.
 *
 *   compileHTMLModule(source, { url: 'ui.html' })
 *
 * The output imports only the runtime, and exports one HTML Component
 * Definition per component (camelCase: "custom-card" → `customCard`), one
 * stylesheet or value per stylesheet or data export, a `components` manifest
 * keyed by export name, and `export default` when the module has one. It registers
 * nothing (PRD, compiler §6): call `customCard.define('my-card')`, or import
 * it declaratively with `<html-import src="./ui.js" as="ui">`. The `register`
 * format adds a call that registers every component on import.
 *
 * Dependencies (`<html-import>` and `<html-export src>`) become static imports
 * with ".html" rewritten to ".js", so compile them too. A module's
 * `<html-import-settings base>` is applied to those specifiers first.
 *
 * Settings: `<html-module-settings>` defaults are already part of each
 * component record; `<html-import-settings>` options reach the `$imports`
 * entries (delimiter, conflict, errors, and `load` for fidelity: compiled
 * dependencies are static imports, so registration is always eager).
 */
import { scanHTMLModule } from './scan.js';
import { moduleImportOptions, readHTMLModule } from './record.js';
import { DELIMITER, assertDelimiter, assertNamespace, bindingName, camelCase } from './names.js';
import { assertOption } from './settings.js';

const str = (v) => JSON.stringify(v);

/** "./icons.html" → "./icons.js"; other specifiers are left alone. */
export const rewriteSpecifier = (src) => src.replace(/\.html?(?=[?#]|$)/i, '.js');

const basename = (url) => String(url).split(/[\\/]/).pop();

const URL_LIKE = /^(?:\.{0,2}\/)/;
const DUMMY = 'http://html-modules.invalid/r/0/1/2/3/4/5/6/7/8/9/';

/**
 * Apply a module's `<html-import-settings base>` to one of its dependency
 * specifiers, keeping it relative where it can: ("./card.html", "./vendor/ui@1/")
 * → "./vendor/ui@1/card.html"; ("./card.html", "../lib/") → "../lib/card.html";
 * with an absolute base, the absolute URL. Bare and absolute specifiers are
 * left alone, as the runtime leaves them.
 */
export function rebaseSpecifier(src, base) {
  if (!base || !URL_LIKE.test(src)) return src;
  const module = new URL('module.html', DUMMY);
  const target = new URL(src, new URL(base, module));
  if (target.origin !== module.origin) return target.href;
  const tail = target.search + target.hash;
  if (src.startsWith('/') || base.startsWith('/')) return target.pathname + tail;
  const from = module.pathname.split('/').slice(1, -1);
  const to = target.pathname.split('/').slice(1);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const rel = [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
  return (rel.startsWith('../') ? rel : `./${rel}`) + tail;
}

/**
 * @param {string} source HTML module source
 * @param {object} [options]
 * @param {string} [options.url]            the module's URL or file name (for messages and the header)
 * @param {string} [options.runtime]        specifier the output imports the runtime from (default "@johnhenry/html-modules/runtime")
 * @param {'esm'|'register'} [options.format]
 * @param {string} [options.as]             register format: namespace to register under (default: the export names)
 * @param {string} [options.delimiter]      register format: namespace delimiter (default "--"), e.g. "-" for <ui-card>
 * @param {'error'|'reuse'} [options.conflict]  register format: keep tags that are already defined instead of throwing
 * @param {(src: string) => string} [options.rewrite]   dependency specifier rewrite (default ".html" → ".js")
 * @param {boolean} [options.hot]           add Vite-style HMR: the module accepts itself and hot-replaces its components and stylesheets under live elements (see `hotReplaceModule()`); invalidates when that cannot be done in place
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
export function compileRecord(record, { runtime = '@johnhenry/html-modules/runtime', format = 'esm', as, delimiter = DELIMITER, conflict = 'error', rewrite = rewriteSpecifier, hot = false } = {}) {
  if (format !== 'esm' && format !== 'register') throw new TypeError(`Unknown format "${format}": use "esm" or "register"`);
  if (as != null) assertNamespace(as);
  assertDelimiter(delimiter);
  assertOption('conflict', conflict);
  const base = record.importSettings?.base;
  const specifier = (src) => rewrite(rebaseSpecifier(src, base));
  if (format === 'register' && as != null) {
    // Check the tags this module's own components will get now, rather than on import.
    for (const e of record.exports) if (e.kind === 'component' && e.name) bindingName(as, e.name, delimiter);
  }
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
    const items = record.imports.map((i) => {
      const options = Object.entries(moduleImportOptions(record, i)).map(([k, v]) => `, ${k}: ${str(v)}`).join('');
      return `  { module: ${dep(i.src)}, from: ${str(i.src)}${i.as ? `, as: ${str(i.as)}` : ''}${options}, bindings: ${str(i.bindings)} }`;
    });
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
        expr = `defineHTMLComponent({\n  name: ${str(e.name)},\n  template: ${str(e.template)},\n  shadow: ${str(e.shadow)},\n  delegatesFocus: ${e.delegatesFocus},\n  styles: ${str(e.styles)},${e.props ? `\n  props: ${str(e.props)},` : ''}${e.formAssociated ? `\n  formAssociated: true,${e.formControl ? `\n  formControl: ${str(e.formControl)},` : ''}` : ''}\n  imports: ${imports},\n  url: import.meta.url,\n})`;
        break;
      case 'stylesheet':
        helpers.add('defineHTMLStylesheet');
        expr = `defineHTMLStylesheet({ name: ${str(e.name)}, css: ${str(e.css)}, url: import.meta.url })`;
        break;
      case 'data':
        // JSON.parse, as at runtime: an object literal would turn a "__proto__" key into the prototype.
        expr = `JSON.parse(${str(str(e.value))})`;
        break;
      case 'reexport':
        if (!('name' in e)) {
          stars.push(`[${dep(e.src)}, ${str(e.src)}]`);
          starLines.push(`export * from ${str(specifier(e.src))};`);
          continue;
        }
        if (e.import === '*') {
          expr = dep(e.src);
          break;
        }
        helpers.add('lookupExport');
        expr = `lookupExport(${dep(e.src)}, ${str(e.import ?? e.name ?? 'default')}, ${str(e.src)})`;
        break;
    }
    body.push(`const ${local} = ${expr};`);
    if (e.name) {
      exported.push([local, camelCase(e.name)]);
      // Components, and named re-exports (which may be components); manifest() skips the rest.
      if (e.kind === 'component' || e.kind === 'reexport') manifestEntries.push(`  ${str(e.name)}: ${local},`);
      if (e.import === '*') {
        helpers.add('namespaceComponents');
        manifestEntries.push(`  ...namespaceComponents(${str(e.name)}, ${local}),`);
      }
    }
    if (e.default) defaultLocal = local;
  }

  body.push(`const $components = manifest({${manifestEntries.length ? `\n${manifestEntries.join('\n')}\n` : ''}}, [${stars.join(', ')}]);`);
  exported.push(['$components', 'components']);
  if (hot) {
    helpers.add('hotReplaceModule');
    const own = exported.map(([local, name]) => `${name}: ${local}`);
    if (defaultLocal) own.push(`default: ${defaultLocal}`);
    // Before any registration, so re-registering a replaced component under its tag is the same component.
    body.push(`if (import.meta.hot) {
  const $next = { ${own.join(', ')} };
  const $previous = import.meta.hot.data.namespace;
  import.meta.hot.data.namespace = $next;
  if ($previous) {
    const $result = hotReplaceModule($previous, $next);
    if ($result.reload) import.meta.hot.invalidate($result.reasons.join('; '));
  }
  import.meta.hot.accept();
}`);
  }
  if (format === 'register') {
    helpers.add('registerComponents');
    const opts = [
      ...(as != null ? [`as: ${str(as)}`] : []),
      ...(as != null && delimiter !== DELIMITER ? [`delimiter: ${str(delimiter)}`] : []),
      ...(conflict !== 'error' ? [`conflict: ${str(conflict)}`] : []),
      'from: import.meta.url',
    ];
    body.push(`registerComponents({ components: $components }, { ${opts.join(', ')} });`);
  }

  const out = [
    `// Compiled from ${basename(record.url || 'module.html')} by html-module. Do not edit; recompile instead.`,
    `import { ${[...helpers].sort().join(', ')} } from ${str(runtime)};`,
    ...[...deps].map(([src, id]) => `import * as ${id} from ${str(specifier(src))};`),
    ...starLines,
    '',
    ...body,
    '',
    `export {\n${exported.map(([local, name]) => `  ${local} as ${name},`).join('\n')}\n};`,
    ...(defaultLocal ? [`export default ${defaultLocal};`] : []),
    '',
  ];
  return out.join('\n');
}
