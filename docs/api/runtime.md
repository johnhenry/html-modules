# Runtime: definitions and binding

[API reference](../api.md) › Runtime

`src/runtime.js` (also `@johnhenry/html-modules/runtime`) is the only place component semantics live. The runtime
loader and compiled modules both build definitions with `defineHTMLComponent()` and bind them with `bindModule()`,
so the two paths cannot drift apart. A definition is inert: **nothing registers until something binds it to a
tag.**

- Definitions: [`HTMLComponent` / `defineHTMLComponent`](#htmlcomponent), [`isHTMLComponent`](#ishtmlcomponentvalue)
- Stylesheets: [`HTMLStylesheet` / `defineHTMLStylesheet`](#htmlstylesheet), [`adoptStylesheet`](#adoptstylesheetroot-value-options), [`isHTMLStylesheet`, `isStylesheet`](#ishtmlstylesheetvalue-isstylesheetvalue)
- Page security: [`configureRuntime`](#configureruntimewindow-options)
- Registration: [`defineElement`](#defineelementtag-value-options), [`toComponent`](#tocomponentvalue-options), [`isElementLike`](#iselementlikevalue-window)
- Binding: [`bindModule`](#bindmodule), [`applyBinding`](#applybinding), [`registerComponents`](#registercomponentsns-options)
- Namespaces: [`lookupExport`](#lookupexportns-name-from), [`componentsOf`](#componentsofns-from), [`manifest`](#manifestlocals-stars), [`namespaceComponents`](#namespacecomponentsname-ns)

## `HTMLComponent`

An HTML Component Definition: a component's module-local identity and how to render it. One definition can be
registered under any number of tags.

```ts
new HTMLComponent(spec?: {
  name?: string | null,                 // = null: the identity, e.g. "custom-card" (null for a default-only export)
  template?: string,                    // the <template>'s content HTML; required unless `element` is given
  shadow?: 'open' | 'closed',           // = "open"
  delegatesFocus?: boolean,             // = false
  styles?: string[],                    // = []: CSS texts, adopted into every shadow root (one sheet per definition)
  imports?: Array<{                     // = []: modules this component uses, bound before it is registered
    module?: object, from: string, as?: string, bindings?: Array<{ export, element?, adopt? }>,
    delimiter?: string, conflict?: 'error' | 'reuse', errors?: 'event' | 'throw', load?: 'eager' | 'lazy',
    lazy?: () => Promise<object>,       // an entry with no `module` and a `lazy` loader is bound on first use of its tags
  }>,
  element?: Function,                   // a JS-authored class extending HTMLElement, instead of a template
  url?: string,                         // where it came from, for messages
})

defineHTMLComponent(spec | Class | HTMLComponent): HTMLComponent
```

`defineHTMLComponent()` is the usual way to make one: it returns an existing definition as-is, wraps a class
(`defineHTMLComponent(MyElement)` ≡ `new HTMLComponent({ element: MyElement })`), or builds from a spec.

| Member | Description |
| --- | --- |
| `name` | The identity (`string` or `null`). For an `element` class without a `name`, the class name kebab-cased (`FancyButton` → `fancy-button`). |
| `template` | The template HTML, or `null` for a class-backed definition. |
| `shadow`, `delegatesFocus`, `styles`, `imports` | As given (normalized; `styles` and `imports` frozen, each import and its `bindings` frozen). |
| `url` | Present only when given. The runtime loader sets the module URL; compiled output sets `import.meta.url`. |
| `isClass` | `true` for a JS-authored (`element`) definition. |
| `element` | The base element class for `globalThis`, to extend: `customElements.define('x-card', class extends def.element { … })`. For a class-backed definition, the class itself. |
| `elementFor(window = globalThis)` | The base class for another window (a test DOM, an iframe). Built once per window. |
| `define(tag, { registry?, window?, conflict? })` | Register under `tag` and return the registered class: [`defineElement(tag, this, options)`](#defineelementtag-value-options). |
| `String(def)` | `"[object HTMLComponent]"`. |

The instance is frozen.

**What an instance of a template-backed element does** when constructed:

1. If it already has a shadow root with content (declarative shadow DOM, server-rendered), it keeps it and does not
   re-stamp.
2. Otherwise it attaches a shadow root (`{ mode: shadow, delegatesFocus }`, or reuses an empty existing one), adopts
   the component's stylesheets (its own `styles` as one shared constructed sheet per window, then any stylesheet its
   module's imports `adopt`), and appends a clone of the template content (parsed once per window, on first use).
3. It reports the shadow root to lazy loading (so lazily imported tags inside it are seen, even when `closed`).

The base class is named after the identity in PascalCase (`custom-card` → `CustomCard`, `HTMLModuleElement` when the
name is `null`), and has a static `component` getter returning the definition, so
`customElements.get('ui--card').component === ui.card`. Classes that extend it (every registered tag, and your own
subclasses) inherit that getter. A class-backed definition registers the class itself (subclassed); it has no
template, styles or `component` getter unless the class extends a template-backed base.

```js
import { defineHTMLComponent } from '@johnhenry/html-modules/runtime';

const card = defineHTMLComponent({
  name: 'card',
  template: '<article><slot></slot></article>',
  styles: [':host { display: block }'],
});
card.define('my-card');                                  // → the registered class
card.define('invoice-card');                             // another tag: a different class, the same component
customElements.define('fancy-card', class extends card.element { connectedCallback() { /* behaviour */ } });

// HTML template + JS behaviour, carrying the template module's own imports:
class LikeButton extends likeView.element { connectedCallback() { /* … */ } }
export const components = { 'like-button': defineHTMLComponent({ element: LikeButton, imports: likeView.imports }) };
```

Throws `` TypeError: defineHTMLComponent: pass a `template` string or an `element` class ``, `` TypeError:
defineHTMLComponent: `element` must be a class extending HTMLElement ``, or `SyntaxError: Invalid shadow mode "…":
use "open" or "closed"`.

## `isHTMLComponent(value)`

`true` for a definition. The brand is `Symbol.for('html-modules.component')`, a global symbol, so definitions made
by another copy of the library are recognized too.

## `HTMLStylesheet`

A stylesheet export: CSS text that can be adopted into documents and shadow roots.

```ts
new HTMLStylesheet(spec?: { name?: string | null, css?: string, url?: string })
defineHTMLStylesheet(spec | HTMLStylesheet): HTMLStylesheet
```

| Member | Description |
| --- | --- |
| `name` | The export name, or `null`. |
| `css` | The CSS text (`String(css)`, default `""`). |
| `url` | Present only when given. |
| `sheetFor(window = globalThis)` | A constructed `CSSStyleSheet` for that window (built once and shared), or `null` where constructable stylesheets are unavailable. |
| `adopt(root, { window? })` | [`adoptStylesheet(root, this, options)`](#adoptstylesheetroot-value-options). |
| `String(sheet)` | `"[object HTMLStylesheet]"`. |

Frozen. Branded with `Symbol.for('html-modules.stylesheet')`.

## `adoptStylesheet(root, value, options)`

```ts
adoptStylesheet(root: Document | ShadowRoot, value: HTMLStylesheet | CSSStyleSheet, options?: { window? }): void
```

Adopt a stylesheet into a document or shadow root. Adopting the same sheet into the same root again is a no-op.
Where `adoptedStyleSheets` is available, the window's constructed sheet is appended to it. Otherwise (for an
`HTMLStylesheet`) a `<style data-html-module="<name>">` is appended once to `document.head` (for a document) or the
shadow root. `window` defaults to the root's window; the fallback `<style>` gets the window's configured `nonce`. Throws `TypeError: adoptStylesheet: not a stylesheet`, or
`TypeError: This document cannot adopt a CSSStyleSheet` for a raw `CSSStyleSheet` where adoption is unsupported.

## `configureRuntime(window, options)`

```ts
configureRuntime(window, options: { trustedTypes?: { createHTML(html: string): unknown } | false, nonce?: string }): void
```

Per-window page-security settings (only the keys given change). `trustedTypes` is the policy wrapping the template HTML
the runtime stamps (`false`: never; default: a policy named `html-modules` where `window.trustedTypes` exists);
`nonce` goes on the fallback `<style>` elements `adoptStylesheet` inserts. `createHTMLModules({ trustedTypes, nonce })`
calls this for its window; call it yourself when only compiled modules run in the page. Throws `TypeError: Invalid
trustedTypes: pass a Trusted Types policy (an object with createHTML(html)), or false to never use Trusted Types` /
`TypeError: Invalid nonce "<v>": pass the page's CSP nonce as a non-empty string`. See
[Trusted Types and CSP](javascript.md#trusted-types-and-csp).

## `isHTMLStylesheet(value)`, `isStylesheet(value)`

`isHTMLStylesheet`: an `HTMLStylesheet` (from any copy of the library). `isStylesheet`: an `HTMLStylesheet` or a
`CSSStyleSheet`-like object (has `replaceSync` and `cssRules`); what `adopt` accepts.

## `defineElement(tag, value, options)`

```ts
defineElement(tag: string, value: HTMLComponent | typeof HTMLElement | HTMLTemplateElement,
              options?: { registry?: CustomElementRegistry, window?: Window, conflict?: 'error' | 'reuse' }): CustomElementConstructor
```

Register an element-like value under `tag` and return the registered class. `window` defaults to `globalThis`,
`registry` to `window.customElements`, `conflict` to `"error"`.

- Every registration is a **fresh subclass** of the definition's base element (a registry accepts a constructor only
  once), named like the base class. So one definition can have many tags.
- The definition's module **imports are bound first** (eager ones now, lazy ones watched for), in the same registry.
  A failing import throws to the caller (and, with that import's `errors: 'throw'`, is also reported).
- The **same definition under the same tag** again returns the existing class: a no-op.
- A tag **already defined by something else**: throws `Error: Cannot bind <tag>: it is already defined by "<name>"
  from <url> (conflict="reuse" keeps the existing definition instead)` (the `by …` part appears when html-modules
  made that registration in this registry), or, with `conflict: 'reuse'`, returns the existing class unchanged.
- Throws `SyntaxError: "<tag>" is not a valid custom element name: <reason>`, `SyntaxError: Invalid
  conflict="…"`, or the [`toComponent`](#tocomponentvalue-options) `TypeError`.

## `toComponent(value, options)`

```ts
toComponent(value: unknown, options?: { window?: Window, what?: string }): HTMLComponent
```

The definition for any element-like value: a definition as-is; a class extending `HTMLElement` or a `<template>`
element wrapped in a definition (the same wrapper every time, so identity is stable). Anything else throws
`TypeError: Cannot register <what> as a custom element: it is <kind>, not a component`, where `<kind>` is one of `a
stylesheet`, `a function that does not extend HTMLElement (<Name>)`, `null`, `an array`, `data (an object)`,
`data (a <typeof>)`.

## `isElementLike(value, window)`

`true` for values that can become a custom element: a definition, a `<template>` element, or a class extending the
window's (or the global) `HTMLElement`.

## `bindModule`

```ts
bindModule(ns: object, options?: {
  as?: string, delimiter?: string /* = "--" */, bindings?: Array<{ export: string, element?: string, adopt?: boolean }>,
  from?: string /* = "module" */, registry?, window? /* = globalThis */, root?: Document | ShadowRoot,
  conflict?: 'error' | 'reuse',
}): {
  elements: Record<string, CustomElementConstructor>,        // tag → registered class
  values: Record<string, unknown>,                           // export → value, for each binding
  tags: Record<string, { tag: string, namespace: string | null, export: string, reused?: true }>,
}
```

Bind a module namespace (runtime-loaded HTML, compiled, or plain JS) the way `<html-import>` does:

- with `bindings`: only those, each as [`applyBinding`](#applybinding) does it, in order, **every binding checked
  before any is applied**: a missing export, an invalid tag, a non-component `element`, a tag that is already defined
  (or that two bindings of the list both want) throws and leaves nothing registered or adopted;
- otherwise, with `as`: every component of [`componentsOf(ns)`](#componentsofns-from) as
  `<as><delimiter><export>`, **every tag checked before any is registered** (invalid names and tags already defined
  alike, so a conflict on the last tag does not leave `<ui--a>` and `<ui--b>` registered; `conflict: 'reuse'` keeps
  the existing ones and registers the rest). The same holds for [`registerComponents`](#registercomponentsns-options);
- otherwise: nothing (`{ elements: {}, values: {}, tags: {} }`).

What the check cannot see in advance: a component's **own** module imports are bound when that component registers
(they may load and register more tags), so a failure there can still leave earlier tags of the batch registered.

`as`, `delimiter` and `conflict` are validated first (`SyntaxError`). `root` is where `adopt` bindings adopt; without
it they are applied (validated) but not adopted. `tags` records what each tag was made from, so nothing needs to
split a tag.

## `applyBinding`

```ts
applyBinding(ns: object, binding: { export: string, element?: string, adopt?: boolean }, options?: {
  as?, delimiter? /* = "--" */, from? /* = "module" */, registry?, window?, root?, conflict?,
}): { export: string, value: unknown, tag: string | null, namespace: string | null,
      element: CustomElementConstructor | null, adopted: boolean, reused?: true }
```

Apply one `<html-binding>`: look up the export ([`lookupExport`](#lookupexportns-name-from)); with `adopt`, adopt it
into `root` (it must be a stylesheet); with `element`, register it there (it must be element-like); otherwise, with
`as` and an element-like value, register it as `<as><delimiter><export>` (a `SyntaxError` for `export: 'default'`,
which needs `element`). `namespace` is `as` when the tag was made from it and `null` when `element` chose it (or
nothing was registered). The full table is in [HTML syntax](html-syntax.md#html-binding). Throws `SyntaxError` for a
missing `export` (`<html-binding> requires an "export" attribute`), a missing export in the module, an invalid tag,
or a default without `element`; `TypeError` for a non-stylesheet `adopt` or a non-component `element`.

## `registerComponents(ns, options)`

```ts
registerComponents(ns: object, options?: { as?, delimiter?, from?, registry?, window?, conflict? }):
  Record<string, CustomElementConstructor>     // tag → registered class
```

Register every component of a namespace: with `as`, as `<as><delimiter><export>` (all tags checked before any
registration); without it, under the export names themselves, which must then be valid custom element names (`card`
throws; `plain-card` works). This is what compiled `register`-format modules call:
`registerComponents({ components: $components }, { as, delimiter, conflict, from: import.meta.url })`.

## `lookupExport(ns, name, from)`

```ts
lookupExport(ns: object, name: string, from?: string /* = "module" */): unknown
```

Find an export by the name used in markup: for `"default"`, `ns.default`; otherwise the `components` manifest entry,
then `ns[name]`, then `ns[camelCase(name)]` (own properties only). Throws `SyntaxError: The requested module
'<from>' does not provide an export named '<name>'`.

## `componentsOf(ns, from)`

```ts
componentsOf(ns: object, from?: string): Array<[exportName: string, value: unknown]>
```

The components a module offers to a whole-namespace import: its `components` manifest if it has one (an object);
otherwise its exports made with `defineHTMLComponent()` (excluding `default`), keyed by kebab-cased export name. Other
exports (constants, functions, plain classes) are never components. Throws `` TypeError: The module '<from>' does not
export any HTML components: export a `components` manifest or definitions made with defineHTMLComponent(), or bind
exports explicitly with <html-binding> ``.

A JavaScript module offers components either way:

```js
export const components = { 'custom-card': CustomCard, 'fancy-button': FancyButton };  // a manifest (classes are fine)
// or
export const customCard = defineHTMLComponent(CustomCard);                               // → "custom-card"
```

## `manifest(locals, stars)`

```ts
manifest(locals: Record<string, unknown>, stars?: Array<[namespace: object, from: string]>): Readonly<Record<string, unknown>>
```

Build an HTML module's `components` manifest: the element-like values of `locals` (export name → value; others
skipped), then each star source's components that `locals` does not already name. A name two star sources give
**different** components is a `SyntaxError: Conflicting star exports for '<name>' from '<a>' and '<b>'`. Frozen.
Used by the loader and by compiled output.

## `namespaceComponents(name, ns)`

```ts
namespaceComponents(name: string, ns: object): Record<string, unknown>
```

The manifest entries a namespace re-export (`<html-export src="./icons.html" name="icon" import="*">`) contributes:
each of `ns`'s components (per [`componentsOf`](#componentsofns-from)) keyed `<name>--<export>`, e.g.
`{ 'icon--star': … }`. Returns `{}` when `ns` offers no components instead of throwing. Spread into the `locals` of
[`manifest`](#manifestlocals-stars) by the loader and by compiled output.
