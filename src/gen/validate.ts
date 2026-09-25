// 静的検証器：到達性・人物の時空間整合・証拠と真相の対応・誤誘導の解消可能性。
// 取得可能性（期限内に必須証拠が揃うか）は validate_dynamic.ts でシミュレーションして確かめる。
import type { CaseTemplate } from './case_power';
import { ROOMS, findPath, edgeMinutes, reachableFrom } from '../sim/ship';
import type { RoomId } from '../core/types';
import { START_SEC } from '../core/rng';

function travelMin(a: RoomId, b: RoomId): number {
  let d = 0, c = a;
  for (const n of findPath(a, b)) { d += edgeMinutes(c, n); c = n; }
  return d;
}

export function validateCase(tpl: CaseTemplate): string[] {
  const out: string[] = [];
  const t = tpl.truth;
  const all = reachableFrom('bridge');
  for (const r of ROOMS) if (!all.has(r.id)) out.push(`区画 ${r.id} に到達できない`);

  const evIds = new Set(t.evidence.map((e) => e.id));
  for (const e of t.evidence) {
    if (e.room && !all.has(e.room)) out.push(`証拠 ${e.id} の区画に到達できない`);
    if (e.skill) {
      const able = tpl.crew.some((c) => c.skills[e.skill!] >= e.minSkill);
      if (!able) out.push(`証拠 ${e.id} を見つけられる乗員がいない`);
    }
  }

  // 人物の時空間整合
  for (const c of tpl.crew) {
    const w = tpl.whereabouts.filter((x) => x.crew === c.id).sort((a, b) => a.sec - b.sec);
    const seq = [...w, { crew: c.id, sec: START_SEC, room: c.room }];
    for (let i = 1; i < seq.length; i++) {
      const need = travelMin(seq[i - 1].room, seq[i].room) * 60;
      if (seq[i].sec - seq[i - 1].sec < need) out.push(`${c.id} が ${seq[i - 1].room}→${seq[i].room} を時間内に移動できない`);
    }
    for (const ev of t.events.filter((e) => e.actor === c.id && e.sec > START_SEC - 86400)) {
      const at = w.filter((x) => x.sec <= ev.sec).pop();
      if (!at || at.room !== ev.room) out.push(`事象 ${ev.id} の時刻に ${c.id} が ${ev.room} にいない`);
    }
  }

  // 因果グラフ：参照先が存在し、原因から観測された被害（遮断）へ到達する
  const evMap = new Map(t.events.map((e) => [e.id, e]));
  for (const e of t.events) for (const c of e.causes) if (!evMap.has(c)) out.push(`事象 ${e.id} の因果先 ${c} がない`);
  const reach = new Set<string>();
  const stack = ['ev_crack'];
  while (stack.length) { const x = stack.pop()!; if (reach.has(x)) continue; reach.add(x); stack.push(...(evMap.get(x)?.causes ?? [])); }
  if (!reach.has('ev_trip')) out.push('発端から遮断への因果がつながっていない');

  // 時系列カードは真相の時刻で一意に並ぶ
  const secs = t.orderCards.map((c) => c.sec);
  if (new Set(secs).size !== secs.length) out.push('時系列カードに同時刻がある');

  // 誤誘導は客観証拠で区別できること
  for (const m of t.misleads) {
    if (!evIds.has(m.evidence)) out.push(`誤誘導 ${m.evidence} が証拠にない`);
    const objective = m.resolvedBy.filter((id) => {
      const e = t.evidence.find((x) => x.id === id);
      return e && e.source !== 'testimony';
    });
    if (!objective.length) out.push(`誤誘導 ${m.evidence} を客観証拠で否定できない`);
  }
  for (const tm of tpl.testimonies.filter((x) => x.lie)) {
    if (!t.misleads.some((m) => m.evidence === tm.evidence)) out.push(`嘘 ${tm.evidence} に対応する解消手段がない`);
    const seed = tpl.crew.find((c) => c.id === tm.crew)!;
    const fact = t.evidence.find((e) => e.id === tm.evidence)!.fact;
    if (!seed.hides.length) out.push(`${tm.crew} は嘘をつくが隠したい事実を持たない (${fact})`);
  }

  // 正しい原因が選択肢にあり、カテゴリが一致する
  const co = tpl.causeOptions.find((c) => c.id === t.cause);
  if (!co || co.category !== t.category) out.push('正しい原因が選択肢にないかカテゴリ不一致');
  if (t.responsible && !tpl.crew.some((c) => c.id === t.responsible!.crew)) out.push('関係者が乗員にいない');
  return out;
}
