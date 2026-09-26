// 動的検証：実際にシミュレーションを回し、
// ① ある方針の組み合わせで必須証拠が期限内・乗員が死ぬ前に揃うこと
// ② その時点で正しい仮説を出せば危機が解けること
// ③ 何もしなければ危機が進む（勝手に解決しない）こと を確かめる。
import type { FixedCrew, GameState } from '../core/types';
import { buildCase } from './registry';
import { newState } from './generate';
import { applyAction, step, unlockedKeys } from '../sim/sim';
import { commOk } from '../sim/ship';

export function runSolve(templateId: string, genSeed: number, fixed?: FixedCrew): { state: GameState; gotAllAt: number | null; resolvedAt: number | null } {
  const { def } = buildCase(templateId, genSeed, fixed);
  const s = newState(templateId, genSeed, genSeed, fixed);
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
    // 通信の届く乗員からは、ときどき話を聞く（プレイヤーが普通にすること）
    if (s.world.tick % 60 === 1) for (const c of s.crew) if (c.alive && commOk(s.ship, s.world, c.room) && !s.world.vars['down_' + c.id]) applyAction(s, { type: 'talk', crew: c.id });
    const open = new Set(unlockedKeys(s));
    const answerOpen = open.has('cause:' + def.solve.hyp.cause) && open.has('plan:' + def.solve.hyp.plan) && s.truth.orderCards.every((c) => open.has('order:' + c.id));
    if (gotAllAt === null && answerOpen && keys.every((k) => s.player.evidence.includes(k))) {
      gotAllAt = s.world.tick;
      applyAction(s, { type: 'submit', hyp: def.solve.hyp });
    }
    if (s.world.resolved && resolvedAt === null) resolvedAt = s.world.tick;
    if (resolvedAt !== null && gotAllAt !== null) break;
  }
  return { state: s, gotAllAt, resolvedAt };
}

export function validateDynamic(templateId: string, genSeed: number, fixed?: FixedCrew): string[] {
  const out: string[] = [];
  // ③ 放置で勝手に解決しない
  const idle = newState(templateId, genSeed, genSeed, fixed);
  applyAction(idle, { type: 'begin' });
  for (let i = 0; i < 6 * 30; i++) step(idle);
  if (idle.world.resolved) out.push('何もしなくても解決してしまう');

  const r = runSolve(templateId, genSeed, fixed);
  const s = r.state;
  if (r.gotAllAt === null) {
    const miss = s.truth.evidence.filter((e) => e.key && !s.player.evidence.includes(e.id)).map((e) => e.id);
    const open = new Set(unlockedKeys(s));
    const { def } = buildCase(templateId, genSeed, fixed);
    const closed = ['cause:' + def.solve.hyp.cause, 'plan:' + def.solve.hyp.plan, ...s.truth.orderCards.map((c) => 'order:' + c.id)].filter((k) => !open.has(k));
    out.push('必須証拠が揃わない: ' + miss.join(',') + (closed.length ? ' / 浮上しない選択肢: ' + closed.join(',') : ''));
  } else {
    const deaths = s.crew.filter((c) => !c.alive).length;
    if (deaths > 0) out.push('必須証拠が揃う前後に死者が出る');
    if (r.resolvedAt === null) out.push('正しい仮説と作戦で危機が解けない');
  }
  return out;
}
