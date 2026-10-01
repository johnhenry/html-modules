// Constructable stylesheets and url() resolution, in real engines (linkedom has no constructable stylesheets, which
// is how "CSSStyleSheet baseURL is ignored" passed every unit test and failed in Chrome): relative url()s in a module's
// <style> resolve against the MODULE, not the page, and the sheet is one constructed object shared by every instance.
import { test, expect } from '@playwright/test';

test('relative url() in a module resolves against the module, in the sheet and on the wire', async ({ page }) => {
  const requested = [];
  page.on('request', (r) => { if (r.url().endsWith('.svg')) requested.push(new URL(r.url()).pathname); });
  await page.goto('/test/browser/fixtures/styles.html');
  await page.waitForFunction(() => document.getElementById('a')?.shadowRoot?.querySelector('span'));
  const info = await page.evaluate(() => {
    const [a, b] = ['a', 'b'].map((id) => document.getElementById(id));
    const [sheet] = a.shadowRoot.adoptedStyleSheets;
    return {
      sheets: [a, b].map((el) => el.shadowRoot.adoptedStyleSheets.length),
      shared: a.shadowRoot.adoptedStyleSheets[0] === b.shadowRoot.adoptedStyleSheets[0],
      constructed: sheet instanceof CSSStyleSheet,
      urls: [...sheet.cssRules].map((r) => r.cssText.match(/url\("?([^")]+)"?\)/)?.[1]),
      color: getComputedStyle(a).color,
      bg: getComputedStyle(a).backgroundImage,
    };
  });
  expect(info.sheets).toEqual([1, 1]);
  expect(info.shared, 'one constructed sheet per definition, shared by every instance').toBe(true);
  expect(info.constructed).toBe(true);
  expect(info.color).toBe('rgb(10, 20, 30)');
  const origin = new URL(page.url()).origin;
  const resolved = info.urls.map((u) => (u.startsWith('data:') ? 'data' : new URL(u, origin).pathname));
  expect(resolved).toEqual([
    '/test/browser/fixtures/sub/pixel.svg', // ./pixel.svg next to sub/styled.html, not next to the page
    '/test/browser/fixtures/up.svg',        // ../up.svg
    '/test/browser/fixtures/root.svg',      // /root-relative: the module's origin
    'data',                                 // left alone
  ]);
  expect(info.bg).toContain('/test/browser/fixtures/sub/pixel.svg');
  expect(requested, 'the browser fetched the module-relative URL, never a page-relative one').toContain('/test/browser/fixtures/sub/pixel.svg');
  expect(requested.filter((p) => p === '/test/browser/fixtures/pixel.svg')).toEqual([]);
});

test('a strict style-src: constructed sheets apply with no inline <style> (CSP-safe), unlike the fallback', async ({ page }) => {
  await page.goto('/test/browser/fixtures/strict.html?csp=strict');
  await page.waitForFunction(() => window.__done === true);
  expect(await page.evaluate(() => window.__strict.color)).toBe('rgb(1, 2, 3)');
  expect(await page.evaluate(() => document.getElementById('g').shadowRoot.querySelectorAll('style').length)).toBe(0);
});
