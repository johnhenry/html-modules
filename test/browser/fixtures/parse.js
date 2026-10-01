// Reads module sources three ways in the real engine: through a DOMParser document (the old path), through
// `parseModuleSource` (the loader's path now), and through the text scanner. Under a strict `style-src` it also
// counts CSP violations, which only the DOMParser path may cause.
import { parseModuleSource } from '/src/loader.js';
import { readHTMLModule } from '/src/record.js';
import { scanHTMLModule } from '/src/scan.js';
import { trustedHTML } from '/src/policy.js';

const violations = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective}: ${e.blockedURI || e.sample}`));
window.__violations = violations;

const attempt = (f) => { try { return f(); } catch (e) { return { threw: `${e.name}: ${e.message}` }; } };
// A record without the engine-serialised template/style text (the scanner keeps the source text; the DOM reader
// the serialisation), so only the structure is compared with the scanner.
const shape = (r) => (r?.threw ? r : { ...r, exports: r.exports.map((e) => ({ ...e, template: undefined, styles: undefined, sheet: undefined, source: undefined })) });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Phase 1 parses the way the loader does, and counts the CSP reports it caused (events are queued tasks: wait for
// them; the directives are returned); phase 2 does the same with DOMParser documents, which is what Chromium reports for.
window.__read = async (sources) => {
  const viaParse = sources.map(([name, source]) => attempt(() => readHTMLModule(parseModuleSource(source, window), name)));
  await wait(300);
  const reportsFromParse = [...violations];
  const viaDOMParser = sources.map(([name, source]) => attempt(() => readHTMLModule(new DOMParser().parseFromString(trustedHTML(source, window), 'text/html'), name)));
  await wait(300);
  const reportsFromDOMParser = violations.slice(reportsFromParse.length);
  const results = sources.map(([name, source], i) => ({
    name, viaDOMParser: viaDOMParser[i], viaParse: viaParse[i], shapeOfParse: shape(viaParse[i]), viaScan: shape(attempt(() => scanHTMLModule(source, name))),
  }));
  return { results, reportsFromParse, reportsFromDOMParser };
};
window.__done = true;
