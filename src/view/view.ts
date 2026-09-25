// プレイヤーに見せてよい情報だけを組み立てる。UI はこの ViewModel だけを描画する。
// 通信断の区画にいる乗員の位置・行動・健康は出さない（最後に確認できた値だけ）。
import type { BoardState, CrewId, GameState, LogEntry, PlanKind, RoomId, Skill } from '../core/types';
import { START_SEC, secToClock } from '../core/rng';
import { ROOMS, commOk, edgeMinutes, roomName, TICKS_PER_MIN } from '../sim/ship';
import { nowSec, policyLabel, PLAN_LABEL } from '../sim/sim';
import { currentTemplate } from '../gen/generate';
import { evaluateCase, type CaseResult } from '../judge/judge';

export interface CrewView {
  id: CrewId;
  name: string;
  role: string;
  history: string;
  look: { skin: number; hair: number; hairStyle: number; suit: number; eyes: number };
  visible: boolean;
  room: RoomId | null;
  roomName: string | null;
  pos: { x: number; y: number } | null; // タイル座標
  activity: string | null;
  health: number;
  healthLive: boolean;
  dead: boolean;
  trust: number;
  lastSeen: string;
  policy: string;
  pending: string | null;
  skills: Record<Skill, string>;
  detained: boolean;
  canTalk: boolean;
}

export interface RoomView {
  id: RoomId;
  name: string;
  rect: [number, number, number, number];
  comm: boolean;
  fire: boolean;
  wet: boolean;
}

export interface EvidenceView { id: string; title: string; text: string; source: string; sourceLabel: string }

export interface LogView extends LogEntry { crewName: string | null; clock: string; deliveredClock: string }

export interface ViewModel {
  phase: GameState['phase'];
  clock: string;
  elapsedMin: number;
  power: { label: string; value: number; sub: string; warn: boolean };
  o2: number;
  hull: number;
  stores: { food: number; morale: number; medkits: number; spareParts: number; extinguishers: number };
  rooms: RoomView[];
  crew: CrewView[];
  log: LogView[];
  unread: number;
  evidence: EvidenceView[];
  board: BoardState;
  submissions: number;
  remaining: number;
  plans: { label: string; status: string; who: string | null }[];
  pendingNotices: { crew: CrewId; name: string; policy: string }[];
  openConfirms: LogView[];
  form: {
    causes: { id: string; label: string; category: string }[];
    orderCards: { id: string; label: string }[];
    plans: { id: PlanKind; label: string; warn?: string }[];
    crew: { id: CrewId; name: string }[];
  };
  briefing: string[];
  title: string;
  resolved: boolean;
  result: CaseResult | null;
}

const SKILL_WORD = ['なし', '低い', 'そこそこ', '高い'];
const SOURCE_LABEL: Record<string, string> = { log: '機器ログ', trace: '痕跡', testimony: '証言', record: '記録', report: '作業報告' };

