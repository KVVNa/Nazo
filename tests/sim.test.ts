import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateCase } from '../src/gen/generate';
import { validateCase } from '../src/gen/validate';
import { checkObtainable } from '../src/gen/validate_dynamic';
import { POWER_CASE } from '../src/gen/case_power';
import { applyAction, replay, step } from '../src/sim/sim';
import { buildView } from '../src/view/view';
import { evaluateCase, judge } from '../src/judge/judge';
import { hashState } from '../src/core/rng';
import type { GameState, Hypothesis } from '../src/core/types';

const RIGHT: Hypothesis = {
  category: 'accident', cause: 'coolant_leak', order: ['o_pressure', 'o_door', 'o_flicker', 'o_trip'],
  person: { crew: 'duran', role: 'falsified' }, evidence: ['panel_log', 'coolant_trace', 'maint_record', 'inventory'], plan: 'sealDryRestart',
};

function started(seed = 1) {
  const s = generateCase(seed);
  applyAction(s, { type: 'begin' });
  return s;
}
function run(s: GameState, ticks: number) { for (let i = 0; i < ticks && s.phase === 'play'; i++) step(s); }
const comparable = (s: GameState) => hashState({ ...s, player: { ...s.player, board: null, unread: 0 } });

describe('事件生成と検証器', () => {
  test('テンプレートは静的検証を通る', () => {
    expect(validateCase(POWER_CASE)).toEqual([]);
  });
  test('壊れたテンプレートは棄却される（人物が時間内に移動できない）', () => {
    const bad = JSON.parse(JSON.stringify(POWER_CASE));
    bad.whereabouts.push({ crew: 'kei', sec: 2 * 3600 + 5 * 60 + 10, room: 'powerroom' });
    expect(validateCase(bad).length).toBeGreaterThan(0);
    expect(() => generateCase(1, bad)).toThrow();
  });
  test('ある方針の組み合わせで、必須証拠が予備電源の枯渇前に揃う', () => {
    const r = checkObtainable(1);
    expect(r.missing).toEqual([]);
    expect(r.state.world.backupCharge).toBeGreaterThan(0);
  });
});

describe('再現性', () => {
  test('同じシードと操作列なら同じ結果になる', () => {
    const a = started(99);
    applyAction(a, { type: 'setPolicy', crew: 'mina', policy: { kind: 'restorePower' } });
    applyAction(a, { type: 'setPolicy', crew: 'kei', policy: { kind: 'investigate', room: 'bridge' } });
    run(a, 120);
    applyAction(a, { type: 'talk', crew: 'sora' });
    applyAction(a, { type: 'setPolicy', crew: 'duran', policy: { kind: 'investigate', room: 'engineering' } });
    run(a, 200);
    applyAction(a, { type: 'submit', hyp: RIGHT });
    run(a, 150);
    const b = replay(99, a.actions, a.world.tick, (sd) => generateCase(sd));
    expect(comparable(b)).toBe(comparable(a));
  });
});

