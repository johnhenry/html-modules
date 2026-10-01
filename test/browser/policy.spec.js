// Trusted Types under an enforced `require-trusted-types-for 'script'` CSP (served by scripts/test-server.js with
// ?csp=…). Whether an engine enforces Trusted Types is detected (`window.trustedTypes`), never assumed: where it does
// not, the same pages still work, and the spec says so.
import { test, expect } from '@playwright/test';

const TT = (names) => encodeURIComponent(`require-trusted-types-for 'script'; trusted-types ${names}`);
const hasTT = (page) => page.evaluate(() => Boolean(window.trustedTypes?.createPolicy));

test('the default policy: only "html-modules" is allowed, and the library works (it creates that one policy)', async ({ page }, info) => {
  await page.goto(`/test/browser/fixtures/strict.html?csp=${TT('html-modules')}`);
  await page.waitForFunction(() => window.__done === true);
  const tt = await hasTT(page);
  info.annotations.push({ type: 'trusted-types', description: tt ? 'enforced' : 'unsupported in this engine' });
  expect(await page.evaluate(() => window.__strict.text)).toBe('Ada');
  if (tt) {
    // The policy name is taken: a second copy of the library cannot create it, and falls back (documented).
    const again = await page.evaluate(() => { try { trustedTypes.createPolicy('html-modules', { createHTML: (s) => s }); return 'created'; } catch (e) { return e.name; } });
    expect(again, 'the library already created "html-modules" (no duplicates allowed)').toBe('TypeError');
  }
});

test('your own policy: createHTMLModules({ trustedTypes }) works when the CSP lists only your policy', async ({ page }, info) => {
  await page.goto(`/test/browser/fixtures/tt-custom.html?csp=${TT('my-policy')}`);
  await page.waitForFunction(() => window.__done === true);
  expect(await page.evaluate(() => window.__text)).toBe('TT');
  const sinks = await page.evaluate(() => window.__sinks.length);
  expect(sinks, 'the module parse and the template stamp both went through the page policy').toBeGreaterThanOrEqual(2);
  info.annotations.push({ type: 'trusted-types', description: (await page.evaluate(() => window.__tt)) ? 'enforced' : 'unsupported in this engine' });
});

test('with no allowed policy for the library, the failure is the browser\'s TypeError about TrustedHTML, not a silent success', async ({ page }) => {
  await page.goto(`/test/browser/fixtures/probe-tt.html?csp=${TT('some-other-policy')}`);
  await page.waitForFunction(() => window.__done === true);
  const result = await page.evaluate(() => window.__result);
  if (await hasTT(page)) expect(result).toMatch(/TrustedHTML|Trusted Type|trusted types/i);
  else expect(result).toBe('ok');
});
