// Config for `web-module-graph build`. Run from the package root:
//
//   node bin/web-module-graph.js build --config examples/cli/modules.config.js \
//     --out examples/cli/importmap.json --lock examples/cli/modules.lock.json
//   node bin/web-module-graph.js build --config examples/cli/modules.config.js --html --out examples/cli/importmap.html
//   node bin/web-module-graph.js resolve @tokens greet@1.0.0 @lib/ --config examples/cli/modules.config.js
//
// The router maps specifiers to paths served from the package root. Each route
// lists candidates in order, and the probe keeps the first one that exists on
// disk: build-time ordered fallback, with no network.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basicRouter } from '../../src/routers/index.js';

const packageRoot = new URL('../../', import.meta.url);
const onDisk = (path) => existsSync(fileURLToPath(new URL(`.${path}`, packageRoot)));

export default {
  router: basicRouter({
    routes: [
      // "@lib" is the component library's barrel; "@lib/" reaches its modules (a prefix entry).
      { match: '@lib', use: () => '/examples/library/all.html' },
      { match: '@lib/*', use: () => '/examples/library/' },
      // Targets see the context: scoped resolutions carry the scope as `referrer`.
      {
        match: '@tokens',
        use: [
          () => '/examples/vendor-cache/tokens.html', // not on disk: the probe skips it
          (rest, { referrer } = {}) => (referrer?.includes('/legacy/') ? '/examples/import-maps/tokens-v1.html' : '/examples/import-maps/tokens-v2.html'),
        ],
      },
      // Everything else: try the "down" mirror first, then the primary one.
      {
        match: '*',
        use: [
          (rest) => `/examples/routers/mirrors/down/${rest}/index.js`,
          (rest) => `/examples/routers/mirrors/primary/${rest}/index.js`,
        ],
      },
    ],
    probe: (url) => onDisk(url),
  }),
  specifiers: ['@lib', '@lib/', '@tokens', 'greet@1.0.0'],
  scopes: { '/examples/cli/legacy/': ['@tokens'] },
  // Merged in as-is (entries from the router win on conflicts).
  importMap: { imports: { '@board/ui': '/examples/app/ui.html' } },
};
