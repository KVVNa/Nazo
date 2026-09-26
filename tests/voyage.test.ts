import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/sim/sim';
import { runSolve } from '../src/gen/validate_dynamic';
import { caseOf } from '../src/gen/registry';
import { NAMES } from '../src/gen/crewpool';
import { CREW8, PROFILES } from '../src/voyage/crew8';
import { CAST, INTROS, PROLOGUE, STAGES, TALKS, DINNER_CLOSE, DINNER_OPEN } from '../src/voyage/story';
import { arrivalLines, crewEpilogue, outcomeLines, sendBlocked } from '../src/voyage/ending';
import {
  applyCaseResult, endCtx, newVoyage, nextTalk, prepareCase, scoreVoyage, setConfined, talk, treat, vc, leaveInterlude, type VoyageState,
} from '../src/voyage/voyage';
import type { GameState } from '../src/core/types';

// 正しい方針で事件を解いて終える（プレイヤーの代わり）
function solveAndEnd(s: GameState): GameState {
  const r = runSolve(s.templateId, s.genSeed, s.fixed);
  const st = r.state;
  if (st.phase !== 'ended') applyAction(st, { type: 'abandon' });
  return st;
}

function playVoyage(seed: number, beforeCase?: (v: VoyageState) => void): VoyageState {
  const v = newVoyage(seed);
  v.phase = 'stage';
  for (let i = 0; i < 5; i++) {
    beforeCase?.(v);
    const { state } = prepareCase(v);
    v.phase = 'case';
    const end = solveAndEnd(state);
    applyCaseResult(v, end, `test-${i}`);
    if ((v.phase as string) === 'interlude') leaveInterlude(v);
    if ((v.phase as string) !== 'stage') break;
  }
  return v;
}

