import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import {
  basicRouter, importMapRouter, chainRouters, toRouter, isRouter, mportRouter, parsePackageSpecifier, httpProbe,
} from '../src/routers/index.js';

test('parsePackageSpecifier', () => {
  assert.deepEqual(parsePackageSpecifier('react'), { name: 'react' });
  assert.deepEqual(parsePackageSpecifier('react@19.2.0'), { name: 'react', version: '19.2.0' });
  assert.deepEqual(parsePackageSpecifier('npm:lodash-es@4/debounce.js'), { name: 'lodash-es', version: '4', path: 'debounce.js' });
  assert.deepEqual(parsePackageSpecifier('@std/path@1.0.0/posix.js'), { name: '@std/path', version: '1.0.0', path: 'posix.js' });
  assert.deepEqual(parsePackageSpecifier('@scope/pkg'), { name: '@scope/pkg' });
  for (const s of ['./x.js', '/x.js', 'https://e.example/x.js', 'jsr:@std/path', '@scope', '']) {
    assert.equal(parsePackageSpecifier(s), null, s);
  }
});

test('toRouter / isRouter / chainRouters', async () => {
  assert.equal(isRouter({ resolve() {} }), true);
  assert.equal(isRouter(() => {}), false);
  const fn = toRouter((s) => (s === 'a' ? 'https://a.example/a.js' : null));
  assert.deepEqual(await fn.resolve('a'), { url: 'https://a.example/a.js' });
  assert.equal(await fn.resolve('b'), null);
  const chain = chainRouters(fn, (s) => ({ url: `https://b.example/${s}`, provider: 'b' }));
  assert.equal((await chain.resolve('a')).url, 'https://a.example/a.js');
  assert.equal((await chain.resolve('z')).provider, 'b');
  assert.throws(() => toRouter(42), TypeError);
});

test('basicRouter: pattern specificity, schemes, functions', async () => {
  const r = basicRouter({
    routes: {
      '*': 'https://esm.sh/',
      '@std/*': 'https://jsr.example/',
      'jsr:': (rest) => `https://jsr.example/${rest}/mod.js`,
      'react*': 'https://react-cdn.example',
      exact: 'https://exact.example/',
    },
  });
  assert.equal((await r.resolve('lit')).url, 'https://esm.sh/lit');
  assert.equal((await r.resolve('@std/path')).url, 'https://jsr.example/@std/path');
  assert.equal((await r.resolve('jsr:@std/fs')).url, 'https://jsr.example/@std/fs/mod.js');
  assert.equal((await r.resolve('react-dom')).url, 'https://react-cdn.example/react-dom');
  assert.equal((await r.resolve('exact')).route, 'exact');
  assert.equal(await r.resolve('./local.js'), null);
  assert.equal(await r.resolve('https://x.example/a.js'), null);
});

test('basicRouter: array form preserves order; ordered fallback with probe', async () => {
  const probed = [];
  const r = basicRouter({
    routes: [
      { match: '*', use: ['https://down.example/', 'https://up.example/', 'https://never.example/'] },
    ],
    probe: async (url) => {
      probed.push(url);
      return url.startsWith('https://up.');
    },
  });
  const res = await r.resolve('react');
  assert.equal(res.url, 'https://up.example/react');
  assert.deepEqual(probed, ['https://down.example/react', 'https://up.example/react']);
  const none = basicRouter({ routes: { '*': ['https://a.example/'] }, probe: () => false });
  await assert.rejects(none.resolve('x'), AggregateError);
  const unmatched = basicRouter({ routes: { '@x/*': 'https://x.example/' } });
  assert.equal(await unmatched.resolve('y'), null);
});

