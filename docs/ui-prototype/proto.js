/*
 * Tiny runtime for the interactive prototype screens.
 * A screen keeps its markup in <template id="screen"> and its logic in <script type="text/x-dc">.
 * Supported: {{ path }} in text and attributes, onClick="{{ fn }}", <sc-if value>, <sc-for list as>.
 * Props declared with an "enum" or "boolean" editor become controls in the prototype bar.
 */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) { Object.assign(this.state, patch); render(); }
  }

  const tpl = document.getElementById('screen');
  const logicTag = document.querySelector('script[type="text/x-dc"]');
  if (!tpl || !logicTag) return;

  const decl = JSON.parse(logicTag.getAttribute('data-props') || '{}');
  const props = {};
  Object.keys(decl).forEach((k) => { if (k[0] !== '$' && 'default' in decl[k]) props[k] = decl[k].default; });

  const Component = new Function('DCLogic', logicTag.textContent + '\nreturn Component;')(DCLogic);
  const comp = new Component(props);
  const mount = document.getElementById('mount');
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  function resolve(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    return path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), scope);
  }

  function process(node, scope) {
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('{{') !== -1) {
        node.nodeValue = node.nodeValue.replace(HOLE, (_, p) => { const v = resolve(p, scope); return v == null ? '' : String(v); });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();

    if (tag === 'sc-if') {
      const m = (node.getAttribute('value') || '').match(WHOLE);
      const frag = document.createDocumentFragment();
      if (m && resolve(m[1], scope)) {
        Array.from(node.childNodes).forEach((c) => frag.appendChild(c));
        Array.from(frag.childNodes).forEach((c) => process(c, scope));
      }
      node.replaceWith(frag);
      return;
    }

    if (tag === 'sc-for') {
      const m = (node.getAttribute('list') || '').match(WHOLE);
      const list = (m && resolve(m[1], scope)) || [];
      const as = node.getAttribute('as') || 'item';
      const frag = document.createDocumentFragment();
      list.forEach((item, i) => {
        const inner = Object.assign({}, scope, { [as]: item, $index: i });
        Array.from(node.childNodes).forEach((c) => {
          const copy = c.cloneNode(true);
          frag.appendChild(copy);
          process(copy, inner);
        });
      });
      node.replaceWith(frag);
      return;
    }

    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name;
      if (name.indexOf('hint-') === 0) { node.removeAttribute(name); return; }
      if (attr.value.indexOf('{{') === -1) return;
      const whole = attr.value.match(WHOLE);
      if (name.indexOf('on') === 0 && whole) {
        node.removeAttribute(name);
        const fn = resolve(whole[1], scope);
        if (typeof fn === 'function') node.addEventListener(name.slice(2), fn);
        return;
      }
      node.setAttribute(name, attr.value.replace(HOLE, (_, p) => { const v = resolve(p, scope); return v == null ? '' : String(v); }));
    });
    Array.from(node.childNodes).forEach((c) => process(c, scope));
  }

  function render() {
    const frag = tpl.content.cloneNode(true);
    const scope = comp.renderVals();
    Array.from(frag.childNodes).forEach((c) => process(c, scope));
    mount.replaceChildren(frag);
  }

  // Prototype controls for the canvas Tweaks
  const bar = document.getElementById('proto-controls');
  if (bar) {
    Object.keys(decl).forEach((k) => {
      const d = decl[k];
      if (k[0] === '$' || (d.editor !== 'enum' && d.editor !== 'boolean')) return;
      const label = document.createElement('label');
      label.className = 'proto-ctl';
      const text = k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      if (d.editor === 'boolean') {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!props[k];
        box.addEventListener('change', () => { comp.props[k] = box.checked; render(); });
        label.append(box, ' ' + text);
      } else {
        const sel = document.createElement('select');
        (d.options || []).forEach((o) => { const opt = document.createElement('option'); opt.textContent = o; sel.appendChild(opt); });
        sel.value = props[k];
        sel.addEventListener('change', () => { comp.props[k] = sel.value; comp.state = Object.assign({}, comp.state, { area: undefined }); render(); });
        label.append(text + ': ', sel);
      }
      bar.appendChild(label);
    });
  }

  render();
})();
