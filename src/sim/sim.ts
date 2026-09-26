// 固定ステップのシミュレーション。1 tick = ゲーム内10秒。
// 真相を読めるのはここ（と gen / judge / cases）だけ。乗員AIには perceive() で作った観測だけを渡す。
import type {
  Action, CaseOutcome, Crew, CrewId, EvidenceDef, GameState, Group, LogEntry, Policy, PlanState, Report, RoomId, Skill,
} from '../core/types';
import { nextRand, secToClock } from '../core/rng';
import { commOk, findPath, nearestCommRoom, neighbors, roomName, edgeMinutes, TICKS_PER_MIN, GROUP_NAME } from './ship';
import { decide, type FieldOption, type Perception, type PlanStep } from '../ai/crew_ai';
import { caseOf } from '../gen/registry';
import type { Api, PlanDef } from '../gen/case_api';

export interface StepResult { pause: string | null; sfx: string[] }

const REPORT_MOVES = new Set(['報告のため通信の届く場所へ', '中継器を直しに移動', '確認を取りに通信の届く場所へ']);
const IMMEDIATE = new Set(['到着', '作業完了', '指示を受けた', '作戦の指示を受けた', '']);

export const nowSec = (s: GameState) => s.startSec + s.world.tick * 10;
const crewById = (s: GameState, id: string) => s.crew.find((c) => c.id === id)!;
const evDef = (s: GameState, id: string): EvidenceDef => s.truth.evidence.find((e) => e.id === id)!;
export const skillFactor = (lv: number) => Math.max(0.7, 1.6 - 0.3 * lv);
const ok = (s: GameState, room: RoomId) => commOk(s.ship, s.world, room);

// ---------- ログとレポート ----------
function pushLog(s: GameState, e: Omit<LogEntry, 'id' | 'deliveredSec'> & { deliveredSec?: number }): LogEntry {
  const entry: LogEntry = { id: s.nextId++, deliveredSec: nowSec(s), ...e };
  s.player.log.push(entry);
  s.player.unread++;
  for (const ev of entry.evidence ?? []) grantEvidence(s, ev);
  return entry;
}

export function grantEvidence(s: GameState, id: string) {
  if (s.player.evidence.includes(id)) return;
  s.player.evidence.push(id);
  const n = s.player.board.cards.length;
  s.player.board.cards.push({ id, x: 12 + (n % 2) * 170, y: 16 + Math.floor(n / 2) * 116 });
  // 新しい手がかりで浮上した見立てを知らせる
  const before = new Set(s.player.unlocked ?? []);
  const now = unlockedKeys(s);
  s.player.unlocked = now;
  const fresh = now.filter((k) => !before.has(k));
  if (fresh.length && s.phase === 'play') {
    const def = caseOf(s);
    const label = (k: string) => {
      const [kind, key] = k.split(':');
      if (kind === 'cause') return `原因「${def.causeOptions.find((c) => c.id === key)?.label}」`;
      if (kind === 'order') return `出来事「${s.truth.orderCards.find((c) => c.id === key)?.label}」`;
      return `対処「${planLabel(s, key)}」`;
    };
    s.player.log.push({ id: s.nextId++, sec: nowSec(s), deliveredSec: nowSec(s), crew: null, delayed: false, kind: 'system',
      text: `［${evDef(s, id).title}］から新しい見立てが浮かんだ：${fresh.map(label).join('、')}` });
    s.player.unread++;
  }
}

// 手元の証拠から浮上している仮説の選択肢
export function unlockedKeys(s: GameState): string[] {
  const have = new Set(s.player.evidence);
  return Object.entries(caseOf(s).unlock).filter(([, evs]) => evs.some((e) => have.has(e))).map(([k]) => k);
}

function report(s: GameState, c: Crew, r: Omit<Report, 'id' | 'crew' | 'sec' | 'room' | 'offline'>) {
  c.outbox.push({ id: s.nextId++, crew: c.id, sec: nowSec(s), room: c.room, offline: !ok(s, c.room), ...r });
}

function learn(c: Crew, f: string) {
  if (!c.mind.known.includes(f)) c.mind.known.push(f);
}

