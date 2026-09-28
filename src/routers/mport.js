/**
 * Adapter: the `mport` CDN router (https://github.com/johnhenry/mport) as a Router.
 *
 * mport races dynamic imports across npm CDNs (jsDelivr, JSPM, unpkg by
 * default) and reports which URL won. This adapter turns that into a
 * Resolution `{ url, provider, module }`. Because mport has already evaluated
 * the module, the loader reuses `module` instead of importing again.
 *
 * Scoped packages are always passed to mport in its object form
 * (`{ name, version, path }`) because mport's string form splits on "@".
 */
import { toRouter } from './interface.js';

/**
 * Parse an npm-style bare specifier: `[npm:]name[@version][/path]`.
 * @param {string} specifier
 * @returns {{ name: string, version?: string, path?: string } | null}
 */
export function parsePackageSpecifier(specifier) {
  let s = specifier.startsWith('npm:') ? specifier.slice(4) : specifier;
  if (!s || s.startsWith('.') || s.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  let scope = '';
  if (s.startsWith('@')) {
    const slash = s.indexOf('/');
    if (slash < 0) return null;
    scope = s.slice(0, slash + 1);
    s = s.slice(slash + 1);
  }
  const slash = s.indexOf('/');
  const head = slash < 0 ? s : s.slice(0, slash);
  const path = slash < 0 ? undefined : s.slice(slash + 1) || undefined;
  const at = head.indexOf('@');
  const bare = at < 0 ? head : head.slice(0, at);
  const version = at < 0 ? undefined : head.slice(at + 1) || undefined;
  if (!bare) return null;
  return { name: scope + bare, ...(version && { version }), ...(path && { path }) };
}

/**
 * @param {object} [options]
 * @param {Function} [options.MPortURL]  mport's `MPortURL` factory. Defaults to `import('mport')`.
 * @param {{ cdns?: string[], useCache?: string, cacheKey?: string }} [options.mport] options passed to MPortURL.
 * @param {(specifier: string) => boolean} [options.match] which specifiers to route (default: npm-style bare specifiers).
 * @param {object} [options.importOptions] second argument forwarded to mport's import.
 * @returns {import('./interface.js').Router}
 */
export function mportRouter({ MPortURL, mport: mportOptions, match, importOptions } = {}) {
  let importer;
  const getImporter = async () => {
    if (!importer) {
      const factory = MPortURL ?? (await import('mport')).MPortURL;
      // mport treats an explicit `{}` as "no cdns" and falls back to its defaults.
      importer = factory(mportOptions ?? {});
    }
    return importer;
  };
  return {
    name: 'mport',
    async resolve(specifier) {
      if (match && !match(specifier)) return null;
      const pkg = parsePackageSpecifier(specifier);
      if (!pkg) return null;
      const mport = await getImporter();
      let module, url;
      try {
        [module, url] = await mport(pkg, importOptions);
      } catch (cause) {
        throw new Error(`mport could not load "${specifier}" from any CDN`, { cause });
      }
      let provider;
      try {
        provider = new URL(url).host;
      } catch {}
      return { url, provider, type: 'js', module, ...(pkg.version && { version: pkg.version }) };
    },
  };
}

export { toRouter };
