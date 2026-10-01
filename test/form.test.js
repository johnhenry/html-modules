// Form-associated components: records, registration, and the form logic against a recording ElementInternals.
// linkedom has no ElementInternals, forms or validation, so a fake stands in for it here; the real thing
// (participation in <form>, FormData, :invalid, reset, restore) is proven in test/browser/form.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineHTMLComponent, scanHTMLModule, readHTMLModule, compileHTMLModule } from '../src/index.js';
import { makeWindow } from './helpers.js';
import { specParse } from './spec-dom.js';

function windowWithInternals() {
  const win = makeWindow();
  win.attached = 0;
  win.HTMLElement.prototype.attachInternals = function attachInternals() {
    win.attached++;
    if (this.__internals) throw new DOMException('already attached', 'NotSupportedError');
    const calls = [];
    this.__internals = {
      calls,
      form: null,
      validity: {},
      setFormValue: (...a) => calls.push(['value', ...a]),
      setValidity: (...a) => calls.push(['validity', ...a]),
      checkValidity: () => true,
      reportValidity: () => true,
      shadowRoot: null,
    };
    return this.__internals;
  };
  return win;
}

const mount = (def, tag, attrs = '', win = windowWithInternals()) => {
  def.define(tag, { window: win });
  win.document.body.insertAdjacentHTML('beforeend', `<${tag} ${attrs}></${tag}>`);
  const el = win.document.body.lastElementChild;
  return { win, el, root: el.shadowRoot, calls: () => el.__internals.calls };
};
const last = (calls, kind) => calls.filter((c) => c[0] === kind).at(-1);

test('records: form-associated and form-control, in both readers, with their errors', () => {
  const html = '<html-export name="x-field" form-associated form-control="input"><template><input></template></html-export>';
  const a = scanHTMLModule(html, 'm.html');
  assert.equal(a.exports[0].formAssociated, true);
  assert.equal(a.exports[0].formControl, 'input');
  assert.deepEqual(readHTMLModule(specParse(html), 'm.html'), a);
  const plain = scanHTMLModule('<html-export name="x-p" form-associated><template>x</template></html-export>');
  assert.equal(plain.exports[0].formAssociated, true);
  assert.equal('formControl' in plain.exports[0], false);
  assert.equal(scanHTMLModule('<html-export name="x-p" form-associated="false"><template>x</template></html-export>').exports[0].formAssociated, undefined);
  const T = '<template>x</template>';
  for (const [attrs, message] of [
    ['form-control="input"', /form-control="input" needs form-associated/],
    ['form-associated form-control=""', /form-control="" is empty/],
    ['form-associated="maybe"', /Invalid form-associated="maybe".*it is a boolean attribute/],
    ['form-associated props="value"', /"value" cannot be a prop of a form-associated component: it is a built-in property/],
    ['form-associated props="a name:number"', /"name" cannot be a prop of a form-associated component/],
  ]) {
    const source = `<html-export name="x-f" ${attrs}>${T}</html-export>`;
    for (const read of [(h) => scanHTMLModule(h, 'm.html'), (h) => readHTMLModule(specParse(h), 'm.html')]) {
      assert.throws(() => read(source), (e) => e instanceof SyntaxError && message.test(e.message), attrs);
    }
  }
  for (const attr of ['form-associated', 'form-control="input"']) {
    assert.throws(() => scanHTMLModule(`<html-export name="s" ${attr}><style>p{}</style></html-export>`, 'm.html'), /only applies to an export with a <template>/);
  }
  const code = compileHTMLModule(html, { url: 'f.html' });
  assert.match(code, /formAssociated: true,\n\s+formControl: "input",/);
});

test('records: a component with a form-control delegates focus by default; an explicit setting (or the module default) still decides', () => {
  // regression: the host of a form-control component is not focusable, so a browser could not focus the invalid
  // control on submit (Firefox: "The invalid form control with name='x' is not focusable"). Found by the workbench app.
  const T = '<template><input></template>';
  const delegates = (source) => {
    const a = scanHTMLModule(source, 'm.html').exports[0].delegatesFocus;
    assert.equal(readHTMLModule(specParse(source), 'm.html').exports[0].delegatesFocus, a, 'both readers agree');
    return a;
  };
  assert.equal(delegates(`<html-export name="x-a" form-associated form-control="input">${T}</html-export>`), true);
  assert.equal(delegates(`<html-export name="x-b" form-associated form-control="input" delegates-focus="false">${T}</html-export>`), false);
  assert.equal(delegates(`<html-export name="x-c" form-associated form-control="input" delegates-focus>${T}</html-export>`), true);
  assert.equal(delegates(`<html-module-settings delegates-focus="false"></html-module-settings><html-export name="x-d" form-associated form-control="input">${T}</html-export>`), false, 'the module default decides');
  // no form-control: the element is the control, and nothing changes; neither does a plain component
  assert.equal(delegates(`<html-export name="x-e" form-associated>${T}</html-export>`), false);
  assert.equal(delegates(`<html-export name="x-f">${T}</html-export>`), false);
  // the compiler bakes it in
  assert.match(compileHTMLModule(`<html-export name="x-g" form-associated form-control="input">${T}</html-export>`, { url: 'g.html' }), /delegatesFocus: true,/);
});

