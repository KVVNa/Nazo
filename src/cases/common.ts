// 事件テンプレートで共通に使う小道具
import type { Meter, MeterCtx, EpilogueCtx, GenCtx, CrewSeed } from '../gen/case_api';

export const o2Meter = (m: MeterCtx): Meter => ({ label: '酸素', value: m.o2, text: Math.round(m.o2) + '%', level: m.o2 < 25 ? 'bad' : m.o2 < 50 ? 'warn' : '' });
export const hullMeter = (m: MeterCtx): Meter => ({ label: '船体', value: m.hull, text: Math.round(m.hull) + '%', level: m.hull < 40 ? 'bad' : m.hull < 70 ? 'warn' : '' });
export const pct = (label: string, v: number, warnBelow = 50, badBelow = 25, sub?: string): Meter =>
  ({ label, value: v, text: Math.round(v) + '%', sub, level: v < badBelow ? 'bad' : v < warnBelow ? 'warn' : '' });

// 与えた条件に合う乗員を、指定の順で探す
export function find(g: GenCtx, pred: (c: CrewSeed) => boolean, exclude: (CrewSeed | undefined)[] = []): CrewSeed {
  const c = g.shuffle(g.others(...exclude)).find(pred) ?? g.others(...exclude)[0];
  return c;
}

// 事件と無関係な乗員の初期位置を、指定の区画から選ぶ
export function placeRest(g: GenCtx, placed: Record<string, { room: string }>, rooms: string[]) {
  const ok = rooms.filter((r) => g.has(r));
  for (const c of g.crew) if (!placed[c.id]) placed[c.id] = { room: g.pick(ok.length ? ok : ['corridor']) };
}

export function genericEpilogue(e: EpilogueCtx, special: Record<string, string>): string[] {
  const out: string[] = [];
  for (const c of e.crew) {
    if (!c.alive) { out.push(`${c.name}（${c.role}）は帰らなかった。`); continue; }
    if (c.detained) { out.push(`${c.name}は拘束されたまま朝を迎えた。${e.responsible === c.id ? '処分は寄港後に決まる。' : '身に覚えのない拘束に、口数が減った。'}`); continue; }
    if (special[c.id]) out.push(special[c.id]);
  }
  if (out.length < 3) out.push(e.resolved ? '船内には、いつもの機械音が戻った。' : '船内の空気は、まだ張り詰めたままだ。');
  return out;
}

export const hmToClock = (g: GenCtx, sec: number) => g.clock(sec);

// 事件開始時に通信が届く位置にいる乗員だけから選ぶ（検証用の解き筋で使う）
export function inComm(g: GenCtx, init: Record<string, { room: string }>, down: string[]) {
  return (c: CrewSeed) => !!init[c.id] && !down.includes(g.groupOf(init[c.id].room));
}

// 通信が届く乗員のうち、その技能がいちばん高い者（解き筋で使う）
export function bestLive(g: GenCtx, init: Record<string, { room: string }>, down: string[], skill: 'mech' | 'med' | 'inv', exclude: (CrewSeed | undefined)[] = []): CrewSeed {
  const live = inComm(g, init, down);
  const c = g.others(...exclude).filter(live).sort((a, b) => b.skills[skill] - a.skills[skill] || b.exp - a.exp)[0];
  return c ?? g.others(...exclude)[0];
}
