// Trusted Types and CSP: the HTML sinks take TrustedHTML, the <style> fallback carries the page's nonce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineHTMLComponent, defineHTMLStylesheet, adoptStylesheet, configureRuntime, createHTMLModules } from '../src/index.js';
import { makeWindow } from './helpers.js';

class TrustedHTML extends String {}

/** A window under enforcement: HTML sinks accept only TrustedHTML, as with `require-trusted-types-for 'script'`. */
function enforcing({ allowed = ['html-modules'] } = {}) {
  const win = makeWindow();
  const created = [];
  win.trustedTypes = {
    createPolicy(name, rules) {
      if (!allowed.includes(name)) throw new TypeError(`Policy "${name}" disallowed`);
      created.push(name);
      return { name, createHTML: (s) => new TrustedHTML(rules.createHTML(s)) };
    },
  };
  win.created = created;
  win.sinks = [];
  const Parser = win.DOMParser;
  const parse = Parser.prototype.parseFromString;
  // (linkedom's window does not let DOMParser be replaced, so its prototype method is wrapped; restored by `t.mock`.)
  win.guard = (t) => t.mock.method(Parser.prototype, 'parseFromString', function (html, type) {
    win.sinks.push(html);
    if (!(html instanceof TrustedHTML)) throw new TypeError("This document requires 'TrustedHTML' assignment.");
    return parse.call(this, String(html), type);
  });
  return win;
}

test('the template stamped into a component goes through a Trusted Types policy', () => {
  const win = enforcing();
  const seen = [];
  const original = win.document.createElement.bind(win.document);
  win.document.createElement = (tag) => {
    const el = original(tag);
    if (tag === 'template') {
      let value;
      Object.defineProperty(el, 'innerHTML', { set(v) { seen.push(v); value = v; }, get: () => String(value) });
    }
    return el;
  };
  const def = defineHTMLComponent({ name: 'tt-card', template: '<b>x</b>' });
  def.define('tt-card', { window: win });
  win.document.body.append(win.document.createElement('tt-card'));
  assert.ok(seen[0] instanceof TrustedHTML, 'TrustedHTML, not a string, reaches template.innerHTML');
  assert.deepEqual(win.created, ['html-modules'], 'the named policy is created once');
});

test('a module is parsed through the policy too: DOMParser.parseFromString gets TrustedHTML', async (t) => {
  const win = enforcing();
  win.guard(t);
  const fetch = async () => ({ ok: true, status: 200, text: async () => '<html-export name="a"><template>a</template></html-export>' });
  const modules = createHTMLModules({ window: win, baseURL: 'http://m.test/', fetch });
  assert.ok((await modules.load('./a.html')).a);
  assert.ok(win.sinks[0] instanceof TrustedHTML);
});

test('trustedTypes option: your own policy is used instead, and false opts out', async () => {
  const win = enforcing({ allowed: [] });
  const calls = [];
  const policy = { createHTML: (s) => { calls.push(s); return new TrustedHTML(s); } };
  const fetch = async () => ({ ok: true, status: 200, text: async () => '<html-export name="a"><template>a</template></html-export>' });
  const modules = createHTMLModules({ window: win, baseURL: 'http://m.test/', fetch, trustedTypes: policy });
  const { a } = await modules.load('./a.html');
  a.define('tt-own', { window: win });
  win.document.body.append(win.document.createElement('tt-own'));
  assert.equal(calls.length, 2, 'one for parsing the module, one for the template');
  assert.deepEqual(win.created, [], 'no "html-modules" policy was created');
  assert.throws(() => createHTMLModules({ window: win, trustedTypes: {} }), /Invalid trustedTypes: pass a Trusted Types policy/);
  const off = makeWindow();
  off.trustedTypes = { createPolicy: () => assert.fail('never created') };
  configureRuntime(off, { trustedTypes: false });
  defineHTMLComponent({ name: 'tt-off', template: '<i>x</i>' }).define('tt-off', { window: off });
  off.document.body.append(off.document.createElement('tt-off'));
});

test('without Trusted Types, HTML stays a plain string; a disallowed default policy falls back to it', () => {
  const win = makeWindow();
  defineHTMLComponent({ name: 'tt-plain', template: '<i>x</i>' }).define('tt-plain', { window: win });
  win.document.body.append(win.document.createElement('tt-plain'));
  const strict = enforcing({ allowed: [] });
  defineHTMLComponent({ name: 'tt-denied', template: '<i>x</i>' }).define('tt-denied', { window: strict });
  strict.document.body.append(strict.document.createElement('tt-denied'));
  assert.equal(strict.document.querySelector('tt-denied').shadowRoot.innerHTML, '<i>x</i>', 'the template still renders from a string');
});

test('nonce: the <style> fallback carries it (and only a non-empty string is accepted)', () => {
  const win = makeWindow();
  configureRuntime(win, { nonce: 'abc123' });
  adoptStylesheet(win.document, defineHTMLStylesheet({ name: 'theme', css: 'p{}' }), { window: win });
  assert.equal(win.document.head.querySelector('style[data-html-module="theme"]').getAttribute('nonce'), 'abc123');
  assert.throws(() => configureRuntime(win, { nonce: '' }), /Invalid nonce "": pass the page's CSP nonce/);
  const other = makeWindow();
  const modules = createHTMLModules({ window: other, nonce: 'n-2' });
  adoptStylesheet(other.document, defineHTMLStylesheet({ name: 'theme', css: 'p{}' }), { window: other });
  assert.equal(other.document.head.querySelector('style').getAttribute('nonce'), 'n-2');
  assert.ok(modules);
});