describe('航海モード', () => {
  test('5話を通して遊べ、関係人物は人物像どおりに選ばれる', () => {
    for (const seed of [1, 2, 3]) {
      const v = playVoyage(seed);
      expect(v.results.length).toBe(5);
      expect(v.phase).toBe('ending');
      v.results.forEach((r, i) => {
        expect(STAGES[i].pool).toContain(r.templateId);
        expect(r.grade).toBe('真相解明');
        if (CAST[r.templateId]) expect(r.responsible).toBe(CAST[r.templateId]);
      });
      expect(v.crew.every((c) => c.alive)).toBe(true);
    }
  }, 120000);

  test('同じ航海番号なら同じ事件の並びになる', () => {
    const a = newVoyage(77); a.phase = 'stage';
    const b = newVoyage(77); b.phase = 'stage';
    const sa = prepareCase(a).state, sb = prepareCase(b).state;
    expect(sa.templateId).toBe(sb.templateId);
    expect(sa.genSeed).toBe(sb.genSeed);
    expect(JSON.stringify(sa.crew.map((c) => c.room))).toBe(JSON.stringify(sb.crew.map((c) => c.room)));
  });

  test('死んだ乗員は次の事件に出ず、欠けた役目は代役が務める', () => {
    const v = playVoyage(5, (v) => {
      if (v.stage === 1) { vc(v, 'dmitri').alive = false; vc(v, 'aisha').alive = false; }
    });
    expect(v.results.length).toBe(5);
    for (const r of v.results.slice(1)) expect(r.grade).toBe('真相解明');
    // 代役の肩書きが付く
    const v2 = newVoyage(9); v2.phase = 'stage'; v2.stage = 2;
    vc(v2, 'dmitri').alive = false; vc(v2, 'aisha').alive = false;
    const s = prepareCase(v2).state;
    expect(s.crew.some((c) => c.id === 'dmitri' || c.id === 'aisha')).toBe(false);
    expect(s.crew.some((c) => c.roleId === 'engineer' && c.role.includes('機関代行'))).toBe(true);
    expect(s.crew.some((c) => c.roleId === 'medic' && c.role.includes('医務代行'))).toBe(true);
    expect(s.crew.length).toBe(6);
  }, 120000);

  test('健康と信頼は次の事件へ持ち越す', () => {
    const v = newVoyage(11); v.phase = 'stage';
    vc(v, 'haru').health = 40; vc(v, 'haru').trust = 80;
    const s = prepareCase(v).state;
    const h = s.crew.find((c) => c.id === 'haru')!;
    expect(h.health).toBeLessThanOrEqual(40);
    expect(h.trust).toBe(80);
  });

  test('会話で手を打つと、その乗員の事件は起きない', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const v = newVoyage(seed); v.phase = 'stage'; v.stage = 4;
      v.facts.push('P_niko', 'P_tomas');
      const s = prepareCase(v).state;
      expect(['false_fire', 'plot']).toContain(s.templateId);
      if (s.templateId === 'plot') expect(['niko', 'tomas']).not.toContain(s.truth.responsible!.crew);
      expect(v.pendingCase?.note).toMatch(/ニコ|トマス/);
    }
    // 関係人物が死んでいる型も選ばない
    const v = newVoyage(3); v.phase = 'stage'; v.stage = 3;
    vc(v, 'lin').alive = false; vc(v, 'haru').alive = false;
    const s = prepareCase(v).state;
    expect(['creak', 'distress']).not.toContain(s.templateId);
  }, 60000);

  test('会話は信頼と時期で開き、隠し事が分かる', () => {
    const v = newVoyage(1);
    v.phase = 'interlude'; v.slots = 3;
    // まだ事件を終えていない → 取り込み中（時間は使わない）
    expect(nextTalk(v, 'elena').guarded).toBe(true);
    talk(v, 'elena', 0);
    expect(v.slots).toBe(3);
    v.results.push({ stage: 0, templateId: 'x', title: '', grade: '', code: '', responsible: null, deaths: [] });
    talk(v, 'elena', 1);
    expect(v.slots).toBe(2);
    expect(vc(v, 'elena').talks).toBe(1);
    talk(v, 'elena', 0); // 同じ合間に二度は話せない
    expect(vc(v, 'elena').talks).toBe(1);
    // 3つ目は事件を3つ終え、信頼が高いときだけ
    v.results.push(v.results[0], v.results[0]);
    vc(v, 'elena').talks = 2; vc(v, 'elena').trust = 70; v.talkedNow = []; v.slots = 3;
    talk(v, 'elena', 0);
    expect(v.facts).toContain('S_model');
    vc(v, 'niko').talks = 2; vc(v, 'niko').trust = 70;
    talk(v, 'niko', 0);
    expect(v.facts).toContain('S_debt');
    expect(v.facts).toContain('P_niko');
  });

  test('手当てと拘束', () => {
    const v = newVoyage(1); v.phase = 'interlude'; v.slots = 3;
    vc(v, 'lin').health = 30;
    treat(v);
    expect(vc(v, 'lin').health).toBe(75);
    expect(v.slots).toBe(2);
    expect(setConfined(v, 'niko', true)).toBe(true);
    expect(setConfined(v, 'lin', true)).toBe(true);
    expect(setConfined(v, 'tomas', true)).toBe(true);
    expect(setConfined(v, 'hahn', true)).toBe(false); // 自由な乗員が5人を切る
  });

  test('報告書：命令書を知らず通信士の信頼も低いと、回線を止められる', () => {
    const v = newVoyage(1);
    vc(v, 'niko').trust = 40;
    expect(sendBlocked(endCtx(v)).blocked).toBe(true);
    v.facts.push('S_order');
    expect(sendBlocked(endCtx(v)).blocked).toBe(false);
    const w = newVoyage(1);
    vc(w, 'hahn').alive = false;
    expect(sendBlocked(endCtx(w)).blocked).toBe(false);
    const full = { ...v, results: Array(5).fill({ grade: '真相解明' }) } as VoyageState;
    expect(scoreVoyage(full, 'truth', ['deaths', 'model'], false).rank).toBe('S');
    expect(scoreVoyage(full, 'wait', [], false).score).toBeLessThan(scoreVoyage(full, 'truth', [], false).score);
  });

  test('文章に出てくる名前は固定乗員（と入植地のカリム）だけ。時刻の書式を使わない', () => {
    const texts: string[] = [];
    const push = (t: string) => texts.push(t);
    PROLOGUE.forEach((p) => p.lines.forEach((l) => push(l.text)));
    [...DINNER_OPEN, ...DINNER_CLOSE].forEach((l) => push(l.text));
    INTROS.forEach((i) => { push(i.line); i.choices.forEach((c) => { push(c.label); c.reply.forEach((l) => push(l.text)); }); });
    Object.values(TALKS).flat().forEach((t) => { t.lines.forEach((l) => push(l.text)); t.choices?.forEach((c) => { push(c.label); c.reply.forEach((l) => push(l.text)); }); });
    STAGES.forEach((s) => s.intro.forEach(push));
    PROFILES.forEach((p) => { push(p.reason); push(p.speech); push(p.secretText); });
    const v = newVoyage(1);
    arrivalLines(endCtx(v)).forEach((l) => push(l.text));
    for (const ch of ['truth', 'conditional', 'wait'] as const) outcomeLines(ch, ['deaths', 'model', 'order'], false).forEach((l) => push(l.text));
    CREW8.forEach((c) => push(crewEpilogue(c.id, endCtx(v), 'truth', true)));
    const kata = /[ァ-ヶー]/;
    for (const t of texts) {
      expect(t).not.toMatch(/\d{1,2}:\d{2}/);
      for (const n of NAMES) {
        let i = t.indexOf(n);
        while (i >= 0) {
          const ok = kata.test(t[i - 1] ?? '') || kata.test(t[i + n.length] ?? '');
          expect(ok, `「${t}」に固定乗員でない名前 ${n}`).toBe(true);
          i = t.indexOf(n, i + 1);
        }
      }
    }
    // 固定乗員の話者IDは実在する
    for (const l of Object.values(TALKS).flat().flatMap((t) => t.lines)) expect(['narr', 'captain', 'radio', ...CREW8.map((c) => c.id)]).toContain(l.who);
  });

  test('航海の事件は、固定乗員の差し替え文を使う（寄港は到着に言い換える）', () => {
    const v = newVoyage(2); v.phase = 'stage'; v.stage = 4;
    v.facts.push('P_niko', 'P_tomas');
    const s = prepareCase(v).state;
    const def = caseOf(s);
    expect(def.truth.events.find((e) => e.id === 'ev_motive')!.text).toMatch(/校正試料/);
    // 航海の事件の文章には「寄港」「太陽」が出てこない
    for (const seed of [1, 2, 3]) {
      const w = newVoyage(seed); w.phase = 'stage';
      for (let i = 0; i < 5; i++) {
        w.stage = i;
        const st = prepareCase(w).state;
        const d = caseOf(st);
        const text = JSON.stringify({ b: d.briefing, t: d.truth, c: d.causeOptions, p: d.plans.map((p) => p.label) });
        expect(text, st.templateId).not.toMatch(/寄港|太陽|運航会社/);
      }
    }
  }, 60000);
});

