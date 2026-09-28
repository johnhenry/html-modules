/**
 * basicRouter: a small, deterministic, offline router.
 *
 * This is NOT a CDN router: it performs no racing, health tracking, or
 * latency-based selection (use `mportRouter()` for live multi-CDN routing).
 * It maps specifier patterns to URL templates, optionally checking candidates
 * in order with a caller-supplied `probe` (resolution-time ordered fallback).
 * Useful for build-time import-map generation, private origins, and tests.
 */

/**
 * @typedef {string | ((bareSpecifier: string, context: object) => (string|null|Promise<string|null>))} Target
 *   A string is a base URL (the specifier is appended); a function returns a URL.
 */

function patternMatch(pattern, specifier) {
  if (pattern === '*') return { rest: specifier };
  if (pattern.endsWith(':') ) return specifier.startsWith(pattern) ? { rest: specifier.slice(pattern.length) } : null;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return specifier.startsWith(prefix) ? { rest: specifier } : null;
  }
  return pattern === specifier ? { rest: specifier } : null;
}

function normalizeRoutes(routes) {
  const list = Array.isArray(routes)
    ? routes.map(({ match, use }) => [match, use])
    : Object.entries(routes ?? {}).sort(([a], [b]) => (a === '*') - (b === '*') || b.length - a.length);
  return list.map(([pattern, use]) => [pattern, Array.isArray(use) ? use : [use]]);
}

async function targetURL(target, rest, context) {
  if (typeof target === 'function') return target(rest, context);
  return new URL(rest, target.endsWith('/') ? target : target + '/').href;
}

const isBare = (s) => !(s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || /^[a-z][a-z0-9+.-]*:\/\//i.test(s));

/**
 * @param {object} options
 * @param {Record<string, Target|Target[]> | Array<{match: string, use: Target|Target[]}>} options.routes
 * @param {(url: string, context: object) => boolean|Promise<boolean>} [options.probe]
 *   When given, candidates are tried in order and the first passing one wins.
 * @returns {import('./interface.js').Router}
 */
export function basicRouter({ routes, probe } = {}) {
  const table = normalizeRoutes(routes);
  return {
    name: 'basic',
    async resolve(specifier, context = {}) {
      if (!isBare(specifier)) return null;
      for (const [pattern, targets] of table) {
        const m = patternMatch(pattern, specifier);
        if (!m) continue;
        const failures = [];
        for (const target of targets) {
          const url = await targetURL(target, m.rest, context);
          if (!url) continue;
          if (!probe || (await probe(url, context))) {
            return { url, provider: safeHost(url), route: pattern };
          }
          failures.push(url);
        }
        throw new AggregateError(
          failures.map((u) => new Error(`probe failed: ${u}`)),
          `No candidate for "${specifier}" passed the probe (route "${pattern}")`,
        );
      }
      return null;
    },
  };
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/**
 * A probe using HTTP HEAD (falls back to GET on 405).
 * @param {{ fetch?: typeof fetch, timeout?: number }} [options]
 */
export function httpProbe({ fetch: f = globalThis.fetch, timeout = 5000 } = {}) {
  return async (url, { signal } = {}) => {
    const s = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
    try {
      let res = await f(url, { method: 'HEAD', signal: s, redirect: 'follow' });
      if (res.status === 405) res = await f(url, { method: 'GET', signal: s, redirect: 'follow' });
      return res.ok;
    } catch {
      return false;
    }
  };
}
