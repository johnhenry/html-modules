// The `sanitize` option end to end, in real engines, with the real @johnhenry/safe-fragment (the pinned commit,
// bundled by scripts/vendor-safe-fragment.js): a module served from a second origin whose templates carry every
// execution vector of html-modules#3, loaded with and without a sanitizer; benign templates; Trusted Types.
// The vectors record themselves in window.__pwned (see fixtures/sanitize/untrusted.html), so a control run proves
// each one really fires when nothing sanitizes, and the sanitized runs prove it does not.
import { test, expect } from '@playwright/test';

const OTHER = 'http://127.0.0.1:4174'; // another origin: the "less-trusted" module host
const VECTORS = ['img onerror', 'iframe srcdoc', 'javascript: link', 'onclick'];
const TT = (names) => encodeURIComponent(`require-trusted-types-for 'script'; trusted-types ${names}`);

async function run(page, query) {
  await page.goto(`/test/browser/fixtures/sanitize/page.html?${query}`);
  await page.waitForFunction(() => window.__done === true);
  return page.evaluate(() => ({ pwned: window.__pwned, events: window.__events, violations: window.__violations, result: window.__result }));
}

const notes = (events) => events.flatMap((e) => e.details?.removed ?? []);

test('control: with no sanitizer, every vector of the less-trusted module runs', async ({ page }) => {
  const { pwned, result } = await run(page, `mode=raw&remote=${OTHER}`);
  for (const v of VECTORS) expect(pwned, `${v} should run unsanitized (the fixture is a real attack)`).toContain(v);
  expect(result.has.iframe && result.has.script && result.attrs.imgOnerror).toBe(true);
});

for (const mode of ['import', 'default', 'element']) {
  test(`sanitize (${mode}): img onerror, javascript: links, iframe srcdoc, handlers and script are removed from a template from another origin`, async ({ page }, info) => {
    const { pwned, events, result } = await run(page, `mode=${mode}&remote=${OTHER}`);
    expect(result.error).toBeUndefined();
    expect(pwned, 'no vector ran').toEqual([]);
    expect(result.has).toMatchObject({ script: false, iframe: false, style: false });
    expect(result.attrs).toEqual({ imgOnerror: false, jsHref: null, btnOnclick: false });
    expect(result.html).not.toMatch(/onerror|onclick|javascript:|srcdoc|<script|<iframe|<style/i);
    // What is safe stays: the image itself, the binding, <slot>, part, a namespaced custom element (upgraded) and the module's own <style>.
    expect(result.has).toMatchObject({ img: true, slot: true, 'ui--badge': true });
    expect(result.html).toContain('<h2 part="title">Ada</h2>');
    expect(result.html).toContain('part="badge"');
    expect(result.badgeUpgraded).toBe('<b part="badge-text"><slot></slot></b>');
    expect(result.sheets, 'the module\'s <html-export><style> is still adopted').toBe(1);
    // The removals are reported on the event channel (and on the document).
    const removed = notes(events);
    for (const expected of [{ tag: 'iframe' }, { tag: 'script' }, { attribute: 'onerror' }, { attribute: 'onclick' }, { tag: 'a', attribute: 'href' }]) {
      expect(removed, `${JSON.stringify(expected)} is reported`).toContainEqual(expect.objectContaining(expected));
    }
    info.annotations.push({ type: 'sanitizer-engine', description: events[0]?.details.engine ?? 'unknown' });
  });
}

test('benign templates render exactly as they do unsanitized, and report nothing', async ({ page }) => {
  const raw = await run(page, `mode=raw&module=benign&remote=${OTHER}`);
  const safe = await run(page, `mode=import&module=benign&remote=${OTHER}`);
  expect(safe.result.error).toBeUndefined();
  expect(safe.result.html).toBe(raw.result.html);
  expect(safe.result.badgeUpgraded).toBe(raw.result.badgeUpgraded);
  expect(safe.result.html).toContain('aria-label="Ada"');
  expect(safe.result.html).toContain('<slot name="intro">fallback</slot>');
  expect(notes(safe.events), 'no warning for a template with nothing to remove (not even the DOMPurify engine\'s own artefacts)').toEqual([]);
});

test('bindings survive: a changed attribute still patches the sanitized template', async ({ page }) => {
  await run(page, `mode=import&module=benign&remote=${OTHER}`);
  const html = await page.evaluate(() => {
    const card = document.querySelector('ui--card');
    card.setAttribute('label', 'Grace');
    return card.shadowRoot.innerHTML;
  });
  expect(html).toContain('aria-label="Grace"');
  expect(html).toContain('<h2 part="title">Grace</h2>');
  expect(html).toContain('href="/docs/Grace"');
});

