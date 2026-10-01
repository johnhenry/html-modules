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
export const FORM_PROPERTIES = new Set([
  'name', 'value', 'defaultValue', 'disabled', 'required', 'type', 'form', 'labels', 'validity', 'validationMessage',
  'willValidate', 'checkValidity', 'reportValidity', 'setCustomValidity', 'internals',
]);

/** Values of `form-role`. */
export const FORM_ROLES = new Set(['submit', 'reset']);

/** Attributes a form-associated component observes besides its template's. */
export const FORM_ATTRIBUTES = ['name', 'value', 'disabled', 'required'];

const CONTROLS = new Set(['input', 'textarea', 'select']);
// <input> types whose fields block implicit submission (HTML: "a field that blocks implicit submission").
const TEXT_LIKE = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'date', 'month', 'week', 'time', 'datetime-local', 'number']);
// Native content inside a button component's shadow root that is focusable and activates itself on Enter and Space.
const NATIVE_ACTIVATABLE = 'button, a[href], input, select, textarea, summary, [tabindex]';
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
    type: { enumerable: true, configurable: true, get() { return get(this)?.role ?? this.localName; } },
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
  if (state.role) {
    // A button has no value of its own: nothing of it reaches FormData, and it is never invalid.
    state.internals.setFormValue(null);
    state.internals.setValidity({});
    return;
  }
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
export function setupForm(el, root, selector, internalsOf, role) {
  let state = states.get(el);
  const first = !state;
  if (first) {
    state = { internals: internalsOf(el), control: null, value: '', dirty: false, custom: '', initialValue: '', listener: null, keydown: null, role: role ?? null, nativeInner: false };
    states.set(el, state);
  } else if (state.control && state.listener) {
    for (const type of ['input', 'change']) state.control.removeEventListener(type, state.listener);
    if (state.keydown) state.control.removeEventListener('keydown', state.keydown);
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
    state.keydown = (event) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (control.localName !== 'input' || !TEXT_LIKE.has(control.type)) return; // not <textarea>, <select> or a checkbox
      // The platform's implicit submission is the *default action* of the key, so a listener further along the
      // event's path (a form that blocks Enter, say) can cancel it: decide after dispatch.
      afterDispatch(control, event, () => {
        const form = state.internals.form;
        if (form) implicitSubmit(form);
      });
    };
    control.addEventListener('keydown', state.keydown);
    control.disabled = el.hasAttribute('disabled');
    control.required = el.hasAttribute('required');
  } else if (first) {
    state.initialValue = attribute ?? '';
    state.value = state.initialValue;
  }
  if (state.role) {
    state.nativeInner = Boolean(root.querySelector(NATIVE_ACTIVATABLE));
    if (first) bindButton(el, state);
    // A native <button>/<a>/control inside carries the role (and the name) itself; a host role="button" around it is
    // a nested interactive control, which axe reports as `nested-interactive` (serious).
    if (!state.nativeInner && !state.internals.role) {
      try {
        state.internals.role = 'button';
      } catch {} // ARIA reflection on ElementInternals is not everywhere
    }
  }
  publish(el, state);
}

/** Is `el` disabled (its own attribute, a disabled fieldset, or a form-associated component being disabled)? */
function isDisabled(el) {
  if (el.hasAttribute?.('disabled')) return true;
  try {
    return el.matches(':disabled');
  } catch {
    return false;
  }
}

/** A native submit button (the form's default button candidates), or a component with `form-role="submit"`. */
function isSubmitButton(el) {
  const state = states.get(el);
  if (state) return state.role === 'submit';
  return (el.localName === 'button' && el.type === 'submit') || (el.localName === 'input' && (el.type === 'submit' || el.type === 'image'));
}

/** A field that blocks implicit submission: a text-like `<input>`, native or the `form-control` of a component. */
function blocksImplicitSubmission(el) {
  const state = states.get(el);
  const input = state ? state.control : el;
  return input?.localName === 'input' && TEXT_LIKE.has(input.type) && !state?.role;
}

/**
 * Run `action` as the *default action* of `event`: after it has been dispatched, and only if no listener cancelled
 * it. (A listener of this library runs before the author's, so it cannot see their `preventDefault()` itself.) The
 * window's bubble phase is the end of an event's path, so the common case is synchronous; an event that never gets
 * that far (propagation stopped, or a node outside any document) is settled by a task.
 */
function afterDispatch(target, event, action) {
  const win = target.ownerDocument?.defaultView ?? globalThis;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    win.removeEventListener?.(event.type, onWindow);
    if (!event.defaultPrevented) action();
  };
  const onWindow = (e) => {
    if (e === event) settle();
  };
  win.addEventListener?.(event.type, onWindow);
  setTimeout(settle, 0);
}

/**
 * Implicit submission, as the HTML Standard defines it: the form's default button (the first submit button in tree
 * order, native or a `form-role="submit"` component) is activated, and nothing happens when that button is disabled;
 * with no default button the form is submitted only if at most one field blocks implicit submission.
 */
function implicitSubmit(form) {
  const fields = [...form.elements];
  const button = fields.find(isSubmitButton);
  if (button) {
    if (!isDisabled(button)) button.click();
    return;
  }
  if (fields.filter(blocksImplicitSubmission).length <= 1) form.requestSubmit?.();
}

/**
 * `form.requestSubmit(submitter)` for a submitter that is a custom element (which the platform refuses): interactive
 * validation (unless the form is `novalidate` or the button has `formnovalidate`), a cancelable `submit` event whose
 * `submitter` is the element, then the form's submission unless the event was cancelled.
 */
function submitFrom(el, form) {
  if (!form.noValidate && !el.hasAttribute('formnovalidate') && !form.reportValidity()) return;
  const win = el.ownerDocument?.defaultView ?? globalThis;
  const init = { bubbles: true, cancelable: true };
  let event;
  try {
    event = new win.SubmitEvent('submit', { ...init, submitter: el });
  } catch {
    event = new win.Event('submit', init); // no SubmitEvent (or a submitter it will not take): the event, without `submitter`
  }
  // HTMLFormElement.prototype.submit, not form.submit: a field named "submit" shadows the method.
  if (form.dispatchEvent(event)) (win.HTMLFormElement?.prototype?.submit ?? form.submit).call(form);
}

/** Make the host a button: click submits or resets its form; Enter and Space (on the host itself) click it. */
function bindButton(el, state) {
  // Activation is the default action of a click: a click listener that cancels it stops the submission or reset.
  el.addEventListener('click', (event) => {
    afterDispatch(el, event, () => {
      const form = state.internals.form;
      if (!form || isDisabled(el)) return;
      if (state.role === 'reset') form.reset();
      else submitFrom(el, form);
    });
  });
  // A native button or link inside the shadow root (or slotted in) activates itself, and its click reaches this host.
  const mine = (event) => event.target === el && !state.nativeInner && !isDisabled(el);
  el.addEventListener('keydown', (event) => {
    if (!mine(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      const cancelled = event.defaultPrevented;
      event.preventDefault();
      if (!event.repeat && !cancelled) el.click();
    } else if (event.key === ' ') event.preventDefault(); // Space activates on keyup, and must not scroll the page
  });
  el.addEventListener('keyup', (event) => {
    if (mine(event) && event.key === ' ' && !event.defaultPrevented) {
      event.preventDefault();
      el.click();
    }
  });
}

/** Called when a button component is connected: it needs to be focusable to be operated from the keyboard. */
export function connectButton(el) {
  const state = states.get(el);
  if (state?.role && !state.nativeInner && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
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