describe('情報の秘匿', () => {
  test('通信断の乗員の位置・行動は ViewModel に出ない', () => {
    const s = started();
    applyAction(s, { type: 'setPolicy', crew: 'mina', policy: { kind: 'restorePower' } });
    run(s, 80); // 配電室で点検中
    const mina = s.crew.find((c) => c.id === 'mina')!;
    expect(mina.room).toBe('powerroom');
    const v = buildView(s);
    const cv = v.crew.find((c) => c.id === 'mina')!;
    expect(cv.visible).toBe(false);
    expect(cv.room).toBeNull();
    expect(cv.activity).toBeNull();
    expect(cv.pos).toBeNull();
    const json = JSON.stringify({ ...v, result: null });
    expect(json).not.toContain(mina.task.label);
    // 本人が見つけた証拠も、報告が届くまではプレイヤーの手元にない
    expect(mina.mind.known).toContain('F_leak');
    expect(v.evidence.map((e) => e.id)).not.toContain('coolant_trace');
    // 真相の文章は事件中の ViewModel に含まれない
    for (const e of s.truth.events) expect(json).not.toContain(e.text);
  });
  test('通信断中の出来事は通信回復後に理由つきで届く', () => {
    const s = started();
    applyAction(s, { type: 'setPolicy', crew: 'mina', policy: { kind: 'restorePower' } });
    run(s, 300);
    const delayed = s.player.log.filter((l) => l.delayed && l.crew === 'mina');
    expect(delayed.length).toBeGreaterThan(3);
    expect(delayed.some((l) => l.reason)).toBe(true);
    expect(s.player.evidence).toContain('coolant_trace');
  });
  test('通信断の乗員への指示は保留され、勝手に適用されない', () => {
    const s = started();
    applyAction(s, { type: 'setPolicy', crew: 'mina', policy: { kind: 'restorePower' } });
    run(s, 60);
    applyAction(s, { type: 'setPolicy', crew: 'mina', policy: { kind: 'standby' } });
    const m = s.crew.find((c) => c.id === 'mina')!;
    expect(m.policy.kind).toBe('restorePower');
    expect(m.pendingPolicy?.kind).toBe('standby');
    run(s, 300);
    expect(s.player.pendingPolicyNotice).toContain('mina');
    expect(m.policy.kind).toBe('restorePower');
  });
  test('乗員AIは真相を読み込まない（import を静的に確認）', () => {
    const src = readFileSync('src/ai/crew_ai.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\.\/(gen|sim|judge)/);
    expect(src).not.toMatch(/Truth|truth/);
  });
  test('画面側は ViewModel と進行役だけを通す', () => {
    for (const f of readdirSync('src/ui')) {
      if (f === 'game.ts') continue;
      const src = readFileSync('src/ui/' + f, 'utf8');
      expect(src, f).not.toMatch(/from '\.\.\/(gen|judge)\//);
      expect(src, f).not.toMatch(/from '\.\.\/sim\/sim'/);
    }
  });
});

describe('対処の違いが結果に出る', () => {
  const base = () => {
    const s = started(5);
    applyAction(s, { type: 'setPolicy', crew: 'kei', policy: { kind: 'investigate', room: 'bridge' } });
    return s;
  };
  test('原因を残したまま再投入すると発火し、乗員が負傷する', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...RIGHT, plan: 'restartNow' } });
    run(s, 120);
    expect(s.world.fire || s.world.panelDamaged).toBeTruthy();
    expect(s.world.mainPower).toBe(false);
    expect(Math.min(...s.crew.map((c) => c.health))).toBeLessThan(80);
  });
  test('乾燥だけでは一時的に復旧し、漏れが続いて再遮断する', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...RIGHT, cause: 'overload', plan: 'dryRestart' } });
    let restored = false;
    for (let i = 0; i < 400; i++) { step(s); if (s.world.mainPower) restored = true; }
    expect(restored).toBe(true);
    expect(s.world.mainPower).toBe(false);
    expect(s.player.log.some((l) => l.text.includes('再び遮断'))).toBe(true);
  });
  test('正しい原因で封止→乾燥→再投入すると危機が去る', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: RIGHT });
    run(s, 300);
    expect(s.world.resolved).toBe(true);
    expect(s.world.o2).toBe(100);
  });
  test('原因を取り違えると封止されず、同じ作戦でも再遮断する', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...RIGHT, cause: 'panel_sabotage' } });
    for (let i = 0; i < 400; i++) step(s);
    expect(s.world.leakSealed).toBe(false);
    expect(s.world.resolved).toBe(false);
  });
  test('何もしなければ予備電源が尽き、酸素が減り、乗員が死ぬ', () => {
    const s = started(3);
    run(s, 6 * 60 * 3);
    expect(s.world.backupCharge).toBe(0);
    expect(s.world.o2).toBeLessThan(10);
    expect(s.crew.some((c) => !c.alive)).toBe(true);
  });
  test('予備セル交換で時間が延び、外したセルが証拠になる', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...RIGHT, plan: 'swapCell' } });
    run(s, 250);
    expect(s.world.cellCap).toBe(100);
    expect(s.player.evidence).toContain('old_cell');
  });
});

describe('判定', () => {
  test('部分評価（事件中は表示しない）', () => {
    const s = started();
    expect(judge(s, RIGHT).total).toBe(100);
    const wrong = judge(s, { ...RIGHT, category: 'sabotage', cause: 'panel_sabotage', person: { crew: 'kei', role: 'sabotage' }, order: ['o_trip', 'o_flicker', 'o_door', 'o_pressure'] });
    expect(wrong.parts.cause).toBe(0);
    expect(wrong.parts.order).toBe(0);
    expect(wrong.parts.plan).toBe(1);
    expect(buildView(s).result).toBeNull();
  });
  test('3回目の提出で事件が確定し、見落とした手がかりが出る', () => {
    const s = started();
    for (let i = 0; i < 3; i++) { applyAction(s, { type: 'submit', hyp: { ...RIGHT, plan: 'shed', cause: 'overload' } }); run(s, 5); }
    run(s, 300);
    expect(s.phase).toBe('ended');
    const r = evaluateCase(s);
    expect(r.grade).not.toBe('真相解明');
    expect(r.missed.length).toBeGreaterThan(0);
    expect(r.truthLines).toBeNull();
  });
  test('ドゥランは在庫記録を伏せ、突きつけると告白する', () => {
    const s = started();
    applyAction(s, { type: 'setPolicy', crew: 'duran', policy: { kind: 'investigate', room: 'cargo' } });
    run(s, 100);
    const d = s.crew.find((c) => c.id === 'duran')!;
    expect(d.mind.known).toContain('F_not_replaced');
    expect(s.player.evidence).not.toContain('inventory');
    s.player.evidence.push('inventory');
    applyAction(s, { type: 'confront', crew: 'duran', evidence: 'inventory' });
    expect(s.player.evidence).toContain('duran_confess');
  });
});
