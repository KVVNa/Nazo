// 船内見取り図（Canvas）。描くのは ViewModel だけ。通信断の区画は中身を描かない。
import type { ViewModel, RoomView } from '../view/view';
import { drawMini } from './sprites';

export const MAP_W = 13;
export const MAP_H = 18;
const OX = 0.5, OY = 0.5;

const COL = {
  space: '#07080f',
  star: '#3a4060',
  floor: '#262b3a',
  floorAlt: '#2c3244',
  wall: '#7c86a6',
  wallDark: '#454c66',
  label: '#c9d1ea',
  dead: 'rgba(8,9,16,0.86)',
  deadStripe: 'rgba(120,130,160,0.14)',
  deadText: '#9aa3bd',
  fire: ['#ffcf4a', '#ff8a2a', '#e8401c'],
  water: '#3aa0d8',
  door: '#11131c',
};

let stars: [number, number][] = [];

// 横幅と、画面の高さの両方に収まるタイルの大きさ
export function layoutTile(cssW: number): number {
  const byH = typeof window !== 'undefined' ? (window.innerHeight - 250) / MAP_H : Infinity;
  return Math.max(16, Math.floor(Math.min(cssW / MAP_W, byH)));
}

function rectPx(r: [number, number, number, number], T: number) {
  return { x: (r[0] + OX) * T, y: (r[1] + OY) * T, w: r[2] * T, h: r[3] * T };
}

