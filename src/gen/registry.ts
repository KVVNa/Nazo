// 事件テンプレートの一覧と、(テンプレート, 採用シード) から事件定義を決定的に再構築する処理。
import type { FixedCrew, GameState, Group, RoomId, Ship } from '../core/types';
import type { CaseDef, CaseTemplate, CrewSeed, GenCtx } from './case_api';
import { pickCrew } from './crewpool';
import { buildShip, roomDef } from '../sim/ship';
import { secToClock } from '../core/rng';
import { TEMPLATES } from '../cases';
import { voyageDeep } from './voyage_words';

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

function hashStr(t: string): string {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function buildCase(templateId: string, genSeed: number, fixed?: FixedCrew): Built {
  const key = templateId + ':' + genSeed + (fixed ? ':' + hashStr(JSON.stringify(fixed)) : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const tpl = templateById(templateId);
  const rand = makeRand(genSeed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const crew = fixed ? fixed.crew.map((c) => ({ ...c, skills: { ...c.skills }, look: { ...c.look } })) : pickCrew(rand, tpl.needRoles);
  const ship = buildShip();
  const g: GenCtx = {
    rand,
    int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
    pick,
    shuffle,
    crew,
    cast: fixed?.cast,
    byRole: (r) => crew.find((c) => c.roleId === r),
    others: (...ex) => crew.filter((c) => !ex.some((e) => e && e.id === c.id)),
    rooms: ship.rooms,
    has: (r: RoomId) => ship.rooms.some((x) => x.id === r),
    rn: (r: RoomId) => roomDef(ship, r).name,
    groupOf: (r: RoomId): Group => roomDef(ship, r).group,
    relayOf: (gr: Group): RoomId => ship.relayRoom[gr],
    hm: (h, m) => h * 3600 + m * 60,
    clock: secToClock,
  };
  const raw = tpl.build(g);
  const def = fixed ? voyageDeep(raw) : raw;
  const b = { tpl, def, ship, crew };
  if (cache.size > 200) cache.clear();
  cache.set(key, b);
  return b;
}

export function caseOf(s: GameState): CaseDef {
  return buildCase(s.templateId, s.genSeed, s.fixed).def;
}
