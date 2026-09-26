// 航海モードの進行：5つの事件をつなぎ、乗員の生死・健康・信頼・分かったことを持ち越す。
// UI からは VoyageState と下の関数だけを使う。事件そのものは gen/ と sim/ に任せる。
import type { FixedCrew, FixedSeed, GameState } from '../core/types';
import { generateWithReport, mixSeed } from '../gen/generate';
import { makeRand, templateById } from '../gen/registry';
import { evaluateCase } from '../judge/judge';
import { ACTING_LABEL, CREW8, LINES, PROFILES } from './crew8';
import { CASE_SECRET, CAST, DAILY, GRIEF, INTROS, PREVENTS, REACT, STAGES, TALKS, type Choice, type Line, type Talk } from './story';
import type { EndCtx, ReportChoice } from './ending';

export const VOYAGE_SCHEMA = 1;
export const SLOTS_PER_INTERLUDE = 3;
export const MIN_CREW = 5;

export interface VCrew {
  id: string;
  alive: boolean;
  health: number;
  trust: number;
  confined: boolean;
  talks: number; // 進んだ会話の数（0..3）
  diedDay?: number;
}

export interface StageResult {
  stage: number;
  templateId: string;
  title: string;
  grade: string;
  code: string;
  responsible: string | null;
  deaths: string[];
  prevented?: string; // 会話で手を打ったため起きなかった事件の説明
}

export type VPhase = 'prologue' | 'dinner' | 'stage' | 'case' | 'interlude' | 'ending' | 'done';

export interface VoyageState {
  kind: 'campaign';
  schema: number;
  seed: number;
  phase: VPhase;
  stage: number; // 次に（または今）起きる事件の段階 0..4
  crew: VCrew[];
  facts: string[]; // 分かったこと（S_*, H_*）と手を打った印（P_*）
  results: StageResult[];
  used: string[];
  slots: number; // 事件の合間に残っている行動の数
  treated: boolean;
  repaired: boolean;
  rested: boolean;
  hull: number; // 船体（事件をまたいで持ち越す）
  parts: number; // 予備部品（修理に使う）
  meds: number; // 医療品（手当てに使う）
  gifts?: string; // 直前の事件で受け取ったもの
  talkedNow: string[]; // この合間に話した乗員
  dinner: Record<string, number>; // 出港前夜の返事
  pendingCase: { templateId: string; seed: number; fixed: FixedCrew; note?: string } | null;
  ending: { choice: ReportChoice; attach: string[]; blocked: boolean; score: number; rank: string; kind: 'report' | 'abort' | 'lost' } | null;
  startedAt: string;
}

export function newVoyage(seed = Math.floor(Math.random() * 1e9)): VoyageState {
  return {
    kind: 'campaign', schema: VOYAGE_SCHEMA, seed, phase: 'prologue', stage: 0,
    crew: CREW8.map((c) => ({ id: c.id, alive: true, health: 100, trust: c.trust, confined: false, talks: 0 })),
    facts: [], results: [], used: [], slots: 0, treated: false, repaired: false, rested: false, talkedNow: [], dinner: {},
    hull: 100, parts: 3, meds: 3,
    pendingCase: null, ending: null, startedAt: new Date().toISOString(),
  };
}

export const vc = (v: VoyageState, id: string) => v.crew.find((c) => c.id === id)!;
const free = (v: VoyageState) => v.crew.filter((c) => c.alive && !c.confined);
export const profileOf = (id: string) => PROFILES.find((p) => p.id === id)!;
export const seedOf = (id: string) => CREW8.find((c) => c.id === id)!;
export const nameOf = (id: string) => seedOf(id).name;
export const dayOf = (stage: number) => STAGES[Math.min(stage, STAGES.length - 1)].day;

// ---------- 出港前夜 ----------
export function answerDinner(v: VoyageState, id: string, i: number) {
  if (v.dinner[id] !== undefined) return;
  const intro = INTROS.find((x) => x.id === id)!;
  v.dinner[id] = i;
  const c = vc(v, id);
  c.trust = clamp(c.trust + intro.choices[i].trust);
}

