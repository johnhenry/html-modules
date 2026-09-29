#!/usr/bin/env node
/**
 * html-module: compile HTML modules to ES modules.
 *
 *   html-module ui.html                     → ui.js
 *   html-module ui.html -o dist/ui.js
 *   html-module ui.html --format register   → ui.register.js (registers on import)
 *   html-module ui.html --format register --as ui
 *   html-module ui.html --format register --as ui --delimiter -   → <ui-card>, …
 *   html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
 *   html-module ui.html --stdout
 */
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHTMLModule } from '../src/compiler.js';

export const usage = `Usage: html-module <input.html...> [options]

Options:
  -o, --out <file>        output file (one input only; default: input with .js)
  -f, --format <format>   esm (default: definitions only) or register (also registers on import)
      --as <namespace>    register format: register as <namespace>--<export>
      --delimiter <d>     register format: the namespace delimiter (default: --), e.g. - for <namespace>-<export>
      --runtime <spec>    where the output imports the runtime from (default: html-modules/runtime)
      --stdout            print instead of writing files
  -h, --help`;

/** Run the CLI. Returns the exit code. */
export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
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
        runtime: { type: 'string', default: 'html-modules/runtime' },
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
      const js = compileHTMLModule(source, { url: input, format: values.format, as: values.as, delimiter: values.delimiter, runtime: values.runtime });
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
