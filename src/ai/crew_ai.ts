// 乗員の行動AI。入力は「本人の知識・周囲の観測・船長の方針」だけ。真相や事件定義は受け取らない。
// 『星域戦記』探索AIの考え方（候補生成→合法性判定→評価）を借りるが、コードは独立。
import type { CrewMind, Policy, RoomId, Skill } from '../core/types';

export interface PlanStep { room: RoomId; action: string; label: string }

// 本人が知っている事実から思いつく現場の手当て
export interface FieldOption { id: string; room: RoomId; label: string; ask: string; why: string }

export interface Perception {
  room: RoomId;
  comm: boolean;
  nearestComm: RoomId;
  safeNeighbor: RoomId;
  fireHere: boolean;
  injuredHere: { id: string; name: string; health: number }[];
  injuredRadio: { id: string; room: RoomId; health: number }[];
  myRelayRoom: RoomId | null; // 自分のいる系統の中継器（通信が落ちているとき）
  downRelayRooms: RoomId[]; // 落ちている中継器の場所（無線の状態表示で分かる）
  hasImportantUnsent: boolean;
  planStep: PlanStep | null;
  respondRoom: RoomId; // 「現場対応」で向かう区画
  respondWait: string;
  fieldOptions: FieldOption[];
}

export interface SelfInfo {
  id: string;
  name: string;
  skills: Record<Skill, number>;
  exp: number;
  trust: number;
  bold: boolean;
  health: number;
  policy: Policy;
}

export type Decision =
  | { a: 'move'; to: RoomId; label: string; reason?: string; autonomous?: boolean }
  | { a: 'work'; action: string; label: string; reason?: string; autonomous?: boolean; arg?: string }
  | { a: 'ask'; key: string; text: string; reason: string }
  | { a: 'wait'; label: string };

interface Cand { d: Decision; score: number }

export function autonomy(self: SelfInfo): number {
  return self.exp * 20 + self.trust * 0.5 + (self.bold ? 10 : 0);
}

function knows(m: CrewMind, f: string) { return m.known.includes(f); }

// 危険を伴う現場の手当て：自律度が高ければ自分の判断で、低ければ許可を求める
function fieldStep(self: SelfInfo, mind: CrewMind, obs: Perception, f: FieldOption): Cand | null {
  if (mind.permissions[f.id] === false) return null;
  const auto = autonomy(self) >= 60;
  if (auto || mind.permissions[f.id]) {
    if (obs.room !== f.room) return { d: { a: 'move', to: f.room, label: `${f.label}のため移動` }, score: 40 };
    return {
      d: { a: 'work', action: 'fa:' + f.id, label: f.label, reason: mind.permissions[f.id] ? '船長の許可を受けて実施' : f.why, autonomous: !mind.permissions[f.id] },
      score: 60,
    };
  }
  if (mind.asked[f.id]) return { d: { a: 'wait', label: '船長の返答待ち' }, score: 10 };
  if (obs.comm) return { d: { a: 'ask', key: f.id, text: f.ask, reason: '自分だけで判断するには経験が足りないと感じた' }, score: 55 };
  return { d: { a: 'move', to: obs.nearestComm, label: '確認を取りに通信の届く場所へ', reason: `「${f.label}」の許可を取るため` }, score: 55 };
}

function goReport(self: SelfInfo, obs: Perception, score: number): Cand {
  if (self.skills.mech >= 2 && obs.myRelayRoom) {
    if (obs.room === obs.myRelayRoom)
      return { d: { a: 'work', action: 'repairRelay', label: '中継器を予備回路につなぎ直し中', reason: '報告を届けるため中継器を先に直すと判断', autonomous: true }, score: score + 10 };
    return { d: { a: 'move', to: obs.myRelayRoom, label: '中継器を直しに移動', reason: '戻るより中継器を直すほうが早く報告できると判断', autonomous: true }, score };
  }
  return { d: { a: 'move', to: obs.nearestComm, label: '報告のため通信の届く場所へ', reason: '見たことを船長に伝える必要があると判断', autonomous: true }, score };
}

