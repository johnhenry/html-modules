// Declarative shadow DOM, open and closed, in real engines: a server-rendered root (`renderDeclarative()`) is kept, not
// re-stamped, gets the component's styles, and a closed one is found through attachInternals(). linkedom has no
// declarative shadow DOM parsing, so only a real engine can show the parser building the roots.
import { test, expect } from '@playwright/test';
import { defineHTMLComponent, renderDeclarative } from '../../src/index.js';

const open = defineHTMLComponent({ name: 'ssr-open', template: '<p part="p">rendered by the server</p><slot></slot>', styles: [':host { color: rgb(9, 8, 7); }'] });
const closed = defineHTMLComponent({ name: 'ssr-closed', template: '<p>closed server root</p>', shadow: 'closed', styles: ['p { color: rgb(7, 8, 9); }'] });

const pageHTML = `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/src/browser.js"></script></head><body>
<html-import id="m" src="/test/browser/fixtures/ssr.html" as="x"></html-import>
<x--open id="o">${renderDeclarative(open, '<b>light</b>')}</x--open>
<x--closed id="c">${renderDeclarative(closed)}</x--closed>
<p id="rendered">${renderDeclarative(open).includes('shadowrootmode="open"')}</p>
</body></html>`;

test('server-rendered open and closed roots are kept, styled and upgraded in place', async ({ page }) => {
  await page.route('**/ssr-page.html', (route) => route.fulfill({ contentType: 'text/html', body: pageHTML }));
  await page.goto('/ssr-page.html');
  // Before the module loads, the browser's parser already built the roots from the markup.
  const before = await page.evaluate(() => ({
    open: document.getElementById('o').shadowRoot?.querySelector('p')?.textContent,
    closed: document.getElementById('c').shadowRoot, // a closed root is not reachable
  }));
  expect(before.open).toBe('rendered by the server');
  expect(before.closed).toBeNull();
  await page.waitForFunction(() => customElements.get('x--closed'));
  const after = await page.evaluate(() => {
    const o = document.getElementById('o');
    const p = o.shadowRoot.querySelector('p');
    return {
      stillOpen: o.shadowRoot.querySelectorAll('p').length,
      sheets: o.shadowRoot.adoptedStyleSheets.length,
      color: getComputedStyle(o).color,
      slotted: o.shadowRoot.querySelector('slot').assignedNodes()[0]?.textContent,
      samePlace: p === o.shadowRoot.querySelector('p'),
      closedStill: document.getElementById('c').shadowRoot,
      // The memoized attachInternals() returns the one ElementInternals, whose shadowRoot is the closed root.
      closedPs: document.getElementById('c').attachInternals().shadowRoot.querySelectorAll('p').length,
      closedSheets: document.getElementById('c').attachInternals().shadowRoot.adoptedStyleSheets.length,
    };
  });
  expect(after.stillOpen, 'kept, not stamped a second time').toBe(1);
  expect(after.sheets, 'the open root adopted the component sheet').toBe(1);
  expect(after.color).toBe('rgb(9, 8, 7)');
  expect(after.slotted).toBe('light');
  expect(after.closedStill).toBeNull();
  expect(after.closedPs, 'the closed server root was kept too').toBe(1);
  expect(after.closedSheets, 'and styled').toBe(1);
});
