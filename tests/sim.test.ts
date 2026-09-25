import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateCase, generateWithReport, mixSeed, newState } from '../src/gen/generate';
import { validateStatic } from '../src/gen/validate';
import { validateDynamic, runSolve } from '../src/gen/validate_dynamic';
import { TEMPLATES, caseOf } from '../src/gen/registry';
import { applyAction, replay, step } from '../src/sim/sim';
import { commOk } from '../src/sim/ship';
import { buildView } from '../src/view/view';
import { evaluateCase, judge } from '../src/judge/judge';
import { hashState } from '../src/core/rng';
import type { GameState } from '../src/core/types';

function run(s: GameState, ticks: number) { for (let i = 0; i < ticks && s.phase === 'play'; i++) step(s); }
const comparable = (s: GameState) => hashState({ ...s, player: { ...s.player, board: null, unread: 0 } });
const started = (tid: string, seed = 1) => { const s = generateCase(seed, tid); applyAction(s, { type: 'begin' }); return s; };

describe('事件生成と検証器（全テンプレート）', () => {
  test('12種の事件がある（事故・工作・未知の現象が4種ずつ）', () => {
    expect(TEMPLATES.length).toBe(12);
    for (const cat of ['accident', 'sabotage', 'phenomenon']) expect(TEMPLATES.filter((t) => t.category === cat).length).toBe(4);
  });
  for (const t of TEMPLATES) {
    test(`${t.title}：25シードすべて生成でき、初回の採用率が8割以上`, () => {
      let firstTry = 0;
      for (let i = 0; i < 25; i++) {
        const r = generateWithReport(1000 + i, t.id);
        if (r.attempts === 1) firstTry++;
        // 採用された事件は静的検証（名前・時刻・区画の辻褄を含む）と動的検証を通っている
        expect(validateStatic(t.id, r.state.genSeed)).toEqual([]);
      }
      expect(firstTry).toBeGreaterThanOrEqual(20);
    });
    test(`${t.title}：正しい仮説と作戦で危機が解け、事件結果が「真相解明」になる`, () => {
      const g = generateCase(7, t.id).genSeed;
      const r = runSolve(t.id, g);
      expect(r.gotAllAt).not.toBeNull();
      expect(r.resolvedAt).not.toBeNull();
      const s = r.state;
      applyAction(s, { type: 'abandon' });
      expect(evaluateCase(s).grade).toBe('真相解明');
      expect(s.crew.every((c) => c.alive)).toBe(true);
    });
  }
  test('辻褄の合わない事件は棄却される（名前・時刻・移動時間）', () => {
    const g = generateCase(3, 'lost_power').genSeed;
    const def = caseOf(newState('lost_power', g));
    const ev = def.truth.evidence.find((e) => e.id === 'door_log')!;
    const saved = ev.text;
    ev.text = '03:59 貨物室ドア開閉（認証：ゾーイ）。';
    const problems = validateStatic('lost_power', g);
    ev.text = saved;
    expect(problems.some((p) => p.includes('時刻'))).toBe(true);
    const saved2 = ev.text;
    ev.text = saved.replace(/認証：[^）]+/, '認証：ルカ');
    const crewNames = newState('lost_power', g).crew.map((c) => c.name);
    const p2 = validateStatic('lost_power', g);
    ev.text = saved2;
    if (!crewNames.includes('ルカ')) expect(p2.some((p) => p.includes('ルカ'))).toBe(true);
  });
  test('乗員と部屋割りがシードで変わる', () => {
    const a = generateCase(11, 'o2_drain'), b = generateCase(12, 'o2_drain');
    const sig = (s: GameState) => s.crew.map((c) => c.name + c.role).join() + s.ship.rooms.map((r) => r.id).join();
    expect(sig(a)).not.toBe(sig(b));
  });
});

