# Names

[API reference](../api.md) › Names

The naming rules for export names, namespaces, delimiters and tags (`src/names.js`). All are pure functions.

| Name | Signature | Returns |
| --- | --- | --- |
| [`DELIMITER`](#delimiter) | constant | `"--"` |
| [`bindingName`](#bindingnamenamespace-exportname-delimiter) | `(namespace, exportName, delimiter = "--") => string` | the tag; throws when invalid |
| [`parseBindingName`](#parsebindingnametag-delimiter) | `(tag, delimiter = "--") => { namespace, name } \| null` | a display helper |
| [`isValidDelimiter`](#isvaliddelimiterdelimiter) | `(delimiter) => boolean` | |
| [`isValidElementName`](#isvalidelementnamename) | `(name) => boolean` | |
| [`elementNameProblem`](#elementnameproblemname) | `(name) => string \| null` | why a name is invalid |
| [`isKebabName`](#iskebabnamename) | `(name) => boolean` | valid export name / namespace shape |
| [`camelCase`](#camelcasename-kebabcasename) | `(name) => string` | `"fancy-button"` → `"fancyButton"` |
| [`kebabCase`](#camelcasename-kebabcasename) | `(name) => string` | `"FancyButton"` → `"fancy-button"` |

## `DELIMITER`

`"--"`, the default namespace delimiter: `<html-import as="ui">` + `custom-card` → `<ui--custom-card>`.

**Why `--`.** A registered tag must be a valid custom element name, or native upgrade is lost. Namespaces and export
names are kebab names with *single* hyphens, so `--` can never appear inside one: every tag splits exactly one way.
And `--` always supplies the hyphen a custom element name needs, so one-word exports stay valid (`<ui--card>`). It
also echoes CSS custom properties.

## `bindingName(namespace, exportName, delimiter)`

```ts
bindingName(namespace: string, exportName: string, delimiter?: string /* = "--" */): string
```

The tag an export is bound to under a namespace: `` `${namespace}${delimiter}${kebabCase(exportName)}` ``.

```js
bindingName('ui', 'custom-card');        // "ui--custom-card"
bindingName('gh', 'UserCard');           // "gh--user-card"  (JS export names are kebab-cased)
bindingName('ui', 'card', '-');          // "ui-card"
bindingName('ui', 'custom-card', '.');   // "ui.custom-card"
bindingName('ui', 'card', '.');          // throws: <ui.card> has no hyphen
```

Throws `SyntaxError`:

- `Invalid namespace "<ns>": use lower-case words joined by single hyphens (no "--"), e.g. "ui"`
- `Invalid delimiter "<d>": use one or more characters allowed in custom element names (lower-case letters, digits,
  "-", ".", "_", …), e.g. "--" or "-"`
- `Cannot bind '<export>' under namespace "<ns>" with delimiter "<d>": <<tag>> is not a valid custom element name
  (<reason>)`, where `<reason>` is from [`elementNameProblem`](#elementnameproblemname), e.g. `it has no hyphen`
  (`.` or `_` with a one-word export) or `it is reserved by HTML` (`font` + `face` with `-`).

## `parseBindingName(tag, delimiter)`

```ts
parseBindingName(tag: string, delimiter?: string /* = "--" */): { namespace: string, name: string } | null
```

Split a namespaced tag into its parts when it splits into two kebab names **exactly one way**; `null` otherwise
(including for a non-string or an invalid delimiter). With `--` every bound tag splits one way. With `-`,
`ui-card` does but `ui-custom-card` does not (it could be `custom-card` in `ui` or `card` in `ui-custom`).

This is a **display helper only**. The runtime never parses tags: every binding records `{ tag, namespace, export }`
(`el.tags`, and `tags` in the results of `bind()` and `import()`). Use those to map a tag back to its export.

```js
parseBindingName('ui--custom-card');        // { namespace: "ui", name: "custom-card" }
parseBindingName('custom-card');            // null
parseBindingName('ui-card', '-');           // { namespace: "ui", name: "card" }
parseBindingName('ui-custom-card', '-');    // null (ambiguous)
```

## `isValidDelimiter(delimiter)`

`true` for a non-empty string of characters allowed in custom element names: lower-case ASCII letters, digits, `-`,
`.`, `_`, `·`, and the non-ASCII ranges of the
[PotentialCustomElementName](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name)
production. Whitespace, upper case, and characters such as `:` and `/` are rejected.

| Delimiter | `ui` + `card` | `ui` + `custom-card` | Notes |
| --- | --- | --- | --- |
| `--` (default) | `ui--card` | `ui--custom-card` | always valid, always splits one way |
| `-` | `ui-card` | `ui-custom-card` | compact and always valid; tags can be ambiguous to read back |
| `.` | invalid (no hyphen) | `ui.custom-card` | one-word exports fail; the error names the tag |
| `_` | invalid (no hyphen) | `ui_custom-card` | as `.` |
| `-x-` | `ui-x-card` | `ui-x-custom-card` | multi-character delimiters work |

## `isValidElementName(name)`

`true` for a valid custom element name: `elementNameProblem(name) === null`.

## `elementNameProblem(name)`

```ts
elementNameProblem(name: unknown): string | null
```

Why `name` is not a valid custom element name, in words, or `null` if it is valid. The checks, in order:

| Result | Example |
| --- | --- |
| `"it is empty"` | `""`, a non-string |
| `"it must start with a lower-case ASCII letter"` | `"Ui-card"`, `"1-x"` |
| `"it has no hyphen"` | `"card"`, `"ui.card"` |
| `"it contains upper-case letters"` | `"ui-Card"` |
| `"it contains characters not allowed in custom element names"` | `"ui-ca:rd"`, `"ui-my card"` |
| `"it is reserved by HTML"` | `annotation-xml`, `color-profile`, `font-face`, `font-face-src`, `font-face-uri`, `font-face-format`, `font-face-name`, `missing-glyph` |
| `null` | `"ui--card"`, `"ui.custom-card"` |

## `isKebabName(name)`

`true` for a lower-case kebab name: ASCII words of lower-case letters and digits, each starting with a letter, joined
by single hyphens (`/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/`). This is the shape of an export name and of a
namespace. `ui`, `custom-card`, `v2-card` pass; `UI`, `a--b`, `-x`, `x-`, `2x` do not. (Export names are further
restricted: `default` and `components` are reserved.)

## `camelCase(name)`, `kebabCase(name)`

```js
camelCase('fancy-button');     // "fancyButton"   (how an export appears on a namespace)
kebabCase('FancyButton');      // "fancy-button"
kebabCase('customCard');       // "custom-card"
kebabCase('HTMLCard');         // "html-card"
kebabCase('custom-card');      // "custom-card"   (kebab names pass through)
```
