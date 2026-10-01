/**
 * HTML character references, decoded the way the tokenizer does it: numeric
 * references with the spec's replacements (NUL, out-of-range, surrogates and
 * the C1 controls), and the full named table, including the legacy names that
 * work without a ";" (and, in attribute values, the rule that keeps
 * `&notit` and `?a=1&copy=2` as written).
 */
import { ENTITIES, LEGACY_ENTITIES } from './entities.js';

// Windows-1252 replacements for the C1 controls U+0080..U+009F that a numeric reference names.
const C1 = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

/** The character a numeric reference to `code` stands for. */
export function numericReference(code) {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
  if (code >= 0x80 && code <= 0x9f) return String.fromCodePoint(C1[code - 0x80]);
  return String.fromCodePoint(code);
}

const MAX_LEGACY = Math.max(...[...LEGACY_ENTITIES].map((n) => n.length));
const REFERENCE = /&(?:#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?|([A-Za-z0-9]+)(;?))/g;
const ALNUM = /[A-Za-z0-9]/;

/**
 * Decode the character references in `text`.
 * @param {string} text
 * @param {{ attribute?: boolean }} [options]  `attribute: true` for an attribute value (the default is element text)
 */
export function decodeCharacterReferences(text, { attribute = false } = {}) {
  if (!text.includes('&')) return text;
  return text.replace(REFERENCE, (match, hex, dec, name, semicolon, offset) => {
    if (hex !== undefined || dec !== undefined) {
      return numericReference(hex !== undefined ? parseInt(hex, 16) : parseInt(dec, 10));
    }
    if (semicolon && ENTITIES.has(name)) return ENTITIES.get(name);
    // No ";" (or a name the table does not know with one): the longest legacy name that prefixes it.
    for (let length = Math.min(name.length, MAX_LEGACY); length >= 2; length--) {
      const legacy = name.slice(0, length);
      if (!LEGACY_ENTITIES.has(legacy)) continue;
      // In an attribute value, a legacy reference followed by "=" or a letter or digit is left alone.
      const next = length < name.length ? name[length] : text[offset + match.length];
      if (attribute && next !== undefined && (next === '=' || ALNUM.test(next))) return match;
      return ENTITIES.get(legacy) + name.slice(length) + semicolon;
    }
    return match;
  });
}