test('registration: static formAssociated, a control that must exist in the template, one shared ElementInternals', () => {
  const win = windowWithInternals();
  const def = defineHTMLComponent({ name: 'x-reg', template: '<input>', formAssociated: true, formControl: 'input' });
  const Class = (def.define('x-reg', { window: win }), win.customElements.get('x-reg'));
  assert.equal(Class.formAssociated, true);
  assert.equal(defineHTMLComponent({ name: 'x-plain', template: 'x' }).elementFor(win).formAssociated, false);
  for (const [control, message] of [['textarea', /form-control="textarea" matches nothing in the template/], ['p', /matches <p>, which is not a form control/], ['[', /is not a valid selector/]]) {
    const bad = defineHTMLComponent({ name: 'x-bad', template: '<input><p>x</p>', formAssociated: true, formControl: control });
    assert.throws(() => bad.define('x-bad', { window: win }), (e) => e instanceof SyntaxError && message.test(e.message), control);
  }
  assert.throws(() => defineHTMLComponent({ name: 'x-c', template: 'x', formControl: 'input' }), /`formControl` needs `formAssociated: true`/);
  const el = win.document.createElement('x-reg');
  assert.equal(el.attachInternals(), el.attachInternals(), 'attachInternals() is memoized: a subclass can call it too');
  assert.equal(win.attached, 1, 'the platform call happens once per element');
  assert.equal(el.internals, el.attachInternals());
  assert.equal(el.type, 'x-reg');
});

test('a closed shadow root and form association coexist: one attachInternals() serves both', () => {
  const win = windowWithInternals();
  const def = defineHTMLComponent({ name: 'x-closed', template: '<input>', shadow: 'closed', formAssociated: true, formControl: 'input' });
  const { el } = mount(def, 'x-closed', '', win);
  assert.equal(win.attached, 1);
  assert.ok(el.internals.calls.some((c) => c[0] === 'value'), 'the form value was published');
});

test('a control inside the template supplies the value, validity and disabled/required', () => {
  const def = defineHTMLComponent({ name: 'x-ctl', template: '<label><input type="text"></label>', formAssociated: true, formControl: 'input' });
  const { el, root, calls } = mount(def, 'x-ctl', 'value="hi" required');
  const input = root.querySelector('input');
  assert.equal(input.value, 'hi', 'the value attribute is the control\'s initial value');
  assert.equal(el.value, 'hi');
  assert.deepEqual(last(calls(), 'value').slice(1), ['hi', 'hi']);
  assert.equal(input.required, true, 'required is passed on to the control');
  input.value = 'typed';
  input.dispatchEvent(new root.ownerDocument.defaultView.Event('input', { bubbles: true }));
  assert.deepEqual(last(calls(), 'value').slice(1), ['typed', 'typed']);
  el.value = 'set';
  assert.equal(input.value, 'set');
  assert.equal(last(calls(), 'value')[1], 'set');
  el.setAttribute('disabled', '');
  assert.equal(input.disabled, true);
  el.formDisabledCallback(false);
  assert.equal(input.disabled, true, 'a disabled attribute keeps the control disabled');
  el.removeAttribute('disabled');
  assert.equal(input.disabled, false);
  el.formResetCallback();
  assert.equal(el.value, 'hi', 'reset restores the initial value');
  el.formStateRestoreCallback('restored', 'restore');
  assert.equal(input.value, 'restored');
  assert.equal(el.name, '');
  el.name = 'who';
  assert.equal(el.getAttribute('name'), 'who');
});

