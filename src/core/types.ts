// 共有型。真相（Truth と事件定義 CaseDef）は gen / sim / judge / cases だけが読む。
// UI は view/view.ts が作る ViewModel だけを参照する。

export const SCHEMA_VERSION = 2;
export const TICK_SEC = 10; // 1 tick = ゲーム内10秒

export type RoomId = string;
export type Skill = 'mech' | 'med' | 'inv'; // 整備・医療・調査
export type CrewId = string;
export type EvidenceId = string;
export type FactId = string;
export type Group = 'core' | 'port' | 'starboard' | 'lower';
export type Category = 'accident' | 'sabotage' | 'phenomenon';

export interface RoomDef {
  id: RoomId;
  name: string;
  rect: [number, number, number, number]; // タイル座標 x,y,w,h
  group: Group; // 通信中継器の系統
}

export interface Ship {
  rooms: RoomDef[];
  edges: [RoomId, RoomId, number][]; // [a, b, 移動分数]
  relayRoom: Record<Group, RoomId>; // 系統ごとの中継器の場所
}

// ---------- 真相 ----------
export interface TruthEvent {
  id: string;
  sec: number;
  room: RoomId;
  actor: CrewId | null;
  text: string; // 事件後の説明にのみ使う
  causes: string[]; // 因果グラフの辺
}

export interface EvidenceDef {
  id: EvidenceId;
  title: string;
  text: string;
  source: 'log' | 'trace' | 'testimony' | 'record' | 'report';
  room: RoomId | null;
  skill: Skill | null;
  minSkill: number;
  work: number; // 基本作業時間（分）。0 は調査では見つからない
  fact: FactId;
  key: boolean;
  where: string;
  destroyedByFire?: boolean;
}

export interface Truth {
  templateId: string;
  title: string;
  category: Category;
  cause: string;
  events: TruthEvent[];
  orderCards: { id: string; label: string; sec: number }[];
  responsible: { crew: CrewId; role: 'falsified' | 'sabotage' } | null;
  evidence: EvidenceDef[];
  misleads: { evidence: EvidenceId; resolvedBy: EvidenceId[]; explain: string }[];
}

// ---------- 世界の動的状態 ----------
export interface World {
  tick: number;
  o2: number;
  hull: number;
  fire: { room: RoomId; intensity: number } | null;
  destroyed: string[];
  resolved: boolean;
  commDown: Group[]; // 通信が落ちている系統
  vars: Record<string, number>; // 事件ごとの状態（電力、漏れ、汚染など）
  // 試作ではデータだけ持つ資源（事件間の配分で使う予定）
  food: number;
  morale: number;
  supplies: { medkits: number; spareParts: number; extinguishers: number };
}

// ---------- 乗員 ----------
export type PolicyKind =
  | 'standby' | 'respond' | 'investigate' | 'repairRelay'
  | 'guard' | 'medical' | 'plan' | 'detained';

export interface Policy {
  kind: PolicyKind;
  room?: RoomId;
  planId?: number;
}

export interface Report {
  id: number;
  crew: CrewId;
  sec: number;
  room: RoomId;
  text: string;
  reason?: string;
  evidence?: EvidenceId[];
  important: boolean;
  kind: 'report' | 'confirm' | 'autonomy' | 'danger' | 'testimony';
  confirmKey?: string;
  offline: boolean;
  planDone?: number;
}

export interface CrewMind {
  known: FactId[];
  hides: FactId[];
  permissions: Record<string, boolean>;
  asked: Record<string, boolean>;
  skillSeen: Partial<Record<Skill, boolean>>;
  confessed: boolean;
}

export type Task =
  | { t: 'idle'; label: string }
  | { t: 'move'; path: RoomId[]; progress: number; label: string }
  | { t: 'work'; action: string; remaining: number; total: number; label: string; arg?: string };

export interface Look { skin: number; hair: number; hairStyle: number; suit: number; eyes: number }

export interface Crew {
  id: CrewId;
  name: string;
  roleId: string;
  role: string;
  history: string;
  skills: Record<Skill, number>;
  exp: number;
  trust: number;
  health: number;
  impair: number; // 0..1 体調不良などによる作業の遅れ
  alive: boolean;
  bold: boolean;
  room: RoomId;
  task: Task;
  policy: Policy;
  pendingPolicy: Policy | null;
  mind: CrewMind;
  outbox: Report[];
  lostCommSince: number | null;
  look: Look;
}

// ---------- プレイヤーの知識 ----------
export interface LogEntry {
  id: number;
  sec: number;
  deliveredSec: number;
  crew: CrewId | null;
  text: string;
  reason?: string;
  evidence?: EvidenceId[];
  delayed: boolean;
  kind: 'system' | 'report' | 'confirm' | 'autonomy' | 'danger' | 'testimony' | 'order';
  confirmKey?: string;
  answered?: boolean;
}

export interface BoardState {
  cards: { id: EvidenceId; x: number; y: number }[];
  links: { a: EvidenceId; b: EvidenceId; label: string }[];
  notes: { id: string; text: string }[];
}

export interface Hypothesis {
  category: Category;
  cause: string;
  order: string[];
  person: { crew: CrewId; role: 'falsified' | 'sabotage' } | null;
  evidence: EvidenceId[];
  plan: string;
}

export interface PlanState {
  id: number;
  kind: string;
  knowsCause: boolean; // 提出仮説の原因が真相と一致していたか
  target: CrewId | null;
  executor: CrewId | null;
  status: 'waiting' | 'running' | 'done' | 'failed';
  step: number;
  submittedSec: number;
}

export interface PlayerKnowledge {
  log: LogEntry[];
  evidence: EvidenceId[];
  board: BoardState;
  submissions: { sec: number; hyp: Hypothesis }[];
  lastSeen: Record<CrewId, { room: RoomId; sec: number; health: number; alive: boolean; label: string; policy: string; trust: number }>;
  unread: number;
  pendingPolicyNotice: CrewId[];
  knownDead: CrewId[];
  plansKnownDone: number[];
  finalPending: boolean;
}

export type Phase = 'briefing' | 'play' | 'ended';

export interface CaseOutcome {
  reason: 'resolved' | 'third' | 'abandon' | 'lost' | 'timeout';
  sec: number;
}

export interface GameState {
  schema: number;
  seed: number; // プレイヤーが選んだシード
  genSeed: number; // 検証を通って採用されたシード（事件定義はここから再構築できる）
  templateId: string;
  startSec: number;
  deadlineSec: number;
  rng: number;
  phase: Phase;
  ship: Ship;
  truth: Truth;
  world: World;
  crew: Crew[];
  player: PlayerKnowledge;
  plans: PlanState[];
  actions: { tick: number; action: Action }[];
  nextId: number;
  outcome: CaseOutcome | null;
  firedEvents: string[];
}

export type Action =
  | { type: 'begin' }
  | { type: 'setPolicy'; crew: CrewId; policy: Policy }
  | { type: 'resolvePending'; crew: CrewId; apply: boolean }
  | { type: 'talk'; crew: CrewId }
  | { type: 'confront'; crew: CrewId; evidence: EvidenceId }
  | { type: 'answerConfirm'; logId: number; allow: boolean }
  | { type: 'submit'; hyp: Hypothesis }
  | { type: 'abandon' };
