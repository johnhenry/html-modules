// Regenerate examples/compiled/ with the html-module compiler.
// test/examples.test.js fails if the checked-in output is stale.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compileHTMLModule } from '../src/compiler.js';

export const RUNTIME = '../../src/runtime.js';
export const targets = [
  { from: 'components/ui.html', to: 'compiled/ui.js' },
  { from: 'components/icons.html', to: 'compiled/icons.js' },
  { from: 'components/themes.html', to: 'compiled/themes.js' },
  { from: 'components/rating.html', to: 'compiled/rating.js' },
  { from: 'components/tip.html', to: 'compiled/tip.js' },
  { from: 'components/icons.html', to: 'compiled/icons.register.js', format: 'register', as: 'reg' },
  { from: 'components/icons.html', to: 'compiled/icons.dash.register.js', format: 'register', as: 'ico', delimiter: '-' },
];

const examples = new URL('../examples/', import.meta.url);

export async function compileExamples() {
  const out = {};
  for (const t of targets) {
    const source = await readFile(new URL(t.from, examples), 'utf8');
    out[t.to] = compileHTMLModule(source, { url: t.from.split('/').pop(), runtime: RUNTIME, format: t.format, as: t.as, delimiter: t.delimiter });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(new URL('compiled/', examples), { recursive: true });
  for (const [to, js] of Object.entries(await compileExamples())) {
    await writeFile(new URL(to, examples), js);
    console.log(`examples/${to}`);
  }
}
