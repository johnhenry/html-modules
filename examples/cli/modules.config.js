// Config for `web-module-graph build`. Run from the package root:
//
//   node bin/web-module-graph.js build --config examples/cli/modules.config.js \
//     --out examples/cli/importmap.json --lock examples/cli/modules.lock.json
//   node bin/web-module-graph.js build --config examples/cli/modules.config.js --html --out examples/cli/importmap.html
//   node bin/web-module-graph.js resolve @tokens greet@^1 jsr:@demo/scoped@^2 @lib/ --config examples/cli/modules.config.js
//
// Two routers, in order:
//  1. basicRouter: static aliases for HTML modules. "@lib" is not a package
//     name, and "@tokens" depends on the importing scope (the referrer).
//  2. mport v2 (fromMport): packages. Ranges resolve through an offline
//     registry (../routers/registry/), and each package is tried on a "down"
//     mirror, then the primary one: ordered fallback with a file-system probe.
//
// The default export is a function so the CLI can hand it the existing
// lockfile: with `--lock modules.lock.json`, mport pins the recorded versions
// and builds instead of asking the registry again (`--relock` ignores it).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRouter, fallback, custom } from 'mport';
import { basicRouter, chainRouters, fromMport } from '../../src/routers/index.js';
import { localRegistry } from '../routers/registry.js';

const packageRoot = new URL('../../', import.meta.url);
const onDisk = (path) => existsSync(fileURLToPath(new URL(`.${path}`, packageRoot)));
const registry = localRegistry((path) => {
  try {
    return readFileSync(new URL(`../routers/registry/${path}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
});
// Two mirrors of the same artifact: they share a build, so either may serve a locked package.
const mirror = (name) => custom(`/examples/routers/mirrors/${name}/{name}@{version}/index.js`, { name, build: 'mirror', registries: ['npm', 'jsr'] });

export default ({ lock } = {}) => ({
  router: chainRouters(
    basicRouter({
      routes: [
        // "@lib" is the component library's barrel; "@lib/" reaches its modules (a prefix entry).
        { match: '@lib', use: () => '/examples/library/all.html' },
        { match: '@lib/*', use: () => '/examples/library/' },
        // Targets see the context: scoped resolutions carry the scope as `referrer`.
        { match: '@tokens', use: (rest, { referrer } = {}) => (referrer?.includes('/legacy/') ? '/examples/import-maps/tokens-v1.html' : '/examples/import-maps/tokens-v2.html') },
      ],
    }),
    fromMport(createRouter({ '*': fallback(mirror('down'), mirror('primary')) }, {
      lock,
      fetch: registry,
      probe: async (url) => {
        if (!onDisk(url)) throw new Error(`${url} is not on disk`);
      },
    })),
  ),
  specifiers: ['@lib', '@lib/', '@tokens', 'greet@^1', 'jsr:@demo/scoped@^2'],
  scopes: { '/examples/cli/legacy/': ['@tokens'] },
  // Merged in as-is (entries from the router win on conflicts).
  importMap: { imports: { '@board/ui': '/examples/app/ui.html' } },
});
