// 共有型。Truth（真相）は gen / sim / judge だけが読む。
// UI は view/view.ts が作る ViewModel だけを参照する（ui/ から core/state を直接読まない）。

export const SCHEMA_VERSION = 1;
export const TICK_SEC = 10; // 1 tick = ゲーム内10秒

export type RoomId =
  | 'bridge' | 'corridor' | 'quarters' | 'medbay'
  | 'cargo' | 'lifesupport' | 'engineering' | 'powerroom';

export type Skill = 'mech' | 'med' | 'inv'; // 整備・医療・調査
export type CrewId = 'mina' | 'sora' | 'kei' | 'duran';
export type EvidenceId = string;
export type FactId = string;

export interface RoomDef {
  id: RoomId;
  name: string;
  rect: [number, number, number, number]; // タイル座標 x,y,w,h
  relay: 'main' | 'eng'; // どの通信中継器に依存するか
}

// ---------- 真相 ----------
export interface TruthEvent {
  id: string;
  sec: number; // 00:00からの秒
  room: RoomId;
  actor: CrewId | null;
  text: string; // 事件後の説明にのみ使う
  causes: string[]; // 因果グラフの辺（この事象が引き起こす事象）
}

export interface EvidenceDef {
  id: EvidenceId;
  title: string;
  text: string;
  source: 'log' | 'trace' | 'testimony' | 'record' | 'report';
  room: RoomId | null; // 入手区画（証言は null）
  skill: Skill | null; // 発見に必要な系統
  minSkill: number;
  work: number; // 基本作業時間（分）
  fact: FactId; // 真相との対応（内部用）
  key: boolean; // 仮説に必須級か
  where: string; // 事件後「どこで得られたか」
  destroyedByFire?: boolean;
}

export interface Truth {
  caseId: string;
  title: string;
  category: 'accident' | 'sabotage' | 'phenomenon';
  cause: string; // 原因の具体事象ID
  events: TruthEvent[];
  orderCards: { id: string; label: string; sec: number }[];
  responsible: { crew: CrewId; role: 'falsified' | 'sabotage' } | null;
  evidence: EvidenceDef[];
  misleads: { evidence: EvidenceId; resolvedBy: EvidenceId[]; explain: string }[];
  spareCells: number;
  leakRatePerTick: number;
}

// ---------- 世界の動的状態（真実） ----------
export interface World {
  tick: number;
  mainPower: boolean;
  backupCharge: number; // 0..100（定格容量比）
  loadShed: boolean;
  leakSealed: boolean;
  floorWet: number; // 0..100
  fire: { room: RoomId; intensity: number } | null;
  o2: number;
  hull: number;
  relayRepaired: boolean;
  spareCellsLeft: number;
  depletedAt: number | null;
  cellCap: number; // 現在のセルの実容量
  gaugeOffset: number; // 司令室の残量計が定格容量を仮定しているぶんのずれ
  panelDamaged: boolean;
  destroyed: string[]; // 火災で失われた証拠
  resolved: boolean;
  // Phase 1 ではデータだけ持つ資源（事件間の配分・補給なしの航海で使う予定）
  food: number;
  morale: number;
  supplies: { medkits: number; spareParts: number; extinguishers: number };
}

// ---------- 乗員 ----------
export type PolicyKind =
  | 'standby' | 'restorePower' | 'investigate' | 'repairRelay'
  | 'guard' | 'medical' | 'plan' | 'detained';

export interface Policy {
  kind: PolicyKind;
  room?: RoomId;
  planId?: number;
}

export interface Report {
  id: number;
  crew: CrewId;
  sec: number; // 起きた時刻
  room: RoomId;
  text: string;
  reason?: string; // なぜそう判断したか
  evidence?: EvidenceId[];
  important: boolean;
  kind: 'report' | 'confirm' | 'autonomy' | 'danger' | 'testimony';
  confirmKey?: string;
  offline: boolean; // 通信断中に起きた
  planDone?: number;
}

export interface CrewMind {
  known: FactId[]; // 本人が知っている事実
  hides: FactId[]; // 隠したい事実
  permissions: Record<string, boolean>;
  asked: Record<string, boolean>;
  skillSeen: Partial<Record<Skill, boolean>>;
  confessed: boolean;
}

export type Task =
  | { t: 'idle'; label: string }
  | { t: 'move'; path: RoomId[]; progress: number; label: string }
  | { t: 'work'; action: string; remaining: number; total: number; label: string; arg?: string };

export interface Crew {
  id: CrewId;
  name: string;
  role: string;
  history: string; // 職歴（弱い手がかり）
  skills: Record<Skill, number>;
  exp: number;
  trust: number;
  health: number;
  alive: boolean;
  bold: boolean;
  room: RoomId;
  task: Task;
  policy: Policy;
  pendingPolicy: Policy | null;
  mind: CrewMind;
  outbox: Report[];
  lostCommSince: number | null;
  look: { skin: number; hair: number; hairStyle: number; suit: number; eyes: number };
}

// ---------- プレイヤーの知識 ----------
export interface LogEntry {
  id: number;
  sec: number; // 起きた時刻
  deliveredSec: number;
  crew: CrewId | null;
  text: string;
  reason?: string;
  evidence?: EvidenceId[];
  delayed: boolean; // 通信断中の出来事
  kind: 'system' | 'report' | 'confirm' | 'autonomy' | 'danger' | 'testimony' | 'order';
  confirmKey?: string;
  answered?: boolean;
}

export interface BoardState {
  cards: { id: EvidenceId; x: number; y: number }[];
  links: { a: EvidenceId; b: EvidenceId; label: string }[];
}

export interface Hypothesis {
  category: 'accident' | 'sabotage' | 'phenomenon';
  cause: string;
  order: string[];
  person: { crew: CrewId; role: 'falsified' | 'sabotage' } | null;
  evidence: EvidenceId[];
  plan: PlanKind;
}

export type PlanKind = 'restartNow' | 'dryRestart' | 'sealDryRestart' | 'shed' | 'swapCell' | 'detain';

export interface PlanState {
  id: number;
  kind: PlanKind;
  knowsLeak: boolean; // 提出仮説が冷却漏れを原因としていたか
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
  lastSeen: Partial<Record<CrewId, { room: RoomId; sec: number; health: number; alive: boolean; label: string; policy: string; trust: number }>>;
  cellMeasured: boolean;
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
  seed: number;
  rng: number; // 乱数状態
  phase: Phase;
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

// ---------- プレイヤー操作（再現用に記録される） ----------
export type Action =
  | { type: 'begin' }
  | { type: 'setPolicy'; crew: CrewId; policy: Policy }
  | { type: 'resolvePending'; crew: CrewId; apply: boolean }
  | { type: 'talk'; crew: CrewId }
  | { type: 'confront'; crew: CrewId; evidence: EvidenceId }
  | { type: 'answerConfirm'; logId: number; allow: boolean }
  | { type: 'submit'; hyp: Hypothesis }
  | { type: 'abandon' };
