// プレイヤーに見せてよい情報だけを組み立てる。UI はこの ViewModel だけを描画する。
// 通信断の区画にいる乗員の位置・行動・健康は出さない（最後に確認できた値だけ）。
import type { BoardState, CrewId, GameState, LogEntry, RoomId, Ship, Skill } from '../core/types';
import { secToClock } from '../core/rng';
import { commOk, doorPoint, edgeMinutes, roomName, TICKS_PER_MIN } from '../sim/ship';
import { nowSec, policyLabel, planDefs, planLabel, unlockedKeys } from '../sim/sim';
import { caseOf } from '../gen/registry';
import { evaluateCase, type CaseResult } from '../judge/judge';
import type { Meter } from '../gen/case_api';

export type { Meter };

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
  marks: { text: string; color: string }[];
}

export interface EvidenceView { id: string; title: string; text: string; source: string; sourceLabel: string }

export interface LogView extends LogEntry { crewName: string | null; clock: string; deliveredClock: string }

export interface ViewModel {
  phase: GameState['phase'];
  clock: string;
  elapsedMin: number;
  meters: Meter[];
  stores: { food: number; morale: number; medkits: number; spareParts: number; extinguishers: number };
  rooms: RoomView[];
  edges: { a: RoomId; b: RoomId; door: { x: number; y: number } }[];
  crew: CrewView[];
  respond: { label: string; desc: string };
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
    plans: { id: string; label: string; warn?: string }[];
    hidden: { causes: number; orderCards: number; plans: number };
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

function center(ship: Ship, id: RoomId, slot: number): { x: number; y: number } {
  const r = ship.rooms.find((x) => x.id === id)!.rect;
  const cols = Math.max(1, Math.floor((r[2] - 0.4) / 1.2));
  const x = r[0] + 0.9 + (slot % cols) * 1.2;
  const y = r[1] + 1.3 + Math.floor(slot / cols) * 1.1;
  // 人数が多くても区画の内側に収める
  return { x: Math.min(x, r[0] + r[2] - 0.6), y: Math.min(y, r[1] + r[3] - 0.6) };
}

const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function buildView(s: GameState): ViewModel {
  const w = s.world;
  const def = caseOf(s);
  const sec = nowSec(s);
  const name = (id: string | null) => (id ? s.crew.find((c) => c.id === id)!.name : null);
  const has = (id: string) => s.player.evidence.includes(id);
  // 計器は司令室で分かることと、手元の証拠だけから作る
  const mctx = { v: w.vars, o2: w.o2, hull: w.hull, has };
  const ship = s.ship;
  const open = new Set(unlockedKeys(s));

  const slots = new Map<RoomId, number>();
  const crew: CrewView[] = s.crew.map((c) => {
    const ls = s.player.lastSeen[c.id]!;
    let visible = c.alive && commOk(ship, w, c.room);
    let pos: CrewView['pos'] = null;
    if (visible) {
      const slot = slots.get(c.room) ?? 0;
      slots.set(c.room, slot + 1);
      pos = center(ship, c.room, slot);
      if (c.task.t === 'move' && c.task.path.length) {
        const next = c.task.path[0];
        const frac = c.task.progress / (edgeMinutes(ship, c.room, next) * TICKS_PER_MIN);
        if (!commOk(ship, w, next) && frac > 0.5) { visible = false; pos = null; }
        else {
          // 扉を経由して次の区画へ（直線で壁や船外を横切らない）
          const door = doorPoint(ship, c.room, next);
          const b = center(ship, next, 0);
          pos = frac < 0.5 ? lerp(pos, door, frac * 2) : lerp(door, b, (frac - 0.5) * 2);
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
      roomName: visible ? roomName(ship, c.room) : null,
      pos,
      activity: visible ? c.task.label : null,
      health: visible ? Math.round(c.health) : ls.health,
      healthLive: visible,
      dead: knownDead,
      trust: visible ? Math.round(c.trust) : ls.trust,
      lastSeen: `${roomName(ship, ls.room)}（${secToClock(ls.sec)}）`,
      policy: visible ? policyLabel(s, c.policy) : ls.policy,
      pending: c.pendingPolicy ? policyLabel(s, c.pendingPolicy) : null,
      skills,
      detained: c.policy.kind === 'detained',
      canTalk: visible && !knownDead,
    };
  });

  const log: LogView[] = s.player.log.map((l) => ({ ...l, crewName: name(l.crew), clock: secToClock(l.sec), deliveredClock: secToClock(l.deliveredSec) }));
  const marks = def.marks?.(mctx) ?? [];
  const rooms: RoomView[] = ship.rooms.map((r) => ({
    id: r.id, name: r.name, rect: r.rect,
    comm: commOk(ship, w, r.id),
    fire: !!w.fire && w.fire.room === r.id, // 固定の火災センサーは中継器と無関係に届く
    marks: marks.filter((m) => m.room === r.id).map((m) => ({ text: m.text, color: m.color })),
  }));

  // 作戦の完了・中止は報告が届いて初めて分かる
  const planView = s.plans.map((p) => {
    const known = s.player.plansKnownDone.includes(p.id);
    const status = p.status === 'waiting' ? '通信待ち'
      : !known ? '実行中'
      : p.status === 'done' ? '完了報告あり' : '中止';
    return { label: planLabel(s, p.kind), status, who: name(p.executor) };
  });

  return {
    phase: s.phase,
    clock: secToClock(sec),
    elapsedMin: Math.floor((sec - s.startSec) / 60),
    meters: def.meters(mctx),
    stores: { food: w.food, morale: w.morale, ...w.supplies },
    rooms,
    edges: ship.edges.map(([a, b]) => ({ a, b, door: doorPoint(ship, a, b) })),
    crew,
    respond: { label: def.respond.label, desc: def.respond.desc },
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
      return { crew: id, name: c.name, policy: c.pendingPolicy ? policyLabel(s, c.pendingPolicy) : '' };
    }).filter((x) => x.policy),
    openConfirms: log.filter((l) => l.kind === 'confirm' && !l.answered),
    form: {
      // 手がかりで浮上した選択肢だけを出す（拘束はいつでも選べる）
      causes: seededOrder(def.causeOptions.filter((c) => open.has('cause:' + c.id)), s.genSeed + 7),
      orderCards: seededOrder(s.truth.orderCards.filter((c) => open.has('order:' + c.id)).map((c) => ({ id: c.id, label: c.label })), s.genSeed),
      plans: planDefs(s).filter((p) => p.id === 'detain' || open.has('plan:' + p.id)).map((p) => ({ id: p.id, label: p.label, warn: p.warn })),
      hidden: {
        causes: def.causeOptions.filter((c) => !open.has('cause:' + c.id)).length,
        orderCards: s.truth.orderCards.filter((c) => !open.has('order:' + c.id)).length,
        plans: def.plans.filter((p) => !open.has('plan:' + p.id)).length,
      },
      crew: s.crew.map((c) => ({ id: c.id, name: c.name })),
    },
    briefing: def.briefing,
    title: s.truth.title,
    resolved: w.resolved,
    result: s.phase === 'ended' ? evaluateCase(s) : null,
  };
}
