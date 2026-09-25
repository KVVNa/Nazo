// 証拠ボード：カードを自由に置き、2枚の間に線を張る・外す。線の正誤は一切表示しない。
import { h } from './dom';
import { game } from './game';
import type { ViewModel } from '../view/view';
import { openSheet, closeSheet } from './dom';

let mode: 'move' | 'link' = 'move';
let pickA: string | null = null;

const CW = 138, CH = 88;

export function renderBoard(v: ViewModel, showCard: (id: string) => void): HTMLElement {
  const wrap = h('div', {});
  const board = h('div', { class: 'board' + (mode === 'link' ? ' linking' : '') });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  board.appendChild(svg);
  const pos = new Map(v.board.cards.map((c) => [c.id, { x: c.x, y: c.y }]));
  const cardEls = new Map<string, HTMLElement>();

  const drawLinks = () => {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const l of v.board.links) {
      const a = pos.get(l.a), b = pos.get(l.b);
      if (!a || !b) continue;
      const x1 = a.x + CW / 2, y1 = a.y + CH / 2, x2 = b.x + CW / 2, y2 = b.y + CH / 2;
      const hit = document.createElementNS(svgNS, 'line');
      for (const [k, val] of Object.entries({ x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 22 })) hit.setAttribute(k, String(val));
      hit.style.pointerEvents = 'stroke';
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => editLink(l.a, l.b, l.label));
      const line = document.createElementNS(svgNS, 'line');
      for (const [k, val] of Object.entries({ x1, y1, x2, y2, stroke: '#e0503a', 'stroke-width': 3, 'stroke-linecap': 'round' })) line.setAttribute(k, String(val));
      line.style.pointerEvents = 'none';
      svg.append(line, hit);
      if (l.label) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', String((x1 + x2) / 2));
        t.setAttribute('y', String((y1 + y2) / 2 - 6));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', '#ffd8c8');
        t.setAttribute('font-size', '12');
        t.setAttribute('paint-order', 'stroke');
        t.setAttribute('stroke', '#0f1320');
        t.setAttribute('stroke-width', '4');
        t.textContent = l.label;
        t.style.pointerEvents = 'none';
        svg.appendChild(t);
      }
    }
  };

  for (const e of v.evidence) {
    const p = pos.get(e.id)!;
    const el = h('div', { class: `ecard ${e.source === 'testimony' ? 'testimony' : ''} ${pickA === e.id ? 'sel' : ''}`, style: { left: p.x + 'px', top: p.y + 'px' }, 'data-id': e.id },
      h('div', { class: 'src' }, e.sourceLabel), h('div', { class: 'ttl' }, e.title), h('div', { class: 'txt' }, e.text));
    cardEls.set(e.id, el);
    let start: { x: number; y: number; px: number; py: number } | null = null;
    let moved = false;
    el.addEventListener('pointerdown', (ev) => {
      if (mode !== 'move') return;
      el.setPointerCapture(ev.pointerId);
      start = { x: ev.clientX, y: ev.clientY, px: p.x, py: p.y };
      moved = false;
    });
    el.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      p.x = Math.max(0, Math.min(760 - CW, start.px + dx));
      p.y = Math.max(0, Math.min(1100 - CH, start.py + dy));
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      drawLinks();
    });
    const end = () => {
      if (!start) return;
      start = null;
      if (moved) game.moveCard(e.id, p.x, p.y);
      else showCard(e.id);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { start = null; });
    el.addEventListener('click', () => {
      if (mode !== 'link') return;
      if (!pickA) { pickA = e.id; el.classList.add('sel'); return; }
      if (pickA === e.id) { pickA = null; el.classList.remove('sel'); return; }
      const a = pickA;
      pickA = null;
      game.toggleLink(a, e.id); // 再描画は更新通知で行う
    });
    board.appendChild(el);
  }
  drawLinks();

  const setMode = (m: 'move' | 'link') => { mode = m; pickA = null; rerender(); };
  const rerender = () => { const nv = game.view(); if (nv) wrap.replaceWith(renderBoard(nv, showCard)); };
  wrap.append(
    h('div', { class: 'board-tools' },
      h('div', { class: 'seg', role: 'group', 'aria-label': '操作' },
        h('button', { class: mode === 'move' ? 'on' : '', onclick: () => setMode('move') }, '動かす'),
        h('button', { class: mode === 'link' ? 'on' : '', onclick: () => setMode('link') }, '線でつなぐ')),
      h('span', { class: 'small muted' }, mode === 'move' ? 'ドラッグで移動、タップで全文' : '2枚を順にタップで線を張る／外す。線をタップでメモ')),
    h('div', { class: 'board-wrap' }, board),
    h('p', { class: 'small muted' }, `証拠 ${v.evidence.length} 枚・線 ${v.board.links.length} 本。線の正しさはここでは分からない。`),
  );
  return wrap;
}

function editLink(a: string, b: string, label: string) {
  const inp = h('input', { type: 'text', value: label, maxlength: 30, placeholder: '例：時刻が合わない' }) as HTMLInputElement;
  openSheet(h('div', {},
    h('h2', {}, '線のメモ'),
    inp,
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn danger', onclick: () => { closeSheet(); game.setLinkLabel(a, b, null); } }, '線を外す'),
      h('button', { class: 'btn primary', onclick: () => { closeSheet(); game.setLinkLabel(a, b, inp.value); } }, '保存'))));
}
