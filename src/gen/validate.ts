// 静的検証：到達性、人物の時空間整合、因果のつながり、証拠と真相の対応、誤誘導の解消可能性、技能の足りる乗員の有無。
import type { RoomId } from '../core/types';
import { buildCase } from './registry';
import { LOWER_ROOMS, SIDE_ROOMS, reachableFrom, travelMinutes } from '../sim/ship';
import { NAMES } from './crewpool';

export function validateStatic(templateId: string, genSeed: number): string[] {
  const { def, ship, crew } = buildCase(templateId, genSeed);
  const out: string[] = [];
  const t = def.truth;
  const has = (r: RoomId) => ship.rooms.some((x) => x.id === r);
  const all = reachableFrom(ship, 'bridge');
  for (const r of ship.rooms) if (!all.has(r.id)) out.push(`区画 ${r.id} に到達できない`);

  const evIds = new Set(t.evidence.map((e) => e.id));
  for (const e of t.evidence) {
    if (e.room && !has(e.room)) out.push(`証拠 ${e.id} の区画 ${e.room} が船にない`);
    if (e.skill && e.work > 0 && !crew.some((c) => c.skills[e.skill!] >= e.minSkill)) out.push(`証拠 ${e.id} を見つけられる乗員がいない`);
  }
  for (const id of def.initialEvidence) if (!evIds.has(id)) out.push(`初期証拠 ${id} がない`);
  for (const [cid, init] of Object.entries(def.crewInit)) {
    if (!crew.some((c) => c.id === cid)) out.push(`初期配置の乗員 ${cid} がいない`);
    if (!has(init.room)) out.push(`乗員 ${cid} の初期区画 ${init.room} が船にない`);
  }
  for (const c of crew) if (!def.crewInit[c.id]) out.push(`乗員 ${c.id} の初期配置がない`);

  // 人物の時空間整合
  for (const c of crew) {
    const w = def.whereabouts.filter((x) => x.crew === c.id).sort((a, b) => a.sec - b.sec);
    for (const x of w) if (!has(x.room)) out.push(`${c.id} の居場所 ${x.room} が船にない`);
    const seq = [...w, { crew: c.id, sec: def.startSec, room: def.crewInit[c.id]?.room }];
    for (let i = 1; i < seq.length; i++) {
      if (!seq[i].room || !seq[i - 1].room || !has(seq[i].room) || !has(seq[i - 1].room)) continue;
      const need = travelMinutes(ship, seq[i - 1].room, seq[i].room) * 60;
      if (seq[i].sec - seq[i - 1].sec < need) out.push(`${c.name} が ${seq[i - 1].room}→${seq[i].room} を時間内に移動できない`);
    }
    for (const ev of t.events.filter((e) => e.actor === c.id && e.sec > def.startSec - 86400)) {
      const at = w.filter((x) => x.sec <= ev.sec).pop();
      if (!at || at.room !== ev.room) out.push(`事象 ${ev.id} の時刻に ${c.name} が ${ev.room} にいない`);
    }
  }
  for (const ev of t.events) if (!has(ev.room)) out.push(`事象 ${ev.id} の区画 ${ev.room} が船にない`);

  // 因果：発端から被害へつながる
  const evMap = new Map(t.events.map((e) => [e.id, e]));
  for (const e of t.events) for (const c of e.causes) if (!evMap.has(c)) out.push(`事象 ${e.id} の因果先 ${c} がない`);
  const reach = new Set<string>();
  const stack = [def.rootEvent];
  while (stack.length) { const x = stack.pop()!; if (reach.has(x)) continue; reach.add(x); stack.push(...(evMap.get(x)?.causes ?? [])); }
  if (!reach.has(def.damageEvent)) out.push('発端から被害への因果がつながっていない');

  const secs = t.orderCards.map((c) => c.sec);
  if (new Set(secs).size !== secs.length) out.push('時系列カードに同時刻がある');
  if (t.orderCards.length < 3) out.push('時系列カードが少ない');

  // 誤誘導は客観証拠で区別できること
  for (const m of t.misleads) {
    if (!evIds.has(m.evidence)) out.push(`誤誘導 ${m.evidence} が証拠にない`);
    const objective = m.resolvedBy.filter((id) => { const e = t.evidence.find((x) => x.id === id); return e && e.source !== 'testimony'; });
    if (!objective.length) out.push(`誤誘導 ${m.evidence} を客観証拠で否定できない`);
  }
  for (const tm of def.testimonies) {
    if (!evIds.has(tm.evidence)) out.push(`証言 ${tm.evidence} が証拠にない`);
    if (!crew.some((c) => c.id === tm.crew)) out.push(`証言者 ${tm.crew} がいない`);
    if (tm.lie) {
      if (!t.misleads.some((m) => m.evidence === tm.evidence)) out.push(`嘘 ${tm.evidence} に対応する解消手段がない`);
      if (!def.crewInit[tm.crew]?.hides?.length) out.push(`嘘をつく ${tm.crew} が隠したい事実を持たない`);
    }
  }
  for (const cf of def.confessions) for (const id of cf.triggeredBy) if (!evIds.has(id)) out.push(`告白の引き金 ${id} が証拠にない`);

  const co = def.causeOptions.find((c) => c.id === t.cause);
  if (!co) out.push('正しい原因が選択肢にない');
  if (t.responsible && !crew.some((c) => c.id === t.responsible!.crew)) out.push('関係者が乗員にいない');
  if (!has(def.respond.room)) out.push('現場対応の区画が船にない');
  for (const f of def.fieldActions) if (!has(f.room)) out.push(`現場の手当て ${f.id} の区画が船にない`);
  if (!def.plans.some((p) => p.score >= 1)) out.push('完全に有効な対処がない');

  // ---- 文章の辻褄 ----
  const texts: [string, string][] = [
    ...t.evidence.flatMap((e) => [[`証拠${e.id}`, e.title], [`証拠${e.id}`, e.text], [`証拠${e.id}の入手先`, e.where]] as [string, string][]),
    ...t.events.map((e) => [`事象${e.id}`, e.text] as [string, string]),
    ...t.misleads.map((m) => [`誤誘導${m.evidence}`, m.explain] as [string, string]),
    ...t.orderCards.map((o) => [`時系列${o.id}`, o.label] as [string, string]),
    ...def.briefing.map((b, i) => [`ブリーフィング${i}`, b] as [string, string]),
    ['警報', def.alarmText],
    ...def.fieldActions.map((f) => [`手当て${f.id}`, f.ask + f.label] as [string, string]),
    ...def.plans.map((p) => [`作戦${p.id}`, p.label + (p.warn ?? '')] as [string, string]),
    [ '現場対応', def.respond.label + def.respond.desc + def.respond.waitLabel ],
  ];
  // 名前：その回の乗員にいない名前が出てこない（前後がカタカナでない位置だけを名前とみなす）
  const names = new Set(crew.map((c) => c.name));
  const kata = /[ァ-ヶー]/;
  for (const [where, text] of texts) {
    for (const n of NAMES) {
      if (names.has(n)) continue;
      let i = text.indexOf(n);
      while (i >= 0) {
        const before = text[i - 1] ?? '', after = text[i + n.length] ?? '';
        if (!kata.test(before) && !kata.test(after)) { out.push(`${where}に乗員にいない名前「${n}」`); break; }
        i = text.indexOf(n, i + 1);
      }
    }
  }
  // 区画：その回の船にない区画の名前が出てこない
  const shipNames = new Set(ship.rooms.map((r) => r.name));
  for (const rn of [...Object.values(SIDE_ROOMS), ...Object.values(LOWER_ROOMS)]) {
    if (shipNames.has(rn)) continue;
    for (const [where, text] of texts) if (text.includes(rn)) { out.push(`${where}に船にない区画「${rn}」`); break; }
  }
  // 時刻：文章中の HH:MM は、出来事・居場所・時系列・開始時刻・明示した時刻のどれかと一致する（±1分）
  const allowed = [def.startSec, ...t.events.map((e) => e.sec), ...def.whereabouts.map((w) => w.sec), ...t.orderCards.map((o) => o.sec), ...(def.statedTimes ?? [])]
    .map((x) => Math.round((((x % 86400) + 86400) % 86400) / 60));
  const near = (m: number) => allowed.some((a) => Math.min(Math.abs(a - m), 1440 - Math.abs(a - m)) <= 1);
  for (const [where, text] of texts) {
    for (const mm of text.matchAll(/(\d{2}):(\d{2})/g)) {
      const m = Number(mm[1]) * 60 + Number(mm[2]);
      if (!near(m)) out.push(`${where}の時刻 ${mm[0]} が真相のどの出来事とも合わない`);
    }
  }
  // 証言の中で、話している本人の名前が出てこない（自分を三人称で呼ばない）
  for (const tm of [...def.testimonies, ...def.confessions.map((c) => ({ crew: c.crew, evidence: c.evidence }))]) {
    const who = crew.find((c) => c.id === tm.crew);
    const e = t.evidence.find((x) => x.id === tm.evidence);
    if (who && e && e.text.includes(who.name)) out.push(`証言 ${tm.evidence} で${who.name}が自分の名前を口にしている`);
  }
  // 時系列カードの時刻は、真相の出来事のどれかと一致する
  for (const o of t.orderCards) if (!t.events.some((e) => Math.abs(e.sec - o.sec) <= 60)) out.push(`時系列カード ${o.id} に対応する出来事がない`);
  return out;
}
