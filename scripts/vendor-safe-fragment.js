// Build @johnhenry/safe-fragment (the devDependency pinned in package.json) into one browser ES module.
//
// Why this script exists: safe-fragment is unpublished and its git repository does not commit `dist/` or define a
// `prepare` script, so `npm install github:johnhenry/safe-fragment#<sha>` installs an empty package (its `files` list
// is just `dist`, which does not exist). It does install the one dependency we need (`dompurify`). This script fetches
// the pinned commit's source, bundles `src/index.ts` (with DOMPurify) using Vite, which is already a devDependency, and
// writes the result to examples/vendor/safe-fragment/safe-fragment.js (gitignored). Browser tests and the sanitizer
// example page import that file. Delete this script when safe-fragment is published and the devDependency becomes a
// normal semver range.
//
//   node scripts/vendor-safe-fragment.js          # build if missing
//   node scripts/vendor-safe-fragment.js --force  # rebuild
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const output = join(root, 'examples/vendor/safe-fragment/safe-fragment.js');

/** The commit pinned in package.json (`…safe-fragment#<sha>`). */
export async function pinnedSha() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const sha = /#([0-9a-f]{40})$/.exec(pkg.devDependencies?.['@johnhenry/safe-fragment'] ?? '')?.[1];
  if (!sha) throw new Error('package.json: devDependencies["@johnhenry/safe-fragment"] must be pinned to a commit: github:johnhenry/safe-fragment#<40-hex sha>');
  return sha;
}

export async function vendorSafeFragment({ force = false } = {}) {
  const sha = await pinnedSha();
  const work = join(root, 'node_modules/.cache/html-modules/safe-fragment', sha);
  const built = join(work, 'out/safe-fragment.js');
  if (force || !existsSync(built)) {
    await rm(work, { recursive: true, force: true });
    await mkdir(join(work, 'src'), { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: join(work, 'src'), stdio: 'pipe' });
    git('init', '-q');
    git('fetch', '-q', '--depth', '1', 'https://github.com/johnhenry/safe-fragment.git', sha);
    git('checkout', '-q', 'FETCH_HEAD');
    const { build } = await import('vite');
    await build({
      root: join(work, 'src'),
      configFile: false,
      logLevel: 'error',
      build: {
        outDir: join(work, 'out'),
        emptyOutDir: true,
        minify: false,
        target: 'es2022',
        lib: { entry: join(work, 'src/src/index.ts'), formats: ['es'], fileName: () => 'safe-fragment.js' },
        rolldownOptions: { output: { codeSplitting: false } },
      },
      // `dompurify` is resolved from this repository's node_modules (it is safe-fragment's dependency, installed with it).
      resolve: { preserveSymlinks: false },
    });
  }
  await mkdir(dirname(output), { recursive: true });
  await copyFile(built, output);
  return { sha, output };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sha, output: file } = await vendorSafeFragment({ force: process.argv.includes('--force') });
  console.log(`ok: safe-fragment@${sha.slice(0, 7)} bundled to ${file}`);
}
