// 事件の生成：シード → テンプレート選択 → 乗員 → 事件定義 → 検証。通らなければ次のシードで作り直す。
import { SCHEMA_VERSION, type Crew, type FixedCrew, type GameState } from '../core/types';
import { buildCase, TEMPLATES } from './registry';
import { validateStatic } from './validate';
import { validateDynamic } from './validate_dynamic';

export function mixSeed(seed: number, k: number): number {
  let x = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function pickTemplateId(seed: number): string {
  return TEMPLATES[mixSeed(seed, 999) % TEMPLATES.length].id;
}

// 検証なしで、採用済みシードから初期状態を作る（セーブの再構築・検証器の内部で使う）
export function newState(templateId: string, genSeed: number, seed = genSeed, fixed?: FixedCrew): GameState {
  const { tpl, def, ship, crew: seeds } = buildCase(templateId, genSeed, fixed);
  const crew: Crew[] = seeds.map((c) => {
    const init = def.crewInit[c.id] ?? { room: 'corridor' };
    return {
      id: c.id, name: c.name, roleId: c.roleId, role: c.role, history: c.history,
      skills: { ...c.skills }, exp: c.exp, trust: c.trust,
      health: Math.min(init.health ?? 100, c.health ?? 100), impair: 0, alive: true, bold: c.bold,
      room: init.room,
      task: { t: 'idle', label: init.label ?? '待機中' },
      policy: { kind: 'standby' },
      pendingPolicy: null,
      mind: { known: [...(init.known ?? [])], hides: [...(init.hides ?? [])], permissions: {}, asked: {}, skillSeen: {}, confessed: false },
      outbox: [],
      lostCommSince: null,
      look: { ...c.look },
    };
  });
  return {
    schema: SCHEMA_VERSION,
    seed,
    genSeed,
    templateId,
    startSec: def.startSec,
    deadlineSec: def.deadlineSec,
    rng: genSeed | 0,
    phase: 'briefing',
    ship: JSON.parse(JSON.stringify(ship)),
    truth: JSON.parse(JSON.stringify({ ...def.truth, templateId, title: def.title ?? tpl.title, category: tpl.category })),
    world: {
      tick: 0, o2: 100, hull: fixed?.hull ?? 100, fire: null, destroyed: [], resolved: false,
      commDown: [...def.commDown],
      vars: { ...def.vars },
      food: 100, morale: 70, supplies: { medkits: 3, spareParts: 4, extinguishers: 2 },
    },
    crew,
    player: {
      log: [],
      evidence: [...def.initialEvidence],
      board: { cards: def.initialEvidence.map((id, i) => ({ id, x: 12 + (i % 2) * 170, y: 16 })), links: [], notes: [] },
      submissions: [],
      lastSeen: Object.fromEntries(crew.map((c) => [c.id, { room: c.room, sec: def.startSec, health: c.health, alive: true, label: c.task.label, policy: '待機', trust: c.trust }])),
      unread: 0,
      pendingPolicyNotice: [],
      knownDead: [],
      plansKnownDone: [],
      finalPending: false,
    },
    plans: [],
    actions: [],
    nextId: 1,
    outcome: null,
    firedEvents: [],
    ...(fixed ? { fixed: JSON.parse(JSON.stringify(fixed)) } : {}),
  };
}

export interface GenResult { state: GameState; attempts: number; rejected: string[][] }

export function generateWithReport(seed: number, templateId?: string, maxAttempts = 40, fixed?: FixedCrew): GenResult {
  const tid = templateId ?? pickTemplateId(seed);
  const rejected: string[][] = [];
  for (let k = 0; k < maxAttempts; k++) {
    const g = mixSeed(seed, k);
    let problems: string[];
    try {
      problems = validateStatic(tid, g, fixed);
      if (!problems.length) problems = validateDynamic(tid, g, fixed);
    } catch (e) {
      problems = ['例外: ' + (e as Error).message];
    }
    if (!problems.length) return { state: newState(tid, g, seed, fixed), attempts: k + 1, rejected };
    rejected.push(problems);
  }
  throw new Error(`事件を生成できなかった (${tid}): ${rejected.slice(-1)[0]?.join(' / ')}`);
}

export function generateCase(seed: number, templateId?: string, fixed?: FixedCrew): GameState {
  return generateWithReport(seed, templateId, 40, fixed).state;
}
