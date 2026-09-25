// 固定ステップのシミュレーション。1 tick = ゲーム内10秒。
// 真相を読めるのはここ（と gen / judge）だけ。乗員AIには perceive() で作った観測だけを渡す。
import type {
  Action, CaseOutcome, Crew, CrewId, EvidenceDef, Policy, GameState, LogEntry, PlanKind, PlanState, Report, RoomId, Skill,
} from '../core/types';
import { START_SEC, nextRand, secToClock } from '../core/rng';
import { commOk, findPath, nearestCommRoom, neighbors, roomName, edgeMinutes, TICKS_PER_MIN } from './ship';
import { decide, type Perception, type PlanStep } from '../ai/crew_ai';
import { currentTemplate } from '../gen/generate';

export interface StepResult { pause: string | null; sfx: string[] }

const DRAIN_PER_TICK = 100 / 180 / TICKS_PER_MIN; // 定格100で3時間
const O2_LOSS_PER_TICK = 100 / 60 / TICKS_PER_MIN; // 停止後60分で0
const WET_TRIP = 40;
const WET_FIRE = 25;
const IMMEDIATE = new Set(['到着', '作業完了', '指示を受けた', '作戦の指示を受けた', '']);

export const nowSec = (s: GameState) => START_SEC + s.world.tick * 10;
const crewById = (s: GameState, id: string) => s.crew.find((c) => c.id === id)!;
const evDef = (s: GameState, id: string): EvidenceDef => s.truth.evidence.find((e) => e.id === id)!;
const skillFactor = (lv: number) => Math.max(0.7, 1.6 - 0.3 * lv);

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
  if (id === 'cell_measure' || id === 'old_cell') s.player.cellMeasured = true;
}

function report(s: GameState, c: Crew, r: Omit<Report, 'id' | 'crew' | 'sec' | 'room' | 'offline'>) {
  c.outbox.push({ id: s.nextId++, crew: c.id, sec: nowSec(s), room: c.room, offline: !commOk(s.world, c.room), ...r });
}

function learn(c: Crew, f: string) {
  if (!c.mind.known.includes(f)) c.mind.known.push(f);
}

// ---------- 観測（AIへの入力） ----------
function perceive(s: GameState, c: Crew): Perception {
  const w = s.world;
  const comm = commOk(w, c.room);
  const safe = neighbors(c.room).map((n) => n.to).find((r) => !(w.fire && w.fire.room === r)) ?? 'corridor';
  const radioHurt = comm
    ? s.crew.filter((x) => x.alive && x.id !== c.id && commOk(w, x.room)).map((x) => ({ id: x.id, room: x.room, health: x.health }))
    : [];
  const plan = c.policy.kind === 'plan' ? s.plans.find((p) => p.id === c.policy.planId) : undefined;
  return {
    room: c.room,
    comm,
    nearestComm: nearestCommRoom(w, c.room),
    safeNeighbor: safe,
    fireHere: !!w.fire && w.fire.room === c.room,
    injuredHere: s.crew.filter((x) => x.alive && x.room === c.room && x.task.t !== 'move').map((x) => ({ id: x.id, name: x.name, health: x.health })),
    injuredRadio: radioHurt,
    relayUp: commOk(w, 'engineering'),
    panelWetVisible: c.room === 'powerroom' && w.floorWet > 10,
    hasImportantUnsent: c.outbox.some((r) => r.important),
    planStep: plan && plan.status === 'running' ? currentPlanStep(s, plan) : null,
  };
}

// ---------- 作戦 ----------
export const PLAN_LABEL: Record<PlanKind, string> = {
  sealDryRestart: '漏れを封止し、乾燥させてから主電源を再投入',
  dryRestart: '配電盤を乾燥させて主電源を再投入',
  restartNow: '主電源をただちに再投入',
  shed: '負荷を切り離して酸素再生を優先',
  swapCell: '予備セルを在庫品と交換',
  detain: '関係人物を拘束',
};