function drawRoom(g: CanvasRenderingContext2D, room: RoomView, T: number) {
  const { x, y, w, h } = rectPx(room.rect, T);
  for (let i = 0; i < room.rect[2]; i++)
    for (let j = 0; j < room.rect[3]; j++) {
      g.fillStyle = (i + j) % 2 ? COL.floor : COL.floorAlt;
      g.fillRect(x + i * T, y + j * T, T, T);
    }
  g.strokeStyle = COL.wallDark;
  g.lineWidth = Math.max(3, T / 6);
  g.strokeRect(x, y, w, h);
  g.strokeStyle = COL.wall;
  g.lineWidth = Math.max(1, T / 14);
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function drawDoors(g: CanvasRenderingContext2D, v: ViewModel, T: number) {
  const byId = new Map(v.rooms.map((r) => [r.id, r]));
  for (const e of v.edges) {
    const A = byId.get(e.a)!.rect, B = byId.get(e.b)!.rect;
    const ax2 = A[0] + A[2], ay2 = A[1] + A[3], bx2 = B[0] + B[2], by2 = B[1] + B[3];
    const cx = (e.door.x + OX) * T, cy = (e.door.y + OY) * T;
    g.fillStyle = COL.door;
    if (ax2 === B[0] || bx2 === A[0]) g.fillRect(cx - T * 0.2, cy - T * 0.45, T * 0.4, T * 0.9);
    else if (ay2 === B[1] || by2 === A[1]) g.fillRect(cx - T * 0.45, cy - T * 0.2, T * 0.9, T * 0.4);
    else {
      // 縦穴（はしご）
      const y0 = Math.min(ay2, by2), y1 = Math.max(A[1], B[1]);
      g.fillStyle = '#1a1d29';
      g.fillRect(cx - T * 0.4, (y0 + OY) * T - 2, T * 0.8, (y1 - y0) * T + 4);
      g.fillStyle = '#6a7290';
      for (let k = 0; k < 3; k++) g.fillRect(cx - T * 0.3, (y0 + OY) * T + k * T * 0.33 + 2, T * 0.6, 2);
    }
  }
}

function drawDead(g: CanvasRenderingContext2D, room: RoomView, T: number) {
  const { x, y, w, h } = rectPx(room.rect, T);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = COL.dead;
  g.fillRect(x, y, w, h);
  g.strokeStyle = COL.deadStripe;
  g.lineWidth = 2;
  for (let k = -h; k < w; k += 10) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
  g.restore();
  // 通信断アイコン（アンテナに斜線）
  const cx = x + w / 2, cy = y + h / 2 - T * 0.25;
  const s = Math.max(2, Math.floor(T / 10));
  g.fillStyle = COL.deadText;
  g.fillRect(cx - s * 4 - T * 1.3, cy - s * 3, s, s * 6);
  g.fillRect(cx - s * 6 - T * 1.3, cy - s * 3, s * 5, s);
  g.strokeStyle = '#e46a5a';
  g.lineWidth = s;
  g.beginPath(); g.moveTo(cx - s * 8 - T * 1.3, cy + s * 3); g.lineTo(cx - T * 1.3, cy - s * 4); g.stroke();
  g.fillStyle = COL.deadText;
  g.font = `bold ${Math.round(T * 0.42)}px system-ui, sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('通信断', cx - T * 0.9, cy - T * 0.05);
  g.font = `${Math.round(T * 0.34)}px system-ui, sans-serif`;
  g.fillText('情報なし', cx - T * 0.9, cy + T * 0.45);
}

function drawFire(g: CanvasRenderingContext2D, room: RoomView, T: number, t: number) {
  const { x, y, w, h } = rectPx(room.rect, T);
  const s = Math.max(2, Math.floor(T / 8));
  for (let i = 0; i < 18; i++) {
    const fx = x + ((i * 37) % Math.max(1, Math.floor(w - s * 3))) + s;
    const base = y + h - s * 2 - ((i * 13) % Math.floor(h / 2));
    const flick = Math.sin(t / 90 + i) * s * 1.5;
    g.fillStyle = COL.fire[(i + Math.floor(t / 120)) % 3];
    g.fillRect(fx, base - s * 3 + flick, s * 2, s * 3);
  }
  g.fillStyle = '#ffe9a8';
  g.font = `bold ${Math.round(T * 0.42)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.textBaseline = 'top';
  g.fillText('▲火災', x + w - 4, y + 4);
}

function drawMarks(g: CanvasRenderingContext2D, room: RoomView, T: number) {
  const { x, y, w, h } = rectPx(room.rect, T);
  const s = Math.max(2, Math.floor(T / 8));
  room.marks.forEach((m, i) => {
    const cx = x + w * 0.5, cy = y + h * 0.58 + i * T * 0.7;
    g.fillStyle = m.color;
    g.globalAlpha = 0.75;
    g.fillRect(cx - s * 6, cy - s, s * 12, s * 2);
    g.fillRect(cx - s * 4, cy - s * 2, s * 8, s * 4);
    g.globalAlpha = 1;
    g.fillStyle = '#e8f2ff';
    g.font = `${Math.round(T * 0.32)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(m.text, cx, cy + s * 2.5);
  });
}

export function drawMap(canvas: HTMLCanvasElement, v: ViewModel, t: number, selected: string | null, reduce: boolean) {
  const cssW = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth;
  const T = layoutTile(cssW);
  const dpr = window.devicePixelRatio || 1;
  const W = T * MAP_W, H = T * MAP_H;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    canvas.style.width = W + 'px';
    stars = Array.from({ length: 60 }, (_, i) => [((i * 73) % 97) / 97, ((i * 41) % 89) / 89]);
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = COL.space;
  g.fillRect(0, 0, W, H);
  g.fillStyle = COL.star;
  for (const [sx, sy] of stars) g.fillRect(Math.floor(sx * W), Math.floor(sy * H), 2, 2);

  for (const r of v.rooms) drawRoom(g, r, T);
  drawDoors(g, v, T);

  for (const r of v.rooms) {
    const { x, y } = rectPx(r.rect, T);
    if (!r.comm) drawDead(g, r, T);
    if (r.marks.length) drawMarks(g, r, T);
    if (r.fire) drawFire(g, r, T, reduce ? 0 : t);
    g.fillStyle = COL.label;
    g.font = `bold ${Math.round(T * 0.38)}px system-ui, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(r.name, x + 5, y + 4);
  }

  // 乗員（通信が通る者だけ）
  const s = Math.max(2, Math.floor(T / 9));
  for (const c of v.crew) {
    if (!c.visible || !c.pos) continue;
    const px = (c.pos.x + OX) * T - s * 4;
    const py = (c.pos.y + OY) * T - s * 5;
    const moving = c.activity?.includes('移動') || c.activity?.includes('向かう') || c.activity?.includes('戻る');
    if (selected === c.id) {
      g.strokeStyle = '#ffe07a';
      g.lineWidth = 2;
      g.strokeRect(px - 3, py - 3, s * 8 + 6, s * 10 + 6);
    }
    drawMini(g, c.look, px, py, s, moving && !reduce ? Math.floor(t / 250) : 0);
    g.fillStyle = c.health < 50 ? '#ff8c7a' : '#e8ecf8';
    g.font = `bold ${Math.round(T * 0.34)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(c.name + (c.health < 50 ? '✚' : ''), px + s * 4, py + s * 10 + 1);
  }

  // どれかの計器が危険域なら赤く脈打つ
  if (v.meters.some((m) => m.level === 'bad')) {
    g.fillStyle = reduce ? 'rgba(120,20,20,0.15)' : `rgba(160,20,20,${0.12 + 0.08 * Math.sin(t / 300)})`;
    g.fillRect(0, 0, W, H);
  }
}

export function hitCrew(canvas: HTMLCanvasElement, v: ViewModel, clientX: number, clientY: number): string | null {
  const r = canvas.getBoundingClientRect();
  const T = r.width / MAP_W;
  const mx = (clientX - r.left) / T - OX, my = (clientY - r.top) / T - OY;
  let best: string | null = null, bd = 1.1;
  for (const c of v.crew) {
    if (!c.visible || !c.pos) continue;
    const d = Math.hypot(c.pos.x - mx, c.pos.y - 0.1 - my);
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}
