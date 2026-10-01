// How the loader parses a module (`parseModuleSource`): the same record as a DOMParser document in every engine, and
// no CSP report under a strict `style-src` (Chromium evaluates `style-src` for each <style> in a connected tree,
// which is what a DOMParser document is). Whether an engine reports for the DOMParser path is noted, not assumed.
import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const examples = fileURLToPath(new URL('../../examples/', import.meta.url));
const files = (await readdir(examples, { recursive: true })).filter((f) => f.endsWith('.html') && /(^|\/)(components|app|interop|errors|vendor)\//.test(f));
const corpus = await Promise.all(files.map(async (f) => [f, await readFile(join(examples, f), 'utf8')]));

const edge = [
  ['full document', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>x{}</style></head><body><html-export name="a"><style>b{color:red}</style><template><b>x</b></template></html-export></body></html>'],
  ['bare fragment, style first', '<style>:host{display:block}</style><html-export name="a"><template>hi</template></html-export>'],
  ['stylesheet export', '<html-export name="s"><style>a{color:red}</style><style>b{color:blue}</style></html-export>'],
  ['noscript wrapper', '<noscript><html-export name="n"><template>x</template></html-export></noscript><html-export name="a"><template>y</template></html-export>'],
  ['stray table tags', '<tr><td>cell</td></tr><html-export name="a"><template><tr><td>in</td></tr></template></html-export>'],
  ['comments, doctype, text', '<!-- c --><!doctype html>text<html-import src="./x.html" as="x"></html-import>tail'],
  ['nested export is rejected', '<html-export name="a"><template>x</template><html-export name="b"><template>y</template></html-export></html-export>'],
  ['template in template', '<html-export name="a"><template><template><p>deep</p></template></template></html-export>'],
  ['json data', '<html-export name="d"><script type="application/json">{"a":1}</script></html-export>'],
  ['entities', '<html-import src="a&amp;b.html" as="x&#x79;"></html-import>'],
];

for (const strict of [false, true]) {
  test(`parseModuleSource reads every example and edge module exactly as a DOMParser document does${strict ? ', under a strict CSP' : ''}`, async ({ page }, info) => {
    await page.goto(`/test/browser/fixtures/parse.html${strict ? '?csp=strict' : ''}`);
    await page.waitForFunction(() => window.__done === true);
    const { results, reportsFromParse, reportsFromDOMParser } = await page.evaluate((sources) => window.__read(sources), [...corpus, ...edge]);
    expect(results.length).toBeGreaterThan(30);
    for (const r of results) {
      expect(r.viaParse, `${r.name}: same record as DOMParser`).toEqual(r.viaDOMParser);
      expect(r.shapeOfParse, `${r.name}: agrees with the scanner`).toEqual(r.viaScan);
    }
    // A `style="…"` attribute in markup is blocked by `style-src-attr` whichever way it is parsed (the module author's
    // choice, and the stamp would be blocked too); the point is the `<style>` element.
    const elem = (reports) => reports.filter((v) => v.startsWith('style-src-elem'));
    expect(elem(reportsFromParse), 'parseModuleSource causes no style-src-elem report').toEqual([]);
    expect(reportsFromParse.filter((v) => !v.startsWith('style-src-attr')), 'and no other kind').toEqual([]);
    if (strict) info.annotations.push({ type: 'csp', description: `style-src-elem reports: DOMParser path ${elem(reportsFromDOMParser).length}, parseModuleSource path 0` });
  });
}

test('under a strict CSP the loader logs no CSP error at all for a module with <style>', async ({ page }) => {
  const messages = [];
  page.on('console', (m) => messages.push(m.text()));
  await page.goto('/test/browser/fixtures/strict.html?csp=strict');
  await page.waitForFunction(() => window.__done === true);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(messages.filter((m) => /Content Security Policy|violates/i.test(m))).toEqual([]);
});
