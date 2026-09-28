import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mport from 'mport';
import {
  basicRouter, importMapRouter, chainRouters, toRouter, isRouter,
  fromMport, isMportRouter, isPackageSpecifier, mportRouter,
} from '../src/routers/index.js';
import { compileImportMap } from '../src/index.js';
import { fakeFetch, registry } from './helpers.js';

const { createRouter, esmSh, jsDelivr, unpkg, jsr, fallback, race, custom } = mport;

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

test('basicRouter: array form keeps order and passes the context; probing moved to mport', async () => {
  const r = basicRouter({
    routes: [
      { match: '@tokens', use: (rest, { referrer } = {}) => (referrer?.includes('/legacy/') ? '/v1.html' : '/v2.html') },
      { match: '*', use: ['https://only.example/'] },
    ],
  });
  assert.equal((await r.resolve('@tokens')).url, '/v2.html');
  assert.equal((await r.resolve('@tokens', { referrer: 'https://app.example/legacy/' })).url, '/v1.html');
  assert.equal((await r.resolve('x')).url, 'https://only.example/x');
  assert.throws(() => basicRouter({ routes: { '*': ['https://a.example/', 'https://b.example/'] } }), /no longer probes or falls back.*fallback\(custom/);
  assert.throws(() => basicRouter({ routes: { '*': 'https://a.example/' }, probe: () => true }), /no longer probes/);
  const unmatched = basicRouter({ routes: { '@x/*': 'https://x.example/' } });
  assert.equal(await unmatched.resolve('y'), null);
});

test('importMapRouter claims only mapped specifiers', async () => {
  const r = importMapRouter({ imports: { react: 'https://esm.sh/react@19' } });
  assert.deepEqual(await r.resolve('react', { referrer: 'https://app.example/' }), { url: 'https://esm.sh/react@19', provider: 'import-map' });
  assert.equal(await r.resolve('vue', { referrer: 'https://app.example/' }), null);
  assert.equal(await r.resolve('./x.js', { referrer: 'https://app.example/' }), null);
});

test('isPackageSpecifier / isMportRouter', () => {
  for (const s of ['react', 'react@^19/jsx-runtime', '@scope/pkg@1', 'npm:lodash-es@4', 'jsr:@std/path@^1', 'github:user/repo@v1/a.js', 'gh:user/repo']) {
    assert.equal(isPackageSpecifier(s), true, s);
  }
  for (const s of ['./x.js', '../x.js', '/x.js', 'https://e.example/x.js', 'partial:card', 'node:fs', 'data:text/javascript,', '']) {
    assert.equal(isPackageSpecifier(s), false, s);
  }
  assert.equal(isMportRouter(createRouter({ '*': esmSh() })), true);
  assert.equal(isMportRouter({ resolve() {} }), false);
  assert.throws(() => fromMport({ resolve() {} }), /expects a router from mport v2/);
});

test('fromMport: resolves npm:, jsr: and bare specifiers with mport, passing the trace through', async () => {
  const fetch = fakeFetch({ ...registry, 'https://esm.sh/*': 200 });
  const router = fromMport(createRouter({ '*': esmSh(), '@std/*': jsr() }, { fetch }));
  assert.equal(router.name, 'mport');
  assert.ok(isMportRouter(router.mport));

  const react = await router.resolve('npm:react@^19');
  assert.equal(react.url, 'https://esm.sh/react@19.2.0');
  assert.equal(react.provider, 'esm.sh');
  assert.equal(react.version, '19.2.0');
  assert.equal(react.build, 'esm.sh');
  assert.equal(react.key, 'npm:react');
  assert.equal(react.type, undefined, 'no type unless mport evaluated the module');
  assert.deepEqual(react.trace.map((e) => e.type), ['lookup', 'resolved', 'probe', 'ok']);

  const path = await router.resolve('jsr:@std/path@^1');
  assert.equal(path.url, 'https://esm.sh/jsr/@std/path@1.1.0', 'yanked 1.2.0 is skipped');
  assert.equal(path.registry, 'jsr');
  assert.equal((await router.resolve('@std/path')).registry, 'jsr', 'a bare scoped name reaching jsr() is a JSR package');

  for (const s of ['./x.js', 'https://cdn.example/x.js', 'partial:card']) assert.equal(await router.resolve(s), null, s);
  assert.ok(fetch.log.every((r) => !r.url.includes('partial')), 'unknown schemes never reach mport');
});

test('fromMport: signal, onEvent, match, type and resolveOptions', async () => {
  const fetch = fakeFetch({ ...registry, 'https://slow.example/*': 200, 'https://esm.sh/*': 200 }, { delays: { 'https://slow.example/': 1000 } });
  const slow = custom('https://slow.example/{name}@{version}/{path}', { name: 'slow' });
  const router = createRouter({ '*': fallback(slow, esmSh()) }, { fetch });

  const ac = new AbortController();
  const seen = [];
  const pending = fromMport(router).resolve('react@19.2.0', { signal: ac.signal, onEvent: (e) => seen.push(`${e.type}:${e.provider}`) });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(pending, (e) => e.name === 'AbortError');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(seen, ['probe:slow', 'aborted:slow'], 'the signal reached mport, which aborted the probe');

  const events = [];
  const onlyNpm = fromMport(router, { match: (s) => s.startsWith('npm:'), resolveOptions: { exclude: ['slow'] }, onEvent: (e) => events.push(e) });
  assert.equal(await onlyNpm.resolve('react'), null);
  const res = await onlyNpm.resolve('npm:react@19.2.0');
  assert.equal(res.provider, 'esm.sh', 'resolveOptions reach mport (slow is excluded)');
  assert.deepEqual(events.map((e) => `${e.type}:${e.provider}`), ['skip:slow', 'probe:esm.sh', 'ok:esm.sh']);
  const perCall = [];
  await onlyNpm.resolve('npm:react@19.2.0', { onEvent: (e) => perCall.push(e.type) });
  assert.deepEqual(perCall, ['skip', 'probe', 'ok'], 'a per-call onEvent wins');

  const imported = [];
  const evaluating = fromMport(createRouter({ '*': esmSh() }, { fetch, probe: 'import', importer: async (url) => (imported.push(url), { url }) }));
  const mod = await evaluating.resolve('lit@3.3.1');
  assert.equal(mod.type, 'js');
  assert.deepEqual(mod.module, { url: 'https://esm.sh/lit@3.3.1' });
  assert.equal((await fromMport(router, { type: 'html', resolveOptions: { exclude: ['slow'] } }).resolve('react@19.2.0')).type, 'html');
});

test('fromMport: failures carry the trace; health is shared with the mport router', async () => {
  const fetch = fakeFetch({ ...registry, 'https://esm.sh/*': 503, 'https://cdn.jsdelivr.net/*': 503 });
  const router = createRouter({ '*': race(esmSh(), jsDelivr({ esm: true })) }, { fetch, circuitBreaker: { failures: 1, reset: '1m' } });
  const wmg = fromMport(router);
  await assert.rejects(wmg.resolve('react@19.2.0'), (e) => e instanceof mport.RoutingError && e.trace.filter((t) => t.type === 'fail').length === 2);
  assert.equal(router.health.isOpen('esm.sh'), true);
  await assert.rejects(wmg.resolve('react@19.2.0'), (e) => e.trace.every((t) => t.type === 'skip' && t.reason === 'circuit open'));
});

test('compileImportMap over fromMport matches mport router.build(), and its lock pins a new router', async () => {
  const fetch = fakeFetch({ ...registry, 'https://esm.sh/*': 200 });
  const routes = { '*': esmSh(), '@std/*': jsr() };
  const specs = ['react@^19', 'lit/', 'jsr:@std/path@^1'];
  const scopes = { 'https://legacy.example/': { react: 'react@18' } };
  const built = await createRouter(routes, { fetch }).build(specs, { scopes });
  const ours = await compileImportMap(fromMport(createRouter(routes, { fetch })), specs, { scopes });
  assert.deepEqual(ours.importMap, built.importMap);
  assert.deepEqual(ours.lock, built.lock);
  assert.deepEqual(ours.importMap, mport.compileImportMap(
    await Promise.all(specs.map((s) => createRouter(routes, { fetch }).resolve(s))),
    { 'https://legacy.example/': [{ ...(await createRouter(routes, { fetch }).resolve('react@18')), key: 'react' }] },
  ));

  const before = fetch.log.length;
  const pinned = fromMport(createRouter(routes, { fetch, lock: ours.lock }));
  const r = await pinned.resolve('react@^19');
  assert.equal(r.version, '19.2.0');
  assert.ok(!r.trace.some((e) => e.type === 'lookup'), 'no registry lookup for a locked specifier');
  assert.ok(fetch.log.slice(before).every((q) => !q.url.startsWith('https://registry.npmjs.org/')));
});

test('mportRouter (deprecated) builds and wraps an mport v2 router', async () => {
  const fetch = fakeFetch({ ...registry, 'https://unpkg.com/*': 200 });
  const r = mportRouter({ module: mport, routes: { '*': unpkg() }, fetch, probe: 'head' });
  assert.equal(await r.resolve('./x.js'), null);
  const res = await r.resolve('@scope/pkg@^1/dist/pkg.mjs');
  assert.equal(res.url, 'https://unpkg.com/@scope/pkg@1.2.3/dist/pkg.mjs');
  const imported = [];
  const defaults = mportRouter({ module: mport, fetch: fakeFetch({ ...registry, 'https://esm.sh/*': 200 }), importer: async (u) => (imported.push(u), { ok: true }) });
  const lit = await defaults.resolve('lit');
  assert.equal(lit.provider, 'esm.sh', 'defaults to esm.sh, then jsDelivr, then unpkg');
  assert.deepEqual(lit.module, { ok: true }, 'defaults to probe: "import"');
  assert.equal(lit.type, 'js');
});

test('mportRouter (deprecated) 1.x form with an injected MPortURL', async () => {
  const seen = [];
  const MPortURL = (opts) => {
    seen.push(['factory', opts]);
    return async (input) => {
      seen.push(['import', input]);
      return [{ ok: true }, `https://cdn.jsdelivr.net/npm/${input}/index.js`, { version: '2', trace: [] }];
    };
  };
  const r = mportRouter({ MPortURL, mport: { cdns: ['cdn.jsdelivr.net/npm/'] } });
  const res = await r.resolve('npm:@scope/pkg@2');
  assert.deepEqual(res, { url: 'https://cdn.jsdelivr.net/npm/@scope/pkg@2/index.js', provider: 'cdn.jsdelivr.net', type: 'js', module: { ok: true }, version: '2', trace: [] });
  assert.deepEqual(seen, [['factory', { cdns: ['cdn.jsdelivr.net/npm/'] }], ['import', '@scope/pkg@2']]);
  assert.equal(await r.resolve('./x.js'), null);
  assert.equal(await r.resolve('jsr:@std/path'), null, 'the 1.x API has no JSR support');
  const failing = mportRouter({ MPortURL: () => async () => { throw new Error('all down'); } });
  await assert.rejects(failing.resolve('react'), (err) => /mport could not load "react"/.test(err.message) && err.cause.message === 'all down');
});
