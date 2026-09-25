// 推理メモ：証拠カードと自由メモを並べ、線でつないで考えを整理する。採点には使わず、正誤も表示しない。
import { h, openSheet, closeSheet } from './dom';
import { game } from './game';
import type { ViewModel } from '../view/view';

let mode: 'move' | 'link' = 'move';
let pickA: string | null = null;
let scroll = { x: 0, y: 0 };

const CW = 138, CH = 88, BW = 760, BH = 1100;

interface Item { id: string; cls: string; head: string; title: string; text: string; onTap: () => void }

export function renderBoard(v: ViewModel, showCard: (id: string) => void): HTMLElement {
  const wrap = h('div', {});
  const board = h('div', { class: 'board' + (mode === 'link' ? ' linking' : '') });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  board.appendChild(svg);
  const pos = new Map(v.board.cards.map((c) => [c.id, { x: c.x, y: c.y }]));

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
        for (const [k, val] of Object.entries({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle', fill: '#ffd8c8', 'font-size': 12, 'paint-order': 'stroke', stroke: '#0f1320', 'stroke-width': 4 })) t.setAttribute(k, String(val));
        t.textContent = l.label;
        t.style.pointerEvents = 'none';
        svg.appendChild(t);
      }
    }
  };

  const items: Item[] = [
    ...v.evidence.map((e) => ({ id: e.id, cls: e.source === 'testimony' ? 'testimony' : '', head: e.sourceLabel, title: e.title, text: e.text, onTap: () => showCard(e.id) })),
    ...v.board.notes.map((n) => ({ id: n.id, cls: 'note', head: '自分のメモ', title: '', text: n.text, onTap: () => noteSheet(n.id, n.text) })),
  ];

  for (const it of items) {
    const p = pos.get(it.id);
    if (!p) continue;
    const el = h('div', { class: `ecard ${it.cls} ${pickA === it.id ? 'sel' : ''}`, style: { left: p.x + 'px', top: p.y + 'px' } },
      h('div', { class: 'src' }, it.head), it.title ? h('div', { class: 'ttl' }, it.title) : null, h('div', { class: 'txt' }, it.text));
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
      p.x = Math.max(0, Math.min(BW - CW, start.px + dx));
      p.y = Math.max(0, Math.min(BH - CH, start.py + dy));
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      drawLinks();
    });
    el.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      if (moved) game.moveCard(it.id, p.x, p.y);
      else it.onTap();
    });
    el.addEventListener('pointercancel', () => { start = null; });
    el.addEventListener('click', () => {
      if (mode !== 'link') return;
      if (!pickA) { pickA = it.id; el.classList.add('sel'); return; }
      if (pickA === it.id) { pickA = null; el.classList.remove('sel'); return; }
      const a = pickA;
      pickA = null;
      game.toggleLink(a, it.id);
    });
    board.appendChild(el);
  }
  drawLinks();

  const area = h('div', { class: 'board-wrap' }, board);
  area.addEventListener('scroll', () => { scroll = { x: area.scrollLeft, y: area.scrollTop }; });
  requestAnimationFrame(() => { area.scrollLeft = scroll.x; area.scrollTop = scroll.y; });

  const rerender = () => { const nv = game.view(); if (nv) wrap.replaceWith(renderBoard(nv, showCard)); };
  const setMode = (m: 'move' | 'link') => { mode = m; pickA = null; rerender(); };
  const addNote = () => {
    const ta = h('textarea', { placeholder: '例：ソラの「02:30」は遮断の後。時計がずれていた？', maxlength: 120, style: { minHeight: '90px', fontSize: '16px' } }) as HTMLTextAreaElement;
    openSheet(h('div', {},
      h('h2', {}, 'メモを書く'),
      ta,
      h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: () => {
        closeSheet();
        game.addNote(ta.value, Math.min(BW - CW, area.scrollLeft + 16), Math.min(BH - CH, area.scrollTop + 16));
      } }, 'メモを貼る')));
    setTimeout(() => ta.focus(), 50);
  };

  wrap.append(
    h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, '考えを整理する自由なメモ帳。ここに書いたことや線は採点に使わず、正誤も出ない。答えは「仮説」タブで提出する。'),
    h('div', { class: 'board-tools' },
      h('div', { class: 'seg', role: 'group', 'aria-label': '操作' },
        h('button', { class: mode === 'move' ? 'on' : '', onclick: () => setMode('move') }, '並べる'),
        h('button', { class: mode === 'link' ? 'on' : '', onclick: () => setMode('link') }, '線を引く')),
      h('button', { class: 'btn small', onclick: addNote }, '＋ メモを書く')),
    h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, mode === 'move' ? 'ドラッグで移動。タップで全文を読む／自分のメモを書き直す。' : '2枚を順にタップで線を引く／消す。線をタップすると一言添えられる。'),
    area,
  );
  return wrap;
}

function noteSheet(id: string, text: string) {
  const ta = h('textarea', { maxlength: 120, style: { minHeight: '90px', fontSize: '16px' } }) as HTMLTextAreaElement;
  ta.value = text;
  openSheet(h('div', {},
    h('h2', {}, '自分のメモ'),
    ta,
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn danger', onclick: () => { closeSheet(); game.editNote(id, null); } }, '捨てる'),
      h('button', { class: 'btn primary', onclick: () => { closeSheet(); game.editNote(id, ta.value); } }, '保存'))));
}

function editLink(a: string, b: string, label: string) {
  const inp = h('input', { type: 'text', value: label, maxlength: 30, placeholder: '例：時刻が合わない' }) as HTMLInputElement;
  openSheet(h('div', {},
    h('h2', {}, '線に一言'),
    inp,
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn danger', onclick: () => { closeSheet(); game.setLinkLabel(a, b, null); } }, '線を消す'),
      h('button', { class: 'btn primary', onclick: () => { closeSheet(); game.setLinkLabel(a, b, inp.value); } }, '保存'))));
}