function planSteps(p: PlanState, s: GameState): PlanStep[] {
  switch (p.kind) {
    case 'shed': return [{ room: 'powerroom', action: 'shed', label: '負荷の切り離し' }];
    case 'swapCell': return [
      { room: 'cargo', action: 'takeCell', label: '予備セルの搬出' },
      { room: 'powerroom', action: 'installCell', label: '予備セルの交換' },
    ];
    case 'restartNow': return [{ room: 'powerroom', action: 'restart', label: '主電源の再投入' }];
    case 'dryRestart': return [
      { room: 'powerroom', action: 'dry', label: '配電盤の乾燥' },
      { room: 'powerroom', action: 'restart', label: '主電源の再投入' },
    ];
    case 'sealDryRestart': return [
      p.knowsLeak
        ? { room: 'powerroom', action: 'seal', label: '冷却配管の封止' }
        : { room: 'powerroom', action: 'inspect', label: '想定した原因箇所の点検' },
      { room: 'powerroom', action: 'dry', label: '配電盤の乾燥' },
      { room: 'powerroom', action: 'restart', label: '主電源の再投入' },
    ];
    case 'detain': {
      const t = p.target ? crewById(s, p.target) : null;
      return t ? [{ room: t.room, action: 'detain', label: `${t.name}の拘束` }] : [];
    }
  }
}

function currentPlanStep(s: GameState, p: PlanState): PlanStep | null {
  const steps = planSteps(p, s);
  if (p.kind === 'detain' && p.target) {
    // 対象は動くので、毎回いまの居場所を目指す
    const t = crewById(s, p.target);
    return p.step === 0 ? { room: t.room, action: 'detain', label: `${t.name}の拘束` } : null;
  }
  return steps[p.step] ?? null;
}

function pickExecutor(s: GameState, p: PlanState): Crew | null {
  const cands = s.crew.filter((c) => c.alive && c.policy.kind !== 'detained' && commOk(s.world, c.room) && c.id !== p.target);
  if (!cands.length) return null;
  const key = (c: Crew) => (p.kind === 'detain' ? (c.role === '保安員' ? 10 : 0) + c.exp : c.skills.mech * 10 + c.exp);
  return cands.sort((a, b) => key(b) - key(a))[0];
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
    pushLog(s, { sec: nowSec(s), crew: ex.id, text: `作戦「${PLAN_LABEL[p.kind]}」を引き受けた。`, delayed: false, kind: 'order' });
  }
}

// ---------- タスク生成 ----------
function nextFindable(s: GameState, c: Crew): EvidenceDef | null {
  return s.truth.evidence.find((e) =>
    e.room === c.room && e.work > 0 && !c.mind.known.includes(e.fact + '@' + e.id) &&
    !s.world.destroyed.includes(e.id) &&
    (!e.skill || c.skills[e.skill] >= e.minSkill)) ?? null;
}

function workMinutes(s: GameState, c: Crew, action: string, arg?: string): number {
  const m = c.skills.mech;
  switch (action) {
    case 'search': {
      const e = arg ? evDef(s, arg) : null;
      if (!e) return 2;
      const lv = e.skill ? c.skills[e.skill] : Math.max(c.skills.inv, c.skills.mech);
      return e.work * skillFactor(lv);
    }
    case 'seal': return s.world.leakSealed ? 1 : 6 * skillFactor(m);
    case 'shed': return 3;
    case 'repairRelay': return 10 * skillFactor(m);
    case 'fightFire': return 1;
    case 'treat': return 3 * skillFactor(c.skills.med);
    case 'takeCell': return 2;
    case 'installCell': return 6 * skillFactor(m) + (s.world.panelDamaged ? 5 : 0);
    case 'dry': return 8;
    case 'restart': return 2 + (s.world.panelDamaged ? 12 * skillFactor(m) : 0);
    case 'inspect': return 6;
    case 'detain': return 1;
  }
  return 2;
}

function startDecision(s: GameState, c: Crew) {
  const obs = perceive(s, c);
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
      const path = findPath(c.room, d.to);
      if (!path.length) { c.task = { t: 'idle', label: '移動できない' }; return; }
      c.task = { t: 'move', path, progress: 0, label: d.label };
      if (d.autonomous && d.reason) report(s, c, { text: `${d.label}。`, reason: d.reason, important: false, kind: 'autonomy' });
      return;
    }
    case 'work': {
      let arg = d.arg;
      if (d.action === 'search') arg = nextFindable(s, c)?.id ?? '';
      const min = workMinutes(s, c, d.action, arg);
      const ticks = Math.max(1, Math.round(min * TICKS_PER_MIN));
      c.task = { t: 'work', action: d.action, remaining: ticks, total: ticks, label: d.label, arg };
      if (d.autonomous && d.reason && d.action !== 'search' && d.action !== 'treat')
        report(s, c, { text: `自分の判断で「${d.label}」を始めた。`, reason: d.reason, important: false, kind: 'autonomy' });
    }
  }
}