test('without a control: value, required, custom validity, reset', () => {
  const def = defineHTMLComponent({ name: 'x-own', template: '<span part="v"></span>', formAssociated: true });
  const { el, calls } = mount(def, 'x-own', 'required');
  assert.deepEqual(last(calls(), 'validity').slice(1, 2), [{ valueMissing: true }], 'required and empty: valueMissing');
  assert.equal(last(calls(), 'validity')[2], 'Please fill out this field.');
  el.value = 'x';
  assert.deepEqual(last(calls(), 'validity').slice(1), [{}], 'filled: valid');
  assert.deepEqual(last(calls(), 'value').slice(1), ['x', 'x']);
  el.setCustomValidity('nope');
  assert.deepEqual(last(calls(), 'validity').slice(1, 3), [{ customError: true }, 'nope']);
  el.setCustomValidity('');
  assert.deepEqual(last(calls(), 'validity').slice(1), [{}]);
  el.formResetCallback();
  assert.equal(el.value, '');
  assert.equal(last(calls(), 'validity')[1].valueMissing, true);
  el.setAttribute('value', 'default');
  assert.equal(el.value, 'default', 'a clean element follows its value attribute (the default value)');
  el.value = 'mine';
  el.setAttribute('value', 'other');
  assert.equal(el.value, 'mine', 'a dirty one does not');
  assert.equal(el.defaultValue, 'other');
});

test('records: form-role makes a submit or reset button, in both readers, with its errors; the compiler emits it', () => {
  const T = '<template><button type="button">Go</button></template>';
  for (const role of ['submit', 'reset']) {
    const html = `<html-export name="x-btn" form-associated form-role="${role}">${T}</html-export>`;
    const a = scanHTMLModule(html, 'm.html');
    assert.equal(a.exports[0].formRole, role);
    assert.deepEqual(readHTMLModule(specParse(html), 'm.html'), a);
    assert.match(compileHTMLModule(html, { url: 'b.html' }), new RegExp(`formAssociated: true,\\n\\s+formRole: "${role}",`));
  }
  assert.equal('formRole' in scanHTMLModule(`<html-export name="x-p" form-associated>${T}</html-export>`).exports[0], false);
  for (const [attrs, message] of [
    ['form-role="submit"', /form-role="submit" needs form-associated/],
    ['form-associated form-role=""', /form-role="" is empty; write form-role="submit" or form-role="reset"/],
    ['form-associated form-role="button"', /form-role="button" must be "submit" or "reset"/],
    ['form-associated form-role="submit" form-control="input"', /form-role="submit" and form-control="input" cannot be combined/],
  ]) {
    const source = `<html-export name="x-f" ${attrs}>${T}</html-export>`;
    for (const read of [(h) => scanHTMLModule(h, 'm.html'), (h) => readHTMLModule(specParse(h), 'm.html')]) {
      assert.throws(() => read(source), (e) => e instanceof SyntaxError && message.test(e.message), attrs);
    }
  }
  assert.throws(() => scanHTMLModule('<html-export name="s" form-associated form-role="submit"><style>p{}</style></html-export>', 'm.html'), /only applies to an export with a <template>/);
  assert.throws(() => defineHTMLComponent({ name: 'x-r', template: 'x', formRole: 'submit' }), /`formRole` needs `formAssociated: true`/);
  assert.throws(() => defineHTMLComponent({ name: 'x-r', template: 'x', formAssociated: true, formRole: 'link' }), /Invalid formRole "link": use "submit" or "reset"/);
  assert.throws(() => defineHTMLComponent({ name: 'x-r', template: '<input>', formAssociated: true, formControl: 'input', formRole: 'submit' }), /has no `formControl`/);
});

// A recording form: the logic of implicit submission and of a button component, without a browser (the engines are in
// test/browser/form.spec.js).
function fakeForm(win, fields = []) {
  const form = {
    elements: fields, noValidate: false, log: [], valid: true,
    requestSubmit: () => form.log.push('requestSubmit'),
    submit() { form.log.push('submit'); },
    reportValidity: () => (form.log.push('reportValidity'), form.valid),
    dispatchEvent: (event) => (form.log.push(`event:${event.type}:${event.submitter?.localName ?? 'none'}`), !form.cancel),
    reset: () => form.log.push('reset'),
  };
  win.SubmitEvent = class extends win.Event { constructor(type, init) { super(type, init); this.submitter = init.submitter; } };
  return form;
}
const nativeButton = (type, disabled = false) => ({ localName: 'button', type, matches: () => disabled, click() { this.clicked = (this.clicked ?? 0) + 1; } });
const nativeInput = (type) => ({ localName: 'input', type });
const press = (win, el, key) => el.dispatchEvent(Object.assign(new win.Event('keydown', { bubbles: true, cancelable: true }), { key }));
// Activation is a default action, decided after dispatch (a task, for events that never reach a window).
const settle = () => new Promise((r) => setTimeout(r, 5));

