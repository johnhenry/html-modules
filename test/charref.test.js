// Character references: the scanner must decode attribute values exactly as a spec parser does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseFragment } from 'parse5';
import { readHTMLModule, scanHTMLModule } from '../src/index.js';
import { decodeCharacterReferences, numericReference } from '../src/charref.js';
import { ENTITIES, LEGACY_ENTITIES } from '../src/entities.js';
import { specParse } from './spec-dom.js';

const specAttribute = (value) => parseFragment(`<a x="${value}">`).childNodes[0].attrs[0].value;
const specText = (text) => parseFragment(`<template>${text}</template>`).childNodes[0].content.childNodes.map((n) => n.value ?? '').join('');

test('the generated table is the WHATWG one: 2125 names with ";", 106 legacy', () => {
  assert.equal(ENTITIES.size, 2125);
  assert.equal(LEGACY_ENTITIES.size, 106);
  assert.equal(ENTITIES.get('amp'), '&');
  assert.equal(ENTITIES.get('NotEqualTilde'), '≂̸');
  assert.ok([...LEGACY_ENTITIES].every((n) => ENTITIES.has(n)));
});

test('every named reference decodes as a spec parser decodes it, in attribute values and in text', () => {
  const failures = [];
  for (const name of ENTITIES.keys()) {
    for (const source of [`&${name};`, `&${name}`, `&${name}x`, `&${name}=`, `&${name} `, `a&${name};b`, `&${name}&${name};`]) {
      for (const [mode, expected] of [['attribute', specAttribute(source)], ['text', specText(source)]]) {
        const got = decodeCharacterReferences(source, { attribute: mode === 'attribute' });
        if (got !== expected) failures.push(`${mode} ${JSON.stringify(source)}: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`);
      }
    }
  }
  assert.deepEqual(failures.slice(0, 5), [], `${failures.length} differ from parse5`);
});

test('legacy names without ";" and prefixes of longer names follow the attribute rule', () => {
  const cases = ['?a=1&copy=2', '?a=1&copy', '?a=1&copyx', 'x&notit;', 'x&notin;', '&notit', '&amp&lt;', 'AT&T', '&ampx', '&AMP', '&amp1', '&ltgt', '&para=', '&para', '&sect;&sect'];
  for (const c of cases) {
    assert.equal(decodeCharacterReferences(c, { attribute: true }), specAttribute(c), `attribute ${c}`);
    assert.equal(decodeCharacterReferences(c), specText(c), `text ${c}`);
  }
});

test('numeric references: NUL, out of range, surrogates and the C1 table become what the spec says', () => {
  const cases = ['&#0;', '&#x0;', '&#x110000;', '&#1114112;', '&#xFFFFFFFFFF;', '&#99999999999999999999;', '&#xD800;', '&#xDFFF;', '&#x80;', '&#x81;', '&#x9F;', '&#150;', '&#x41', '&#65', '&#xg;', '&#;', '&#x;', '&#X41;', '&#x1F600;', '&#xFDD0;', '&#x0D;', '&#x7F;'];
  for (const c of cases) {
    assert.equal(decodeCharacterReferences(c, { attribute: true }), specAttribute(c), c);
    assert.equal(decodeCharacterReferences(c), specText(c), c);
  }
  assert.equal(numericReference(0x110000), '�');
  assert.equal(numericReference(0x80), '€');
});

test('src="./caf&eacute;.html" and out-of-range references read the same through the DOM and the scanner', () => {
  const html = '<html-import src="./caf&eacute;.html?a=1&copy=2&amp;b=&#x110000;&#128;" as="a"></html-import><html-export src="./x.html" name="y" import="q&notit;"></html-export>';
  const [a, b] = [readHTMLModule(specParse(html), 'm.html'), scanHTMLModule(html, 'm.html')];
  assert.deepEqual(b, a);
  assert.equal(b.exports[0].import, 'q&notit;', 'a legacy name followed by a letter is left alone in an attribute');
  assert.equal(b.imports[0].src, './café.html?a=1&copy=2&b=�€');
  assert.doesNotThrow(() => scanHTMLModule('<html-import src="&#x110000;"></html-import>', 'm.html'));
});

test('a named reference with no table entry stays as written', () => {
  assert.equal(decodeCharacterReferences('&nosuchname; &;'), '&nosuchname; &;');
});