// 事件定義から使う操作の窓口
function makeApi(s: GameState, res: StepResult): Api {
  const api: Api = {
    s,
    v: s.world.vars,
    w: s.world,
    now: () => nowSec(s),
    clock: secToClock,
    rn: (r) => roomName(s.ship, r),
    crew: (id) => crewById(s, id),
    crews: () => s.crew,
    log: (text, kind = 'system', pause, evidence) => {
      pushLog(s, { sec: nowSec(s), crew: null, text, delayed: false, kind, evidence });
      if (pause) res.pause = res.pause ?? pause;
    },
    alarm: (text, pause) => {
      pushLog(s, { sec: nowSec(s), crew: null, text, delayed: false, kind: 'danger' });
      res.pause = res.pause ?? pause ?? text.slice(0, 20);
      res.sfx.push('alarm');
    },
    report: (c, text, o = {}) => report(s, c, { text, evidence: o.evidence, reason: o.reason, important: o.important ?? true, kind: o.kind ?? 'report' }),
    learn,
    knows: (c, f) => c.mind.known.includes(f),
    hurt: (id, n) => { const c = crewById(s, id); if (c.alive) c.health = Math.max(0, c.health - n); },
    fire: (room, intensity) => {
      s.world.fire = { room, intensity };
      for (const e of s.truth.evidence) if (e.destroyedByFire && e.room === room && !s.world.destroyed.includes(e.id)) s.world.destroyed.push(e.id);
      api.alarm(`火災警報：${roomName(s.ship, room)}（固定センサー）`, '火災');
    },
    destroy: (ids) => { for (const id of ids) if (!s.world.destroyed.includes(id)) s.world.destroyed.push(id); },
    setComm: (g, down) => {
      const has = s.world.commDown.includes(g);
      if (down && !has) s.world.commDown.push(g);
      if (!down && has) s.world.commDown = s.world.commDown.filter((x) => x !== g);
    },
    once: (key) => { if (s.firedEvents.includes(key)) return false; s.firedEvents.push(key); return true; },
    evTitle: (id) => evDef(s, id).title,
    evText: (id) => evDef(s, id).text,
    failPlan: (c) => failPlan(s, c),
    order: (c, policy) => {
      if (!c.alive || c.policy.kind === 'detained' || c.policy.kind === 'plan' || !ok(s, c.room)) return false;
      c.policy = policy; c.pendingPolicy = null; c.mind.asked = {};
      c.task = { t: 'idle', label: '指示を受けた' };
      return true;
    },
  };
  return api;
}

// ---------- 作戦 ----------
const DETAIN: PlanDef = {
  id: 'detain',
  label: '関係人物を拘束',
  warn: '「関係人物」で選んだ乗員を拘束する。見当違いなら乗員の信頼を損なう',
  score: 0,
  steps: () => [],
};

export function planDefs(s: GameState): PlanDef[] {
  return [...caseOf(s).plans, DETAIN];
}
export function planLabel(s: GameState, kind: string): string {
  return planDefs(s).find((p) => p.id === kind)?.label ?? kind;
}

function currentPlanStep(s: GameState, p: PlanState, api: Api): PlanStep | null {
  if (p.kind === 'detain') {
    if (!p.target || p.step > 0) return null;
    const t = crewById(s, p.target);
    return { room: t.room, action: 'detain', label: `${t.name}の拘束` };
  }
  const def = planDefs(s).find((d) => d.id === p.kind);
  return def?.steps({ knowsCause: p.knowsCause, target: p.target }, api)[p.step] ?? null;
}

function pickExecutor(s: GameState, p: PlanState): Crew | null {
  const cands = s.crew.filter((c) => c.alive && c.policy.kind !== 'detained' && !s.world.vars['down_' + c.id] && ok(s, c.room) && c.id !== p.target);
  if (!cands.length) return null;
  const skill: Skill = planDefs(s).find((d) => d.id === p.kind)?.skill ?? 'mech';
  const key = (c: Crew) => (p.kind === 'detain' ? (c.roleId === 'security' ? 10 : 0) + c.exp : c.skills[skill] * 10 + c.exp - c.impair * 20);
  return [...cands].sort((a, b) => key(b) - key(a))[0];
}