test('a profile that keeps no custom elements (ui-v1 as shipped) drops <ui--badge>, <slot> and part, and keeps the text', async ({ page }) => {
  const { result, pwned } = await run(page, `mode=import&profile=ui-v1&remote=${OTHER}`);
  expect(pwned).toEqual([]);
  expect(result.has['ui--badge']).toBe(false);
  expect(result.has.slot).toBe(false);
  expect(result.html).not.toMatch(/part="/);
  expect(result.html).toContain('new');
});

test('ids are prefixed user-content- by safe-fragment, and so are the references to them', async ({ page }) => {
  await run(page, 'mode=raw&module=benign');
  const out = await page.evaluate(async () => {
    const sf = await import('/examples/vendor/safe-fragment/safe-fragment.js');
    const { fragment } = await sf.sanitizeToFragment('<label for="a">l</label><button id="a" aria-controls="b">x</button><div id="b">y</div>', { profile: 'ui-v1', document });
    const div = document.createElement('div');
    div.append(fragment);
    return div.innerHTML;
  });
  expect(out).toContain('id="user-content-a"');
  expect(out).toContain('for="user-content-a"');
  expect(out).toContain('aria-controls="user-content-b"');
});

test('Trusted Types: with the CSP naming html-modules and dompurify, sanitized templates render and nothing runs', async ({ page }, info) => {
  const csp = TT('html-modules dompurify');
  const control = await run(page, `mode=import&module=benign&csp=${csp}&remote=${OTHER}`);
  const attack = await run(page, `mode=import&csp=${csp}&remote=${OTHER}`);
  info.annotations.push({ type: 'trusted-types', description: attack.result.trustedTypes ? 'enforced' : 'unsupported in this engine' });
  expect(attack.result.error).toBeUndefined();
  expect(attack.pwned).toEqual([]);
  expect(attack.result.has).toMatchObject({ script: false, iframe: false });
  expect(attack.result.attrs.imgOnerror).toBe(false);
  expect(control.result.error).toBeUndefined();
  expect(control.result.html).toContain('<h2 part="title">Ada</h2>');
  // The stamp itself uses no HTML sink: html-modules' own policy only wraps the module source it parses. (On the
  // native engine safe-fragment's own baseline parse is a blocked sink under Trusted Types: safe-fragment#12.)
  const own = [...attack.violations, ...control.violations].filter((v) => !/trusted-types-sink/.test(v));
  expect(own, 'no policy violations other than safe-fragment\'s documented sink').toEqual([]);
});

test('Trusted Types: a CSP that does not allow safe-fragment\'s policy never renders unsanitized markup (it fails closed or works)', async ({ page }, info) => {
  const { pwned, result } = await run(page, `mode=import&csp=${TT('html-modules')}&remote=${OTHER}`);
  expect(pwned).toEqual([]);
  if (result.error) {
    info.annotations.push({ type: 'trusted-types', description: 'sanitizer refused without a dompurify policy: the load failed closed' });
    expect(await page.evaluate(() => customElements.get('ui--card'))).toBeUndefined();
  } else {
    expect(result.html).not.toMatch(/onerror|<iframe|<script/i);
  }
});

test('a sanitized module cannot import JavaScript: the failure is an error, and nothing from it runs or registers', async ({ page }) => {
  await run(page, 'mode=raw&module=benign');
  const message = await page.evaluate(async () => {
    const { HTMLModules } = await import('/src/browser.js');
    const { safeFragmentSanitizer } = await import('/src/safe-fragment.js');
    const safeFragment = await import('/examples/vendor/safe-fragment/safe-fragment.js');
    const sanitize = safeFragmentSanitizer({ safeFragment, profile: 'ui-v1' });
    try {
      await HTMLModules.import('/test/browser/fixtures/sanitize/with-js.html', { as: 'withjs', sanitize });
      return 'loaded';
    } catch (e) {
      return `${e.message} | defined=${Boolean(customElements.get('withjs--box'))} | ran=${Boolean(window.__widgetRan)}`;
    }
  });
  expect(message).toMatch(/Refusing to import the JavaScript module .*\/widget\.js from a sanitized HTML module/);
  expect(message).toMatch(/defined=false \| ran=false/);
});

test('<safe-fragment> inside a component\'s template sanitizes what a page hands the component, and follows its binding', async ({ page }) => {
  await page.goto('/test/browser/fixtures/sanitize/bio-page.html');
  await page.waitForFunction(() => window.__done === true);
  const r = await page.evaluate(() => window.__result);
  expect(r.error).toBeUndefined();
  expect(r.pwned, 'nothing ran, even after clicking the link').toEqual([]);
  expect(r.initial).toContain('<p>Hello <strong>world</strong>');
  expect(r.initial).not.toMatch(/onerror|javascript:/);
  expect(r.updated, 'the {{bio}} binding patched the content attribute and safe-fragment re-rendered').toContain('Second <em>one</em>');
  expect(r.updated).not.toMatch(/iframe|srcdoc/);
});
