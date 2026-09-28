#!/usr/bin/env node
/**
 * web-module-graph CLI
 *
 *   web-module-graph build   [--config modules.config.js] [--out importmap.json] [--lock modules.lock.json] [--relock] [--html]
 *   web-module-graph resolve <specifier...> [--config modules.config.js] [--lock file] [--trace]
 *
 * The config module's default export is `{ router, specifiers, scopes?, importMap? }`,
 * or a function `({ lock }) => config` that receives the existing lockfile
 * (so it can pass it to mport: `createRouter(routes, { lock })`).
 *
 * `router` is any Router: an mport v2 router, `fromMport(router)`, a chain
 * with static aliases in front of it, a `basicRouter`, or a function.
 *  - A plain mport router (with no array-form scopes) is compiled by mport's
 *    own `router.build()`.
 *  - Anything else is compiled by `compileImportMap()`, using mport's
 *    `compileImportMap` and `mergeImportMaps` when mport is installed.
 * Either way the lockfile is in mport's format (`{ lockfileVersion: 1, packages }`).
 */
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileImportMap, mergeImportMaps, importMapScript } from '../src/import-map.js';
import { toRouter } from '../src/routers/interface.js';
import { isMportRouter } from '../src/routers/mport.js';

const usage = `Usage:
  web-module-graph build [--config modules.config.js] [--out importmap.json] [--lock file] [--relock] [--html]
  web-module-graph resolve <specifier...> [--config modules.config.js] [--lock file] [--trace]`;

const loadMport = () => import('mport').catch(() => null);
const readJSON = (path) => readFile(path, 'utf8').then(JSON.parse, () => undefined);

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, cwd = process.cwd() } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c', default: 'modules.config.js' },
      out: { type: 'string', short: 'o' },
      lock: { type: 'string' },
      relock: { type: 'boolean', default: false },
      trace: { type: 'boolean', default: false },
      html: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    stdout.write(usage + '\n');
    return values.help ? 0 : 1;
  }
  const lockPath = values.lock && resolvePath(cwd, values.lock);
  const previousLock = lockPath && !values.relock ? await readJSON(lockPath) : undefined;
  const configURL = pathToFileURL(resolvePath(cwd, values.config)).href;
  let config = (await import(configURL)).default;
  if (typeof config === 'function' && !config.resolve) config = await config({ lock: previousLock });
  if (!config?.router) throw new Error(`${values.config} must default-export { router, specifiers }`);
  const router = toRouter(config.router);

  if (command === 'build') {
    const mport = await loadMport();
    const scopes = config.scopes ?? {};
    const specifiers = config.specifiers ?? [];
    const { importMap, lock } = isMportRouter(router) && !Object.values(scopes).some(Array.isArray)
      ? await router.build(specifiers, { scopes })
      : await compileImportMap(router, specifiers, { scopes, ...(mport && { compile: mport.compileImportMap }) });
    const merge = mport?.mergeImportMaps ?? mergeImportMaps;
    const finalMap = config.importMap ? merge(config.importMap, importMap) : importMap;
    const text = values.html ? importMapScript(finalMap) + '\n' : JSON.stringify(finalMap, null, 2) + '\n';
    if (values.out) await writeFile(resolvePath(cwd, values.out), text);
    else stdout.write(text);
    if (lockPath) await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
    return 0;
  }
  if (command === 'resolve') {
    for (const specifier of rest) {
      const res = await router.resolve(specifier, {});
      const { module: _m, trace, ...printable } = res ?? {};
      if (values.trace && trace) printable.trace = trace;
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
