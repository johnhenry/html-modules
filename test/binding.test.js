// Data binding in templates: {{attribute}} in text and attribute values, declared props, escaping, patching.
// (linkedom proves the logic; stamping, upgrade and reflection in a real browser are proven in test/browser/.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineHTMLComponent, scanHTMLModule, readHTMLModule, compileHTMLModule, renderDeclarative } from '../src/index.js';
import { parseBindingText, isUnsafeURL, parseProps } from '../src/template.js';
import { makeWindow, setup, normalizeHTML } from './helpers.js';
import { specParse } from './spec-dom.js';

const mount = (def, tag, attrs = '', win = makeWindow()) => {
  def.define(tag, { window: win });
  win.document.body.insertAdjacentHTML('beforeend', `<${tag} ${attrs}></${tag}>`);
  const el = win.document.body.lastElementChild;
  return { win, el, root: el.shadowRoot };
};

test('parseBindingText: literals, bindings, escapes; expressions are refused', () => {
  assert.equal(parseBindingText('plain'), null);
  assert.deepEqual(parseBindingText('Hi {{ name }}!'), ['Hi ', { name: 'name' }, '!']);
  assert.deepEqual(parseBindingText('{{a}}{{b-c}}'), [{ name: 'a' }, { name: 'b-c' }]);
  assert.deepEqual(parseBindingText('\\{{a}} and {{a}}'), ['{{a}} and ', { name: 'a' }]);
  assert.deepEqual(parseBindingText('\\{{'), ['{{']);
  for (const bad of ['{{a + b}}', '{{ a.b }}', '{{ fn() }}', '{{}}', '{{ 1 }}', "{{a | upper}}"]) {
    assert.throws(() => parseBindingText(bad), /Invalid binding .*no expressions, filters or calls/, bad);
  }
  assert.throws(() => parseBindingText('x {{name'), /Unterminated binding "{{name"/);
});

test('isUnsafeURL: script and active-document schemes, however they are disguised', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', '\u0001javascript:x', 'vbscript:x', 'data:text/html,<b>', 'DATA:image/svg+xml,<svg>', '​javascript:x']) {
    assert.ok(isUnsafeURL(bad), JSON.stringify(bad));
  }
  for (const ok of ['https://x.test/', '/a/b', '#frag', 'mailto:a@b.c', 'data:image/png;base64,AAAA', 'javascript', 'x-javascript:y', 'about:blank']) {
    assert.ok(!isUnsafeURL(ok), ok);
  }
});

test('text bindings set text, never markup', () => {
  const def = defineHTMLComponent({ name: 'b-text', template: '<p>Hello, {{name}}!</p><p>{{ missing }}</p>' });
  const { el, root } = mount(def, 'b-text', 'name="<b>x</b> &amp;"');
  const [p1, p2] = root.querySelectorAll('p');
  assert.equal(p1.textContent, 'Hello, <b>x</b> &!');
  assert.equal(p1.children.length, 0, 'no element was created from the value');
  assert.equal(p2.textContent, '', 'an absent attribute is empty text');
  el.setAttribute('name', 'Ada');
  assert.equal(p1.textContent, 'Hello, Ada!');
});

test('updates patch the bound nodes: nothing is re-stamped, untouched nodes are not written', () => {
  const def = defineHTMLComponent({ name: 'b-patch', template: '<h1>{{title}}</h1><p>{{body}}</p><i>static</i>' });
  const { el, root } = mount(def, 'b-patch', 'title="a" body="b"');
  const [h1, p, i] = root.children;
  const writes = [];
  for (const node of [h1.firstChild, p.firstChild]) {
    let data = node.data;
    Object.defineProperty(node, 'data', { get: () => data, set(v) { writes.push(v); data = v; } });
  }
  el.setAttribute('title', 'A');
  assert.deepEqual(writes, ['A'], 'only the node that mentions "title" is written');
  el.setAttribute('title', 'A');
  el.setAttribute('body', 'B');
  assert.deepEqual(writes, ['A', 'B']);
  assert.deepEqual([...root.children], [h1, p, i], 'the same elements: the shadow root was not re-stamped');
  assert.equal(h1.textContent, 'A');
});

test('attribute bindings: interpolation, absent attributes remove the target, namespaced and unknown attributes', () => {
  const def = defineHTMLComponent({
    name: 'b-attr',
    template: '<a href="/users/{{id}}" title="{{ name }} ({{id}})" class="x {{kind}}">go</a><button disabled="{{off}}">b</button>',
  });
  const { el, root } = mount(def, 'b-attr', 'id="7" name="Ada" kind="big"');
  const a = root.querySelector('a');
  const button = root.querySelector('button');
  assert.equal(a.getAttribute('href'), '/users/7');
  assert.equal(a.getAttribute('title'), 'Ada (7)');
  assert.equal(a.getAttribute('class'), 'x big');
  assert.equal(button.hasAttribute('disabled'), false, 'a lone binding of an absent attribute removes the attribute');
  el.setAttribute('off', '');
  assert.equal(button.getAttribute('disabled'), '');
  el.removeAttribute('off');
  assert.equal(button.hasAttribute('disabled'), false);
  el.setAttribute('id', '8');
  assert.equal(a.getAttribute('href'), '/users/8');
  assert.equal(a.getAttribute('title'), 'Ada (8)');
});