function assignPlans(s: GameState) {
  for (const p of s.plans) {
    if (p.status !== 'waiting') continue;
    const ex = pickExecutor(s, p);
    if (!ex) continue;
    p.executor = ex.id;
    p.status = 'running';
    ex.policy = { kind: 'plan', planId: p.id };
    ex.pendingPolicy = null;
    ex.task = { t: 'idle', label: '作戦の指示を受けた' };
    pushLog(s, { sec: nowSec(s), crew: ex.id, text: `作戦「${planLabel(s, p.kind)}」を引き受けた。`, delayed: false, kind: 'order' });
  }
}

function advancePlan(s: GameState, c: Crew, api: Api) {
  if (c.policy.kind !== 'plan') return;
  const p = s.plans.find((x) => x.id === c.policy.planId);
  if (!p || p.status !== 'running') return;
  p.step++;
  if (!currentPlanStep(s, p, api)) {
    p.status = 'done';
    c.policy = { kind: 'standby' };
    report(s, c, { text: `作戦「${planLabel(s, p.kind)}」を終えた。`, important: true, kind: 'report', planDone: p.id });
  }
}

function failPlan(s: GameState, c: Crew) {
  const p = s.plans.find((x) => x.id === c.policy.planId);
  if (p && p.status === 'running') {
    p.status = 'failed';
    report(s, c, { text: `作戦「${planLabel(s, p.kind)}」を続けられない。`, important: true, kind: 'report', planDone: p.id });
  }
  c.policy = { kind: 'standby' };
}

// ---------- 観測（AIへの入力） ----------
function perceive(s: GameState, c: Crew, api: Api): Perception {
  const w = s.world;
  const def = caseOf(s);
  const comm = ok(s, c.room);
  const safe = neighbors(s.ship, c.room).map((n) => n.to).find((r) => !(w.fire && w.fire.room === r)) ?? 'corridor';
  const radioHurt = comm ? s.crew.filter((x) => x.alive && x.id !== c.id && ok(s, x.room)).map((x) => ({ id: x.id, room: x.room, health: x.health })) : [];
  const plan = c.policy.kind === 'plan' ? s.plans.find((p) => p.id === c.policy.planId) : undefined;
  // 本人が知っている事実から思いつく現場の手当て（真相ではなく本人の知識で絞る）
  const fieldOptions: FieldOption[] = def.fieldActions
    .filter((f) => c.mind.known.includes(f.needs) && !c.mind.known.includes('S_' + f.id) && !c.mind.hides.includes(f.needs)
      && (!f.skill || c.skills[f.skill] >= (f.minSkill ?? 1)))
    .map((f) => ({ id: f.id, room: f.room, label: f.label, ask: f.ask, why: f.why }));
  const myGroup = s.ship.rooms.find((r) => r.id === c.room)!.group;
  const down = w.commDown.map((g) => s.ship.relayRoom[g]);
  return {
    room: c.room,
    comm,
    nearestComm: nearestCommRoom(s.ship, w, c.room),
    safeNeighbor: safe,
    fireHere: !!w.fire && w.fire.room === c.room,
    injuredHere: s.crew.filter((x) => x.alive && x.room === c.room && x.task.t !== 'move').map((x) => ({ id: x.id, name: x.name, health: x.health })),
    injuredRadio: radioHurt,
    myRelayRoom: comm ? null : s.ship.relayRoom[myGroup],
    downRelayRooms: down,
    hasImportantUnsent: c.outbox.some((r) => r.important),
    planStep: plan && plan.status === 'running' ? currentPlanStep(s, plan, api) : null,
    respondRoom: def.respond.room,
    respondWait: def.respond.waitLabel,
    fieldOptions,
  };
}

// ---------- タスク ----------
function nextFindable(s: GameState, c: Crew): EvidenceDef | null {
  return s.truth.evidence.find((e) =>
    e.room === c.room && e.work > 0 && !c.mind.known.includes(e.fact + '@' + e.id) &&
    !s.world.destroyed.includes(e.id) &&
    (!e.skill || c.skills[e.skill] >= e.minSkill)) ?? null;
}

