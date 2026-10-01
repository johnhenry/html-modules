/**
 * Form-associated components: `<html-export name="x-field" form-associated form-control="input">`.
 *
 * The registered class gets `static formAssociated = true` and the platform's form participation through
 * ElementInternals: a form value, validity, `disabled`, reset and restore. Two ways to supply the value:
 *
 *   - `form-control="selector"`: a control inside the template (`input`, `textarea`, `select`). Its value is the
 *     element's form value, its validity is the element's validity (and its validation message), and the
 *     element's `disabled` / `required` are passed on to it. Typing in it updates the form value.
 *   - no `form-control`: the element is the control. Set `el.value`; or call `el.internals.setFormValue(…)` yourself.
 *
 * ElementInternals can be attached only once per element, and a component's base class may need it already (a
 * closed declarative shadow root is only visible through it), so `attachInternals()` on these classes is
 * memoized: every caller, including a subclass that calls `this.attachInternals()`, gets the same object.
 */
/** Built-in properties of a form-associated component: a `props` entry may not take them. */
export declare const FORM_PROPERTIES: Set<string>;
/** Attributes a form-associated component observes besides its template's. */
export declare const FORM_ATTRIBUTES: string[];
/** Throw unless `selector` names a text-like control in the template content (checked when a definition is registered). */
export declare function checkFormControl(content: any, selector: any, what: any): void;
/** Add the form members to a template element class (once per class). */
export declare function installFormAssociation(cls: any, internalsOf: any): void;
/**
 * Connect a freshly stamped element to its form: find the control, take the initial value (the `value` attribute,
 * else the control's own), publish it, and follow the control's `input` / `change` events. Safe to call again
 * after the shadow root was re-stamped.
 */
export declare function setupForm(el: any, root: any, selector: any, internalsOf: any): void;
/** An observed attribute of a form-associated element changed. */
export declare function formAttributeChanged(el: any, name: any, previous: any, value: any): void;
