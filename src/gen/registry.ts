// 事件テンプレートの一覧と、(テンプレート, 採用シード) から事件定義を決定的に再構築する処理。
import type { GameState, Group, RoomId, Ship } from '../core/types';
import type { CaseDef, CaseTemplate, CrewSeed, GenCtx } from './case_api';
import { pickCrew } from './crewpool';
import { buildShip, LOWER_ROOMS, SIDE_ROOMS, roomDef } from '../sim/ship';
import { secToClock } from '../core/rng';
import { TEMPLATES } from '../cases';

export { TEMPLATES };

export function templateById(id: string): CaseTemplate {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error('事件テンプレートがない: ' + id);
  return t;
}

export function makeRand(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Built { tpl: CaseTemplate; def: CaseDef; ship: Ship; crew: CrewSeed[] }

const cache = new Map<string, Built>();

export function buildCase(templateId: string, genSeed: number): Built {
  const key = templateId + ':' + genSeed;
  const hit = cache.get(key);
  if (hit) return hit;
  const tpl = templateById(templateId);
  const rand = makeRand(genSeed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const crew = pickCrew(rand, tpl.needRoles);
  const side = shuffle([...tpl.needSide, ...shuffle(Object.keys(SIDE_ROOMS).filter((r) => !tpl.needSide.includes(r))).slice(0, 4 - tpl.needSide.length)]);
  const lower = shuffle([...tpl.needLower, ...shuffle(Object.keys(LOWER_ROOMS).filter((r) => !tpl.needLower.includes(r))).slice(0, 2 - tpl.needLower.length)]);
  const ship = buildShip(side, lower);
  const g: GenCtx = {
    rand,
    int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
    pick,
    shuffle,
    crew,
    byRole: (r) => crew.find((c) => c.roleId === r),
    others: (...ex) => crew.filter((c) => !ex.some((e) => e && e.id === c.id)),
    rooms: ship.rooms,
    has: (r: RoomId) => ship.rooms.some((x) => x.id === r),
    rn: (r: RoomId) => roomDef(ship, r).name,
    groupOf: (r: RoomId): Group => roomDef(ship, r).group,
    hm: (h, m) => h * 3600 + m * 60,
    clock: secToClock,
  };
  const def = tpl.build(g);
  const b = { tpl, def, ship, crew };
  if (cache.size > 200) cache.clear();
  cache.set(key, b);
  return b;
}

export function caseOf(s: GameState): CaseDef {
  return buildCase(s.templateId, s.genSeed).def;
}
