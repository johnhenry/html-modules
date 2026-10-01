// Data binding, proven in real engines (linkedom cannot upgrade elements in shadow roots, adopt sheets, or enforce
// Trusted Types): under a strict CSP, and in the examples page.
import { test, expect } from '@playwright/test';

test('strict CSP + Trusted Types: bindings and props work with no violations, javascript: URLs are refused', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/test/browser/fixtures/strict.html?csp=strict');
  await page.waitForFunction(() => window.__done === true);
  const r = await page.evaluate(() => ({ ...window.__strict, violations: window.__violations, clicked: window.__clicked }));
  // No directive reports anything: the module's <style> is parsed without a CSP-checked document (see parse.spec.js).
  expect(r.violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(r.text).toBe('Ada');
  expect(r.href, 'the javascript: href was refused').toBe(false);
  expect(r.color).toBe('rgb(1, 2, 3)');
  expect(r.sheets, 'styles adopted as a constructed sheet, not an inline <style>').toBe(1);
  expect(r.clicked).toBeUndefined();
  // Whether this engine enforces Trusted Types is reported, not assumed: where it does not, the page still works.
  test.info().annotations.push({ type: 'trusted-types', description: r.trustedTypes ? 'enforced' : 'unsupported in this engine' });
});

test('bound text is text: nothing in a value is parsed as markup, even with TT enforced', async ({ page }) => {
  await page.goto('/test/browser/fixtures/strict.html?csp=strict');
  await page.waitForFunction(() => window.__done === true);
  const html = await page.evaluate(() => {
    const g = document.getElementById('g');
    g.setAttribute('who', '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2<\/script>');
    return { shadow: g.shadowRoot.querySelector('b').innerHTML, pwn: window.__pwn };
  });
  expect(html.shadow).toContain('&lt;img');
  expect(html.pwn).toBeUndefined();
});