function workMinutes(s: GameState, c: Crew, action: string, api: Api, arg?: string): number {
  const def = caseOf(s);
  let m: number;
  if (action === 'search') {
    const e = arg ? evDef(s, arg) : null;
    if (!e) m = 2;
    else m = e.work * skillFactor(e.skill ? c.skills[e.skill] : Math.max(c.skills.inv, c.skills.mech));
  } else if (action === 'repairRelay') m = 10 * skillFactor(c.skills.mech);
  else if (action === 'fightFire') m = 1;
  else if (action === 'treat') m = 3 * skillFactor(c.skills.med);
  else if (action === 'detain') m = 1;
  else m = def.actions[action]?.minutes(api, c) ?? 2;
  return m * (1 + c.impair);
}

function startDecision(s: GameState, c: Crew, api: Api) {
  const obs = perceive(s, c, api);
  const d = decide(
    { id: c.id, name: c.name, skills: c.skills, exp: c.exp, trust: c.trust, bold: c.bold, health: c.health, policy: c.policy },
    c.mind, obs, nextRand(s),
  );
  switch (d.a) {
    case 'wait':
      c.task = { t: 'idle', label: d.label };
      return;
    case 'ask':
      c.mind.asked[d.key] = true;
      report(s, c, { text: d.text, reason: d.reason, important: false, kind: 'confirm', confirmKey: d.key });
      c.task = { t: 'idle', label: '船長の返答待ち' };
      return;
    case 'move': {
      const path = findPath(s.ship, c.room, d.to);
      if (!path.length) { c.task = { t: 'idle', label: '移動できない' }; return; }
      c.task = { t: 'move', path, progress: 0, label: d.label };
      if (d.autonomous && d.reason) report(s, c, { text: `${d.label}。`, reason: d.reason, important: false, kind: 'autonomy' });
      return;
    }
    case 'work': {
      let arg = d.arg;
      let action = d.action;
      if (action === 'search') arg = nextFindable(s, c)?.id ?? '';
      if (action.startsWith('fa:')) {
        const fa = caseOf(s).fieldActions.find((f) => f.id === action.slice(3))!;
        arg = fa.id;
        action = fa.action;
      }
      const ticks = Math.max(1, Math.round(workMinutes(s, c, action, api, arg) * TICKS_PER_MIN));
      c.task = { t: 'work', action: d.action.startsWith('fa:') ? d.action : action, remaining: ticks, total: ticks, label: d.label, arg };
      if (d.autonomous && d.reason && action !== 'search' && action !== 'treat')
        report(s, c, { text: `自分の判断で「${d.label}」を始めた。`, reason: d.reason, important: false, kind: 'autonomy' });
    }
  }
}