test('URL attributes refuse javascript: and active data: URLs; they are removed, never set', () => {
  const def = defineHTMLComponent({ name: 'b-url', template: '<a href="{{href}}">a</a><img src="{{src}}"><form action="{{act}}"></form>' });
  const { el, root } = mount(def, 'b-url', 'href="https://ok.test/" src="javascript:alert(1)" act=" java\nscript:x"');
  assert.equal(root.querySelector('a').getAttribute('href'), 'https://ok.test/');
  assert.equal(root.querySelector('img').hasAttribute('src'), false);
  assert.equal(root.querySelector('form').hasAttribute('action'), false);
  el.setAttribute('href', 'JaVaScRiPt:alert(1)');
  assert.equal(root.querySelector('a').hasAttribute('href'), false, 'an update to a bad URL removes it');
  el.setAttribute('href', 'data:text/html,<script>1</script>');
  assert.equal(root.querySelector('a').hasAttribute('href'), false);
  el.setAttribute('href', '/fine');
  assert.equal(root.querySelector('a').getAttribute('href'), '/fine');
  // A static javascript: URL is the module author's own markup, not a binding: untouched.
  assert.equal(normalizeHTML('<a href="javascript:void(0)">x</a>'), '<a href="javascript:void(0)">x</a>');
});

test('on* attributes, style and srcdoc are never bound: a SyntaxError at registration, before anything is registered', () => {
  const win = makeWindow();
  for (const [html, message] of [
    ['<b onclick="{{x}}">x</b>', /<b onclick="{{x}}">: "onclick" is an event handler attribute; bindings never write on\* attributes/],
    ['<b ONMOUSEOVER="a{{x}}">x</b>', /event handler attribute/],
    ['<b style="color: {{c}}">x</b>', /"style" cannot be bound: it would inject CSS/],
    ['<iframe srcdoc="{{x}}"></iframe>', /"srcdoc" cannot be bound: it would inject HTML/],
    ['<p>{{ a + b }}</p>', /Invalid binding "{{ a \+ b }}": a binding is the name of a host attribute/],
    ['<a title="{{x">x</a>', /<a title>: Unterminated binding/],
  ]) {
    const def = defineHTMLComponent({ name: 'b-bad', template: html });
    assert.throws(() => def.define('b-bad', { window: win }), (e) => e instanceof SyntaxError && message.test(e.message), html);
    assert.equal(win.customElements.get('b-bad'), undefined, 'nothing was registered');
  }
});

test('static markup is untouched; text in <script>, <style> and nested <template> is not bound; \\{{ is a literal', () => {
  const def = defineHTMLComponent({
    name: 'b-static',
    template: '<style>.a{{x}}</style><p>\\{{x}} is literal, {{x}} is not</p><template><i>{{x}}</i></template><script>if(a){{b}}</script>',
  });
  const { root } = mount(def, 'b-static', 'x="1"');
  assert.equal(root.querySelector('p').textContent, '{{x}} is literal, 1 is not');
  assert.equal(root.querySelector('style').textContent, '.a{{x}}');
  assert.equal(root.querySelector('template').innerHTML, '<i>{{x}}</i>');
});

test('props: attributes reflected as typed properties, observed, and set before upgrade', () => {
  const def = defineHTMLComponent({
    name: 'b-props',
    template: '<p>{{title}}: {{count}}</p>',
    props: [{ name: 'title' }, { name: 'count', type: 'number' }, { name: 'open', type: 'boolean' }, { name: 'aria-label' }],
  });
  assert.deepEqual(def.props, [{ name: 'title', type: 'string' }, { name: 'count', type: 'number' }, { name: 'open', type: 'boolean' }, { name: 'aria-label', type: 'string' }]);
  const win = makeWindow();
  def.define('b-props', { window: win });
  const Class = win.customElements.get('b-props');
  assert.deepEqual(Class.observedAttributes, ['title', 'count', 'open', 'aria-label']);
  const el = win.document.createElement('b-props');
  win.document.body.append(el);
  assert.deepEqual([el.title, el.count, el.open, el.ariaLabel], ['', 0, false, '']);
  el.title = 'Tasks';
  el.count = 3;
  el.open = true;
  assert.equal(el.getAttribute('title'), 'Tasks');
  assert.equal(el.getAttribute('count'), '3');
  assert.equal(el.getAttribute('open'), '');
  assert.equal(el.shadowRoot.querySelector('p').textContent, 'Tasks: 3');
  el.open = false;
  assert.equal(el.hasAttribute('open'), false);
  el.setAttribute('count', 'abc');
  assert.equal(el.count, 0, 'a non-number reads as 0');
  assert.equal(el.shadowRoot.querySelector('p').textContent, 'Tasks: abc', 'the text shows the attribute as written');
});

