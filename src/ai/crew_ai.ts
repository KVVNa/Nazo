// 乗員の行動AI。入力は「本人の知識・周囲の観測・船長の方針」だけ。真相オブジェクトは受け取らない。
// 『星域戦記』探索AIの考え方（候補生成→合法性判定→評価）を借りるが、コードは独立。
import type { CrewMind, Policy, RoomId, Skill } from '../core/types';

export interface Perception {
  room: RoomId;
  comm: boolean; // 自分の無線が通じるか
  nearestComm: RoomId;
  safeNeighbor: RoomId;
  fireHere: boolean;
  injuredHere: { id: string; name: string; health: number }[];
  injuredRadio: { id: string; room: RoomId; health: number }[]; // 無線で聞いた負傷者
  relayUp: boolean; // 自分の無線で分かる
  panelWetVisible: boolean; // 配電室にいて床の濡れが見える
  hasImportantUnsent: boolean;
  planStep: PlanStep | null;
}

export interface PlanStep {
  room: RoomId;
  action: string; // work の種類
  label: string;
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

const RISKY: Record<string, { label: string; ask: string }> = {
  seal: { label: '漏れている配管を仮封止', ask: '配電室の天井配管から冷却液が漏れています。仮封止してよいですか' },
  shed: { label: '不要な負荷を切り離し', ask: '予備セルが想定より弱いです。照明や居住区の電源を切って酸素再生を優先してよいですか' },
};

function knows(m: CrewMind, f: string) { return m.known.includes(f); }

function riskyStep(self: SelfInfo, mind: CrewMind, obs: Perception, key: 'seal' | 'shed', why: string): Cand {
  const r = RISKY[key];
  if (mind.permissions[key] === false) return { d: { a: 'wait', label: `${r.label}は許可されなかった` }, score: 5 };
  const auto = autonomy(self) >= 60;
  if (auto || mind.permissions[key]) {
    return {
      d: { a: 'work', action: key, label: r.label, reason: mind.permissions[key] ? '船長の許可を受けて実施' : why, autonomous: !mind.permissions[key] },
      score: 60,
    };
  }
  if (mind.asked[key]) return { d: { a: 'wait', label: '船長の返答待ち' }, score: 10 };
  if (obs.comm) return { d: { a: 'ask', key, text: r.ask, reason: '自分だけで判断するには経験が足りないと感じた' }, score: 55 };
  return { d: { a: 'move', to: obs.nearestComm, label: '確認を取りに通信の届く場所へ', reason: `${r.label}の許可を取るため` }, score: 55 };
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
    case 'investigate':
      if (at !== p.room) c.push({ d: { a: 'move', to: p.room!, label: '調査区画へ移動' }, score: 30 });
      else if (!knows(mind, 'X_searched_' + at)) c.push({ d: { a: 'work', action: 'search', label: '区画を調査中' }, score: 40 });
      else if (obs.hasImportantUnsent && !obs.comm)
        c.push({ d: { a: 'move', to: obs.nearestComm, label: '報告のため通信の届く場所へ', reason: '調べた内容を早く届けるべきだと判断', autonomous: true }, score: 35 });
      else c.push({ d: { a: 'wait', label: '調査を終えて待機' }, score: 5 });
      break;
    case 'repairRelay':
      if (obs.relayUp) c.push({ d: { a: 'wait', label: '中継器は動いている' }, score: 5 });
      else if (at !== 'engineering') c.push({ d: { a: 'move', to: 'engineering', label: '中継器へ移動' }, score: 30 });
      else c.push({ d: { a: 'work', action: 'repairRelay', label: '中継器を予備電源につなぎ直し中' }, score: 40 });
      break;
    case 'medical': {
      const target = obs.injuredRadio.filter((x) => x.health < 80).sort((a, b) => a.health - b.health)[0];
      if (target && target.room !== at) c.push({ d: { a: 'move', to: target.room, label: '負傷者のもとへ移動' }, score: 35 });
      else if (!target && at !== 'medbay') c.push({ d: { a: 'move', to: 'medbay', label: '医務室へ戻る' }, score: 10 });
      else c.push({ d: { a: 'wait', label: '救護に備えて待機' }, score: 2 });
      break;
    }
    case 'restorePower': {
      if (!knows(mind, 'X_searched_powerroom')) {
        if (at !== 'powerroom') c.push({ d: { a: 'move', to: 'powerroom', label: '配電室へ移動' }, score: 30 });
        else c.push({ d: { a: 'work', action: 'search', label: '配電室を点検中' }, score: 45 });
        break;
      }
      const needs: ['seal' | 'shed', string][] = [];
      if (knows(mind, 'F_leak') && !knows(mind, 'S_sealed') && self.skills.mech >= 1)
        needs.push(['seal', '漏れを放置すると配電盤がさらに濡れて復旧が遠のくと判断']);
      if (knows(mind, 'F_cell_half') && !knows(mind, 'S_shed') && !mind.hides.includes('F_cell_half'))
        needs.push(['shed', '予備セルの残りが少なく、酸素再生を守るのが先だと判断']);
      let handled = false;
      for (const [k, why] of needs) {
        if (mind.permissions[k] === false) continue;
        const r = riskyStep(self, mind, obs, k, why);
        if (r.d.a === 'work' && at !== 'powerroom') c.push({ d: { a: 'move', to: 'powerroom', label: '配電室へ戻る' }, score: 40 });
        else c.push(r);
        handled = true;
        break;
      }
      if (handled) break;
      if (obs.hasImportantUnsent && !obs.comm) {
        if (self.skills.mech >= 2)
          c.push({ d: { a: 'move', to: 'engineering', label: '中継器を直しに機関区へ', reason: '戻るより中継器を直すほうが早く報告できると判断', autonomous: true }, score: 38 });
        else c.push({ d: { a: 'move', to: obs.nearestComm, label: '報告のため通信の届く場所へ', reason: '見たことを船長に伝える必要があると判断', autonomous: true }, score: 36 });
        break;
      }
      if (at !== 'powerroom') c.push({ d: { a: 'move', to: 'powerroom', label: '配電室へ戻る' }, score: 20 });
      else c.push({ d: { a: 'wait', label: '主電源の再投入は船長の判断待ち' }, score: 5 });
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

// 機関区で報告のために中継器を直すケース（restorePower の途中で機関区にいる）
function relayDetour(self: SelfInfo, obs: Perception): Cand | null {
  if (self.policy.kind !== 'restorePower') return null;
  if (obs.room === 'engineering' && !obs.relayUp && obs.hasImportantUnsent && self.skills.mech >= 2)
    return { d: { a: 'work', action: 'repairRelay', label: '中継器を予備電源につなぎ直し中', reason: '報告を届けるため中継器を先に直すと判断', autonomous: true }, score: 48 };
  return null;
}

export function decide(self: SelfInfo, mind: CrewMind, obs: Perception, tiebreak: number): Decision {
  const cands: Cand[] = [];
  if (obs.fireHere) {
    if (self.bold && self.skills.mech >= 1 && self.health > 40)
      cands.push({ d: { a: 'work', action: 'fightFire', label: '消火中', reason: '火が広がる前に消せると判断', autonomous: true }, score: 90 });
    cands.push({ d: { a: 'move', to: obs.safeNeighbor, label: '火災から退避', reason: '火災で危険なため退避', autonomous: true }, score: self.bold ? 70 : 95 });
  }
  const hurt = obs.injuredHere.filter((x) => x.health < 70 && x.id !== self.id).sort((a, b) => a.health - b.health)[0];
  if (hurt && self.skills.med >= 1)
    cands.push({ d: { a: 'work', action: 'treat', arg: hurt.id, label: `${hurt.name}を手当て中`, reason: '目の前の負傷者を優先', autonomous: self.policy.kind !== 'medical' }, score: self.policy.kind === 'medical' ? 80 : 58 });
  // 通信断の区画で重要なことを知ったら、方針が許す限り報告しに戻る
  const k = self.policy.kind;
  if (obs.hasImportantUnsent && !obs.comm && (k === 'standby' || k === 'medical' || (k === 'plan' && !obs.planStep)))
    cands.push({ d: { a: 'move', to: obs.nearestComm, label: '報告のため通信の届く場所へ', reason: '通信断のあいだに起きたことを船長に伝えるため', autonomous: true }, score: 25 });
  const det = relayDetour(self, obs);
  if (det) cands.push(det);
  cands.push(...policyCands(self, mind, obs));
  // 同点は乱数で。候補順は固定なので、シードが同じなら結果も同じ。
  let best = cands[0];
  for (const x of cands) {
    if (x.score > best.score || (x.score === best.score && tiebreak > 0.5 && x !== best)) best = x;
  }
  return best.d;
}
