// 動的検証：実際にシミュレーションを回し、
// ① ある方針の組み合わせで必須証拠が期限内・乗員が死ぬ前に揃うこと
// ② その時点で正しい仮説を出せば危機が解けること
// ③ 何もしなければ危機が進む（勝手に解決しない）こと を確かめる。
import type { GameState } from '../core/types';
import { buildCase } from './registry';
import { newState } from './generate';
import { applyAction, step } from '../sim/sim';

export function runSolve(templateId: string, genSeed: number): { state: GameState; gotAllAt: number | null; resolvedAt: number | null } {
  const { def } = buildCase(templateId, genSeed);
  const s = newState(templateId, genSeed);
  applyAction(s, { type: 'begin' });
  const idx: Record<string, number> = {};
  for (const c of s.crew) {
    const pl = def.solve.policies[c.id];
    idx[c.id] = 0;
    if (pl?.length) applyAction(s, { type: 'setPolicy', crew: c.id, policy: pl[0] });
  }
  const keys = s.truth.evidence.filter((e) => e.key).map((e) => e.id);
  let gotAllAt: number | null = null;
  let resolvedAt: number | null = null;
  for (let i = 0; i < 6 * 60 * 4 && s.phase === 'play'; i++) {
    step(s);
    for (const l of s.player.log) if (l.kind === 'confirm' && !l.answered) applyAction(s, { type: 'answerConfirm', logId: l.id, allow: true });
    for (const c of s.crew) {
      const pl = def.solve.policies[c.id];
      if (!pl) continue;
      if (c.pendingPolicy && s.player.pendingPolicyNotice.includes(c.id)) applyAction(s, { type: 'resolvePending', crew: c.id, apply: true });
      if (!c.pendingPolicy && c.task.t === 'idle' && /調査を終えて待機|待機中/.test(c.task.label) && idx[c.id] + 1 < pl.length && c.policy.kind !== 'plan') {
        idx[c.id]++;
        applyAction(s, { type: 'setPolicy', crew: c.id, policy: pl[idx[c.id]] });
      }
    }
    if (gotAllAt === null && keys.every((k) => s.player.evidence.includes(k))) {
      gotAllAt = s.world.tick;
      applyAction(s, { type: 'submit', hyp: def.solve.hyp });
    }
    if (s.world.resolved && resolvedAt === null) resolvedAt = s.world.tick;
    if (resolvedAt !== null && gotAllAt !== null) break;
  }
  return { state: s, gotAllAt, resolvedAt };
}

export function validateDynamic(templateId: string, genSeed: number): string[] {
  const out: string[] = [];
  // ③ 放置で勝手に解決しない
  const idle = newState(templateId, genSeed);
  applyAction(idle, { type: 'begin' });
  for (let i = 0; i < 6 * 30; i++) step(idle);
  if (idle.world.resolved) out.push('何もしなくても解決してしまう');

  const r = runSolve(templateId, genSeed);
  const s = r.state;
  if (r.gotAllAt === null) {
    const miss = s.truth.evidence.filter((e) => e.key && !s.player.evidence.includes(e.id)).map((e) => e.id);
    out.push('必須証拠が揃わない: ' + miss.join(','));
  } else {
    const deaths = s.crew.filter((c) => !c.alive).length;
    if (deaths > 0) out.push('必須証拠が揃う前後に死者が出る');
    if (r.resolvedAt === null) out.push('正しい仮説と作戦で危機が解けない');
  }
  return out;
}
