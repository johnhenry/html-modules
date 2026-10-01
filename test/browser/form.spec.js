// Form-associated components in real engines: typing, FormData, validation, disabled fieldsets, reset and state restore.
// (linkedom has no ElementInternals or <form> association; test/form.test.js covers the logic with a fake.)
import { test, expect } from '@playwright/test';

const formData = (page) => page.evaluate(() => Object.fromEntries(new FormData(document.getElementById('form'))));

test.beforeEach(async ({ page }) => {
  await page.goto('/examples/forms.html');
  await page.waitForSelector('.checks .status');
});

test('typing into the component\'s control reaches FormData; a closed-root component participates', async ({ page }) => {
  await page.locator('#who input').fill('Grace');
  expect((await formData(page)).who).toBe('Grace');
  expect((await formData(page)).pin).toBe('1234');
  expect('locked' in (await formData(page))).toBe(false);
});

test('submit is blocked while a required component is invalid, and goes through once it is valid', async ({ page }) => {
  const submitted = await page.evaluate(() => {
    window.__submits = 0;
    document.getElementById('form').addEventListener('submit', () => window.__submits++);
    return 0;
  });
  expect(submitted).toBe(0);
  await page.locator('#stars').evaluate((el) => el.shadowRoot.querySelector('[data-n="4"]').click()); // clear the star requirement
  await page.locator('#who input').fill('');
  await page.getByRole('button', { name: 'Submit' }).click();
  expect(await page.evaluate(() => window.__submits), 'invalid: the browser blocked the submit').toBe(0);
  expect(await page.locator('#who').evaluate((el) => ({ invalid: el.matches(':invalid'), message: el.validationMessage }))).toMatchObject({ invalid: true });
  await page.locator('#who input').fill('Grace');
  await page.getByRole('button', { name: 'Submit' }).click();
  expect(await page.evaluate(() => window.__submits)).toBe(1);
});

test('reset restores defaults, including a typed value', async ({ page }) => {
  await page.locator('#who input').fill('Hopper');
  await page.locator('#stars').evaluate((el) => el.shadowRoot.querySelector('[data-n="2"]').click());
  expect(await formData(page)).toMatchObject({ who: 'Hopper', rating: '2' });
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForTimeout(50);
  expect(await formData(page)).toEqual({ who: 'Ada', pin: '1234' });
  expect(await page.locator('#who input').inputValue()).toBe('Ada');
});

test('form state is restored on history navigation (formStateRestoreCallback)', async ({ page }, info) => {
  await page.locator('#who input').fill('Restored');
  await page.locator('#stars').evaluate((el) => el.shadowRoot.querySelector('[data-n="3"]').click());
  await page.goto('/examples/index.html');
  await page.goBack();
  await page.waitForSelector('.checks .status');
  await page.waitForTimeout(200);
  const d = await formData(page);
  info.annotations.push({ type: 'state-restore', description: d.who === 'Restored' ? 'restored' : `not restored (${JSON.stringify(d)})` });
  expect(d).toMatchObject({ who: 'Restored', rating: '3' });
  expect(await page.$$eval('.checks .status.fail', (els) => els.length)).toBe(0);
});