test('httpProbe uses HEAD and falls back to GET on 405', async () => {
  const calls = [];
  const probe = httpProbe({
    fetch: async (url, { method }) => {
      calls.push(method);
      return method === 'HEAD' ? { status: 405, ok: false } : { status: 200, ok: true };
    },
  });
  assert.equal(await probe('https://x.example/'), true);
  assert.deepEqual(calls, ['HEAD', 'GET']);
  const failing = httpProbe({ fetch: async () => { throw new Error('net'); } });
  assert.equal(await failing('https://x.example/'), false);
});

test('importMapRouter claims only mapped specifiers', async () => {
  const r = importMapRouter({ imports: { react: 'https://esm.sh/react@19' } });
  assert.deepEqual(await r.resolve('react', { referrer: 'https://app.example/' }), { url: 'https://esm.sh/react@19', provider: 'import-map' });
  assert.equal(await r.resolve('vue', { referrer: 'https://app.example/' }), null);
  assert.equal(await r.resolve('./x.js', { referrer: 'https://app.example/' }), null);
});

test('mportRouter with an injected MPortURL', async () => {
  const seen = [];
  const MPortURL = (opts) => {
    seen.push(['factory', opts]);
    return async (input) => {
      seen.push(['import', input]);
      return [{ ok: true }, `https://cdn.jsdelivr.net/npm/${input.name}@${input.version ?? 'latest'}/index.js`];
    };
  };
  const r = mportRouter({ MPortURL, mport: { cdns: ['cdn.jsdelivr.net/npm/'] } });
  const res = await r.resolve('@scope/pkg@2');
  assert.deepEqual(res, {
    url: 'https://cdn.jsdelivr.net/npm/@scope/pkg@2/index.js',
    provider: 'cdn.jsdelivr.net',
    type: 'js',
    module: { ok: true },
    version: '2',
  });
  assert.deepEqual(seen[0], ['factory', { cdns: ['cdn.jsdelivr.net/npm/'] }]);
  assert.deepEqual(seen[1], ['import', { name: '@scope/pkg', version: '2' }], 'object form keeps scoped names intact');
  assert.equal(await r.resolve('./x.js'), null);
  const filtered = mportRouter({ MPortURL, match: (s) => s.startsWith('npm:') });
  assert.equal(await filtered.resolve('react'), null);
});

test('mportRouter wraps CDN failures', async () => {
  const r = mportRouter({ MPortURL: () => async () => { throw new Error('all down'); } });
  await assert.rejects(r.resolve('react'), (err) => /mport could not load "react"/.test(err.message) && err.cause.message === 'all down');
});

test('mportRouter end-to-end with the real mport package (https imports served by a loader hook)', async () => {
  // Serve https://cdn.test/npm/... from memory so the real mport can race "CDNs" offline.
  const files = {
    'https://cdn.test/npm/demo-pkg@1.0.0/package.json': JSON.stringify({ main: './lib/main.js' }),
    'https://cdn.test/npm/demo-pkg@1.0.0/lib/main.js': 'export const answer = 42;',
    'https://cdn.test/npm/@demo/scoped@2.0.0/util.js': 'export default "scoped";',
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('https://cdn.test/')) return { url: specifier, shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith('https://cdn.test/')) {
        if (!(url in files)) throw new Error(`404 ${url}`);
        return { format: url.endsWith('.json') ? 'json' : 'module', source: files[url], shortCircuit: true };
      }
      return next(url, context);
    },
  });
  try {
    const r = mportRouter({ mport: { cdns: ['cdn.test/npm/'] } }); // uses real `import('mport')`
    const res = await r.resolve('demo-pkg@1.0.0');
    assert.equal(res.url, 'https://cdn.test/npm/demo-pkg@1.0.0/lib/main.js');
    assert.equal(res.provider, 'cdn.test');
    assert.equal(res.module.answer, 42);
    const scoped = await r.resolve('@demo/scoped@2.0.0/util.js');
    assert.equal(scoped.module.default, 'scoped');
    assert.equal(scoped.url, 'https://cdn.test/npm/@demo/scoped@2.0.0/util.js');
  } finally {
    hooks.deregister();
  }
});
