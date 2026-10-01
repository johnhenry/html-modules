#!/usr/bin/env node
/**
 * html-module: compile HTML modules to ES modules.
 *
 *   html-module ui.html                     → ui.js
 *   html-module ui.html -o dist/ui.js
 *   html-module ui.html --format register   → ui.register.js (registers on import)
 *   html-module ui.html --format register --as ui
 *   html-module ui.html --format register --as ui --delimiter -   → <ui-card>, …
 *   html-module ui.html --format register --as ui --conflict reuse   → keep tags already defined
 *   html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
 *   html-module ui.html --stdout
 *   html-module dev [dir]                   → serve a directory, watch it, hot reload open pages
 */
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHTMLModule } from '../src/compiler.js';
import { createDevServer } from '../src/dev-server.js';

export const usage = `Usage: html-module <input.html...> [options]

Options:
  -o, --out <file>        output file (one input only; default: input with .js)
  -f, --format <format>   esm (default: definitions only) or register (also registers on import)
      --as <namespace>    register format: register as <namespace>--<export>
      --delimiter <d>     register format: the namespace delimiter (default: --), e.g. - for <namespace>-<export>
      --conflict <mode>   register format: error (default) or reuse, for tags that are already defined
      --runtime <spec>    where the output imports the runtime from (default: @johnhenry/html-modules/runtime)
      --stdout            print instead of writing files
  -h, --help

       html-module dev [dir] [options]

Serve a directory (default: .) and hot reload open pages when its files change:
  -p, --port <n>          port (default: 5173; 0 picks a free one)
      --host <host>       interface (default: 127.0.0.1)
      --no-watch          serve only
  -q, --quiet             do not log changes`;

/** `html-module dev [dir]`: runs until `signal` aborts (or SIGINT / SIGTERM). Returns the exit code. */
async function dev(argv, { stdout, stderr, signal }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        port: { type: 'string', short: 'p', default: '5173' },
        host: { type: 'string', default: '127.0.0.1' },
        'no-watch': { type: 'boolean', default: false },
        quiet: { type: 'boolean', short: 'q', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    stderr.write(`${error.message}\n${usage}\n`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(`${usage}\n`);
    return 0;
  }
  const port = Number(values.port);
  if (positionals.length > 1 || !Number.isInteger(port) || port < 0 || port > 65535) {
    stderr.write(`${usage}\n`);
    return 2;
  }
  let server;
  try {
    server = await createDevServer({
      dir: positionals[0] ?? '.', port, host: values.host, watch: !values['no-watch'],
      log: values.quiet ? undefined : (line) => stdout.write(`${line}\n`),
    });
  } catch (error) {
    stderr.write(`html-module dev: ${error.message}\n`);
    return 1;
  }
  stdout.write(`html-module dev: serving ${server.dir} at ${server.url}${values['no-watch'] ? '' : ' (watching; open pages hot reload)'}\n`);
  await new Promise((done) => {
    const stop = () => done();
    signal?.addEventListener('abort', stop, { once: true });
    if (!signal) {
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
    if (signal?.aborted) done();
  });
  await server.close();
  return 0;
}

/** Run the CLI. Returns the exit code. */
export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr, signal } = {}) {
  if (argv[0] === 'dev') return dev(argv.slice(1), { stdout, stderr, signal });
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f', default: 'esm' },
        as: { type: 'string' },
        delimiter: { type: 'string' },
        conflict: { type: 'string' },
        runtime: { type: 'string', default: '@johnhenry/html-modules/runtime' },
        stdout: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    stderr.write(`${error.message}\n${usage}\n`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    stdout.write(`${usage}\n`);
    return 0;
  }
  if (!positionals.length || (values.out && positionals.length > 1)) {
    stderr.write(`${usage}\n`);
    return 2;
  }
  const suffix = values.format === 'register' ? '.register.js' : '.js';
  for (const input of positionals) {
    try {
      const source = await readFile(input, 'utf8');
      const js = compileHTMLModule(source, { url: input, format: values.format, as: values.as, delimiter: values.delimiter, conflict: values.conflict, runtime: values.runtime });
      if (values.stdout) {
        stdout.write(js);
        continue;
      }
      const out = values.out ?? input.replace(/\.html?$/i, '') + suffix;
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, js);
      stdout.write(`${input} → ${out}\n`);
    } catch (error) {
      stderr.write(`${input}: ${error.name}: ${error.message}\n`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  process.exitCode = await main();
}