describe('組み立て式の工作事件', () => {
  test('毎回、犯人・目的・手口が変わり、必須証拠だけで犯人が一人に絞れる', async () => {
    const { generateWithReport } = await import('../src/gen/generate');
    const { validateStatic } = await import('../src/gen/validate');
    const seen = { culprit: new Set<string>(), title: new Set<string>(), cause: new Set<string>() };
    for (let i = 0; i < 30; i++) {
      const r = generateWithReport(500 + i, 'plot');
      expect(validateStatic('plot', r.state.genSeed)).toEqual([]);
      const d = caseOf(r.state);
      expect(d.identify?.length).toBeGreaterThan(1);
      seen.culprit.add(r.state.crew.find((c) => c.id === r.state.truth.responsible!.crew)!.roleId);
      seen.title.add(r.state.truth.title);
      seen.cause.add(d.causeOptions.find((c) => c.id === 'plot_true')!.label);
    }
    expect(seen.culprit.size).toBeGreaterThanOrEqual(4);
    expect(seen.title.size).toBeGreaterThanOrEqual(3);
    expect(seen.cause.size).toBeGreaterThanOrEqual(6);
  }, 120000);

  test('航海の乗員は誰でも犯人になりえ、動機はその人の隠し事から来る', async () => {
    const { generateWithReport } = await import('../src/gen/generate');
    const { LINES } = await import('../src/voyage/crew8');
    for (const c of CREW8) {
      const fixed = { crew: CREW8.map((x) => ({ ...x, lines: LINES[x.id] })), cast: c.id };
      const r = generateWithReport(40, 'plot', 40, fixed);
      expect(r.state.truth.responsible!.crew).toBe(c.id);
      expect([LINES[c.id]['plot.motive'], LINES[c.id]['plot2.motive']]).toContain(caseOf(r.state).truth.events[0].text);
    }
  }, 60000);

  test('会話で手を打った乗員、隠し事がもう分かった乗員は犯人にならない', async () => {
    const { plotCandidates } = await import('../src/voyage/voyage');
    const v = newVoyage(1);
    v.facts.push('P_niko', 'S_model');
    const cs = plotCandidates(v);
    expect(cs).not.toContain('niko');
    expect(cs).not.toContain('elena');
    expect(cs).toContain('hahn');
  });

  test('解いた事件の犯人の隠し事が、航海で分かったことになる', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const v = newVoyage(seed); v.phase = 'stage'; v.stage = 4;
      v.facts.push('P_niko', 'P_tomas');
      const { state } = prepareCase(v);
      if (state.templateId !== 'plot') continue;
      const end = solveAndEnd(state);
      applyCaseResult(v, end, 'x');
      const resp = state.truth.responsible!.crew;
      expect(v.facts).toContain(PROFILES.find((p) => p.id === resp)!.secretFact);
      return;
    }
  }, 60000);
});