test('implicit submission: Enter in a form-control input follows the HTML rules (default button, disabled default, blocking fields)', async () => {
  const def = defineHTMLComponent({ name: 'x-imp', template: '<input type="text"><textarea></textarea>', formAssociated: true, formControl: 'input' });
  const { win, el, root } = mount(def, 'x-imp');
  const input = root.querySelector('input');
  const form = fakeForm(win);
  el.__internals.form = form;
  const enter = async () => { form.log.length = 0; press(win, input, 'Enter'); await settle(); return [...form.log]; };

  form.elements = [el];
  assert.deepEqual(await enter(), ['requestSubmit'], 'no button, one blocking field: the form is submitted');
  form.elements = [el, nativeInput('email')];
  assert.deepEqual(await enter(), [], 'no button, two blocking fields: nothing');
  form.elements = [el, nativeInput('checkbox'), nativeInput('file')];
  assert.deepEqual(await enter(), ['requestSubmit'], 'a checkbox and a file input do not block');
  const first = nativeButton('submit');
  const second = nativeButton('submit');
  form.elements = [el, nativeInput('email'), nativeButton('button'), first, second];
  assert.deepEqual(await enter(), [], 'the default button is clicked, not requestSubmit()');
  assert.equal(first.clicked, 1, 'the first submit button in tree order');
  assert.equal(second.clicked, undefined);
  const disabled = nativeButton('submit', true);
  form.elements = [el, disabled, second];
  assert.deepEqual(await enter(), [], 'a disabled default button: nothing happens');
  assert.equal(disabled.clicked, undefined);
  assert.equal(second.clicked, undefined, 'the next button does not take over');
  // Not Enter, composing, cancelled, or no form
  form.log.length = 0;
  form.elements = [el];
  press(win, input, 'a');
  press(win, input, 'Tab');
  await settle();
  assert.deepEqual(form.log, []);
  input.dispatchEvent(Object.assign(new win.Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter', isComposing: true }));
  input.dispatchEvent(Object.assign(new win.Event('keydown', { bubbles: true, cancelable: true }), { key: 'Enter', keyCode: 229 }));
  await settle();
  assert.deepEqual(form.log, [], 'an IME composition confirms with Enter: not a submission');
  const cancelled = new win.Event('keydown', { bubbles: true, cancelable: true });
  cancelled.key = 'Enter';
  input.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
  input.dispatchEvent(cancelled);
  await settle();
  assert.deepEqual(form.log, [], 'a listener that cancelled the key, even one added after the component\'s, wins');
  el.__internals.form = null;
  press(win, input, 'Enter'); // not in a form: nothing, and no error
  await settle();
});

test('implicit submission: a textarea or a non-text input control never submits', async () => {
  for (const [template, tag] of [['<textarea></textarea>', 'x-imp-ta'], ['<input type="checkbox">', 'x-imp-cb']]) {
    const def = defineHTMLComponent({ name: tag, template, formAssociated: true, formControl: template.slice(1, template.indexOf('>')).split(' ')[0] });
    const { win, el, root } = mount(def, tag);
    const form = fakeForm(win, [el]);
    el.__internals.form = form;
    press(win, root.firstElementChild, 'Enter');
    await settle();
    assert.deepEqual(form.log, [], tag);
  }
});

test('a button component: it is the default button, takes no value, is never invalid, and reports type', async () => {
  const field = defineHTMLComponent({ name: 'x-fld', template: '<input type="text">', formAssociated: true, formControl: 'input' });
  const btn = defineHTMLComponent({ name: 'x-sub', template: '<span>Go</span>', formAssociated: true, formRole: 'submit' });
  const win = windowWithInternals();
  const { el: input, root } = mount(field, 'x-fld', '', win);
  const { el: button, calls } = mount(btn, 'x-sub', 'value="v" required', win);
  assert.equal(button.type, 'submit');
  assert.equal(input.type, 'x-fld', 'a component without a role keeps reporting its tag');
  assert.deepEqual(last(calls(), 'value').slice(1), [null], 'no form value, even with a value attribute');
  assert.deepEqual(last(calls(), 'validity').slice(1), [{}], 'required does not make a button invalid');
  const form = fakeForm(win, [input, button]);
  input.__internals.form = form;
  button.__internals.form = form;
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  press(win, root.querySelector('input'), 'Enter');
  await settle();
  assert.equal(clicks, 1, 'implicit submission activates the component as the default button');
  await settle();
  assert.deepEqual(form.log, ['reportValidity', 'event:submit:x-sub', 'submit'], 'validate, fire submit with the button as submitter, then submit');
  form.log.length = 0;
  form.cancel = true;
  button.click();
  await settle();
  assert.deepEqual(form.log, ['reportValidity', 'event:submit:x-sub'], 'a cancelled submit event stops the submission');
  form.log.length = 0;
  form.cancel = false;
  form.valid = false;
  button.click();
  await settle();
  assert.deepEqual(form.log, ['reportValidity'], 'an invalid form is not submitted');
  form.log.length = 0;
  form.noValidate = true;
  button.click();
  await settle();
  assert.deepEqual(form.log, ['event:submit:x-sub', 'submit'], 'novalidate skips validation');
  form.noValidate = false;
  form.valid = true;
  form.log.length = 0;
  button.setAttribute('formnovalidate', '');
  button.click();
  await settle();
  assert.deepEqual(form.log, ['event:submit:x-sub', 'submit'], 'formnovalidate skips validation');
  button.removeAttribute('formnovalidate');
  button.setAttribute('disabled', '');
  form.log.length = 0;
  button.click();
  await settle();
  assert.deepEqual(form.log, [], 'a disabled button does nothing');
  button.removeAttribute('disabled');
  button.__internals.form = null;
  button.click();
  await settle(); // not in a form: nothing, and no error
  assert.deepEqual(form.log, []);
});

test('a button component: Enter and Space on the host click it, Space on keyup; a reset button resets', async () => {
  const btn = defineHTMLComponent({ name: 'x-rst', template: '<span>Reset</span>', formAssociated: true, formRole: 'reset' });
  const { win, el } = mount(btn, 'x-rst');
  const form = fakeForm(win, [el]);
  el.__internals.form = form;
  el.connectedCallback();
  assert.equal(el.getAttribute('tabindex'), '0', 'focusable, so it can be operated from the keyboard');
  const key = (type, k, extra = {}) => { const e = Object.assign(new win.Event(type, { bubbles: true, cancelable: true }), { key: k }, extra); el.dispatchEvent(e); return e; };
  el.click();
  await settle();
  assert.deepEqual(form.log, ['reset']);
  form.log.length = 0;
  assert.equal(key('keydown', 'Enter').defaultPrevented, true);
  await settle();
  assert.deepEqual(form.log, ['reset'], 'Enter clicks on keydown');
  form.log.length = 0;
  key('keydown', 'Enter', { repeat: true });
  await settle();
  assert.deepEqual(form.log, [], 'a held Enter is not a second click');
  assert.equal(key('keydown', ' ').defaultPrevented, true, 'Space must not scroll the page');
  assert.deepEqual(form.log, [], 'Space activates on keyup');
  key('keyup', ' ');
  await settle();
  assert.deepEqual(form.log, ['reset']);
  form.log.length = 0;
  key('keydown', 'Enter', { ctrlKey: true });
  await settle();
  assert.deepEqual(form.log, [], 'a shortcut is not an activation');
  el.setAttribute('tabindex', '-1');
  el.connectedCallback();
  assert.equal(el.getAttribute('tabindex'), '-1', 'the author\'s tabindex stays');
});

test('a button component with a native <button> in its template leaves keyboard activation to it, and gets no tabindex', async () => {
  const btn = defineHTMLComponent({ name: 'x-nat', template: '<button type="button">Go</button>', formAssociated: true, formRole: 'submit' });
  const { win, el, root } = mount(btn, 'x-nat');
  const form = fakeForm(win, [el]);
  el.__internals.form = form;
  el.connectedCallback();
  assert.equal(el.hasAttribute('tabindex'), false);
  root.querySelector('button').dispatchEvent(Object.assign(new win.Event('keydown', { bubbles: true, cancelable: true, composed: true }), { key: 'Enter' }));
  await settle();
  assert.deepEqual(form.log, [], 'the host does not also activate');
  el.click(); // (what the inner button\'s click becomes at the host: linkedom does not carry events out of shadow roots)
  await settle();
  assert.deepEqual(form.log, ['reportValidity', 'event:submit:x-nat', 'submit']);
});