function finishWork(s: GameState, c: Crew, action: string, api: Api, arg?: string) {
  const def = caseOf(s);
  const useSkill = (k: Skill) => { c.mind.skillSeen[k] = true; };
  if (action.startsWith('fa:')) {
    const fa = def.fieldActions.find((f) => f.id === action.slice(3))!;
    if (fa.skill) useSkill(fa.skill);
    def.actions[fa.action].run(api, c, null);
    learn(c, 'S_' + fa.id);
    return;
  }
  switch (action) {
    case 'search': {
      if (!arg) {
        learn(c, 'X_searched_' + c.room);
        report(s, c, { text: `${roomName(s.ship, c.room)}の調査を終えた。これ以上の手がかりは見当たらない。`, important: false, kind: 'report' });
        return;
      }
      const e = evDef(s, arg);
      learn(c, e.fact + '@' + e.id);
      learn(c, e.fact);
      if (e.skill) useSkill(e.skill);
      if (c.mind.hides.includes(e.fact)) return; // 隠したい事実は報告しない
      report(s, c, { text: `［${e.title}］${e.text}`, evidence: [e.id], important: true, kind: 'report' });
      return;
    }
    case 'repairRelay': {
      useSkill('mech');
      const g = (Object.keys(s.ship.relayRoom) as Group[]).find((k) => s.ship.relayRoom[k] === c.room && s.world.commDown.includes(k));
      if (g) {
        s.world.vars['relay_' + g] = 1;
        api.setComm(g, false);
        report(s, c, { text: `${GROUP_NAME[g]}系統の通信中継器を予備回路につなぎ直した。`, important: false, kind: 'report' });
        // 直した者は、中継器が落ちた理由に気づく
        for (const e of s.truth.evidence) {
          if (!e.relay || e.room !== c.room || c.mind.known.includes(e.fact + '@' + e.id)) continue;
          learn(c, e.fact + '@' + e.id);
          learn(c, e.fact);
          if (!c.mind.hides.includes(e.fact)) report(s, c, { text: `［${e.title}］${e.text}`, evidence: [e.id], important: true, kind: 'report', reason: '直すときに、落ちた理由が目についた' });
        }
      }
      return;
    }
    case 'fightFire': {
      const w = s.world;
      if (w.fire) {
        w.fire.intensity -= 25 + c.skills.mech * 5;
        if (w.fire.intensity <= 0) {
          report(s, c, { text: `${roomName(s.ship, w.fire.room)}の火を消し止めた。`, important: true, kind: 'report' });
          w.fire = null;
        }
      }
      return;
    }
    case 'treat': {
      const t = arg ? crewById(s, arg) : null;
      if (t && t.alive && t.room === c.room && s.world.vars['untreatable_' + t.id]) {
        useSkill('med');
        if (!c.mind.known.includes('X_untreat_' + t.id)) {
          learn(c, 'X_untreat_' + t.id);
          report(s, c, { text: `${t.name}を手当てしたが、容体は良くならない。原因に合った治療が要りそうだ。`, important: true, kind: 'report' });
        }
      } else if (t && t.alive && t.room === c.room) {
        t.health = Math.min(100, t.health + 15 + c.skills.med * 8);
        t.impair = Math.max(0, t.impair - 0.15 * c.skills.med);
        useSkill('med');
        report(s, c, { text: `${t.name}を手当てした。`, important: false, kind: 'report' });
      }
      return;
    }
    case 'detain': {
      const p = s.plans.find((x) => x.id === c.policy.planId);
      const t = p?.target ? crewById(s, p.target) : null;
      if (t && t.alive && t.room === c.room) {
        t.policy = { kind: 'detained' };
        t.task = { t: 'idle', label: '拘束されている' };
        const guilty = s.truth.responsible?.crew === t.id;
        for (const o of s.crew) if (o.id !== t.id) o.trust = Math.max(0, o.trust - (guilty ? 3 : 10));
        t.trust = Math.max(0, t.trust - (guilty ? 10 : 30));
        if (guilty && s.truth.responsible?.role === 'sabotage') s.world.vars.culpritDetained = 1;
        report(s, c, { text: `${t.name}を拘束した。`, important: true, kind: 'report' });
      }
      advancePlan(s, c, api);
      return;
    }
  }
  const a = def.actions[action];
  if (!a) return;
  if (c.skills.mech > 0) useSkill('mech');
  const plan = c.policy.kind === 'plan' ? s.plans.find((x) => x.id === c.policy.planId) ?? null : null;
  const r = a.run(api, c, plan);
  if (r === 'fail') { failPlan(s, c); return; }
  advancePlan(s, c, api);
}