// ---------- 作業完了の効果（ここで真相が動く） ----------
function finishWork(s: GameState, c: Crew, action: string, arg?: string) {
  const w = s.world;
  const useSkill = (k: Skill) => { c.mind.skillSeen[k] = true; };
  switch (action) {
    case 'search': {
      if (!arg) {
        learn(c, 'X_searched_' + c.room);
        report(s, c, { text: `${roomName(c.room)}の調査を終えた。これ以上の手がかりは見当たらない。`, important: false, kind: 'report' });
        break;
      }
      const e = evDef(s, arg);
      learn(c, e.fact + '@' + e.id);
      learn(c, e.fact);
      if (e.skill) useSkill(e.skill);
      if (c.mind.hides.includes(e.fact)) break; // 隠したい事実は報告しない
      const reason = e.id === 'coolant_trace' ? '通電部の近くに液体があるのは危険なので最優先で伝える' : undefined;
      report(s, c, { text: `［${e.title}］${e.text}`, reason, evidence: [e.id], important: true, kind: 'report' });
      break;
    }
    case 'seal':
      useSkill('mech');
      if (!w.leakSealed) {
        w.leakSealed = true;
        learn(c, 'S_sealed');
        report(s, c, { text: '天井の冷却配管の継手を仮封止した。漏れは止まった。床はまだ濡れている。', important: true, kind: 'report' });
      } else learn(c, 'S_sealed');
      advancePlan(s, c);
      break;
    case 'inspect':
      report(s, c, { text: '指示された原因の痕跡を探したが、それらしいものは見つからなかった。', important: true, kind: 'report' });
      advancePlan(s, c);
      break;
    case 'shed':
      w.loadShed = true;
      learn(c, 'S_shed');
      report(s, c, { text: '照明・居住区・貨物室の電源を切り、酸素再生と通信を優先した。予備電源の消費は4割ほど減る。', important: true, kind: 'report' });
      advancePlan(s, c);
      break;
    case 'repairRelay':
      useSkill('mech');
      w.relayRepaired = true;
      learn(c, 'S_relay');
      report(s, c, { text: '機関区の通信中継器を予備電源につなぎ直した。', important: false, kind: 'report' });
      break;
    case 'fightFire':
      if (w.fire) {
        w.fire.intensity -= 25 + c.skills.mech * 5;
        if (w.fire.intensity <= 0) {
          w.fire = null;
          report(s, c, { text: '配電室の火を消し止めた。配電盤は焼けている。', important: true, kind: 'report' });
        }
      }
      break;
    case 'treat': {
      const t = arg ? crewById(s, arg) : null;
      if (t && t.alive && t.room === c.room) {
        t.health = Math.min(100, t.health + 15 + c.skills.med * 8);
        useSkill('med');
        report(s, c, { text: `${t.name}を手当てした。`, important: false, kind: 'report' });
      }
      break;
    }
    case 'takeCell':
      if (w.spareCellsLeft > 0) {
        w.spareCellsLeft--;
        learn(c, 'S_has_cell');
        report(s, c, { text: '貨物室から予備セルを1個持ち出した。在庫の封印は切られていなかった。', important: false, kind: 'report' });
      } else {
        report(s, c, { text: '貨物室に予備セルが残っていない。', important: true, kind: 'report' });
        failPlan(s, c);
        return;
      }
      advancePlan(s, c);
      break;
    case 'installCell':
      useSkill('mech');
      w.cellCap = 100;
      w.gaugeOffset = 0;
      w.backupCharge = w.mainPower ? Math.max(w.backupCharge, 100) : 100;
      w.depletedAt = null;
      learn(c, 'F_not_replaced');
      if (c.mind.hides.includes('F_not_replaced')) {
        report(s, c, { text: '予備セルを新品に交換した。残量は満タン。', important: true, kind: 'report' });
      } else {
        report(s, c, { text: '予備セルを新品に交換した。残量は満タン。', evidence: ['old_cell'], important: true, kind: 'report',
          reason: '外したセルの製造番号が古い記録と同じだったので、念のため伝える' });
        report(s, c, { text: `［取り外したセル］${evDef(s, 'old_cell').text}`, evidence: ['old_cell'], important: true, kind: 'report' });
      }
      advancePlan(s, c);
      break;
    case 'dry':
      w.floorWet = 0;
      report(s, c, { text: '配電盤と床を乾燥させた。', important: false, kind: 'report' });
      advancePlan(s, c);
      break;
    case 'restart':
      doRestart(s, c);
      advancePlan(s, c);
      break;
    case 'detain': {
      const p = s.plans.find((x) => x.id === c.policy.planId);
      const t = p?.target ? crewById(s, p.target) : null;
      if (t && t.alive && t.room === c.room) {
        t.policy = { kind: 'detained' };
        t.task = { t: 'idle', label: '拘束されている' };
        const guilty = s.truth.responsible?.crew === t.id;
        for (const o of s.crew) if (o.id !== t.id) o.trust = Math.max(0, o.trust - (guilty ? 3 : 10));
        t.trust = Math.max(0, t.trust - (guilty ? 10 : 30));
        report(s, c, { text: `${t.name}を拘束した。`, important: true, kind: 'report' });
      }
      advancePlan(s, c);
      break;
    }
  }
}

