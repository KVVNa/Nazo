// 船の部屋グラフ。調査船〈ケストレル〉の固定の見取り図。
import type { Group, RoomDef, RoomId, Ship, World } from '../core/types';

export const TICKS_PER_MIN = 6;

// 区画の名前（検証器が「文章に出てくる区画名」を調べるのにも使う）
export const SIDE_ROOMS: Record<string, string> = {
  quarters: '居住区', medbay: '医務室', cargo: '貨物室', lifesupport: '生命維持室',
  galley: '食堂', comms: '通信室', lab: '研究室',
};
export const LOWER_ROOMS: Record<string, string> = {
  powerroom: '配電室', airlock: 'エアロック', waterplant: '水再生室',
};

export const GROUP_NAME: Record<Group, string> = { core: '中央', port: '左舷', starboard: '右舷', lower: '下層' };

// 調査船〈ケストレル〉の固定の見取り図（13×21タイル）。
// 左舷：居住区（中継器）・食堂・研究室・貨物室　右舷：通信室（中継器）・医務室・生命維持室
// 下層：下層機関区（中継器）・配電室・エアロック・水再生室
const LAYOUT: { id: RoomId; rect: [number, number, number, number]; group: Group }[] = [
  { id: 'bridge', rect: [3, 0, 6, 3], group: 'core' },
  { id: 'corridor', rect: [4, 3, 4, 12], group: 'core' },
  { id: 'quarters', rect: [0, 3, 4, 3], group: 'port' },
  { id: 'galley', rect: [0, 6, 4, 3], group: 'port' },
  { id: 'lab', rect: [0, 9, 4, 3], group: 'port' },
  { id: 'cargo', rect: [0, 12, 4, 3], group: 'port' },
  { id: 'comms', rect: [8, 3, 4, 4], group: 'starboard' },
  { id: 'medbay', rect: [8, 7, 4, 4], group: 'starboard' },
  { id: 'lifesupport', rect: [8, 11, 4, 4], group: 'starboard' },
  { id: 'engineering', rect: [2, 15, 8, 3], group: 'lower' },
  { id: 'powerroom', rect: [0, 18, 4, 3], group: 'lower' },
  { id: 'airlock', rect: [4, 18, 4, 3], group: 'lower' },
  { id: 'waterplant', rect: [8, 18, 4, 3], group: 'lower' },
];
const NAMES: Record<string, string> = { bridge: '司令室', corridor: '中央通路', engineering: '下層機関区', ...SIDE_ROOMS, ...LOWER_ROOMS };

export function buildShip(): Ship {
  const rooms: RoomDef[] = LAYOUT.map((r) => ({ id: r.id, name: NAMES[r.id], rect: [...r.rect] as [number, number, number, number], group: r.group }));
  const side = LAYOUT.filter((r) => r.group === 'port' || r.group === 'starboard').map((r) => r.id);
  const lower = ['powerroom', 'airlock', 'waterplant'];
  const edges: [RoomId, RoomId, number][] = [
    ['bridge', 'corridor', 1],
    ...side.map((id) => [id, 'corridor', 1] as [RoomId, RoomId, number]),
    ['corridor', 'engineering', 2],
    ...lower.map((id) => ['engineering', id, 1] as [RoomId, RoomId, number]),
  ];
  return { rooms, edges, relayRoom: { core: 'bridge', port: 'quarters', starboard: 'comms', lower: 'engineering' } };
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
