#!/usr/bin/env node
/**
 * web-module-graph CLI
 *
 *   web-module-graph build   [--config modules.config.js] [--out importmap.json] [--lock modules.lock.json] [--html]
 *   web-module-graph resolve <specifier...> [--config modules.config.js]
 *
 * The config module's default export:
 *   { router, specifiers: string[], scopes?: Record<string, string[]>, importMap?: object }
 * `router` is any Router (basicRouter, importMapRouter, a function, ...).
 * Note: mportRouter resolves by importing from https CDNs, which Node cannot do;
 * use it in the browser, and a basicRouter/httpProbe config for build time.
 */
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileImportMap, mergeImportMaps, importMapScript } from '../src/import-map.js';
import { toRouter } from '../src/routers/interface.js';

const usage = `Usage:
  web-module-graph build [--config modules.config.js] [--out importmap.json] [--lock file] [--html]
  web-module-graph resolve <specifier...> [--config modules.config.js]`;

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, cwd = process.cwd() } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c', default: 'modules.config.js' },
      out: { type: 'string', short: 'o' },
      lock: { type: 'string' },
      html: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    stdout.write(usage + '\n');
    return values.help ? 0 : 1;
  }
  const configURL = pathToFileURL(resolvePath(cwd, values.config)).href;
  const config = (await import(configURL)).default;
  if (!config?.router) throw new Error(`${values.config} must default-export { router, specifiers }`);
  const router = toRouter(config.router);

  if (command === 'build') {
    const { importMap, lock } = await compileImportMap(router, config.specifiers ?? [], { scopes: config.scopes });
    const finalMap = config.importMap ? mergeImportMaps(config.importMap, importMap) : importMap;
    const text = values.html ? importMapScript(finalMap) + '\n' : JSON.stringify(finalMap, null, 2) + '\n';
    if (values.out) await writeFile(resolvePath(cwd, values.out), text);
    else stdout.write(text);
    if (values.lock) await writeFile(resolvePath(cwd, values.lock), JSON.stringify(lock, null, 2) + '\n');
    return 0;
  }
  if (command === 'resolve') {
    for (const specifier of rest) {
      const res = await router.resolve(specifier, {});
      const { module: _m, ...printable } = res ?? {};
      stdout.write(`${specifier}\t${res ? JSON.stringify(printable) : 'unresolved'}\n`);
    }
    return 0;
  }
  stdout.write(usage + '\n');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href || process.argv[1]?.endsWith('web-module-graph')) {
  main().then((code) => (process.exitCode = code), (err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  });
}