describe('再現性', () => {
  test('同じシードと操作列なら同じ結果になる', () => {
    const a = started('nav_tamper', 99);
    const def = caseOf(a);
    const [c0, c1] = Object.keys(def.solve.policies);
    applyAction(a, { type: 'setPolicy', crew: c0, policy: def.solve.policies[c0][0] });
    run(a, 120);
    applyAction(a, { type: 'talk', crew: a.crew[2].id });
    applyAction(a, { type: 'setPolicy', crew: c1, policy: def.solve.policies[c1][0] });
    run(a, 200);
    applyAction(a, { type: 'submit', hyp: def.solve.hyp });
    run(a, 150);
    const b = replay(() => newState(a.templateId, a.genSeed, a.seed), a.actions, a.world.tick);
    expect(comparable(b)).toBe(comparable(a));
  });
});

describe('情報の秘匿', () => {
  for (const t of TEMPLATES) {
    test(`${t.title}：通信断の乗員の位置・行動は画面に出ず、真相の文章も出ない`, () => {
      const s = started(t.id, 5);
      const def = caseOf(s);
      for (const [cid, pl] of Object.entries(def.solve.policies)) applyAction(s, { type: 'setPolicy', crew: cid, policy: pl[0] });
      for (let i = 0; i < 240 && s.phase === 'play'; i++) {
        step(s);
        if (i % 20) continue;
        const v = buildView(s);
        for (const c of s.crew) {
          const cv = v.crew.find((x) => x.id === c.id)!;
          if (!commOk(s.ship, s.world, c.room)) {
            expect(cv.visible).toBe(false);
            expect(cv.room).toBeNull();
            expect(cv.activity).toBeNull();
            expect(cv.pos).toBeNull();
          }
        }
        const json = JSON.stringify({ ...v, result: null });
        for (const e of s.truth.events) expect(json).not.toContain(e.text);
        // 手元にない証拠の本文は出ない
        for (const e of s.truth.evidence) if (!s.player.evidence.includes(e.id) && e.text.length > 12) expect(json).not.toContain(e.text);
      }
    });
  }
  test('通信断中の出来事は通信回復後に理由つきで届く', () => {
    const s = started('lost_power', 2);
    const def = caseOf(s);
    const fixer = Object.entries(def.solve.policies).find(([, p]) => p[0].kind === 'respond')![0];
    applyAction(s, { type: 'setPolicy', crew: fixer, policy: { kind: 'respond' } });
    run(s, 400);
    const delayed = s.player.log.filter((l) => l.delayed && l.crew === fixer);
    expect(delayed.length).toBeGreaterThan(2);
    expect(s.player.log.some((l) => l.crew === fixer && l.reason)).toBe(true);
  });
  test('乗員AIは真相や事件定義を読み込まない（import を静的に確認）', () => {
    const src = readFileSync('src/ai/crew_ai.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\.\/(gen|sim|judge|cases)/);
    expect(src).not.toMatch(/Truth|truth|CaseDef/);
  });
  test('画面側は ViewModel と進行役だけを通す', () => {
    for (const f of readdirSync('src/ui')) {
      if (f === 'game.ts') continue;
      const src = readFileSync('src/ui/' + f, 'utf8');
      expect(src, f).not.toMatch(/from '\.\.\/(gen|judge|cases)\//);
      expect(src, f).not.toMatch(/from '\.\.\/sim\/sim'/);
    }
  });
});

describe('対処の違いが結果に出る（消えた電力）', () => {
  const base = () => started('lost_power', 5);
  const hyp = (s: GameState) => caseOf(s).solve.hyp;
  test('原因を残したまま再投入すると発火し、実行者が負傷する', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...hyp(s), plan: 'restartNow' } });
    run(s, 120);
    expect(s.world.vars.damaged).toBe(1);
    expect(s.world.vars.main).toBe(0);
    expect(Math.min(...s.crew.map((c) => c.health))).toBeLessThan(80);
  });
  test('乾燥だけでは一時的に復旧し、漏れが続いて再遮断する', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...hyp(s), cause: 'overload', plan: 'dryRestart' } });
    let restored = false;
    for (let i = 0; i < 400; i++) { step(s); if (s.world.vars.main) restored = true; }
    expect(restored).toBe(true);
    expect(s.player.log.some((l) => l.text.includes('再び遮断'))).toBe(true);
  });
  test('原因を取り違えると封止されず、同じ作戦でも解決しない', () => {
    const s = base();
    applyAction(s, { type: 'submit', hyp: { ...hyp(s), cause: 'panel_sabotage' } });
    for (let i = 0; i < 400; i++) step(s);
    expect(s.world.vars.sealed).toBe(0);
    expect(s.world.resolved).toBe(false);
  });
  test('何もしなければ予備電源が尽き、酸素が減り、乗員が死ぬ', () => {
    const s = base();
    run(s, 6 * 60 * 3);
    expect(s.world.vars.backup).toBe(0);
    expect(s.crew.some((c) => !c.alive)).toBe(true);
  });
});

