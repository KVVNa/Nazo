import type { RoomDef, RoomId, World } from '../core/types';

export const ROOMS: RoomDef[] = [
  { id: 'bridge', name: '司令室', rect: [3, 0, 6, 3], relay: 'main' },
  { id: 'quarters', name: '居住区', rect: [0, 4, 4, 3], relay: 'main' },
  { id: 'corridor', name: '中央通路', rect: [4, 3, 4, 7], relay: 'main' },
  { id: 'medbay', name: '医務室', rect: [8, 4, 4, 3], relay: 'main' },
  { id: 'cargo', name: '貨物室', rect: [0, 7, 4, 3], relay: 'main' },
  { id: 'lifesupport', name: '生命維持室', rect: [8, 7, 4, 3], relay: 'main' },
  { id: 'engineering', name: '下層機関区', rect: [2, 11, 8, 3], relay: 'eng' },
  { id: 'powerroom', name: '配電室', rect: [3, 14, 6, 3], relay: 'eng' },
];

// [a, b, 移動分数]
export const EDGES: [RoomId, RoomId, number][] = [
  ['bridge', 'corridor', 1],
  ['quarters', 'corridor', 1],
  ['medbay', 'corridor', 1],
  ['cargo', 'corridor', 1],
  ['lifesupport', 'corridor', 1],
  ['corridor', 'engineering', 2],
  ['engineering', 'powerroom', 1],
];

export const TICKS_PER_MIN = 6;

export function roomName(id: RoomId): string {
  return ROOMS.find((r) => r.id === id)!.name;
}

export function neighbors(id: RoomId): { to: RoomId; min: number }[] {
  const out: { to: RoomId; min: number }[] = [];
  for (const [a, b, m] of EDGES) {
    if (a === id) out.push({ to: b, min: m });
    else if (b === id) out.push({ to: a, min: m });
  }
  return out;
}

export function edgeMinutes(a: RoomId, b: RoomId): number {
  const e = EDGES.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return e ? e[2] : 99;
}

// ダイクストラ。経路は出発地を含まない。
export function findPath(from: RoomId, to: RoomId): RoomId[] {
  if (from === to) return [];
  const dist = new Map<RoomId, number>([[from, 0]]);
  const prev = new Map<RoomId, RoomId>();
  const open: RoomId[] = [from];
  while (open.length) {
    open.sort((x, y) => dist.get(x)! - dist.get(y)!);
    const cur = open.shift()!;
    if (cur === to) break;
    for (const n of neighbors(cur)) {
      const d = dist.get(cur)! + n.min;
      if (d < (dist.get(n.to) ?? Infinity)) {
        dist.set(n.to, d);
        prev.set(n.to, cur);
        open.push(n.to);
      }
    }
  }
  if (!prev.has(to)) return [];
  const path: RoomId[] = [];
  let c: RoomId = to;
  while (c !== from) {
    path.unshift(c);
    c = prev.get(c)!;
  }
  return path;
}

export function reachableFrom(from: RoomId): Set<RoomId> {
  const seen = new Set<RoomId>([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const n of neighbors(c)) if (!seen.has(n.to)) { seen.add(n.to); q.push(n.to); }
  }
  return seen;
}

// 機関区の中継器は主電源か、応急修理で動く。
export function commOk(world: World, room: RoomId): boolean {
  const def = ROOMS.find((r) => r.id === room)!;
  if (def.relay === 'main') return true;
  return world.mainPower || world.relayRepaired;
}

export function nearestCommRoom(world: World, from: RoomId): RoomId {
  if (commOk(world, from)) return from;
  let best: RoomId = 'corridor';
  let bestD = Infinity;
  for (const r of ROOMS) {
    if (!commOk(world, r.id)) continue;
    const p = findPath(from, r.id);
    let d = 0;
    let c = from;
    for (const n of p) { d += edgeMinutes(c, n); c = n; }
    if (d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}
