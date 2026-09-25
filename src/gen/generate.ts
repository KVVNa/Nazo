import { SCHEMA_VERSION, type Crew, type GameState } from '../core/types';
import { START_SEC } from '../core/rng';
import { POWER_CASE, type CaseTemplate } from './case_power';
import { validateCase } from './validate';

export function currentTemplate(): CaseTemplate {
  return POWER_CASE;
}

export function generateCase(seed: number, tpl: CaseTemplate = POWER_CASE): GameState {
  const problems = validateCase(tpl);
  if (problems.length) throw new Error('事件の検証に失敗: ' + problems.join(' / '));

  const t = tpl.truth;
  const crew: Crew[] = tpl.crew.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    history: c.history,
    skills: { ...c.skills },
    exp: c.exp,
    trust: c.trust,
    health: 100,
    alive: true,
    bold: c.bold,
    room: c.room,
    task: { t: 'idle', label: c.id === 'mina' ? '仮眠から起きたところ' : '待機中' },
    policy: { kind: 'standby' },
    pendingPolicy: null,
    mind: { known: [...c.known], hides: [...c.hides], permissions: {}, asked: {}, skillSeen: {}, confessed: false },
    outbox: [],
    lostCommSince: null,
    look: { ...c.look },
  }));

  // 02:14に切替、開始02:20までの6分ぶん予備セルは減っている
  const drainPerMin = 100 / 180;
  const startCharge = 50 - 6 * drainPerMin;

  const state: GameState = {
    schema: SCHEMA_VERSION,
    seed,
    rng: seed | 0,
    phase: 'briefing',
    truth: JSON.parse(JSON.stringify(t)),
    world: {
      tick: 0,
      mainPower: false,
      backupCharge: startCharge,
      loadShed: false,
      leakSealed: false,
      floorWet: 45,
      fire: null,
      o2: 100,
      hull: 100,
      relayRepaired: false,
      spareCellsLeft: t.spareCells,
      depletedAt: null,
      cellCap: 50,
      gaugeOffset: 50,
      panelDamaged: false,
      destroyed: [],
      resolved: false,
      food: 100,
      morale: 70,
      supplies: { medkits: 3, spareParts: 4, extinguishers: 2 },
    },
    crew,
    player: {
      log: [],
      evidence: [...tpl.initialEvidence],
      board: { cards: tpl.initialEvidence.map((id, i) => ({ id, x: 12 + (i % 2) * 170, y: 16 })), links: [] },
      submissions: [],
      lastSeen: Object.fromEntries(crew.map((c) => [c.id, { room: c.room, sec: START_SEC, health: 100, alive: true, label: c.task.label, policy: '待機', trust: c.trust }])),
      cellMeasured: false,
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
  };
  return state;
}
