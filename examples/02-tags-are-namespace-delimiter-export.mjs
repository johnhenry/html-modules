// A namespace import registers each component as <namespace><delimiter><export>.
// The delimiter is "--" by default because it can never appear inside a
// namespace or export name (so every tag splits one way) and it always
// supplies the hyphen a custom element name needs. Other delimiters work,
// with consequences this example proves.
//
//   node examples/02-tags-are-namespace-delimiter-export.mjs
import assert from 'node:assert/strict';
import {
  DELIMITER, bindingName, parseBindingName, isValidDelimiter, isValidElementName, elementNameProblem,
  isKebabName, camelCase, kebabCase,
} from '@johnhenry/html-modules';

// The default: "--".
assert.equal(DELIMITER, '--');
assert.equal(bindingName('ui', 'card'), 'ui--card');
assert.equal(bindingName('ui', 'custom-card'), 'ui--custom-card');
assert.equal(bindingName('gh', 'UserCard'), 'gh--user-card', 'JS-style export names are kebab-cased');

// "-" is compact, but a tag can split more than one way. The runtime never parses tags
// (bindings record { tag, namespace, export }), so parseBindingName is a display helper only.
assert.equal(bindingName('ui', 'custom-card', '-'), 'ui-custom-card');
assert.deepEqual(parseBindingName('ui--custom-card'), { namespace: 'ui', name: 'custom-card' });
assert.equal(parseBindingName('ui-custom-card', '-'), null, 'ambiguous: custom-card in ui, or card in ui-custom');
assert.deepEqual(parseBindingName('ui-card', '-'), { namespace: 'ui', name: 'card' });

// "." reads well, but a one-word export then has no hyphen: an error naming the tag and the reason.
assert.equal(bindingName('ui', 'custom-card', '.'), 'ui.custom-card');
assert.throws(
  () => bindingName('ui', 'card', '.'),
  { name: 'SyntaxError', message: `Cannot bind 'card' under namespace "ui" with delimiter ".": <ui.card> is not a valid custom element name (it has no hyphen)` },
);

// What a delimiter may be: one or more characters allowed in custom element names.
for (const ok of ['--', '-', '.', '_', '__', '-x-']) assert.ok(isValidDelimiter(ok), ok);
for (const bad of ['', ' ', ':', 'A', '/', 42]) assert.ok(!isValidDelimiter(bad), String(bad));
assert.throws(() => bindingName('ui', 'card', ':'), /Invalid delimiter ":"/);

// Namespaces are kebab words with single hyphens: "a--b" would make tags ambiguous.
assert.ok(isKebabName('ui') && isKebabName('my-kit'));
assert.ok(!isKebabName('UI') && !isKebabName('a--b') && !isKebabName('-x'));
assert.throws(() => bindingName('a--b', 'card'), /Invalid namespace "a--b"/);

// Why a name is not a valid custom element name, in words.
assert.equal(elementNameProblem('ui--card'), null);
assert.equal(elementNameProblem('card'), 'it has no hyphen');
assert.equal(elementNameProblem('Ui-card'), 'it must start with a lower-case ASCII letter');
assert.equal(elementNameProblem('ui-Card'), 'it contains upper-case letters');
assert.equal(elementNameProblem('font-face'), 'it is reserved by HTML');
assert.equal(elementNameProblem(''), 'it is empty');
assert.ok(isValidElementName('ui.custom-card'), '"." is legal in element names; the problem is only the missing hyphen');

// Export names map to JS names and back: fancy-button ↔ fancyButton.
assert.equal(camelCase('fancy-button'), 'fancyButton');
assert.equal(kebabCase('FancyButton'), 'fancy-button');

console.log('ok: ui + card → <ui--card> (default), <ui-card> ("-"), <ui.card> rejected (".": no hyphen)');