function seededOrder<T>(arr: T[], seed: number): T[] {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function center(id: RoomId, slot: number): { x: number; y: number } {
  const r = ROOMS.find((x) => x.id === id)!.rect;
  const cols = Math.max(1, Math.floor(r[2] / 1.4));
  return { x: r[0] + 0.9 + (slot % cols) * 1.2, y: r[1] + 1.2 + Math.floor(slot / cols) * 1.1 };
}

export function buildView(s: GameState): ViewModel {
  const w = s.world;
  const tpl = currentTemplate();
  const sec = nowSec(s);
  const name = (id: string | null) => (id ? s.crew.find((c) => c.id === id)!.name : null);

  // 電力表示：司令室の残量計は定格容量を仮定しているので、実測されるまでずれている
  let power: ViewModel['power'];
  const rate = (100 / 180) * (w.loadShed ? 0.6 : 1);
  if (w.mainPower) power = { label: '主電源', value: 100, sub: '稼働中', warn: false };
  else if (w.backupCharge <= 0) power = { label: '予備電源', value: 0, sub: '停止', warn: true };
  else if (s.player.cellMeasured || w.gaugeOffset === 0) {
    const v = w.backupCharge;
    power = { label: '予備電源（実測）', value: v, sub: `残り約${Math.floor(v / rate)}分`, warn: v < 25 };
  } else {
    const v = Math.min(100, w.backupCharge + w.gaugeOffset);
    power = { label: '予備電源（推定）', value: v, sub: `設計値で残り約${Math.floor(v / rate)}分`, warn: v < 25 };
  }

  const slots = new Map<RoomId, number>();
  const crew: CrewView[] = s.crew.map((c) => {
    const ls = s.player.lastSeen[c.id]!;
    let visible = c.alive && commOk(w, c.room);
    let pos: CrewView['pos'] = null;
    if (visible) {
      const slot = slots.get(c.room) ?? 0;
      slots.set(c.room, slot + 1);
      pos = center(c.room, slot);
      if (c.task.t === 'move' && c.task.path.length) {
        const next = c.task.path[0];
        const frac = c.task.progress / (edgeMinutes(c.room, next) * TICKS_PER_MIN);
        if (!commOk(w, next) && frac > 0.5) { visible = false; pos = null; }
        else {
          const b = center(next, 0);
          pos = { x: pos.x + (b.x - pos.x) * frac, y: pos.y + (b.y - pos.y) * frac };
        }
      }
    }
    const knownDead = s.player.knownDead.includes(c.id);
    const skills = { mech: '?', med: '?', inv: '?' } as Record<Skill, string>;
    for (const k of ['mech', 'med', 'inv'] as Skill[]) if (c.mind.skillSeen[k]) skills[k] = SKILL_WORD[c.skills[k]];
    return {
      id: c.id, name: c.name, role: c.role, history: c.history, look: c.look,
      visible,
      room: visible ? c.room : null,
      roomName: visible ? roomName(c.room) : null,
      pos,
      activity: visible ? c.task.label : null,
      health: visible ? Math.round(c.health) : ls.health,
      healthLive: visible,
      dead: knownDead,
      trust: visible ? Math.round(c.trust) : ls.trust,
      lastSeen: `${roomName(ls.room)}（${secToClock(ls.sec)}）`,
      policy: visible ? policyLabel(c.policy) : ls.policy,
      pending: c.pendingPolicy ? policyLabel(c.pendingPolicy) : null,
      skills,
      detained: c.policy.kind === 'detained',
      canTalk: visible && !knownDead,
    };
  });

  const log: LogView[] = s.player.log.map((l) => ({ ...l, crewName: name(l.crew), clock: secToClock(l.sec), deliveredClock: secToClock(l.deliveredSec) }));
  const hasTrace = s.player.evidence.includes('coolant_trace');
  const rooms: RoomView[] = ROOMS.map((r) => ({
    id: r.id, name: r.name, rect: r.rect,
    comm: commOk(w, r.id),
    fire: !!w.fire && w.fire.room === r.id, // 固定の火災センサーは中継器と無関係に届く
    wet: r.id === 'powerroom' && hasTrace && !w.resolved,
  }));

  // 作戦の完了・中止は報告が届いて初めて分かる
  const planView = s.plans.map((p) => {
    const known = s.player.plansKnownDone.includes(p.id);
    const status = p.status === 'waiting' ? '通信待ち'
      : !known ? '実行中'
      : p.status === 'done' ? '完了報告あり' : '中止';
    return { label: PLAN_LABEL[p.kind], status, who: name(p.executor) };
  });

  return {
    phase: s.phase,
    clock: secToClock(sec),
    elapsedMin: Math.floor((sec - START_SEC) / 60),
    power,
    o2: Math.round(w.o2),
    hull: Math.round(w.hull),
    stores: { food: w.food, morale: w.morale, ...w.supplies },
    rooms,
    crew,
    log,
    unread: s.player.unread,
    evidence: s.player.evidence.map((id) => {
      const e = s.truth.evidence.find((x) => x.id === id)!;
      return { id, title: e.title, text: e.text, source: e.source, sourceLabel: SOURCE_LABEL[e.source] };
    }),
    board: s.player.board,
    submissions: s.player.submissions.length,
    remaining: 3 - s.player.submissions.length,
    plans: planView,
    pendingNotices: s.player.pendingPolicyNotice.map((id) => {
      const c = s.crew.find((x) => x.id === id)!;
      return { crew: id, name: c.name, policy: c.pendingPolicy ? policyLabel(c.pendingPolicy) : '' };
    }).filter((x) => x.policy),
    openConfirms: log.filter((l) => l.kind === 'confirm' && !l.answered),
    form: {
      causes: tpl.causeOptions,
      orderCards: seededOrder(s.truth.orderCards.map((c) => ({ id: c.id, label: c.label })), s.seed),
      plans: (Object.keys(PLAN_LABEL) as PlanKind[]).map((id) => ({
        id, label: PLAN_LABEL[id],
        warn: id === 'restartNow' ? '原因が残ったまま通電すると、再遮断や発火のおそれがある'
          : id === 'dryRestart' ? '漏れの元が残っていれば、また濡れて遮断するかもしれない'
          : id === 'detain' ? '「関係人物」で選んだ乗員を拘束する。見当違いなら乗員の信頼を損なう' : undefined,
      })),
      crew: s.crew.map((c) => ({ id: c.id, name: c.name })),
    },
    briefing: tpl.briefing,
    title: tpl.truth.title,
    resolved: w.resolved,
    result: s.phase === 'ended' ? evaluateCase(s) : null,
  };
}
