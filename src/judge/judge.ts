// 構造化された仮説を部分評価する。事件中は内訳を見せない（事件終了画面でだけ使う）。
import type { GameState, Hypothesis } from '../core/types';
import { voyageWords } from '../gen/voyage_words';
import { caseOf } from '../gen/registry';
import { planDefs } from '../sim/sim';

export interface Judgement {
  parts: { category: number; cause: number; order: number; person: number; evidence: number; plan: number };
  total: number;
}

export function judge(s: GameState, h: Hypothesis): Judgement {
  const t = s.truth;
  const category = h.category === t.category ? 1 : 0;
  const cause = h.cause === t.cause ? 1 : 0;
  const trueOrder = [...t.orderCards].sort((a, b) => a.sec - b.sec).map((c) => c.id);
  let okp = 0, n = 0;
  for (let i = 0; i < trueOrder.length; i++)
    for (let j = i + 1; j < trueOrder.length; j++) {
      n++;
      const a = h.order.indexOf(trueOrder[i]), b = h.order.indexOf(trueOrder[j]);
      if (a >= 0 && b >= 0 && a < b) okp++; // 並べていない出来事は正解に数えない
    }
  const order = n ? okp / n : 0;
  let person = 0;
  if (t.responsible) {
    if (h.person && h.person.crew === t.responsible.crew && h.person.role === t.responsible.role) person = 1;
    else if (h.person && h.person.crew === t.responsible.crew) person = 0.5;
    else if (!h.person) person = 0.3;
  } else person = h.person ? 0 : 1;
  const keys = t.evidence.filter((e) => e.key).map((e) => e.id);
  const confess = caseOf(s).confessions.map((c) => c.evidence);
  const misleadIds = t.misleads.map((m) => m.evidence);
  let evidence = 0;
  for (const e of h.evidence) {
    if (keys.includes(e) || confess.includes(e)) evidence += 0.25;
    if (misleadIds.includes(e)) evidence -= 0.15;
  }
  evidence = Math.max(0, Math.min(1, evidence));
  const plan = planDefs(s).find((p) => p.id === h.plan)?.score ?? 0;
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
  planLabel: string | null;
}

export function evaluateCase(s: GameState): CaseResult {
  const def = caseOf(s);
  const last = s.player.submissions[s.player.submissions.length - 1]?.hyp ?? null;
  const j = last ? judge(s, last) : null;
  const shipLost = s.outcome?.reason === 'lost';
  let grade: Grade = '未解明';
  if (j) {
    const p = j.parts;
    if (p.category && p.cause && p.order >= 0.83 && p.person === 1) grade = '真相解明';
    else if (p.cause || (p.category && p.order >= 0.66)) grade = '部分解明';
  }
  if (shipLost) grade = '未解明';
  const t = s.truth;
  const have = new Set(s.player.evidence);
  const resolvers = new Set(t.misleads.flatMap((m) => m.resolvedBy));
  const missed = t.evidence
    .filter((e) => (e.key || (resolvers.has(e.id) && e.room)) && !have.has(e.id))
    .map((e) => ({ title: e.title, where: e.where + (s.world.destroyed.includes(e.id) ? '（失われた）' : '') }));
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
  const epilogue = def.epilogue({
    grade,
    resolved: s.world.resolved,
    has: (id) => have.has(id),
    v: s.world.vars,
    crew: s.crew.map((c) => ({ id: c.id, name: c.name, role: c.role, alive: c.alive, confessed: c.mind.confessed, detained: c.policy.kind === 'detained', trust: c.trust })),
    responsible: t.responsible?.crew ?? null,
  });
  // 航海モードでは寄港がない。行き先は〈ハース〉への到着になる
  if (s.fixed) for (let i = 0; i < epilogue.length; i++) epilogue[i] = voyageWords(epilogue[i]);
  const sorted = [...t.events].sort((a, b) => a.sec - b.sec);
  return {
    grade,
    judgement: j,
    hyp: last,
    survivors: s.crew.map((c) => ({ id: c.id, name: c.name, alive: c.alive, health: Math.round(c.health), trust: Math.round(c.trust) })),
    hull: Math.round(s.world.hull),
    o2: Math.round(s.world.o2),
    resolved: s.world.resolved,
    shipLost,
    missed,
    misleads,
    truthLines: grade === '真相解明' ? sorted.map((e) => e.text) : null,
    epilogue,
    reasonText,
    planLabel: last ? planDefs(s).find((p) => p.id === last.plan)?.label ?? null : null,
  };
}

