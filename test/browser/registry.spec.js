// Scoped custom element registries, in real engines. Whether an engine has them is detected, never assumed:
// where it does, two versions of a library coexist; where it does not, the page says "unsupported" and imports with
// registry="scoped" fall back to the global registry with one console warning.
import { test, expect } from '@playwright/test';

const supports = (page) => page.evaluate(async () => (await import('/src/runtime.js')).supportsScopedRegistries(window));

test('two versions of a library with the same inner tag coexist (or the page reports it unsupported)', async ({ page }, info) => {
  await page.goto('/examples/scoped.html');
  await page.waitForSelector('.checks .status');
  const supported = await supports(page);
  info.annotations.push({ type: 'scoped-registries', description: supported ? 'supported' : 'unsupported in this engine' });
  expect(await page.$$eval('.checks .status.fail', (els) => els.length)).toBe(0);
  const states = await page.$$eval('.checks .status', (els) => els.map((e) => e.textContent));
  if (supported) {
    expect(new Set(states)).toEqual(new Set(['pass']));
    const glyphs = await page.evaluate(() => [...document.querySelectorAll('lib1--rating, lib2--rating')].map((el) => el.shadowRoot.querySelector('icon--star').shadowRoot.querySelector('[part=glyph]').textContent));
    expect(glyphs).toEqual(['★', '✦']);
  } else {
    expect(new Set(states)).toEqual(new Set(['unsupported here']));
  }
});

test('without registry="scoped" the second version conflicts on <icon--star>', async ({ page }) => {
  await page.route('**/components/scoped/**/lib.html', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/<html-import-settings registry="scoped"><\/html-import-settings>/, '') });
  });
  await page.goto('/test/browser/fixtures/strict.html');
  await page.waitForFunction(() => window.__done === true);
  const outcome = await page.evaluate(async () => {
    const { HTMLModules } = await import('/src/browser.js');
    await HTMLModules.import('/examples/components/scoped/v1/lib.html', { as: 'one' });
    try {
      await HTMLModules.import('/examples/components/scoped/v2/lib.html', { as: 'two' });
      return 'no error';
    } catch (error) {
      return error.message;
    }
  });
  expect(outcome).toMatch(/Cannot bind <icon--star>: it is already defined/);
});

test('registry="scoped" falls back to the global registry with one warning where scoped registries are unsupported', async ({ page }, info) => {
  await page.goto('/test/browser/fixtures/strict.html');
  await page.waitForFunction(() => window.__done !== undefined || document.getElementById('g')?.shadowRoot);
  if (await supports(page)) {
    info.annotations.push({ type: 'fallback', description: 'not exercised: this engine supports scoped registries' });
    return;
  }
  const warnings = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.evaluate(async () => {
    const { HTMLModules } = await import('/src/browser.js');
    await HTMLModules.import('/examples/components/scoped/v1/lib.html', { as: 'fb' });
    document.body.insertAdjacentHTML('beforeend', '<fb--rating></fb--rating>');
  });
  expect(warnings.filter((w) => /does not support scoped custom element registries/.test(w))).toHaveLength(1);
  expect(await page.evaluate(() => customElements.get('icon--star') !== undefined)).toBe(true);
});