// ---------- 事件の準備 ----------
// 欠けた役目（機関・医務）を残った乗員が代わりに務める。関係人物にしたい乗員は代役にしない
function rosterFor(v: VoyageState, cast?: string): FixedSeed[] {
  const list: FixedSeed[] = free(v).map((c) => {
    const s = seedOf(c.id);
    return { ...s, skills: { ...s.skills }, look: { ...s.look }, trust: Math.round(c.trust), health: Math.round(c.health), lines: LINES[c.id] };
  });
  const core = ['engineer', 'medic'];
  const skill: Record<string, 'mech' | 'med'> = { engineer: 'mech', medic: 'med' };
  for (const role of core) {
    if (list.some((c) => c.roleId === role)) continue;
    const others = list.filter((c) => !core.includes(c.roleId) && c.id !== cast);
    // 観測・厨房の役目はなるべく残す（その役目が要る事件のため）
    const pref = others.filter((c) => !['scientist', 'cook'].includes(c.roleId));
    const cand = (pref.length ? pref : others).sort((a, b) => b.skills[skill[role]] - a.skills[skill[role]] || b.exp - a.exp)[0];
    if (!cand) continue;
    cand.role = `${cand.role}（${ACTING_LABEL[role]}）`;
    cand.roleId = role;
  }
  return list;
}

// 組み立て式の事件の犯人候補：動機（差し替え文）を持ち、会話で手を打たれておらず、隠し事がまだ明らかでなく、
// これまでの事件の関係人物でもない乗員。信頼が低いほど選ばれやすい
export function plotCandidates(v: VoyageState): string[] {
  return free(v).map((c) => c.id).filter((id) => {
    if (!LINES[id]?.['plot.goal']) return false;
    if (v.facts.includes('P_' + id)) return false;
    if (v.facts.includes(profileOf(id).secretFact)) return false;
    if (v.results.some((r) => r.responsible === id)) return false;
    return true;
  });
}
function pickPlotCulprit(v: VoyageState, rnd: () => number): string | undefined {
  const cs = plotCandidates(v);
  if (!cs.length) return undefined;
  const w = cs.map((id) => 120 - vc(v, id).trust);
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cs.length; i++) { x -= w[i]; if (x <= 0) return cs[i]; }
  return cs[cs.length - 1];
}
const usedUp = (v: VoyageState, t: string) => (t === 'plot' ? v.used.filter((x) => x === 'plot').length >= 2 : v.used.includes(t));

function needsOk(tid: string, v: VoyageState): boolean {
  if (tid === 'plot') return plotCandidates(v).length > 0;
  const alive = new Set(free(v).map((c) => seedOf(c.id).roleId));
  if (tid === 'food' && !alive.has('cook')) return false;
  if (tid === 'dust' && !alive.has('scientist')) return false;
  const cast = CAST[tid];
  if (cast) {
    const c = vc(v, cast);
    if (!c.alive || c.confined) return false;
    const p = Object.entries(PREVENTS).find(([, x]) => x.template === tid);
    if (p && v.facts.includes(p[0])) return false;
  }
  return true;
}

