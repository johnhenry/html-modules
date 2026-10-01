// Which platform features each engine really has. Not a gate (except for Chromium, the reference engine): it prints a
// matrix per engine, so the README and CI logs can say honestly what is unsupported where. The examples that need a
// missing feature report it as "unsupported", never as a failure (see examples.spec.js).
import { test, expect } from '@playwright/test';

test('feature matrix', async ({ page, browserName }, info) => {
  await page.goto('/package.json');
  const features = await page.evaluate(async () => {
    const { supportsScopedRegistries } = await import('/src/runtime.js');
    const enforced = await new Promise((resolve) => {
      // A policy is only "enforced" if the engine implements the API at all.
      resolve(Boolean(window.trustedTypes?.createPolicy));
    });
    return {
      trustedTypes: enforced,
      constructableStylesheets: (() => { try { new CSSStyleSheet().replaceSync('a{}'); return typeof document.adoptedStyleSheets !== 'undefined'; } catch { return false; } })(),
      scopedRegistries: supportsScopedRegistries(window),
      formAssociated: 'ElementInternals' in window && 'setFormValue' in ElementInternals.prototype,
      declarativeShadowDom: 'shadowRootMode' in HTMLTemplateElement.prototype,
      customStateSet: 'ElementInternals' in window && 'states' in ElementInternals.prototype,
    };
  });
  const row = { engine: browserName, version: page.context().browser().version(), ...features };
  console.log(`FEATURES ${JSON.stringify(row)}`);
  await info.attach('features.json', { body: JSON.stringify(row, null, 2), contentType: 'application/json' });
  if (browserName === 'chromium') expect(features).toMatchObject({ trustedTypes: true, constructableStylesheets: true, scopedRegistries: true, formAssociated: true, declarativeShadowDom: true });
  // Every engine html-modules supports has these; a regression there is a real failure.
  expect(features.constructableStylesheets).toBe(true);
  expect(features.formAssociated).toBe(true);
  expect(features.declarativeShadowDom).toBe(true);
});
