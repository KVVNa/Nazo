// 事件テンプレートの書式。テンプレートは「先に真相を決め、証拠と証言を派生させる」手作りの型で、
// シードで変わるのは型の中の変数（関係者、区画、時刻、証言者、通信断の系統など）だけ。
import type {
  Category, Crew, CrewId, EvidenceDef, GameState, Group, Hypothesis, Look, PlanState, Policy, RoomDef, RoomId, Skill, Truth, TruthEvent, World,
} from '../core/types';

export interface CrewSeed {
  id: CrewId;
  name: string;
  roleId: string;
  role: string;
  history: string;
  skills: Record<Skill, number>;
  exp: number;
  trust: number;
  bold: boolean;
  look: Look;
}

export interface GenCtx {
  rand(): number;
  int(lo: number, hi: number): number;
  pick<T>(a: T[]): T;
  shuffle<T>(a: T[]): T[];
  crew: CrewSeed[];
  byRole(roleId: string): CrewSeed | undefined;
  others(...exclude: (CrewSeed | undefined)[]): CrewSeed[];
  rooms: RoomDef[];
  has(room: RoomId): boolean;
  rn(room: RoomId): string; // 区画名
  groupOf(room: RoomId): Group;
  hm(h: number, m: number): number;
  clock(sec: number): string;
}

export interface Meter { label: string; value: number; text: string; sub?: string; level: '' | 'warn' | 'bad' }

// 事件中の画面に出してよい情報だけを渡す（司令室の計器とプレイヤーの手元の証拠）
export interface MeterCtx { v: Record<string, number>; o2: number; hull: number; has(evidence: string): boolean }

export interface Api {
  s: GameState;
  v: Record<string, number>;
  w: World;
  now(): number;
  clock(sec: number): string;
  rn(room: RoomId): string;
  crew(id: CrewId): Crew;
  crews(): Crew[];
  log(text: string, kind?: 'system' | 'danger', pause?: string): void;
  alarm(text: string, pause?: string): void;
  report(c: Crew, text: string, o?: { evidence?: string[]; reason?: string; important?: boolean; kind?: 'report' | 'danger' | 'autonomy' }): void;
  learn(c: Crew, fact: string): void;
  knows(c: Crew, fact: string): boolean;
  hurt(id: CrewId, n: number): void;
  fire(room: RoomId, intensity: number): void;
  destroy(ids: string[]): void;
  setComm(group: Group, down: boolean): void;
  once(key: string): boolean;
  evTitle(id: string): string;
  evText(id: string): string;
  failPlan(c: Crew): void;
  order(c: Crew, policy: Policy): boolean; // 通信が届く乗員の方針を変える（作戦の効果で使う）
}

export interface FieldAction {
  id: string;
  room: RoomId;
  needs: string; // この事実を本人が知っていれば思いつく
  label: string;
  ask: string; // 確認を求めるときの言葉
  why: string; // 自分の判断で行うときの理由
  skill?: Skill;
  minSkill?: number;
  action: string; // actions のキー
}

export interface Step { room: RoomId; action: string; label: string }

export interface PlanDef {
  id: string;
  label: string;
  warn?: string;
  score: number; // 判定での対処の評価 0..1
  skill?: Skill; // 実行者の選び方
  steps(p: { knowsCause: boolean; target: CrewId | null }, api: Api): Step[];
}

export interface ActionDef {
  minutes(api: Api, c: Crew): number;
  run(api: Api, c: Crew, plan: PlanState | null): 'ok' | 'fail' | void;
}

export interface EpilogueCtx {
  grade: string;
  resolved: boolean;
  has(evidence: string): boolean;
  v: Record<string, number>;
  crew: { id: CrewId; name: string; role: string; alive: boolean; confessed: boolean; detained: boolean; trust: number }[];
  responsible: CrewId | null;
}

export interface CaseDef {
  startSec: number;
  deadlineSec: number;
  briefing: string[];
  alarmText: string;
  initialEvidence: string[];
  truth: Omit<Truth, 'templateId' | 'title' | 'category'>;
  rootEvent: string; // 発端
  damageEvent: string; // 観測された被害
  testimonies: { crew: CrewId; evidence: string; requires?: string; lie?: boolean }[];
  confessions: { crew: CrewId; triggeredBy: string[]; evidence: string }[];
  crewInit: Record<CrewId, { room: RoomId; known?: string[]; hides?: string[]; label?: string; health?: number }>;
  whereabouts: { crew: CrewId; sec: number; room: RoomId }[];
  commDown: Group[];
  statedTimes?: number[]; // 文章に出てくるが出来事そのものではない時刻（範囲の端、予報、本人の思い違いなど）
  vars: Record<string, number>;
  causeOptions: { id: string; label: string; category: Category }[];
  respond: { label: string; desc: string; room: RoomId; waitLabel: string };
  fieldActions: FieldAction[];
  plans: PlanDef[];
  actions: Record<string, ActionDef>;
  tick(api: Api): void;
  meters(m: MeterCtx): Meter[];
  marks?(m: MeterCtx): { room: RoomId; text: string; color: string }[];
  resolved(api: Api): boolean;
  resolvedText: string;
  epilogue(e: EpilogueCtx): string[];
  solve: { policies: Record<CrewId, Policy[]>; hyp: Hypothesis };
}

export interface CaseTemplate {
  id: string;
  title: string;
  category: Category;
  needSide: string[]; // 必要な区画（左右の区画スロット）
  needLower: string[]; // 必要な区画（下層スロット）
  needRoles?: string[];
  build(g: GenCtx): CaseDef;
}

export type { TruthEvent, EvidenceDef };

// 証拠定義を短く書くための補助
export function ev(id: string, title: string, text: string, o: Partial<EvidenceDef> & { room: RoomId | null; fact: string }): EvidenceDef {
  return {
    id, title, text,
    source: o.source ?? 'log',
    room: o.room,
    skill: o.skill ?? null,
    minSkill: o.minSkill ?? 0,
    work: o.work ?? (o.room ? 3 : 0),
    fact: o.fact,
    key: o.key ?? false,
    where: o.where ?? '',
    destroyedByFire: o.destroyedByFire,
  };
}
export function said(id: string, name: string, text: string, fact: string, where: string, key = false): EvidenceDef {
  return { id, title: `${name}の証言`, text: `「${text}」`, source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact, key, where };
}
