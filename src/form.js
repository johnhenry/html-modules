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
export const FORM_PROPERTIES = new Set([
  'name', 'value', 'defaultValue', 'disabled', 'required', 'type', 'form', 'labels', 'validity', 'validationMessage',
  'willValidate', 'checkValidity', 'reportValidity', 'setCustomValidity', 'internals',
]);

/** Attributes a form-associated component observes besides its template's. */
export const FORM_ATTRIBUTES = ['name', 'value', 'disabled', 'required'];

const CONTROLS = new Set(['input', 'textarea', 'select']);
const states = new WeakMap(); // element → form state

const VALIDITY_KEYS = ['badInput', 'customError', 'patternMismatch', 'rangeOverflow', 'rangeUnderflow', 'stepMismatch', 'tooLong', 'tooShort', 'typeMismatch', 'valueMissing'];
const flagsOf = (validity) => Object.fromEntries(VALIDITY_KEYS.filter((k) => validity?.[k]).map((k) => [k, true]));

/** Throw unless `selector` names a text-like control in the template content (checked when a definition is registered). */
export function checkFormControl(content, selector, what) {
  let control;
  try {
    control = content.querySelector(selector);
  } catch {
    throw new SyntaxError(`${what}: form-control="${selector}" is not a valid selector`);
  }
  if (!control) throw new SyntaxError(`${what}: form-control="${selector}" matches nothing in the template`);
  if (!CONTROLS.has(control.localName)) {
    throw new SyntaxError(`${what}: form-control="${selector}" matches <${control.localName}>, which is not a form control (use an <input>, <textarea> or <select>)`);
  }
}

/** Add the form members to a template element class (once per class). */
export function installFormAssociation(cls, internalsOf) {
  const get = (el) => states.get(el);
  const reflect = (name, { boolean = false } = {}) => ({
    enumerable: true,
    configurable: true,
    get() {
      return boolean ? this.hasAttribute(name) : this.getAttribute(name) ?? '';
    },
    set(v) {
      if (boolean) this.toggleAttribute(name, Boolean(v));
      else this.setAttribute(name, String(v));
    },
  });
  Object.defineProperties(cls.prototype, {
    name: reflect('name'),
    disabled: reflect('disabled', { boolean: true }),
    required: reflect('required', { boolean: true }),
    defaultValue: reflect('value'),
    type: { enumerable: true, configurable: true, get() { return this.localName; } },
    internals: { enumerable: true, configurable: true, get() { return internalsOf(this); } },
    form: { enumerable: true, configurable: true, get() { return internalsOf(this).form; } },
    labels: { enumerable: true, configurable: true, get() { return internalsOf(this).labels; } },
    validity: { enumerable: true, configurable: true, get() { return internalsOf(this).validity; } },
    validationMessage: { enumerable: true, configurable: true, get() { return internalsOf(this).validationMessage; } },
    willValidate: { enumerable: true, configurable: true, get() { return internalsOf(this).willValidate; } },
    value: {
      enumerable: true,
      configurable: true,
      get() {
        const state = get(this);
        if (!state) return this.getAttribute('value') ?? '';
        return state.control ? state.control.value : state.value;
      },
      set(v) {
        const state = get(this);
        if (!state) return;
        state.dirty = true;
        write(this, state, v === null || v === undefined ? '' : String(v));
      },
    },
  });
  Object.assign(cls.prototype, {
    checkValidity() {
      return internalsOf(this).checkValidity();
    },
    reportValidity() {
      return internalsOf(this).reportValidity();
    },
    setCustomValidity(message) {
      const state = get(this);
      if (state) state.custom = String(message ?? '');
      validate(this);
    },
    formAssociatedCallback() {},
    formDisabledCallback(disabled) {
      const state = get(this);
      if (state?.control) state.control.disabled = disabled || this.hasAttribute('disabled');
    },
    formResetCallback() {
      const state = get(this);
      if (!state) return;
      state.dirty = false;
      state.custom = '';
      write(this, state, state.initialValue);
    },
    formStateRestoreCallback(restored) {
      const state = get(this);
      if (state && restored !== null && restored !== undefined) {
        state.dirty = true;
        write(this, state, String(restored));
      }
    },
  });
}

/** Write the value (control or own), then publish it to the form and revalidate. */
function write(el, state, value) {
  if (state.control) state.control.value = value;
  else state.value = value;
  publish(el, state);
}

function publish(el, state) {
  const value = state.control ? state.control.value : state.value;
  state.internals.setFormValue(value === '' && !state.control ? null : value, value);
  validate(el);
}

/** Recompute validity: the control's (or `required` on the element itself), plus a custom message. */
function validate(el) {
  const state = states.get(el);
  if (!state) return;
  const { internals, control } = state;
  let flags;
  let message = '';
  let anchor = control ?? undefined;
  if (control) {
    flags = flagsOf(control.validity);
    message = control.validationMessage;
  } else {
    flags = {};
    if (el.hasAttribute('required') && state.value === '') {
      flags.valueMissing = true;
      message = 'Please fill out this field.';
    }
    anchor = el.shadowRoot?.firstElementChild ?? undefined;
  }
  if (state.custom) {
    flags.customError = true;
    message = state.custom;
  }
  if (Object.keys(flags).length) internals.setValidity(flags, message, anchor);
  else internals.setValidity({});
}

/**
 * Connect a freshly stamped element to its form: find the control, take the initial value (the `value` attribute,
 * else the control's own), publish it, and follow the control's `input` / `change` events. Safe to call again
 * after the shadow root was re-stamped.
 */
export function setupForm(el, root, selector, internalsOf) {
  let state = states.get(el);
  const first = !state;
  if (first) {
    state = { internals: internalsOf(el), control: null, value: '', dirty: false, custom: '', initialValue: '', listener: null };
    states.set(el, state);
  } else if (state.control && state.listener) {
    for (const type of ['input', 'change']) state.control.removeEventListener(type, state.listener);
  }
  const previous = state.control ? state.control.value : state.value; // what a re-stamp must carry over
  const control = selector ? root.querySelector(selector) : null;
  state.control = control;
  const attribute = el.getAttribute('value');
  if (control) {
    if (first) {
      if (attribute !== null) control.value = attribute;
      state.initialValue = control.value;
    } else control.value = previous;
    state.listener = () => {
      state.dirty = true;
      publish(el, state);
    };
    for (const type of ['input', 'change']) control.addEventListener(type, state.listener);
    control.disabled = el.hasAttribute('disabled');
    control.required = el.hasAttribute('required');
  } else if (first) {
    state.initialValue = attribute ?? '';
    state.value = state.initialValue;
  }
  publish(el, state);
}

/** An observed attribute of a form-associated element changed. */
export function formAttributeChanged(el, name, previous, value) {
  const state = states.get(el);
  if (!state || previous === value) return;
  if (name === 'value') {
    state.initialValue = value ?? '';
    if (!state.dirty) write(el, state, value ?? '');
  } else if (name === 'disabled') {
    if (state.control) state.control.disabled = value !== null;
  } else if (name === 'required') {
    if (state.control) state.control.required = value !== null;
    validate(el);
  }
}
