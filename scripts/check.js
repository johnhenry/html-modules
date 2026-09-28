// "Build" check: this package ships plain ESM (no compile step). Verify every
// source file parses and the public entry points import cleanly in Node.
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const roots = ['src', 'bin'];
let count = 0;
for (const root of roots) {
  for (const entry of await readdir(root, { recursive: true })) {
    if (!entry.endsWith('.js')) continue;
    execFileSync(process.execPath, ['--check', join(root, entry)]);
    count++;
  }
}
const index = await import('../src/index.js');
const routers = await import('../src/routers/index.js');
console.log(`ok: ${count} files parsed; ${Object.keys(index).length} exports from ".", ${Object.keys(routers).length} from "./routers"`);