test('props are declared in the record, identically by both readers, with their errors', () => {
  const html = '<html-export name="card" props="title count:number open:boolean, aria-label"><template>{{title}}</template></html-export>';
  const a = scanHTMLModule(html, 'm.html');
  const b = readHTMLModule(specParse(html), 'm.html');
  assert.deepEqual(a.exports[0].props, [{ name: 'title', type: 'string' }, { name: 'count', type: 'number' }, { name: 'open', type: 'boolean' }, { name: 'aria-label', type: 'string' }]);
  assert.deepEqual(b.exports[0].props, a.exports[0].props);
  assert.equal(scanHTMLModule('<html-export name="c"><template>x</template></html-export>').exports[0].props, undefined, 'absent unless declared');
  const T = '<template>x</template>';
  for (const [attrs, message] of [
    ['props=""', /props="" declares no props/],
    ['props="Title"', /"Title" in props is not "<name>" or "<name>:<type>"/],
    ['props="a:b:c"', /"a:b:c" in props is not/],
    ['props="count:int"', /props type "int" for "count" must be "string", "number", "boolean" or omitted/],
    ['props="a a"', /prop "a" is declared twice/],
    ['props="onclick"', /"onclick" cannot be a prop: bindings never write on\* attributes/],
    ['props="class-name"', /"className" is a member of the element itself/],
  ]) {
    const source = `<html-export name="card" ${attrs}>${T}</html-export>`;
    for (const read of [(h) => scanHTMLModule(h, 'm.html'), (h) => readHTMLModule(specParse(h), 'm.html')]) {
      assert.throws(() => read(source), (e) => e instanceof SyntaxError && message.test(e.message), `${attrs}`);
    }
  }
  assert.throws(() => scanHTMLModule('<html-export name="s" props="a"><style>p{}</style></html-export>', 'm.html'), /"props" only applies to an export with a <template>/);
  assert.deepEqual(parseProps('a', 'x', (n) => n), [{ name: 'a', type: 'string' }]);
});

test('runtime and compiled loading behave the same: props and bindings survive the compiler', async () => {
  const source = '<html-export name="user-card" props="name count:number"><template><b>{{name}}</b> <i title="{{count}}">{{count}}</i></template></html-export>';
  const code = compileHTMLModule(source, { url: 'user.html', runtime: new URL('../src/runtime.js', import.meta.url).href });
  assert.match(code, /props: \[\{"name":"name","type":"string"\},\{"name":"count","type":"number"\}\]/);
  const compiled = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const { modules } = setup({ files: { 'user.html': source } });
  const runtime = (await modules.load('./user.html')).userCard;
  assert.deepEqual(compiled.userCard.props, runtime.props);
  const render = (def, tag) => {
    const { el, root } = mount(def, tag, 'name="Ada" count="2"');
    el.count = 5;
    return root.innerHTML;
  };
  assert.equal(render(compiled.userCard, 'u-compiled'), render(runtime, 'u-runtime'));
  assert.match(render(runtime, 'u-runtime-2'), /<b>Ada<\/b> <i title="5">5<\/i>/);
});

test('server-rendered roots: a template with bindings cannot be rendered on the server, and an existing root is re-stamped keeping its styles', () => {
  const def = defineHTMLComponent({ name: 'b-ssr', template: '<p>{{who}}</p>', styles: ['p{color:red}'] });
  assert.throws(() => renderDeclarative(def), /has data bindings \(\{\{…\}\}\) in its template, which cannot be rendered on the server/);
  const plain = defineHTMLComponent({ name: 'b-ssr2', template: '<p>x</p>', props: [{ name: 'who' }] });
  assert.match(renderDeclarative(plain), /<template shadowrootmode="open"><p>x<\/p>/, 'props alone render fine');
  const win = makeWindow();
  const host = win.document.createElement('b-ssr');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>p{color:red}</style><p>{{who}} stale</p>';
  win.document.body.append(host);
  host.setAttribute('who', 'Ada');
  def.define('b-ssr', { window: win });
  win.customElements.upgrade(host);
  assert.equal(root.querySelectorAll('style').length >= 1, true, 'the leading <style> is kept');
  assert.equal(root.querySelector('p').textContent, 'Ada');
  assert.equal(root.querySelectorAll('p').length, 1, 'the stale server markup was replaced');
});