// ---------- 1 tick ----------
export function step(s: GameState): StepResult {
  const res: StepResult = { pause: null, sfx: [] };
  if (s.phase !== 'play') return res;
  const w = s.world;
  const def = caseOf(s);
  const api = makeApi(s, res);
  w.tick++;
  const sec = nowSec(s);

  def.tick(api);
  w.o2 = Math.max(0, Math.min(100, w.o2));
  for (const th of [50, 25]) {
    if (w.o2 < th && api.once('o2_' + th)) api.alarm(`船内の酸素濃度が${th}%を下回った。`, '酸素低下');
  }

  if (w.fire) {
    w.hull = Math.max(0, w.hull - 0.02 * w.fire.intensity / 10);
    w.fire.intensity -= 0.15;
    for (const c of s.crew) if (c.alive && c.room === w.fire.room) c.health -= 0.8;
    if (w.fire.intensity <= 0) w.fire = null;
  }

  for (const c of s.crew) {
    if (!c.alive) continue;
    if (w.o2 < 30) c.health -= (30 - w.o2) * 0.02;
    if (c.health <= 0) {
      c.health = 0;
      c.alive = false;
      c.task = { t: 'idle', label: '—' };
      if (ok(s, c.room)) {
        s.player.knownDead.push(c.id);
        pushLog(s, { sec, crew: null, text: `${c.name}の生体反応が途絶えた。`, delayed: false, kind: 'danger' });
        res.pause = '乗員の死亡';
      }
      continue;
    }
    if (w.vars['down_' + c.id]) { c.task = { t: 'idle', label: '意識がない' }; continue; }
    const t = c.task;
    if (t.t === 'move') {
      t.progress += 1 / (1 + c.impair);
      const next = t.path[0];
      if (t.progress >= edgeMinutes(s.ship, c.room, next) * TICKS_PER_MIN) {
        c.room = next;
        t.path.shift();
        t.progress = 0;
        if (!t.path.length) c.task = { t: 'idle', label: '到着' };
      }
    } else if (t.t === 'work') {
      t.remaining--;
      if (t.remaining <= 0) {
        c.task = { t: 'idle', label: '作業完了' };
        finishWork(s, c, t.action, api, t.arg);
      }
    }
    if (w.fire && w.fire.room === c.room && c.task.t !== 'move' && !(c.task.t === 'work' && c.task.action === 'fightFire')) {
      c.task = { t: 'idle', label: '' };
    }
    if (c.alive && c.task.t === 'idle' && (IMMEDIATE.has(c.task.label) || w.tick % TICKS_PER_MIN === 0)) startDecision(s, c, api);
  }

  assignPlans(s);
  deliver(s, res);
  if (!w.resolved && def.resolved(api)) {
    w.resolved = true;
    pushLog(s, { sec, crew: null, text: `${def.resolvedText} 事件を締めくくるか、提出回数が残っていれば仮説を見直せる。`, delayed: false, kind: 'system' });
    res.pause = '危機は去った';
    res.sfx.push('success');
  }
  checkEnd(s, res);
  return res;
}

function deliver(s: GameState, res: StepResult) {
  const sec = nowSec(s);
  for (const c of s.crew) {
    const cok = ok(s, c.room);
    if (!c.alive) {
      if (cok && !s.player.knownDead.includes(c.id)) {
        s.player.knownDead.push(c.id);
        pushLog(s, { sec, crew: null, text: `通信回復：${c.name}の生体反応がない。`, delayed: true, kind: 'danger' });
        res.pause = '乗員の死亡';
      }
      continue;
    }
    if (!cok) {
      if (c.lostCommSince === null) {
        c.lostCommSince = sec;
        pushLog(s, { sec, crew: c.id, text: `${c.name}との通信が途絶えた（${roomName(s.ship, s.player.lastSeen[c.id].room)}付近）。`, delayed: false, kind: 'system' });
      }
      continue;
    }
    if (c.lostCommSince !== null) {
      pushLog(s, { sec, crew: c.id, text: `${c.name}との通信が回復した（${secToClock(c.lostCommSince)}から途絶）。`, delayed: false, kind: 'system' });
      c.lostCommSince = null;
      if (c.pendingPolicy && !s.player.pendingPolicyNotice.includes(c.id)) s.player.pendingPolicyNotice.push(c.id);
      res.pause = res.pause ?? `${c.name}と通信回復`;
    }
    for (const r of c.outbox) {
      pushLog(s, { sec: r.sec, crew: c.id, text: r.text, reason: r.reason, evidence: r.evidence, delayed: r.offline, kind: r.kind, confirmKey: r.confirmKey });
      if (r.planDone) s.player.plansKnownDone.push(r.planDone);
      if (r.kind === 'confirm' || r.kind === 'danger') res.pause = res.pause ?? `${c.name}から${r.kind === 'confirm' ? '確認要請' : '緊急報告'}`;
      else if (r.important) res.pause = res.pause ?? `${c.name}から報告`;
      res.sfx.push(r.kind === 'danger' ? 'alarm' : 'report');
    }
    c.outbox = [];
    // 報告や確認のために通信の届く場所へ向かっていた途中で届いたら、そこで考え直す
    if (c.task.t === 'move' && REPORT_MOVES.has(c.task.label)) c.task = { t: 'idle', label: '到着' };
    s.player.lastSeen[c.id] = { room: c.room, sec, health: Math.round(c.health), alive: true, label: c.task.label, policy: policyLabel(s, c.policy), trust: Math.round(c.trust) };
  }
}

