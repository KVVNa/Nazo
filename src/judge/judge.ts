// 構造化された仮説を部分評価する。事件中は内訳を見せない（結果は事件終了画面でだけ使う）。
import type { GameState, Hypothesis, PlanKind } from '../core/types';
import { currentTemplate } from '../gen/generate';

export interface Judgement {
  parts: { category: number; cause: number; order: number; person: number; evidence: number; plan: number };
  total: number;
}

const PLAN_SCORE: Record<PlanKind, number> = {
  sealDryRestart: 1, swapCell: 0.5, shed: 0.5, dryRestart: 0.3, restartNow: 0, detain: 0,
};

export function judge(s: GameState, h: Hypothesis): Judgement {
  const t = s.truth;
  const category = h.category === t.category ? 1 : 0;
  const cause = h.cause === t.cause ? 1 : 0;
  const trueOrder = [...t.orderCards].sort((a, b) => a.sec - b.sec).map((c) => c.id);
  let ok = 0, n = 0;
  for (let i = 0; i < trueOrder.length; i++)
    for (let j = i + 1; j < trueOrder.length; j++) {
      n++;
      if (h.order.indexOf(trueOrder[i]) < h.order.indexOf(trueOrder[j])) ok++;
    }
  const order = n ? ok / n : 0;
  let person = 0;
  if (t.responsible) {
    if (h.person && h.person.crew === t.responsible.crew && h.person.role === t.responsible.role) person = 1;
    else if (!h.person) person = 0.4;
  } else person = h.person ? 0 : 1;
  const keys = t.evidence.filter((e) => e.key).map((e) => e.id);
  const misleadIds = t.misleads.map((m) => m.evidence);
  let evidence = 0;
  for (const e of h.evidence) {
    if (keys.includes(e) || e === 'duran_confess' || e === 'old_cell') evidence += 0.25;
    if (misleadIds.includes(e)) evidence -= 0.15;
  }
  evidence = Math.max(0, Math.min(1, evidence));
  const plan = PLAN_SCORE[h.plan];
  const total = category * 10 + cause * 30 + order * 20 + person * 15 + evidence * 15 + plan * 10;
  return { parts: { category, cause, order, person, evidence, plan }, total: Math.round(total) };
}

export type Grade = '真相解明' | '部分解明' | '未解明';

export interface CaseResult {
  grade: Grade;
  judgement: Judgement | null;
  hyp: Hypothesis | null;
  survivors: { id: string; name: string; alive: boolean; health: number; trust: number }[];
  hull: number;
  o2: number;
  resolved: boolean;
  shipLost: boolean;
  missed: { title: string; where: string }[];
  misleads: string[];
  truthLines: string[] | null;
  epilogue: string[];
  reasonText: string;
}

export function evaluateCase(s: GameState): CaseResult {
  const last = s.player.submissions[s.player.submissions.length - 1]?.hyp ?? null;
  const j = last ? judge(s, last) : null;
  const shipLost = s.outcome?.reason === 'lost';
  let grade: Grade = '未解明';
  if (j) {
    const p = j.parts;
    if (p.category && p.cause && p.order >= 0.83 && p.person === 1) grade = '真相解明';
    else if (p.cause || (p.category && p.order >= 0.66)) grade = '部分解明';
  }
  const t = s.truth;
  const have = new Set(s.player.evidence);
  const missed = t.evidence
    .filter((e) => (e.key || e.id === 'medclock' || e.id === 'inventory') && !have.has(e.id))
    .map((e) => ({ title: e.title, where: e.where + (s.world.destroyed.includes(e.id) ? '（火災で失われた）' : '') }));
  const misleads = t.misleads
    .filter((m) => have.has(m.evidence) || (last && last.evidence.includes(m.evidence)))
    .map((m) => m.explain);
  const reasonText = {
    resolved: '危機を脱し、事件を締めくくった',
    third: '3回目の仮説で事件を確定した',
    abandon: '調査を打ち切った',
    lost: '船は失われた',
    timeout: '事件の期限に達した',
  }[s.outcome?.reason ?? 'abandon'];

  const epilogue: string[] = [];
  for (const c of s.crew) {
    if (!c.alive) { epilogue.push(`${c.name}（${c.role}）は帰らなかった。${c.id === 'duran' && !c.mind.confessed ? '記録の真偽を語る者はもういない。' : ''}`); continue; }
    if (c.policy.kind === 'detained') { epilogue.push(`${c.name}は拘束されたまま朝を迎えた。${t.responsible?.crew === c.id ? '処分は寄港後に決まる。' : '身に覚えのない拘束に、口数が減った。'}`); continue; }
    if (c.id === 'duran') epilogue.push(c.mind.confessed ? 'ドゥランは整備記録を自分で訂正し、次の寄港で処分を受けると申し出た。' : grade === '真相解明' ? 'ドゥランは記録の件を問われ、しばらく黙ってからうなずいた。' : 'ドゥランは何事もなかったように巡回に戻った。予備セルの記録は、誰にも見直されていない。');
    else if (c.id === 'mina') epilogue.push(s.world.leakSealed ? 'ミナは封止した継手を何度も叩いて確かめ、「次の寄港で必ず交換する」と整備計画に書き込んだ。' : 'ミナは濡れた配電室の前で腕を組んだまま、長いこと動かなかった。');
    else if (c.id === 'sora') epilogue.push(have.has('medclock') ? 'ソラは医務室の時計を合わせ直し、「火花」の件を自分から訂正しに来た。' : 'ソラは今も、あの夜の火花は誰かの仕業だったのではと考えている。');
    else if (c.id === 'kei') epilogue.push(c.trust >= 55 ? 'ケイは夜食の件を少し恥ずかしそうに話し、次の当直からは司令室を離れないと言った。' : 'ケイは当直のたびに貨物室の方を気にしている。');
  }

  return {
    grade: shipLost ? '未解明' : grade,
    judgement: j,
    hyp: last,
    survivors: s.crew.map((c) => ({ id: c.id, name: c.name, alive: c.alive, health: Math.round(c.health), trust: Math.round(c.trust) })),
    hull: Math.round(s.world.hull),
    o2: Math.round(s.world.o2),
    resolved: s.world.resolved,
    shipLost,
    missed,
    misleads,
    truthLines: grade === '真相解明' ? [...t.events].filter((e) => e.sec > 0).sort((a, b) => a.sec - b.sec).map((e) => e.text).concat(t.events.filter((e) => e.sec <= 0).map((e) => e.text)) : null,
    epilogue,
    reasonText,
  };
}

export function causeOptions() {
  return currentTemplate().causeOptions;
}