function doRestart(s: GameState, c: Crew) {
  const w = s.world;
  if (w.fire) {
    report(s, c, { text: '火災中のため再投入を見送った。', important: true, kind: 'danger' });
    return;
  }
  if (w.floorWet >= WET_FIRE) {
    w.fire = { room: 'powerroom', intensity: 70 };
    w.panelDamaged = true;
    c.health = Math.max(1, c.health - 35);
    for (const e of s.truth.evidence) if (e.destroyedByFire && !w.destroyed.includes(e.id)) w.destroyed.push(e.id);
    report(s, c, { text: '再投入した瞬間、濡れた配電盤から火が出た！ 主電源は入らない。', important: true, kind: 'danger', reason: '指示どおり通電したが、配電盤がまだ濡れていた' });
    pushLog(s, { sec: nowSec(s), crew: null, text: '火災警報：配電室（固定センサー）', delayed: false, kind: 'danger' });
    return;
  }
  w.mainPower = true;
  w.panelDamaged = false;
  w.depletedAt = null;
  c.trust = Math.min(100, c.trust + 5);
  report(s, c, { text: w.leakSealed ? '主電源の再投入に成功した。配電盤は安定している。' : '主電源が入った。ただ、天井からまだ何か滴っている気がする。', important: true, kind: 'report' });
}

function advancePlan(s: GameState, c: Crew) {
  if (c.policy.kind !== 'plan') return;
  const p = s.plans.find((x) => x.id === c.policy.planId);
  if (!p || p.status !== 'running') return;
  p.step++;
  if (p.step >= planSteps(p, s).length) {
    p.status = 'done';
    c.policy = { kind: 'standby' };
    report(s, c, { text: `作戦「${PLAN_LABEL[p.kind]}」を終えた。`, important: true, kind: 'report', planDone: p.id });
  }
}

function failPlan(s: GameState, c: Crew) {
  const p = s.plans.find((x) => x.id === c.policy.planId);
  if (p) {
    p.status = 'failed';
    report(s, c, { text: `作戦「${PLAN_LABEL[p.kind]}」を続けられない。`, important: true, kind: 'report', planDone: p.id });
  }
  c.policy = { kind: 'standby' };
}