describe('事件の合間', () => {
  test('船体の傷みは次の事件に持ち越し、修理で直る。部品がなければ直せない', async () => {
    const { repair, rest } = await import('../src/voyage/voyage');
    const v = newVoyage(3); v.phase = 'stage';
    v.hull = 55;
    const s = prepareCase(v).state;
    expect(s.world.hull).toBe(55);
    v.phase = 'interlude'; v.slots = 3;
    expect(repair(v)).toBe(25);
    expect(v.hull).toBe(80);
    expect(v.parts).toBe(2);
    expect(repair(v)).toBe(0); // 1回の合間に1度だけ
    const w = newVoyage(3); w.phase = 'interlude'; w.slots = 3; w.hull = 50; w.parts = 0;
    expect(repair(w)).toBe(0);
    vc(w, 'lin').health = 50;
    expect(rest(w)).toBe(true);
    expect(vc(w, 'lin').health).toBe(60);
    expect(w.slots).toBe(2);
  });

  test('医療品がなければ手当てできない', () => {
    const v = newVoyage(1); v.phase = 'interlude'; v.slots = 3; v.meds = 0;
    vc(v, 'lin').health = 30;
    expect(treat(v)).toEqual([]);
    expect(vc(v, 'lin').health).toBe(30);
  });

  test('合間の一場面：死者を悼む、関係人物への反応、何もなければ船の暮らし', async () => {
    const { interludeScene } = await import('../src/voyage/voyage');
    const v = newVoyage(1);
    v.results.push({ stage: 0, templateId: 'x', title: '', grade: '', code: '', responsible: null, deaths: ['haru'] });
    vc(v, 'haru').alive = false;
    expect(interludeScene(v)[0]).toEqual({ who: 'dmitri', text: expect.stringContaining('計算') });
    v.results.push({ stage: 1, templateId: 'x', title: '', grade: '', code: '', responsible: 'lin', deaths: [] });
    expect(interludeScene(v).map((l) => l.who)).toContain('niko');
    v.results.push({ stage: 2, templateId: 'x', title: '', grade: '', code: '', responsible: null, deaths: [] });
    expect(interludeScene(v).length).toBeGreaterThan(0);
  });
});
