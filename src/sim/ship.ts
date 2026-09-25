// 船の部屋グラフ。部屋割りは事件ごとに生成する（固定の骨格＋入れ替わる区画スロット）。
import type { Group, RoomDef, RoomId, Ship, World } from '../core/types';

export const TICKS_PER_MIN = 6;

// 入れ替わる区画の種類
export const SIDE_ROOMS: Record<string, string> = {
  quarters: '居住区', medbay: '医務室', cargo: '貨物室', lifesupport: '生命維持室',
  galley: '食堂', comms: '通信室', lab: '研究室',
};
export const LOWER_ROOMS: Record<string, string> = {
  powerroom: '配電室', airlock: 'エアロック', waterplant: '水再生室',
};

const SIDE_SLOTS: { rect: [number, number, number, number]; group: Group }[] = [
  { rect: [0, 4, 4, 3], group: 'port' },
  { rect: [0, 7, 4, 3], group: 'port' },
  { rect: [8, 4, 4, 3], group: 'starboard' },
  { rect: [8, 7, 4, 3], group: 'starboard' },
];
const LOWER_SLOTS: [number, number, number, number][] = [[2, 14, 4, 3], [6, 14, 4, 3]];

export const GROUP_NAME: Record<Group, string> = { core: '中央', port: '左舷', starboard: '右舷', lower: '下層' };

// side は4つ、lower は2つの区画 id を受け取る（並び順がスロット順）
export function buildShip(side: string[], lower: string[]): Ship {
  const rooms: RoomDef[] = [
    { id: 'bridge', name: '司令室', rect: [3, 0, 6, 3], group: 'core' },
    { id: 'corridor', name: '中央通路', rect: [4, 3, 4, 7], group: 'core' },
    { id: 'engineering', name: '下層機関区', rect: [2, 11, 8, 3], group: 'lower' },
  ];
  side.forEach((id, i) => rooms.push({ id, name: SIDE_ROOMS[id], rect: SIDE_SLOTS[i].rect, group: SIDE_SLOTS[i].group }));
  lower.forEach((id, i) => rooms.push({ id, name: LOWER_ROOMS[id], rect: LOWER_SLOTS[i], group: 'lower' }));
  const edges: [RoomId, RoomId, number][] = [
    ['bridge', 'corridor', 1],
    ...side.map((id) => [id, 'corridor', 1] as [RoomId, RoomId, number]),
    ['corridor', 'engineering', 2],
    ...lower.map((id) => ['engineering', id, 1] as [RoomId, RoomId, number]),
  ];
  return { rooms, edges, relayRoom: { core: 'bridge', port: side[0], starboard: side[2], lower: 'engineering' } };
}

export function roomDef(ship: Ship, id: RoomId): RoomDef {
  const r = ship.rooms.find((x) => x.id === id);
  if (!r) throw new Error('区画がない: ' + id);
  return r;
}
export const roomName = (ship: Ship, id: RoomId) => roomDef(ship, id).name;
export const hasRoom = (ship: Ship, id: RoomId) => ship.rooms.some((r) => r.id === id);

export function neighbors(ship: Ship, id: RoomId): { to: RoomId; min: number }[] {
  const out: { to: RoomId; min: number }[] = [];
  for (const [a, b, m] of ship.edges) {
    if (a === id) out.push({ to: b, min: m });
    else if (b === id) out.push({ to: a, min: m });
  }
  return out;
}

export function edgeMinutes(ship: Ship, a: RoomId, b: RoomId): number {
  const e = ship.edges.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return e ? e[2] : 99;
}

export function findPath(ship: Ship, from: RoomId, to: RoomId): RoomId[] {
  if (from === to) return [];
  const dist = new Map<RoomId, number>([[from, 0]]);
  const prev = new Map<RoomId, RoomId>();
  const open: RoomId[] = [from];
  while (open.length) {
    open.sort((x, y) => dist.get(x)! - dist.get(y)!);
    const cur = open.shift()!;
    if (cur === to) break;
    for (const n of neighbors(ship, cur)) {
      const d = dist.get(cur)! + n.min;
      if (d < (dist.get(n.to) ?? Infinity)) { dist.set(n.to, d); prev.set(n.to, cur); open.push(n.to); }
    }
  }
  if (!prev.has(to)) return [];
  const path: RoomId[] = [];
  let c: RoomId = to;
  while (c !== from) { path.unshift(c); c = prev.get(c)!; }
  return path;
}

export function travelMinutes(ship: Ship, a: RoomId, b: RoomId): number {
  let d = 0, c = a;
  for (const n of findPath(ship, a, b)) { d += edgeMinutes(ship, c, n); c = n; }
  return d;
}

export function reachableFrom(ship: Ship, from: RoomId): Set<RoomId> {
  const seen = new Set<RoomId>([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const n of neighbors(ship, c)) if (!seen.has(n.to)) { seen.add(n.to); q.push(n.to); }
  }
  return seen;
}

export function commOk(ship: Ship, world: World, room: RoomId): boolean {
  return !world.commDown.includes(roomDef(ship, room).group);
}

export function nearestCommRoom(ship: Ship, world: World, from: RoomId): RoomId {
  if (commOk(ship, world, from)) return from;
  let best: RoomId = 'corridor', bestD = Infinity;
  for (const r of ship.rooms) {
    if (!commOk(ship, world, r.id)) continue;
    const d = travelMinutes(ship, from, r.id);
    if (d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}

// 2区画をつなぐ扉（はしご）の位置。移動の描画はここを経由させ、船外を通らないようにする。
export function doorPoint(ship: Ship, a: RoomId, b: RoomId): { x: number; y: number } {
  const A = roomDef(ship, a).rect, B = roomDef(ship, b).rect;
  const ax2 = A[0] + A[2], ay2 = A[1] + A[3], bx2 = B[0] + B[2], by2 = B[1] + B[3];
  if (ax2 === B[0] || bx2 === A[0]) {
    const x = ax2 === B[0] ? ax2 : A[0];
    return { x, y: (Math.max(A[1], B[1]) + Math.min(ay2, by2)) / 2 };
  }
  if (ay2 === B[1] || by2 === A[1]) {
    const y = ay2 === B[1] ? ay2 : A[1];
    return { x: (Math.max(A[0], B[0]) + Math.min(ax2, bx2)) / 2, y };
  }
  return { x: 6, y: (Math.min(ay2, by2) + Math.max(A[1], B[1])) / 2 };
}