describe('判定', () => {
  test('部分評価（事件中は表示しない）', () => {
    const s = started('lost_power', 4);
    const h = caseOf(s).solve.hyp;
    expect(judge(s, h).total).toBe(100);
    const wrong = judge(s, { ...h, category: 'sabotage', cause: 'panel_sabotage', person: { crew: s.crew[0].id, role: 'sabotage' }, order: [...h.order].reverse() });
    expect(wrong.parts.cause).toBe(0);
    expect(wrong.parts.order).toBe(0);
    expect(buildView(s).result).toBeNull();
  });
  test('3回目の提出で事件が確定し、見落とした手がかりが出る', () => {
    const s = started('food', 4);
    const h = caseOf(s).solve.hyp;
    for (let i = 0; i < 3; i++) { applyAction(s, { type: 'submit', hyp: { ...h, cause: 'water_contam', plan: 'rehydrate' } }); run(s, 5); }
    run(s, 400);
    expect(s.phase).toBe('ended');
    const r = evaluateCase(s);
    expect(r.grade).not.toBe('真相解明');
    expect(r.missed.length).toBeGreaterThan(0);
    expect(r.truthLines).toBeNull();
  });
});

describe('見取り図の描画位置', () => {
  test('移動中の乗員が船外を通らない', () => {
    for (const tid of ['lost_power', 'creak', 'painkiller']) {
      const s = started(tid, 11);
      s.world.commDown = [];
      const inside = (x: number, y: number) =>
        s.ship.rooms.some((r) => x >= r.rect[0] - 0.05 && x <= r.rect[0] + r.rect[2] + 0.05 && y >= r.rect[1] - 0.05 && y <= r.rect[1] + r.rect[3] + 0.05)
        || (x >= 5.4 && x <= 6.6 && y >= 9.9 && y <= 11.1);
      const rooms = s.ship.rooms.map((r) => r.id);
      s.crew.forEach((c, i) => applyAction(s, { type: 'setPolicy', crew: c.id, policy: { kind: 'guard', room: rooms[(i * 3 + 2) % rooms.length] } }));
      for (let i = 0; i < 150; i++) {
        step(s);
        s.world.commDown = [];
        for (const c of buildView(s).crew) if (c.pos) expect(inside(c.pos.x, c.pos.y), `${tid} ${c.name} ${JSON.stringify(c.pos)}`).toBe(true);
      }
    }
  });
});

describe('検証器の動的チェック', () => {
  test('採用シードは放置で解決せず、解き筋では揃う', () => {
    for (const t of TEMPLATES) expect(validateDynamic(t.id, generateCase(21, t.id).genSeed)).toEqual([]);
  });
  test('mixSeed は重なりにくい', () => {
    const set = new Set(Array.from({ length: 1000 }, (_, i) => mixSeed(i, 0)));
    expect(set.size).toBe(1000);
  });
});
