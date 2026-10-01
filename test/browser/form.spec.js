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

test('form state is restored on history navigation (formStateRestoreCallback), wherever the browser restores it at all', async ({ page }, info) => {
  await page.locator('#who input').fill('Restored');
  await page.locator('#stars').evaluate((el) => el.shadowRoot.querySelector('[data-n="3"]').click());
  await page.locator('#plain').evaluate((el) => { el.value = 'plain-kept'; }); // the control experiment: no html-modules
  await page.goto('/examples/index.html');
  await page.goBack();
  await page.waitForSelector('.checks .status');
  await page.waitForTimeout(200);
  const browserRestores = (await page.locator('#plain').evaluate((el) => el.value)) === 'plain-kept';
  const d = await formData(page);
  info.annotations.push({ type: 'state-restore', description: browserRestores ? `restored ${JSON.stringify(d)}` : 'this engine did not restore even a plain form-associated custom element in an automated back navigation' });
  if (browserRestores) {
    expect(d).toMatchObject({ who: 'Restored', rating: '3', plain: 'plain-kept' });
    expect(new Set(await page.$$eval('.checks .status', (els) => els.map((e) => e.textContent)))).toEqual(new Set(['pass']));
  } else {
    // Nothing for html-modules to restore: the page reports its restore checks as unsupported, not failed.
    expect(await page.$$eval('.checks .status.fail', (els) => els.length)).toBe(0);
    expect(await page.$$eval('.checks .status.unsupported', (els) => els.length)).toBeGreaterThan(0);
  }
});

test('a form-control component delegates focus, so validating the form can focus the invalid control', async ({ page }) => {
  // regression: Firefox logged "The invalid form control with name='note' is not focusable" and focused nothing,
  // because the host of a form-control component was not focusable (found by the workbench app)
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const result = await page.evaluate(async () => {
    await HTMLModules.import('./components/fields.html', { as: 'nf', bindings: [{ export: 'note-field' }] });
    const form = document.createElement('form');
    const field = document.createElement('nf--note-field');
    field.setAttribute('name', 'note');
    field.setAttribute('required', '');
    form.append(field);
    document.body.append(form);
    const valid = form.requestSubmit() === undefined && form.reportValidity();
    return { delegates: field.shadowRoot.delegatesFocus, valid, focusOnHost: document.activeElement === field, focusOnInput: field.shadowRoot.activeElement?.localName ?? null };
  });
  expect(result.delegates).toBe(true);
  expect(result.valid).toBe(false);
  expect(result.focusOnHost).toBe(true);
  expect(result.focusOnInput).toBe('input');
  expect(errors).toEqual([]);
});

// ---- implicit submission and button components (form-role) ----------------------------------------------------------
// Components of examples/components/fields.html: ff--text-field (form-control="input"), ff--submit-button and
// ff--reset-button (form-role). `build()` makes a throwaway form of them on the page and counts its submit events.
const build = (page, markup, { prevent = true } = {}) => page.evaluate(({ markup, prevent }) => {
  document.getElementById('scratch')?.remove();
  const holder = document.createElement('div');
  holder.id = 'scratch';
  holder.innerHTML = `<form id="scratch-form">${markup}</form>`;
  document.body.append(holder);
  const form = holder.firstElementChild;
  window.__events = [];
  form.addEventListener('submit', (e) => {
    window.__events.push(`submit:${e.submitter ? (e.submitter.id || e.submitter.localName) : 'none'}`);
    if (prevent) e.preventDefault();
  });
  form.addEventListener('reset', () => window.__events.push('reset'));
  return true;
}, { markup, prevent });
const events = (page) => page.evaluate(() => window.__events);

test('Enter in a form-control input submits a form that has no button (one blocking field), and not one with two', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field>');
  await page.locator('#a input').press('Enter');
  expect(await events(page), 'one submit, from implicit submission (no double submission from the engine)').toEqual(['submit:none']);
  await build(page, '<ff--text-field id="a" name="a">A</ff--text-field><ff--text-field id="b" name="b">B</ff--text-field>');
  await page.locator('#a input').press('Enter');
  expect(await events(page), 'two fields that block implicit submission, no button: nothing').toEqual([]);
  // a native text input counts too
  await build(page, '<ff--text-field id="a" name="a">A</ff--text-field><input name="n">');
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual([]);
});

test('implicit submission is validated like a native one: an invalid required component blocks it', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" required>A</ff--text-field>');
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual([]);
  await page.locator('#a input').fill('ok');
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual(['submit:none']);
});

test('the form\'s default button is activated by Enter, native or component, whichever is first in tree order; a disabled one blocks it', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><ff--text-field id="b" name="b">B</ff--text-field><ff--submit-button id="sgo">Go</ff--submit-button>');
  await page.locator('#a input').press('Enter');
  expect(await events(page), 'two fields but a default button: the component submits, with itself as submitter').toEqual(['submit:sgo']);
  await page.locator('#sgo').evaluate((el) => el.setAttribute('disabled', ''));
  await page.locator('#a input').press('Enter');
  expect(await events(page), 'a disabled default button: nothing happens').toEqual(['submit:sgo']);
  await page.locator('#sgo').evaluate((el) => el.removeAttribute('disabled'));
  // a native submit button before the component is the default button: the engine's own submission does the work
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><button id="native" type="submit">N</button><ff--submit-button id="sgo">Go</ff--submit-button>');
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual(['submit:native']);
  // a disabled fieldset disables the component button too
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><fieldset disabled><ff--submit-button id="sgo">Go</ff--submit-button></fieldset>');
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual([]);
});