// 次の事件を選んで生成する（検証つき）。選べる型がなければ別の段階の型から探す
export function prepareCase(v: VoyageState): { state: GameState; note?: string } {
  const st = STAGES[v.stage];
  const rand = mixSeed(v.seed, 100 + v.stage);
  const notes: string[] = [];
  for (const [flag, p] of Object.entries(PREVENTS)) {
    if (st.pool.includes(p.template) && v.facts.includes(flag) && vc(v, p.crew).alive) notes.push(p.note);
  }
  let pool = st.pool.filter((t) => !usedUp(v, t) && needsOk(t, v));
  if (!pool.length) {
    const all = STAGES.flatMap((s) => s.pool);
    pool = all.filter((t) => !usedUp(v, t) && needsOk(t, v) && !CAST[t] && t !== 'plot');
    if (!pool.length) pool = all.filter((t) => !usedUp(v, t) && needsOk(t, v));
    if (!pool.length) pool = ['seu'];
  }
  const rnd = makeRand(rand);
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let lastErr: unknown = null;
  for (const tid of order) {
    const cast = tid === 'plot' ? pickPlotCulprit(v, rnd) : CAST[tid];
    const fixed: FixedCrew = { crew: rosterFor(v, cast), ...(cast ? { cast } : {}), ...(v.hull < 100 ? { hull: v.hull } : {}) };
    const seed = mixSeed(v.seed, 1000 + v.stage * 17 + order.indexOf(tid));
    try {
      const r = generateWithReport(seed, tid, 40, fixed);
      // 関係人物が意図どおりでなければ（代役で役目が変わったなど）別の型にする
      if (cast && r.state.truth.responsible && r.state.truth.responsible.crew !== cast) continue;
      v.pendingCase = { templateId: tid, seed, fixed, note: notes.join('\n') || undefined };
      return { state: r.state, note: v.pendingCase.note };
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('次の事件を組み立てられなかった');
}

// ---------- 事件の結果を持ち越す ----------
export function applyCaseResult(v: VoyageState, s: GameState, code: string): StageResult {
  const r = evaluateCase(s);
  const deaths: string[] = [];
  for (const c of s.crew) {
    const x = vc(v, c.id);
    if (!c.alive && x.alive) { x.alive = false; x.diedDay = dayOf(v.stage); deaths.push(c.id); }
    x.health = Math.max(0, Math.round(c.health));
    x.trust = clamp(c.trust);
    x.confined = c.alive && c.policy.kind === 'detained';
  }
  // 拘束で人手が足りなくなるなら、拘束は解く（船を回せなくなるため）
  if (free(v).length < MIN_CREW) for (const c of v.crew) c.confined = false;
  const resp = s.truth.responsible?.crew ?? null;
  const tid = s.templateId;
  const identified = !!resp && (s.crew.find((c) => c.id === resp)?.mind.confessed || (r.judgement?.parts.person ?? 0) >= 0.99);
  const castId = v.pendingCase?.fixed.cast ?? CAST[tid];
  const secret = tid === 'plot' ? (resp ? profileOf(resp).secretFact : undefined) : CASE_SECRET[tid];
  if (identified && resp === castId && secret) addFact(v, secret);
  const res: StageResult = { stage: v.stage, templateId: tid, title: templateById(tid).title, grade: r.shipLost ? '船の喪失' : r.grade, code, responsible: identified ? resp : null, deaths, prevented: v.pendingCase?.note };
  v.results.push(res);
  v.used.push(tid);
  v.pendingCase = null;
  if (r.shipLost) { finishLost(v); return res; }
  v.hull = Math.max(1, Math.round(s.world.hull));
  v.gifts = undefined;
  // 〈ヘロン〉を救えば、採掘艇の乗員から予備部品と医療品が届く
  if (tid === 'distress' && s.world.resolved && !s.world.vars.lost) { v.parts += 2; v.meds += 1; v.gifts = '〈ヘロン〉の乗員から、礼の言葉と一緒に予備部品2つと医療品1つが届いた。'; }
  v.stage++;
  v.slots = SLOTS_PER_INTERLUDE;
  v.treated = false;
  v.repaired = false;
  v.rested = false;
  v.talkedNow = [];
  // 事件のあとで少し回復する（治療すればさらに）
  for (const c of v.crew) if (c.alive) c.health = Math.min(100, c.health + 20);
  v.phase = v.stage >= STAGES.length || canNotContinue(v) ? 'ending' : 'interlude';
  return res;
}

function canNotContinue(v: VoyageState) {
  return v.crew.filter((c) => c.alive).length < MIN_CREW;
}

export function addFact(v: VoyageState, f: string) { if (!v.facts.includes(f)) v.facts.push(f); }
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

// ---------- 事件の合間 ----------
export function nextTalk(v: VoyageState, id: string): { talk: Talk | null; guarded: boolean; done: boolean } {
  const c = vc(v, id);
  const list = TALKS[id];
  if (c.talks >= list.length) return { talk: null, guarded: false, done: true };
  const t = list[c.talks];
  const doneCases = v.results.length;
  if (doneCases < t.minDone || c.trust < t.minTrust) return { talk: null, guarded: true, done: false };
  return { talk: t, guarded: false, done: false };
}

export function choicesFor(v: VoyageState, t: Talk): Choice[] {
  return (t.choices ?? []).filter((ch) => !ch.needs || v.facts.includes(ch.needs));
}

// 会話を1つ進める。行動を1つ使う（話し終えた相手との雑談でも使う。取り込み中の相手なら使わない）
export function talk(v: VoyageState, id: string, choice: number | null): void {
  if (v.slots <= 0 || v.talkedNow.includes(id)) return;
  const c = vc(v, id);
  if (!c.alive || c.confined) return;
  const n = nextTalk(v, id);
  if (n.guarded) return; // 相手が話せる状態でなければ時間は使わない
  v.slots--;
  v.talkedNow.push(id);
  if (!n.talk) { c.trust = clamp(c.trust + 1); return; }
  const chs = choicesFor(v, n.talk);
  const ch = choice !== null ? chs[choice] : undefined;
  c.trust = clamp(c.trust + 3 + (ch?.trust ?? 0));
  if (ch?.flag) addFact(v, ch.flag);
  if (n.talk.fact) addFact(v, n.talk.fact);
  c.talks++;
}

export function medicAvailable(v: VoyageState): string | null {
  const a = vc(v, 'aisha');
  if (a.alive && !a.confined) return 'aisha';
  const alt = free(v).map((c) => seedOf(c.id)).filter((s) => s.skills.med >= 1).sort((x, y) => y.skills.med - x.skills.med)[0];
  return alt?.id ?? null;
}

export function treat(v: VoyageState): string[] {
  if (v.slots <= 0 || v.treated || v.meds <= 0) return [];
  const m = medicAvailable(v);
  if (!m) return [];
  v.slots--;
  v.meds--;
  v.treated = true;
  const gain = m === 'aisha' ? 45 : 25;
  const healed: string[] = [];
  for (const c of v.crew) if (c.alive && c.health < 100) { c.health = Math.min(100, c.health + gain); healed.push(c.id); }
  return healed;
}

// 修理：予備部品を1つ使って船体を直す。機関長が動ければよく直る
export function repairer(v: VoyageState): string | null {
  const d = vc(v, 'dmitri');
  if (d.alive && !d.confined) return 'dmitri';
  const alt = free(v).map((c) => seedOf(c.id)).filter((s) => s.skills.mech >= 1).sort((x, y) => y.skills.mech - x.skills.mech)[0];
  return alt?.id ?? null;
}
export function repair(v: VoyageState): number {
  if (v.slots <= 0 || v.repaired || v.parts <= 0 || v.hull >= 100) return 0;
  const who = repairer(v);
  if (!who) return 0;
  v.slots--;
  v.parts--;
  v.repaired = true;
  const gain = who === 'dmitri' ? 25 : 15;
  const before = v.hull;
  v.hull = Math.min(100, v.hull + gain);
  return v.hull - before;
}
// 休息：当直を減らして全員を休ませる。少し回復し、少し打ち解ける
export function rest(v: VoyageState): boolean {
  if (v.slots <= 0 || v.rested) return false;
  v.slots--;
  v.rested = true;
  for (const c of v.crew) if (c.alive) { c.health = Math.min(100, c.health + 10); if (!c.confined) c.trust = clamp(c.trust + 2); }
  return true;
}

export function setConfined(v: VoyageState, id: string, on: boolean): boolean {
  const c = vc(v, id);
  if (!c.alive) return false;
  if (on && free(v).filter((x) => x.id !== id).length < MIN_CREW) return false;
  if (c.confined === on) return true;
  c.confined = on;
  c.trust = clamp(c.trust + (on ? -8 : 6));
  return true;
}

// 次の段階へ進む（合間を閉じる）
export function leaveInterlude(v: VoyageState) {
  if (v.phase !== 'interlude') return;
  v.phase = 'stage';
}

// ---------- 到着 ----------
export function endCtx(v: VoyageState): EndCtx {
  return {
    alive: (id) => { const c = vc(v, id); return c.alive && !c.confined; },
    dead: (id) => !vc(v, id).alive,
    confined: (id) => { const c = vc(v, id); return c.alive && c.confined; },
    trust: (id) => vc(v, id).trust,
    fact: (f) => v.facts.includes(f),
  };
}

export function scoreVoyage(v: VoyageState, choice: ReportChoice | null, attach: string[], blocked: boolean): { score: number; rank: string; parts: [string, number, number][] } {
  const cases = v.results.reduce((a, r) => a + (r.grade === '真相解明' ? 16 : r.grade === '部分解明' ? 8 : 0), 0);
  const alive = v.crew.filter((c) => c.alive).length;
  const surv = Math.round(alive * 2.5);
  let rep = 0;
  if (choice === 'truth' && !blocked) rep = 24 + Math.min(2, attach.length) * 8;
  else if (choice === 'truth' && blocked) rep = 6;
  else if (choice === 'conditional') rep = 12;
  const score = cases + surv + rep;
  const rank = score >= 115 ? 'S' : score >= 90 ? 'A' : score >= 65 ? 'B' : 'C';
  return { score, rank, parts: [['事件の解明', cases, 80], ['生きて着いた乗員', surv, 20], ['報告書', rep, 40]] };
}

export function finishReport(v: VoyageState, choice: ReportChoice, attach: string[], blocked: boolean) {
  const sc = scoreVoyage(v, choice, attach, blocked);
  v.ending = { choice, attach, blocked, score: sc.score, rank: sc.rank, kind: 'report' };
  v.phase = 'done';
}

export function finishAbort(v: VoyageState) {
  const sc = scoreVoyage(v, null, [], false);
  v.ending = { choice: 'wait', attach: [], blocked: false, score: sc.score, rank: sc.rank, kind: 'abort' };
  v.phase = 'done';
}

function finishLost(v: VoyageState) {
  for (const c of v.crew) if (c.alive) { c.alive = false; c.diedDay = dayOf(v.stage); }
  v.ending = { choice: 'wait', attach: [], blocked: false, score: 0, rank: 'C', kind: 'lost' };
  v.phase = 'done';
}

export function mustAbort(v: VoyageState) { return canNotContinue(v); }

// 事件の合間の冒頭に置く一場面：死者を悼む、関係人物への反応、何もなければ船の暮らし
export function interludeScene(v: VoyageState): Line[] {
  const last = v.results[v.results.length - 1];
  if (!last) return [];
  const ok = (id: string) => { const c = vc(v, id); return c.alive && !c.confined; };
  const out: Line[] = [];
  for (const d of last.deaths) {
    const gr = GRIEF[d];
    if (gr && ok(gr.by)) out.push({ who: gr.by, text: gr.text });
    else out.push({ who: 'narr', text: `食堂の椅子が一つ、空いたままになった。${nameOf(d)}の席だった。` });
  }
  if (last.responsible && vc(v, last.responsible).alive) {
    const r = REACT[last.responsible];
    out.push({ who: 'narr', text: `${nameOf(last.responsible)}は、食堂の隅でひとりで食事をとった。` });
    if (r && ok(r.by)) out.push({ who: r.by, text: r.text });
  }
  if (!out.length) {
    const opts = DAILY.filter((d) => d.needs.every(ok));
    const pick = opts[(v.results.length - 1) % Math.max(1, opts.length - 1)] ?? opts[opts.length - 1];
    out.push(...pick.lines);
  }
  if (v.gifts) out.push({ who: 'narr', text: v.gifts });
  return out;
}

// 以前の版で保存した航海に、新しい項目を足す
export function migrateVoyage(v: VoyageState): VoyageState {
  if (v.hull === undefined) v.hull = 100;
  if (v.parts === undefined) v.parts = 3;
  if (v.meds === undefined) v.meds = 3;
  if (v.repaired === undefined) v.repaired = false;
  if (v.rested === undefined) v.rested = false;
  return v;
}