// ---------- 1 tick ----------
export function step(s: GameState): StepResult {
  const res: StepResult = { pause: null, sfx: [] };
  if (s.phase !== 'play') return res;
  const w = s.world;
  w.tick++;
  const sec = nowSec(s);

  // 電力
  if (w.mainPower) {
    w.backupCharge = Math.min(w.cellCap, w.backupCharge + 0.05);
    if (!w.leakSealed) {
      w.floorWet = Math.min(100, w.floorWet + s.truth.leakRatePerTick);
      if (w.floorWet >= WET_TRIP) {
        w.mainPower = false;
        pushLog(s, { sec, crew: null, text: '主電源が再び遮断した。予備電源に切り替わった。', delayed: false, kind: 'danger' });
        res.pause = '主電源が再び遮断';
        res.sfx.push('alarm');
      }
    }
  } else {
    if (!w.leakSealed) w.floorWet = Math.min(100, w.floorWet + s.truth.leakRatePerTick);
    if (w.backupCharge > 0) {
      w.backupCharge = Math.max(0, w.backupCharge - DRAIN_PER_TICK * (w.loadShed ? 0.6 : 1));
      if (w.backupCharge === 0) {
        w.depletedAt = w.tick;
        pushLog(s, { sec, crew: null, text: '予備電源が尽きた。照明が落ち、酸素再生機が止まった。', delayed: false, kind: 'danger' });
        res.pause = '予備電源が尽きた';
        res.sfx.push('alarm');
      }
    }
  }
  const lifeSupport = w.mainPower || w.backupCharge > 0;
  w.o2 = lifeSupport ? Math.min(100, w.o2 + 0.2) : Math.max(0, w.o2 - O2_LOSS_PER_TICK);
  for (const th of [50, 25]) {
    const key = 'o2_' + th;
    if (w.o2 < th && !s.firedEvents.includes(key)) {
      s.firedEvents.push(key);
      pushLog(s, { sec, crew: null, text: `船内の酸素濃度が${th}%を下回った。`, delayed: false, kind: 'danger' });
      res.pause = '酸素低下';
      res.sfx.push('alarm');
    }
  }

  // 火災
  if (w.fire) {
    w.hull = Math.max(0, w.hull - 0.02 * w.fire.intensity / 10);
    w.fire.intensity -= 0.15;
    for (const c of s.crew) if (c.alive && c.room === w.fire.room) c.health -= 0.8;
    if (w.fire.intensity <= 0) w.fire = null;
  }

  // 乗員
  for (const c of s.crew) {
    if (!c.alive) continue;
    if (w.o2 < 30) c.health -= (30 - w.o2) * 0.02;
    if (c.health <= 0) {
      c.health = 0;
      c.alive = false;
      c.task = { t: 'idle', label: '—' };
      if (commOk(w, c.room)) {
        s.player.knownDead.push(c.id);
        pushLog(s, { sec, crew: null, text: `${c.name}の生体反応が途絶えた。`, delayed: false, kind: 'danger' });
        res.pause = '乗員の死亡';
      }
      continue;
    }
    // 移動と作業
    const t = c.task;
    if (t.t === 'move') {
      t.progress++;
      const next = t.path[0];
      if (t.progress >= edgeMinutes(c.room, next) * TICKS_PER_MIN) {
        c.room = next;
        t.path.shift();
        t.progress = 0;
        if (!t.path.length) c.task = { t: 'idle', label: '到着' };
      }
    } else if (t.t === 'work') {
      t.remaining--;
      if (t.remaining <= 0) {
        c.task = { t: 'idle', label: '作業完了' };
        finishWork(s, c, t.action, t.arg);
      }
    }
    if (w.fire && w.fire.room === c.room && !(c.task.t === 'move') && !(c.task.t === 'work' && c.task.action === 'fightFire')) {
      c.task = { t: 'idle', label: '' };
    }
    // 判断は「到着・作業完了・指示変更・危険」の時点と、待機中は1分ごとにだけ行う
    if (c.alive && c.task.t === 'idle' && (IMMEDIATE.has(c.task.label) || w.tick % TICKS_PER_MIN === 0)) startDecision(s, c);
  }

  assignPlans(s);
  deliver(s, res);
  if (w.mainPower && w.leakSealed && !w.resolved) {
    w.resolved = true;
    pushLog(s, { sec, crew: null, text: '主電源が安定した。電力の危機は去った。事件を締めくくるか、提出回数が残っていれば仮説を見直せる。', delayed: false, kind: 'system' });
    res.pause = '危機は去った';
    res.sfx.push('success');
  }
  checkEnd(s, res);
  return res;
}

