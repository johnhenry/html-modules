// The safe-fragment adapter, over a stand-in for @johnhenry/safe-fragment (this package does not depend on it).
// The real library runs through it in the browsers: test/browser/sanitize.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeFragmentSanitizer, registerTemplateProfile } from '../src/safe-fragment.js';
import { setup } from './helpers.js';

/** A stand-in with the surface the adapter uses: profiles by name, and sanitizeToFragment(). */
function fakeLibrary({ report = {}, strip = (h) => h } = {}) {
  const profiles = new Map([
    ['ui-v1', { name: 'ui-v1', version: 1, mode: 'html', elements: { div: ['id', 'class'], a: ['href', 'class'] }, urlAttributes: ['href'], urlSchemes: ['relative', 'https:'], allowedDataAttributes: ['data-action'], allowStyleAttribute: false, customElements: [], blockRelativeAutoLoadUrls: false }],
    ['plain-text-v1', { name: 'plain-text-v1', version: 1, mode: 'text', elements: {} }],
  ]);
  const lib = {
    profiles,
    calls: [],
    getProfile: (name) => profiles.get(name),
    deriveProfile: (base, overrides) => ({ ...base, ...overrides }),
    registerProfile: (profile) => { profiles.set(profile.name, profile); return profile; },
    async sanitizeToFragment(html, options) {
      lib.calls.push({ html, options });
      const t = options.document.createElement('template');
      t.innerHTML = strip(html);
      return { fragment: t.content, report: { profile: options.profile, engine: 'native', removedElements: [], removedAttributes: [], rewrittenUrls: [], ...report } };
    },
  };
  return lib;
}

test('registerTemplateProfile derives a profile with <slot>, part and slot, and namespaced custom elements', () => {
  const lib = fakeLibrary();
  const name = registerTemplateProfile(lib, { namespaces: ['ui', 'x'], attributes: ['tone'], dataAttributes: ['data-id'] });
  assert.equal(name, 'html-modules-ui-v1');
  const profile = lib.profiles.get(name);
  assert.deepEqual(profile.elements.slot, ['name']);
  assert.deepEqual(profile.elements.div, ['id', 'class', 'part', 'slot'], 'everything the base kept, plus composition attributes');
  assert.deepEqual(profile.customElements.map((c) => c.tag), ['ui--*', 'x--*']);
  assert.ok(profile.customElements[0].attributes.includes('tone') && profile.customElements[0].attributes.includes('part') && profile.customElements[0].attributes.includes('exportparts'));
  assert.deepEqual(profile.allowedDataAttributes, ['data-action', 'data-id']);
  assert.equal(registerTemplateProfile(lib, { namespaces: ['other'] }), name, 'registering the same name again is a no-op: the first registration stands');
  assert.equal(lib.profiles.get(name).customElements.length, 2);
  assert.equal(registerTemplateProfile(lib, { name: 'mine-v1', delimiter: '-', namespaces: ['ui'] }), 'mine-v1');
  assert.equal(lib.profiles.get('mine-v1').customElements[0].tag, 'ui-*');
});

test('registerTemplateProfile refuses what cannot work', () => {
  assert.throws(() => registerTemplateProfile({}), /pass the @johnhenry\/safe-fragment module/);
  assert.throws(() => registerTemplateProfile(fakeLibrary(), { base: 'nope-v1' }), /no profile named "nope-v1"/);
  assert.throws(() => registerTemplateProfile(fakeLibrary(), { base: 'plain-text-v1' }), /does not parse markup/);
});

test('safeFragmentSanitizer returns the profile-conformant fragment, with the profile and the window\'s document', async () => {
  const lib = fakeLibrary({ strip: (h) => h.replace(/<script>.*?<\/script>/g, '') });
  const { modules, window } = setup({
    files: { 'ui.html': '<html-export name="card"><template><p>a</p><script>x()</script></template></html-export>' },
    sanitize: safeFragmentSanitizer({ safeFragment: lib, profile: 'ui-v1' }),
  });
  const ns = await modules.load('./ui.html');
  assert.equal(ns.card.template.nodeType, 11);
  assert.equal(lib.calls.length, 1);
  assert.equal(lib.calls[0].options.profile, 'ui-v1');
  assert.equal(lib.calls[0].options.document, window.document, 'the document of the window the module is loaded for');
  assert.match(lib.calls[0].html, /<script>/, 'it receives the raw template');
  await modules.import('./ui.html', { as: 'ui' });
  const el = window.document.createElement('ui--card');
  window.document.body.append(el);
  assert.equal(el.shadowRoot.innerHTML, '<p>a</p>');
});

test('an object profile is registered on first use, once', async () => {
  const lib = fakeLibrary();
  const sanitize = safeFragmentSanitizer({ safeFragment: lib, profile: { namespaces: ['ui'] } });
  const { modules } = setup({ files: { 'a.html': '<html-export name="a"><template>a</template></html-export>', 'b.html': '<html-export name="b"><template>b</template></html-export>' } });
  assert.equal(lib.profiles.has('html-modules-ui-v1'), false, 'nothing is registered until the first template');
  await modules.load('./a.html', { sanitize });
  await modules.load('./b.html', { sanitize });
  assert.equal(lib.calls.map((c) => c.options.profile).join(), 'html-modules-ui-v1,html-modules-ui-v1');
  assert.equal([...lib.profiles.keys()].filter((k) => k.startsWith('html-modules')).length, 1);
});

