import { resolveImportMap } from '../import-map.js';

/**
 * Router backed by a static import map (e.g. a previously compiled/locked map).
 * Only bare specifiers are handled; everything else returns null.
 * @param {{imports?: object, scopes?: object}} importMap
 * @param {{ mapBaseURL?: string }} [options]
 * @returns {import('./interface.js').Router}
 */
export function importMapRouter(importMap, { mapBaseURL } = {}) {
  return {
    name: 'import-map',
    resolve(specifier, { referrer } = {}) {
      let url;
      try {
        url = resolveImportMap(importMap, specifier, { referrer, mapBaseURL: mapBaseURL ?? referrer });
      } catch {
        return null;
      }
      if (!url) return null;
      // Only claim specifiers the map actually remapped.
      const passthrough = (() => {
        try {
          return new URL(specifier, referrer).href === url;
        } catch {
          return false;
        }
      })();
      return passthrough ? null : { url, provider: 'import-map' };
    },
  };
}