function policyCands(self: SelfInfo, mind: CrewMind, obs: Perception): Cand[] {
  const p = self.policy;
  const c: Cand[] = [];
  const at = obs.room;
  switch (p.kind) {
    case 'standby':
      c.push({ d: { a: 'wait', label: '待機中' }, score: 1 });
      break;
    case 'detained':
      c.push({ d: { a: 'wait', label: '拘束されている' }, score: 100 });
      break;
    case 'guard':
      if (at !== p.room) c.push({ d: { a: 'move', to: p.room!, label: '警備位置へ移動' }, score: 30 });
      else c.push({ d: { a: 'wait', label: '区画を警備中' }, score: 20 });
      break;
    case 'investigate': {
      const target = p.room!;
      if (!knows(mind, 'X_searched_' + target)) {
        if (at !== target) c.push({ d: { a: 'move', to: target, label: '調査区画へ移動' }, score: 30 });
        else c.push({ d: { a: 'work', action: 'search', label: '区画を調査中' }, score: 40 });
        break;
      }
      // 調べ終えたあと：知ったことから思いつく手当て → 報告 → 待機（調べ終えた区画へは戻らない）
      const f = at === target ? obs.fieldOptions.find((o) => o.room === at && fieldStep(self, mind, obs, o)) : undefined;
      if (f) c.push(fieldStep(self, mind, obs, f)!);
      else if (obs.hasImportantUnsent && !obs.comm) c.push(goReport(self, obs, 35));
      else c.push({ d: { a: 'wait', label: '調査を終えて待機' }, score: 5 });
      break;
    }
    case 'repairRelay': {
      const target = obs.downRelayRooms[0];
      if (!target) c.push({ d: { a: 'wait', label: '中継器はすべて動いている' }, score: 5 });
      else if (at !== target) c.push({ d: { a: 'move', to: target, label: '中継器へ移動' }, score: 30 });
      else c.push({ d: { a: 'work', action: 'repairRelay', label: '中継器を予備回路につなぎ直し中' }, score: 40 });
      break;
    }
    case 'medical': {
      const target = obs.injuredRadio.filter((x) => x.health < 80).sort((a, b) => a.health - b.health)[0];
      if (target && target.room !== at) c.push({ d: { a: 'move', to: target.room, label: '負傷者のもとへ移動' }, score: 35 });
      else c.push({ d: { a: 'wait', label: '救護に備えて待機' }, score: 2 });
      break;
    }
    case 'respond': {
      const home = obs.respondRoom;
      if (!knows(mind, 'X_searched_' + home)) {
        if (at !== home) c.push({ d: { a: 'move', to: home, label: '現場へ移動' }, score: 30 });
        else c.push({ d: { a: 'work', action: 'search', label: '現場を点検中' }, score: 45 });
        break;
      }
      let handled = false;
      for (const f of obs.fieldOptions) {
        const r = fieldStep(self, mind, obs, f);
        if (r) { c.push(r); handled = true; break; }
      }
      if (handled) break;
      if (obs.hasImportantUnsent && !obs.comm) { c.push(goReport(self, obs, 38)); break; }
      if (at !== home) c.push({ d: { a: 'move', to: home, label: '現場へ戻る' }, score: 20 });
      else c.push({ d: { a: 'wait', label: obs.respondWait }, score: 5 });
      break;
    }
    case 'plan': {
      const s = obs.planStep;
      if (!s) c.push({ d: { a: 'wait', label: '作戦完了' }, score: 1 });
      else if (s.room !== at) c.push({ d: { a: 'move', to: s.room, label: `作戦（${s.label}）のため移動` }, score: 50 });
      else c.push({ d: { a: 'work', action: s.action, label: s.label }, score: 50 });
      break;
    }
  }
  return c;
}

export function decide(self: SelfInfo, mind: CrewMind, obs: Perception, tiebreak: number): Decision {
  const cands: Cand[] = [];
  if (obs.fireHere) {
    if (self.bold && self.skills.mech >= 1 && self.health > 40)
      cands.push({ d: { a: 'work', action: 'fightFire', label: '消火中', reason: '火が広がる前に消せると判断', autonomous: true }, score: 90 });
    cands.push({ d: { a: 'move', to: obs.safeNeighbor, label: '火災から退避', reason: '火災で危険なため退避', autonomous: true }, score: self.bold ? 70 : 95 });
  }
  const hurt = obs.injuredHere.filter((x) => x.health < 70 && x.id !== self.id).sort((a, b) => a.health - b.health)[0];
  if (hurt && self.skills.med >= 1 && !mind.known.includes('X_untreat_' + hurt.id))
    cands.push({ d: { a: 'work', action: 'treat', arg: hurt.id, label: `${hurt.name}を手当て中`, reason: '目の前の負傷者を優先', autonomous: self.policy.kind !== 'medical' }, score: self.policy.kind === 'medical' ? 80 : 58 });
  // 通信断の区画で重要なことを知ったら、方針が許す限り報告しに戻る
  const k = self.policy.kind;
  if (obs.hasImportantUnsent && !obs.comm && (k === 'standby' || k === 'medical' || (k === 'plan' && !obs.planStep)))
    cands.push({ d: { a: 'move', to: obs.nearestComm, label: '報告のため通信の届く場所へ', reason: '通信断のあいだに起きたことを船長に伝えるため', autonomous: true }, score: 25 });
  cands.push(...policyCands(self, mind, obs));
  let best = cands[0];
  for (const x of cands) {
    if (x.score > best.score || (x.score === best.score && tiebreak > 0.5 && x !== best)) best = x;
  }
  return best.d;
}
