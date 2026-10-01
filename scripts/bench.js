// A non-gating benchmark: `npm run bench`. Numbers vary by machine; the README records one run.
//
//   scanner throughput on a large module · compile time · DOM reader (linkedom) for comparison
//   and, in each Playwright engine that can launch: registering 500 components (load + parse + bind + define) and
//   upgrading 500 elements that use them.
import { performance } from 'node:perf_hooks';
import { parseHTML } from 'linkedom';
import { scanHTMLModule, compileHTMLModule, readHTMLModule } from '../src/index.js';
import { createTestServer } from './test-server.js';

const COMPONENTS = 500;

function moduleSource(n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`<html-export name="item-n${i}" props="label count:number">
  <style>:host { display: block; padding: ${i % 7}px; } .a-${i} { color: rgb(${i % 256}, 20, 30); }</style>
  <template><div class="a-${i}"><h3>{{label}}</h3><p>Item ${i} has <b>{{count}}</b> things <a href="/items/${i}/{{label}}">link</a></p><slot></slot></div></template>
</html-export>`);
  }
  return parts.join('\n');
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function time(fn, runs = 7) {
  fn(); // warm up
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  return median(samples);
}

const rows = [];
const report = (name, value, unit, note = '') => {
  rows.push({ name, value: Number(value.toFixed(2)), unit, note });
  console.log(`${name.padEnd(54)} ${value.toFixed(value < 10 ? 2 : 1).padStart(10)} ${unit}${note ? `  (${note})` : ''}`);
};

const source = moduleSource(COMPONENTS);
const mb = source.length / 1e6;
console.log(`html-modules bench · node ${process.version} · ${process.platform}/${process.arch} · module of ${COMPONENTS} components, ${(source.length / 1024).toFixed(0)} KiB\n`);

const scanMs = time(() => scanHTMLModule(source, 'big.html'));
report('scanHTMLModule (text scanner)', scanMs, 'ms', `${(mb / (scanMs / 1000)).toFixed(1)} MB/s`);
const compileMs = time(() => compileHTMLModule(source, { url: 'big.html' }));
report('compileHTMLModule (scan + codegen)', compileMs, 'ms', `${(mb / (compileMs / 1000)).toFixed(1)} MB/s`);
const doc = parseHTML(`<!doctype html><html><body>${source}</body></html>`).document;
const readMs = time(() => readHTMLModule(doc, 'big.html'));
report('readHTMLModule (DOM reader, linkedom, parse excluded)', readMs, 'ms');
const small = moduleSource(10);
const smallMs = time(() => scanHTMLModule(small, 'small.html'), 25);
report('scanHTMLModule, a 10-component module', smallMs, 'ms');

// ---- Browsers
let playwright;
try {
  playwright = await import('@playwright/test');
} catch {
  console.log('\n(Playwright is not installed: skipping the browser benchmark)');
}
if (playwright) {
  const server = createTestServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['chromium', 'firefox', 'webkit']) {
    let browser;
    try {
      browser = await playwright[name].launch();
    } catch {
      console.log(`\n${name}: could not launch here, skipped`);
      continue;
    }
    const page = await browser.newPage();
    await page.route('**/bench-big.html', (route) => route.fulfill({ contentType: 'text/html', body: source }));
    await page.route('**/bench-page.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><script type="module" src="/src/browser.js"></script></body></html>' }));
    await page.goto(`${origin}/bench-page.html`);
    const result = await page.evaluate(async (count) => {
      const t0 = performance.now();
      const { elements } = await HTMLModules.import('/bench-big.html', { as: 'b' });
      const t1 = performance.now();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const el = document.createElement(`b--item-n${i}`);
        el.setAttribute('label', `n${i}`);
        el.setAttribute('count', String(i));
        frag.append(el);
      }
      document.body.append(frag);
      const t2 = performance.now();
      const el = document.body.lastElementChild;
      const t3 = performance.now();
      for (let i = 0; i < 20000; i++) el.count = i;
      const t4 = performance.now();
      return { registered: Object.keys(elements).length, load: t1 - t0, stamp: t2 - t1, update: (t4 - t3) / 20000 };
    }, COMPONENTS);
    report(`${name}: load + parse + register ${result.registered} components`, result.load, 'ms');
    report(`${name}: create and stamp ${COMPONENTS} elements (one per component)`, result.stamp, 'ms');
    report(`${name}: patch one bound attribute`, result.update * 1000, 'µs');
    await browser.close();
  }
  server.close();
}

if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
