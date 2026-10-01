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
 * Two things the platform does for native controls and buttons that it does not do for a custom element, which this
 * module supplies:
 *
 *   - implicit submission: Enter in a text-like `<input>` that is the element's `form-control` submits the form the
 *     way Enter in a native input does (the form's default button if there is one, honouring a disabled one; with no
 *     button, only when the form has at most one field that blocks implicit submission).
 *   - `form-role="submit"|"reset"`: the element is a submit or reset button. Click, Enter and Space activate it; a
 *     submit button is the form's default button. A custom element cannot be a real submit button (the platform's
 *     `form.requestSubmit(el)` throws a TypeError for one), so it validates, fires `submit` with `event.submitter`
 *     set to the element, and calls `form.submit()` unless the event was cancelled: what `requestSubmit` does.
 *
 * ElementInternals can be attached only once per element, and a component's base class may need it already (a
 * closed declarative shadow root is only visible through it), so `attachInternals()` on these classes is
 * memoized: every caller, including a subclass that calls `this.attachInternals()`, gets the same object.
 */
/** Built-in properties of a form-associated component: a `props` entry may not take them. */
export declare const FORM_PROPERTIES: Set<string>;
/** Values of `form-role`. */
export declare const FORM_ROLES: Set<string>;
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
export declare function setupForm(el: any, root: any, selector: any, internalsOf: any, role: any): void;
/** Called when a button component is connected: it needs to be focusable to be operated from the keyboard. */
export declare function connectButton(el: any): void;
/** An observed attribute of a form-associated element changed. */
export declare function formAttributeChanged(el: any, name: any, previous: any, value: any): void;
