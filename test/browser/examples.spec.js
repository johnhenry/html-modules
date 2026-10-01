// Every examples/*.html page, on every engine: each renders pass/fail checks; none may fail, and nothing may log an
// error. A feature an engine lacks must be reported by the page as "unsupported" (`.status.unsupported`), not as a
// failure. Only the pass/fail lists (`ul.checks`) count: other `.status` badges are informational.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pages } from '../../examples/shared/catalog.js';

const reportsChecks = (href) => /renderChecks\(/.test(readFileSync(new URL(`../../examples/${href}`, import.meta.url), 'utf8'));

for (const page of [{ id: 'index', href: 'index.html' }, ...pages]) {
  test(`examples/${page.href}: every check passes, no console errors`, async ({ page: p }) => {
    const problems = [];
    p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
    p.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    await p.goto(`/examples/${page.href}`, { waitUntil: 'load' });
    // Pages settle asynchronously (loads, lazy imports, timers): wait until no check is pending, then until the network
    // is idle (a late lazy import or fetch would still be in flight), instead of a fixed sleep.
    if (reportsChecks(page.href)) await p.waitForSelector('.checks .status', { timeout: 30_000 });
    await p.waitForFunction(() => !document.querySelector('.checks .status.pending'), null, { timeout: 30_000 });
    await p.waitForLoadState('networkidle');
    const failed = await p.$$eval('.checks .status.fail', (els) => els.map((e) => e.parentElement?.textContent?.trim()));
    expect(failed, 'failed checks').toEqual([]);
    const reported = await p.$$eval('.checks .status.pass, .checks .status.unsupported', (els) => els.length);
    if (reportsChecks(page.href)) expect(reported, 'the page renders checks').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
}
