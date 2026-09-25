type Attrs = Record<string, any>;
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); }

// 下から出るシート。閉じると onClose が呼ばれる。
let current: { el: HTMLElement; onClose?: () => void } | null = null;
export function openSheet(content: HTMLElement, onClose?: () => void) {
  closeSheet();
  const ov = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === ov) closeSheet(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('button', { class: 'close', onclick: () => closeSheet(), 'aria-label': '閉じる' }, '閉じる'),
      content));
  document.body.appendChild(ov);
  current = { el: ov, onClose };
}
export function closeSheet() {
  if (!current) return;
  const c = current;
  current = null;
  c.el.remove();
  c.onClose?.();
}
export function sheetOpen() { return !!current; }

export function confirmSheet(title: string, body: string, okLabel: string, onOk: () => void, danger = false) {
  openSheet(h('div', {},
    h('h2', {}, title),
    h('p', {}, body),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => closeSheet() }, 'やめる'),
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { closeSheet(); onOk(); } }, okLabel))));
}