function checkEnd(s: GameState, res: StepResult) {
  const sec = nowSec(s);
  let reason: CaseOutcome['reason'];
  if (s.crew.every((c) => !c.alive) || s.world.hull <= 0) reason = 'lost';
  else if (sec >= s.deadlineSec) reason = 'timeout';
  else if (s.player.finalPending) {
    const last = s.plans[s.plans.length - 1];
    if (!last || last.status === 'done' || last.status === 'failed') reason = 'third';
    else return;
  } else return;
  endCase(s, reason);
  res.pause = '事件終了';
}

export function endCase(s: GameState, reason: CaseOutcome['reason']) {
  s.phase = 'ended';
  s.outcome = { reason, sec: nowSec(s) };
}

// ---------- プレイヤー操作 ----------
export function applyAction(s: GameState, a: Action): StepResult {
  const res: StepResult = { pause: null, sfx: [] };
  if (s.phase === 'ended') return res;
  s.actions.push({ tick: s.world.tick, action: JSON.parse(JSON.stringify(a)) });
  const sec = nowSec(s);
  const def = caseOf(s);
  const api = makeApi(s, res);
  switch (a.type) {
    case 'begin':
      s.phase = 'play';
      s.player.unlocked = unlockedKeys(s);
      pushLog(s, { sec, crew: null, text: def.alarmText, delayed: false, kind: 'system', evidence: def.initialEvidence });
      break;
    case 'setPolicy':
      doSetPolicy(s, a.crew, a.policy, api);
      break;
    case 'resolvePending': {
      const c = crewById(s, a.crew);
      s.player.pendingPolicyNotice = s.player.pendingPolicyNotice.filter((x) => x !== a.crew);
      const pol = c.pendingPolicy;
      c.pendingPolicy = null;
      if (a.apply && pol && ok(s, c.room) && c.alive) doSetPolicy(s, c.id, pol, api);
      break;
    }
    case 'talk': {
      const c = crewById(s, a.crew);
      if (!c.alive || !ok(s, c.room)) break;
      if (s.world.vars['down_' + c.id]) { pushLog(s, { sec, crew: c.id, text: `${c.name}は意識がなく、話を聞けない。`, delayed: false, kind: 'testimony' }); break; }
      const got: string[] = [];
      for (const t of def.testimonies.filter((x) => x.crew === c.id)) {
        if (t.requires && !c.mind.known.includes(t.requires)) continue;
        got.push(t.evidence);
      }
      const now = `いまは「${c.task.label}」。`;
      const body = got.length ? got.map((g) => evDef(s, g).text).join(' ') : '「特に気づいたことはありません」';
      pushLog(s, { sec, crew: c.id, text: `${now}${body}`, delayed: false, kind: 'testimony', evidence: got });
      break;
    }
    case 'confront': {
      const c = crewById(s, a.crew);
      if (!c.alive || !ok(s, c.room) || !s.player.evidence.includes(a.evidence)) break;
      const conf = def.confessions.find((x) => x.crew === c.id && x.triggeredBy.includes(a.evidence));
      const e = evDef(s, a.evidence);
      if (conf && !c.mind.confessed) {
        c.mind.confessed = true;
        c.mind.hides = [];
        c.trust = Math.min(100, c.trust + 5);
        pushLog(s, { sec, crew: c.id, text: `［${e.title}］を示した。${evDef(s, conf.evidence).text}`, delayed: false, kind: 'testimony', evidence: [conf.evidence] });
      } else {
        c.trust = Math.max(0, c.trust - 4);
        pushLog(s, { sec, crew: c.id, text: `［${e.title}］を示した。「……それが私と何の関係が？」${c.name}は戸惑っている。`, delayed: false, kind: 'testimony' });
      }
      break;
    }
    case 'answerConfirm': {
      const entry = s.player.log.find((l) => l.id === a.logId);
      if (!entry || entry.answered || !entry.crew || !entry.confirmKey) break;
      const c = crewById(s, entry.crew);
      if (!c.alive) break;
      if (!ok(s, c.room)) {
        pushLog(s, { sec, crew: c.id, text: `${c.name}は通信断の区画にいて、返答が届かない。`, delayed: false, kind: 'order' });
        break;
      }
      entry.answered = true;
      c.mind.permissions[entry.confirmKey] = a.allow;
      if (a.allow) c.trust = Math.min(100, c.trust + 3);
      if (c.task.t === 'idle') startDecision(s, c, api);
      pushLog(s, { sec, crew: c.id, text: `${c.name}に${a.allow ? '許可' : '不許可'}を伝えた。`, delayed: false, kind: 'order' });
      break;
    }
    case 'submit': {
      if (s.player.submissions.length >= 3) break;
      s.player.submissions.push({ sec, hyp: a.hyp });
      for (const p of s.plans) if (p.status === 'waiting' || p.status === 'running') {
        p.status = 'failed';
        s.player.plansKnownDone.push(p.id);
        const ex = p.executor ? crewById(s, p.executor) : null;
        if (ex && ex.policy.kind === 'plan' && ex.policy.planId === p.id) ex.policy = { kind: 'standby' };
      }
      const plan: PlanState = {
        id: s.nextId++,
        kind: a.hyp.plan,
        knowsCause: a.hyp.cause === s.truth.cause,
        target: a.hyp.person?.crew ?? null,
        executor: null,
        status: 'waiting',
        step: 0,
        submittedSec: sec,
      };
      s.plans.push(plan);
      pushLog(s, { sec, crew: null, text: `仮説を提出（${s.player.submissions.length}/3）。作戦「${planLabel(s, plan.kind)}」を発令した。`, delayed: false, kind: 'order' });
      if (s.player.submissions.length === 3) s.player.finalPending = true;
      assignPlans(s);
      if (plan.status === 'waiting') pushLog(s, { sec, crew: null, text: '通信の届く乗員がいない。作戦は通信回復まで保留される。', delayed: false, kind: 'order' });
      break;
    }
    case 'abandon':
      endCase(s, s.world.resolved ? 'resolved' : 'abandon');
      break;
  }
  return res;
}