test('what the profile removed is announced as a sanitize event, with the engine\'s own artefacts left out', async () => {
  const report = {
    engine: 'dompurify',
    removedElements: [
      { tag: 'remove', reason: 'removed-by-engine:dompurify' }, { tag: 'body', reason: 'removed-by-engine:dompurify' },
      { tag: 'iframe', reason: 'removed-by-engine:dompurify' }, { tag: 'body', reason: 'element-not-in-profile' },
    ],
    removedAttributes: [{ tag: 'img', attribute: 'onerror', reason: 'removed-by-engine:dompurify', snippet: 'x()' }],
    rewrittenUrls: [{ tag: 'a', attribute: 'href', reason: 'disallowed-url-scheme:javascript:', snippet: 'javascript:x()' }],
  };
  const reports = [];
  const { modules, events } = setup({
    files: { 'ui.html': '<html-export name="card"><template>a</template></html-export>' },
    sanitize: safeFragmentSanitizer({ safeFragment: fakeLibrary({ report }), profile: 'ui-v1', onReport: (r, ctx) => reports.push([r, ctx.def.name, ctx.url]) }),
  });
  await modules.load('./ui.html');
  const [event] = events.filter((e) => e.type === 'sanitize');
  assert.equal(event.name, 'card');
  assert.equal(event.url, 'http://modules.test/ui.html');
  assert.deepEqual(event.details, {
    profile: 'ui-v1',
    engine: 'dompurify',
    removed: [
      { what: 'element', tag: 'iframe', reason: 'removed-by-engine:dompurify' },
      { what: 'element', tag: 'body', reason: 'element-not-in-profile' },
      { what: 'attribute', tag: 'img', attribute: 'onerror', reason: 'removed-by-engine:dompurify', snippet: 'x()' },
      { what: 'url', tag: 'a', attribute: 'href', reason: 'disallowed-url-scheme:javascript:', snippet: 'javascript:x()' },
    ],
  });
  assert.equal(reports.length, 1);
  assert.equal(reports[0][0].removedElements, report.removedElements, 'onReport gets the whole report');
  assert.deepEqual(reports[0].slice(1), ['card', 'http://modules.test/ui.html']);
});

test('nothing removed, nothing announced; quiet silences the event but not onReport', async () => {
  const files = { 'ui.html': '<html-export name="card"><template>a</template></html-export>' };
  const clean = setup({ files, sanitize: safeFragmentSanitizer({ safeFragment: fakeLibrary(), profile: 'ui-v1' }) });
  await clean.modules.load('./ui.html');
  assert.equal(clean.events.some((e) => e.type === 'sanitize'), false);
  const seen = [];
  const quiet = setup({
    files,
    sanitize: safeFragmentSanitizer({ safeFragment: fakeLibrary({ report: { removedElements: [{ tag: 'iframe', reason: 'r' }] } }), profile: 'ui-v1', quiet: true, onReport: (r) => seen.push(r) }),
  });
  await quiet.modules.load('./ui.html');
  assert.equal(quiet.events.some((e) => e.type === 'sanitize'), false);
  assert.equal(seen.length, 1);
});

test('extra sanitizeToFragment options pass through; a failing sanitizer fails the load closed', async () => {
  const lib = fakeLibrary();
  const files = { 'ui.html': '<html-export name="card"><template>a</template></html-export>' };
  const { modules } = setup({ files, sanitize: safeFragmentSanitizer({ safeFragment: lib, profile: 'ui-v1', sanitizeOptions: { maxInputLength: 10, baseUrl: 'https://page.test/' } }) });
  await modules.load('./ui.html');
  assert.equal(lib.calls[0].options.maxInputLength, 10);
  assert.equal(lib.calls[0].options.baseUrl, 'https://page.test/');
  lib.sanitizeToFragment = async () => { throw Object.assign(new Error('SOURCE_TOO_LARGE'), { code: 'SOURCE_TOO_LARGE' }); };
  const fresh = setup({ files, sanitize: safeFragmentSanitizer({ safeFragment: lib, profile: 'ui-v1' }) });
  await assert.rejects(fresh.modules.load('./ui.html'), /SOURCE_TOO_LARGE/);
  await assert.rejects(fresh.modules.load('./ui.html'), /SOURCE_TOO_LARGE/, 'and it is not cached');
});

test('option errors are named', async () => {
  assert.throws(() => safeFragmentSanitizer(), /pass \{ profile \}/);
  assert.throws(() => safeFragmentSanitizer({ profile: '' }), /pass \{ profile \}/);
  const files = { 'ui.html': '<html-export name="card"><template>a</template></html-export>' };
  const { modules } = setup({ files, sanitize: safeFragmentSanitizer({ safeFragment: {}, profile: 'ui-v1' }) });
  await assert.rejects(modules.load('./ui.html'), /has no sanitizeToFragment\(\)/);
});