// 通信が通る乗員の報告を届ける。通信断中の出来事は「通信回復後の報告」として届く。
function deliver(s: GameState, res: StepResult) {
  const w = s.world;
  const sec = nowSec(s);
  for (const c of s.crew) {
    const ok = commOk(w, c.room);
    if (!c.alive) {
      if (ok && !s.player.knownDead.includes(c.id)) {
        s.player.knownDead.push(c.id);
        pushLog(s, { sec, crew: null, text: `通信回復：${c.name}の生体反応がない。`, delayed: true, kind: 'danger' });
        res.pause = '乗員の死亡';
      }
      continue;
    }
    if (!ok) {
      if (c.lostCommSince === null) {
        c.lostCommSince = sec;
        pushLog(s, { sec, crew: c.id, text: `${c.name}との通信が途絶えた（${roomName(s.player.lastSeen[c.id]!.room)}付近）。`, delayed: false, kind: 'system' });
      }
      continue;
    }
    const wasLost = c.lostCommSince !== null;
    if (wasLost) {
      pushLog(s, { sec, crew: c.id, text: `${c.name}との通信が回復した（${secToClock(c.lostCommSince!)}から途絶）。`, delayed: false, kind: 'system' });
      c.lostCommSince = null;
      if (c.pendingPolicy && !s.player.pendingPolicyNotice.includes(c.id)) {
        s.player.pendingPolicyNotice.push(c.id);
      }
      res.pause = res.pause ?? `${c.name}と通信回復`;
    }
    for (const r of c.outbox) {
      const e = pushLog(s, { sec: r.sec, crew: c.id, text: r.text, reason: r.reason, evidence: r.evidence, delayed: r.offline, kind: r.kind, confirmKey: r.confirmKey });
      if (r.planDone) s.player.plansKnownDone.push(r.planDone);
      if (r.kind === 'confirm' || r.kind === 'danger') res.pause = res.pause ?? `${c.name}から${r.kind === 'confirm' ? '確認要請' : '緊急報告'}`;
      else if (r.important) res.pause = res.pause ?? `${c.name}から報告`;
      res.sfx.push(r.kind === 'danger' ? 'alarm' : 'report');
      void e;
    }
    c.outbox = [];
    s.player.lastSeen[c.id] = { room: c.room, sec, health: Math.round(c.health), alive: true, label: c.task.label, policy: policyLabel(c.policy), trust: Math.round(c.trust) };
  }
}

function checkEnd(s: GameState, res: StepResult) {
  const sec = nowSec(s);
  const w = s.world;
  let reason: CaseOutcome['reason'];
  if (s.crew.every((c) => !c.alive) || w.hull <= 0) reason = 'lost';
  else if (sec >= currentTemplate().deadlineSec) reason = 'timeout';
  else if (s.player.finalPending) {
    const last = s.plans[s.plans.length - 1];
    if (!last || last.status === 'done' || last.status === 'failed') reason = 'third';
    else return;
  } else return;
  endCase(s, reason);
  res.pause = '事件終了';
}

export function endCase(s: GameState, reason: NonNullable<GameState['outcome']>['reason']) {
  s.phase = 'ended';
  s.outcome = { reason, sec: nowSec(s) };
}