test('a submit button component: click, Enter and Space submit (once each), with the component as submitter and no value of its own in FormData', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><ff--submit-button id="sgo" name="intent" value="save">Go</ff--submit-button>');
  expect(await page.locator('#sgo').evaluate((el) => ({ type: el.type, tabindex: el.getAttribute('tabindex'), form: el.form?.id, data: Object.fromEntries(new FormData(el.form)) })))
    .toEqual({ type: 'submit', tabindex: '0', form: 'scratch-form', data: { a: 'x' } });
  await page.locator('#sgo').click();
  expect(await events(page)).toEqual(['submit:sgo']);
  await page.locator('#sgo').focus();
  await page.keyboard.press('Enter');
  expect(await events(page)).toEqual(['submit:sgo', 'submit:sgo']);
  await page.keyboard.press(' ');
  expect(await events(page)).toEqual(['submit:sgo', 'submit:sgo', 'submit:sgo']);
  await page.keyboard.down(' ');
  expect(await events(page), 'Space activates on keyup, not keydown').toHaveLength(3);
  await page.keyboard.up(' ');
  expect(await events(page)).toHaveLength(4);
  // Tab reaches it from the field
  await page.locator('#a input').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('sgo');
});

test('script can submit and activate: form.requestSubmit() fires submit with no submitter, button.click() with the component', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><ff--submit-button id="sgo">Go</ff--submit-button>');
  await page.evaluate(() => document.getElementById('scratch-form').requestSubmit());
  expect(await events(page)).toEqual(['submit:none']);
  await page.evaluate(() => document.getElementById('sgo').click());
  expect(await events(page)).toEqual(['submit:none', 'submit:sgo']);
  const thrown = await page.evaluate(() => { try { document.getElementById('scratch-form').requestSubmit(document.getElementById('sgo')); return 'ok'; } catch (e) { return e.name; } });
  expect(thrown, 'the platform refuses a custom element as requestSubmit()\'s submitter: that is why form-role exists').toBe('TypeError');
});

test('a button component validates first, honours novalidate / formnovalidate, and a click listener can cancel it', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" required>A</ff--text-field><ff--submit-button id="sgo">Go</ff--submit-button>');
  await page.locator('#sgo').click();
  expect(await events(page), 'invalid: blocked by validation').toEqual([]);
  await page.locator('#sgo').evaluate((el) => el.setAttribute('formnovalidate', ''));
  await page.locator('#sgo').click();
  expect(await events(page)).toEqual(['submit:sgo']);
  await page.locator('#sgo').evaluate((el) => { el.removeAttribute('formnovalidate'); el.form.noValidate = true; });
  await page.locator('#sgo').click();
  expect(await events(page)).toEqual(['submit:sgo', 'submit:sgo']);
  // an author's click listener (added after the component's) cancels the submission, as it would a native button's
  await page.locator('#sgo').evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('#sgo').click();
  expect(await events(page)).toEqual(['submit:sgo', 'submit:sgo']);
});

test('a form\'s own keydown handler can still block implicit submission (the key\'s default action is decided after dispatch)', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field>');
  await page.evaluate(() => document.getElementById('scratch-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); }));
  await page.locator('#a input').press('Enter');
  expect(await events(page)).toEqual([]);
});

test('a reset button component resets the form (click and keyboard), without being a field', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><ff--reset-button id="sclear">Clear</ff--reset-button>');
  await page.locator('#a input').fill('typed');
  await page.locator('#sclear').click();
  expect(await events(page)).toEqual(['reset']);
  expect(await page.locator('#a input').inputValue()).toBe('x');
  await page.locator('#a input').fill('again');
  await page.locator('#sclear').focus();
  await page.keyboard.press('Enter');
  expect(await page.locator('#a input').inputValue()).toBe('x');
  expect(await page.locator('#sclear').evaluate((el) => el.type)).toBe('reset');
});

test('an uncancelled submit from a button component really submits the form (a GET with the fields, none from the button)', async ({ page }) => {
  await build(page, '<ff--text-field id="a" name="who" value="Ada">A</ff--text-field><ff--submit-button id="sgo" name="intent" value="save">Go</ff--submit-button>', { prevent: false });
  await page.evaluate(() => { const f = document.getElementById('scratch-form'); f.action = '/package.json'; f.method = 'get'; });
  const request = page.waitForRequest((r) => r.url().includes('/package.json?'));
  await page.locator('#sgo').click();
  const url = new URL((await request).url());
  expect(Object.fromEntries(url.searchParams)).toEqual({ who: 'Ada' });
});

test('a button component with a native <button> in its template: that button\'s own click and keys work, once', async ({ page }) => {
  await page.evaluate(async () => {
    const { defineHTMLComponent } = await import('/src/index.js');
    defineHTMLComponent({ name: 'inner-go', template: '<button type="button">Go</button>', formAssociated: true, formRole: 'submit' }).define('inner-go');
  });
  await build(page, '<ff--text-field id="a" name="a" value="x">A</ff--text-field><inner-go id="sgo"></inner-go>');
  expect(await page.locator('#sgo').evaluate((el) => el.hasAttribute('tabindex'))).toBe(false);
  await page.locator('#sgo').click();
  expect(await events(page)).toEqual(['submit:sgo']);
  await page.locator('#sgo button').focus();
  await page.keyboard.press('Enter');
  expect(await events(page), 'Enter on the inner button: one submission, not two').toEqual(['submit:sgo', 'submit:sgo']);
  await page.keyboard.press(' ');
  expect(await events(page)).toHaveLength(3);
});