function doSetPolicy(s: GameState, crew: CrewId, policy: Policy, api: Api) {
  const sec = nowSec(s);
  const c = crewById(s, crew);
  if (!c.alive || c.policy.kind === 'detained') return;
  if (!ok(s, c.room)) {
    c.pendingPolicy = policy;
    pushLog(s, { sec, crew: c.id, text: `${c.name}へ「${policyLabel(s, policy)}」を送信できない（通信断）。通信が戻ったら改めて確認する。`, delayed: false, kind: 'order' });
    return;
  }
  if (c.policy.kind === 'plan') {
    const p = s.plans.find((x) => x.id === c.policy.planId);
    if (p && p.status === 'running') { p.status = 'failed'; s.player.plansKnownDone.push(p.id); }
  }
  c.policy = policy;
  c.pendingPolicy = null;
  c.mind.asked = {};
  c.task = { t: 'idle', label: '指示を受けた' };
  pushLog(s, { sec, crew: c.id, text: `${c.name}に「${policyLabel(s, policy)}」を指示した。`, delayed: false, kind: 'order' });
  startDecision(s, c, api);
}

export function policyLabel(s: GameState, p: { kind: string; room?: RoomId }): string {
  switch (p.kind) {
    case 'standby': return '待機';
    case 'respond': return caseOf(s).respond.label;
    case 'investigate': return `${roomName(s.ship, p.room!)}を調査`;
    case 'repairRelay': return '通信中継器を復旧';
    case 'guard': return `${roomName(s.ship, p.room!)}を警備`;
    case 'medical': return '負傷者を救護';
    case 'plan': return '作戦を実行';
    case 'detained': return '拘束中';
  }
  return p.kind;
}

// シード＋操作列から状態を作り直す（再現性の確認用）
export function replay(make: () => GameState, actions: GameState['actions'], endTick: number): GameState {
  const s = make();
  let i = 0;
  while (true) {
    while (i < actions.length && actions[i].tick === s.world.tick) applyAction(s, actions[i++].action);
    if (s.world.tick >= endTick || s.phase === 'ended') break;
    if (s.phase === 'play') step(s);
    else if (i >= actions.length) break;
  }
  return s;
}

export function runTicks(s: GameState, n: number): StepResult[] {
  const out: StepResult[] = [];
  for (let i = 0; i < n && s.phase === 'play'; i++) out.push(step(s));
  return out;
}
