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