// ---------- プレイヤー操作 ----------
export function applyAction(s: GameState, a: Action): StepResult {
  const res: StepResult = { pause: null, sfx: [] };
  if (s.phase === 'ended') return res;
  s.actions.push({ tick: s.world.tick, action: JSON.parse(JSON.stringify(a)) });
  const sec = nowSec(s);
  const w = s.world;
  switch (a.type) {
    case 'begin':
      s.phase = 'play';
      pushLog(s, { sec, crew: null, text: '02:14 主電源喪失。予備電源で運転中。機関区の通信中継器が停止し、下層機関区と配電室は通信断。', delayed: false, kind: 'system', evidence: ['alarm'] });
      break;
    case 'setPolicy':
      doSetPolicy(s, a.crew, a.policy);
      break;
    case 'resolvePending': {
      const c = crewById(s, a.crew);
      s.player.pendingPolicyNotice = s.player.pendingPolicyNotice.filter((x) => x !== a.crew);
      const pol = c.pendingPolicy;
      c.pendingPolicy = null;
      if (a.apply && pol && commOk(w, c.room) && c.alive) doSetPolicy(s, c.id, pol);
      break;
    }
    case 'talk': {
      const c = crewById(s, a.crew);
      if (!c.alive || !commOk(w, c.room)) break;
      const tpl = currentTemplate();
      const got: string[] = [];
      for (const t of tpl.testimonies.filter((x) => x.crew === c.id)) {
        if (t.requires && !c.mind.known.includes(t.requires)) continue;
        got.push(t.evidence);
      }
      const now = c.task.t === 'move' ? `いまは${c.task.label}。` : `いまは「${c.task.label}」。`;
      pushLog(s, { sec, crew: c.id, text: `${now}${got.map((g) => evDef(s, g).text).join(' ')}`, delayed: false, kind: 'testimony', evidence: got });
      break;
    }
    case 'confront': {
      const c = crewById(s, a.crew);
      if (!c.alive || !commOk(w, c.room) || !s.player.evidence.includes(a.evidence)) break;
      const conf = currentTemplate().confessions.find((x) => x.crew === c.id);
      const e = evDef(s, a.evidence);
      if (conf && conf.triggeredBy.includes(a.evidence) && !c.mind.confessed) {
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
      if (!commOk(w, c.room)) {
        pushLog(s, { sec, crew: c.id, text: `${c.name}は通信断の区画にいて、返答が届かない。`, delayed: false, kind: 'order' });
        break;
      }
      entry.answered = true;
      c.mind.permissions[entry.confirmKey] = a.allow;
      if (a.allow) c.trust = Math.min(100, c.trust + 3);
      if (c.task.t === 'idle') startDecision(s, c);
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
        knowsLeak: a.hyp.cause === s.truth.cause,
        target: a.hyp.plan === 'detain' ? a.hyp.person?.crew ?? null : null,
        executor: null,
        status: 'waiting',
        step: 0,
        submittedSec: sec,
      };
      s.plans.push(plan);
      pushLog(s, { sec, crew: null, text: `仮説を提出（${s.player.submissions.length}/3）。作戦「${PLAN_LABEL[plan.kind]}」を発令した。`, delayed: false, kind: 'order' });
      if (s.player.submissions.length === 3) s.player.finalPending = true;
      assignPlans(s);
      if (plan.status === 'waiting') pushLog(s, { sec, crew: null, text: '通信の届く乗員がいない。作戦は通信回復まで保留される。', delayed: false, kind: 'order' });
      break;
    }
    case 'abandon':
      endCase(s, w.resolved ? 'resolved' : 'abandon');
      break;
  }
  return res;
}

function doSetPolicy(s: GameState, crew: CrewId, policy: Policy) {
  const sec = nowSec(s);
  const w = s.world;
  const c = crewById(s, crew);
  if (!c.alive || c.policy.kind === 'detained') return;
  if (!commOk(w, c.room)) {
    c.pendingPolicy = policy;
    pushLog(s, { sec, crew: c.id, text: `${c.name}へ「${policyLabel(policy)}」を送信できない（通信断）。通信が戻ったら改めて確認する。`, delayed: false, kind: 'order' });
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
  pushLog(s, { sec, crew: c.id, text: `${c.name}に「${policyLabel(policy)}」を指示した。`, delayed: false, kind: 'order' });
  startDecision(s, c);
}

export function policyLabel(p: { kind: string; room?: RoomId }): string {
  switch (p.kind) {
    case 'standby': return '待機';
    case 'restorePower': return '電源を復旧';
    case 'investigate': return `${roomName(p.room!)}を調査`;
    case 'repairRelay': return '通信中継器を復旧';
    case 'guard': return `${roomName(p.room!)}を警備`;
    case 'medical': return '負傷者を救護';
    case 'plan': return '作戦を実行';
    case 'detained': return '拘束中';
  }
  return p.kind;
}

// シード＋操作列から状態を作り直す（再現性の確認用）
export function replay(seed: number, actions: GameState['actions'], endTick: number, gen: (seed: number) => GameState): GameState {
  const s = gen(seed);
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

export type { CrewId };
