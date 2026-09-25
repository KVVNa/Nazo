// 動的検証：ある有効な方針の組み合わせで、必須証拠が危機の期限（予備電源の枯渇）前に揃うかをシミュレーションで確かめる。
import type { CrewId, GameState, Policy } from '../core/types';
import { generateCase } from './generate';
import { applyAction, step } from '../sim/sim';

const PLAN: Record<CrewId, Policy[]> = {
  mina: [{ kind: 'restorePower' }],
  kei: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'engineering' }],
  sora: [{ kind: 'investigate', room: 'medbay' }, { kind: 'investigate', room: 'cargo' }],
  duran: [{ kind: 'investigate', room: 'cargo' }],
};

export function checkObtainable(seed: number): { missing: string[]; minutes: number; state: GameState } {
  const s = generateCase(seed);
  applyAction(s, { type: 'begin' });
  const idx: Record<string, number> = {};
  for (const c of s.crew) { idx[c.id] = 0; applyAction(s, { type: 'setPolicy', crew: c.id, policy: PLAN[c.id][0] }); }
  const keys = s.truth.evidence.filter((e) => e.key).map((e) => e.id);
  while (s.phase === 'play' && s.world.backupCharge > 0) {
    step(s);
    for (const c of s.crew) {
      if (c.task.t === 'idle' && c.task.label === '調査を終えて待機' && idx[c.id] + 1 < PLAN[c.id].length) {
        idx[c.id]++;
        applyAction(s, { type: 'setPolicy', crew: c.id, policy: PLAN[c.id][idx[c.id]] });
      }
    }
    if (keys.every((k) => s.player.evidence.includes(k))) break;
  }
  return { missing: keys.filter((k) => !s.player.evidence.includes(k)), minutes: Math.round(s.world.tick / 6), state: s };
}
