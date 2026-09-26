// 事故＋規則違反の隠し事：微小デブリが外壁を貫通。穴は規則違反で積んだ木箱の陰に隠れている。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';

export const PRESSURE: CaseTemplate = {
  id: 'pressure',
  title: '気圧が下がる',
  category: 'accident',
  needSide: ['cargo'],
  needLower: ['airlock'],
  build(g) {
    const E = g.byRole('engineer')!;
    const R = find(g, (c) => ['cargo', 'cook', 'security'].includes(c.roleId), [E], g.cast);
    const S = find(g, () => true, [E, R]);
    const W = find(g, () => true, [E, R, S]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 3), g.int(0, 55));
    const start = T0 + g.int(50, 70) * 60;
    const band0 = T0 - g.int(20, 30) * 60;
    const grp = g.groupOf('cargo');
    const cargoName = g.rn('cargo');
    const wRoom = g.pick(['corridor', ...['quarters', 'galley', 'lab'].filter((r) => g.has(r) && g.groupOf(r) !== grp)]);
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [W.id]: { room: wRoom, known: ['F_knock'] },
      [R.id]: { room: 'corridor', known: ['F_blocked'], hides: ['F_blocked'] },
      [S.id]: { room: 'bridge', known: ['F_s_belief'] },
    };
    placeRest(g, crewInit, ['quarters', 'medbay', 'lab', 'galley', 'bridge', 'engineering']);
    const down = [grp];
    const live = inComm(g, crewInit, down);
    const fixer = bestLive(g, crewInit, down, 'mech', [R]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, R]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。船内の気圧がゆっくり下がり続けている。`,
        `${GROUP_NAME[grp]}系統の通信中継器が応答せず、${cargoName}のある側と連絡が取れない。`,
        '急な減圧ではないが、このままでは数時間で体に影響が出る。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 船内気圧の低下が警報値に達した。${GROUP_NAME[grp]}系統の中継器が応答しない。`,
      initialEvidence: ['press_alarm'],
      truth: {
        cause: 'micrometeoroid',
        events: [
          { id: 'ev_stack', sec: T0 - 3 * 86400, room: 'cargo', actor: null, text: `3日前、${R.name}は外壁の点検口の前に木箱を6段積んだ。規則違反で、点検口が見えなくなった。`, causes: ['ev_hidden'] },
          { id: 'ev_band', sec: band0, room: 'bridge', actor: null, text: `${T(band0)}、船は微小デブリの薄い帯に入った（予報の警戒度は低かった）。`, causes: ['ev_hit'] },
          { id: 'ev_hit', sec: T0, room: 'cargo', actor: null, text: `${T(T0)}、直径1mmに満たない粒子が${cargoName}の外壁を貫通した。`, causes: ['ev_leak', 'ev_cable'] },
          { id: 'ev_cable', sec: T0, room: 'cargo', actor: null, text: `衝撃で、${GROUP_NAME[grp]}系統の中継器の配線が切れた。`, causes: [] },
          { id: 'ev_hidden', sec: T0, room: 'cargo', actor: null, text: '穴は木箱の陰にあり、音も見た目も隠れていた。', causes: [] },
          { id: 'ev_leak', sec: T0 + 60, room: 'cargo', actor: null, text: '小さな穴から空気が漏れ始め、船内の気圧が毎分0.2%ずつ下がった。', causes: ['ev_alarm'] },
          { id: 'ev_alarm', sec: start - 3 * 60, room: 'bridge', actor: null, text: `${T(start - 180)}、気圧の低下が警報値に達した。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_stack', label: '点検口の前に木箱が積まれる', sec: T0 - 3 * 86400 },
          { id: 'o_band', label: '微小デブリの帯に入る', sec: band0 },
          { id: 'o_hit', label: '外壁が小さな衝撃を受ける', sec: T0 },
          { id: 'o_alarm', label: '気圧低下が警報値に達する', sec: start - 3 * 60 },
        ],
        responsible: { crew: R.id, role: 'falsified' },
        evidence: [
          ev('press_alarm', '気圧の警報', `${T(start - 180)} 船内気圧が警報値を下回った。急減圧ではない。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('press_log', '気圧の記録', `${T(T0 + 60)}ごろから、船内気圧が毎分0.2%ずつ一定の速さで下がっている。`, { room: 'bridge', work: 3, fact: 'F_press', key: true, where: '司令室の環境ログ' }),
          ev('impact_log', '船体センサーの記録', `${T(T0)} ${cargoName}付近の外壁で微小な衝撃を1回記録。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_impact', key: true, where: '司令室の船体モニタ' }),
          ev('debris_fc', '航路予報', `${T(band0)}〜${T(T0 + 15 * 60)} 微小デブリの薄い帯を通過（警戒度：低）。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_band', where: '司令室の航路予報' }),
          ev('hiss', '空気の音', '奥の木箱の山の裏から、かすかに空気の抜ける音がする。', { room: 'cargo', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_hiss', key: true, where: `${cargoName}の奥` }),
          ev('stow_plan', '積付図', `3日前：外壁の点検口の前に木箱を6段積み（担当：${R.name}）。規定では点検口の前は空けておく。`, { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_stow', key: true, where: `${cargoName}の積付図` }),
          ev('seal_flag', 'エアロックの点検記録', '先週の点検：エアロック内扉のシール「要点検」。', { room: 'bridge', source: 'record', work: 2, fact: 'F_sealflag', where: '司令室の整備記録' }),
          ev('seal_test', 'シールの漏れ試験', '内扉シールの漏れ量は規定内。今夜の気圧の下がり方とは桁が違う。', { room: 'airlock', skill: 'mech', minSkill: 1, work: 4, fact: 'F_sealok', where: 'エアロック（整備技能が必要）' }),
          ev('hole', '外壁の穴', '木箱の裏の外壁に直径2mmほどの穴。縁が外から内へめくれている。外から何かが当たった跡だ。', { room: null, source: 'report', fact: 'F_hole', where: '木箱をどかして調べる' }),
          said('w_knock', W.name, `${T(T0)}ごろ、${g.rn(wRoom)}にいたとき、外壁のほうでコツンと小さな音がしました`, 'F_knock', `${W.name}から話を聞く`),
          said('r_claim', R.name, '貨物は規定どおりに積んでいます。点検口の前には何も置いていません', 'F_r_lie', `${R.name}から話を聞く`),
          { ...said('r_confess', R.name, '……点検口の前しか空きがなくて。すぐ動かすつもりでした', 'F_blocked', `${R.name}に積付図か穴の報告を突きつける`), title: `${R.name}の告白` },
          said('s_claim', S.name, 'エアロックの内扉、先週から調子が悪いって話でしたよね。あれじゃないですか', 'F_s_belief', `${S.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'seal_flag', resolvedBy: ['seal_test', 'impact_log'], explain: 'エアロックの「要点検」は先週からの軽い劣化で、漏れ量は規定内だった。気圧の低下は外壁への衝突から始まっている。' },
          { evidence: 's_claim', resolvedBy: ['seal_test'], explain: `${S.name}はエアロックを疑ったが、シールの漏れ試験は規定内だった。` },
          { evidence: 'r_claim', resolvedBy: ['stow_plan', 'hole', 'r_confess'], explain: `${R.name}は規定どおりに積んだと言ったが、積付図には点検口の前に木箱を積んだ記録が残っていた。` },
        ],
      },
      rootEvent: 'ev_band',
      damageEvent: 'ev_leak',
      testimonies: [
        { crew: W.id, evidence: 'w_knock' },
        { crew: R.id, evidence: 'r_claim', lie: true },
        { crew: S.id, evidence: 's_claim' },
      ],
      confessions: [{ crew: R.id, triggeredBy: ['stow_plan', 'hole'], evidence: 'r_confess' }],
      crewInit,
      whereabouts: [{ crew: W.id, sec: T0, room: wRoom }],
      commDown: down,
      statedTimes: [T0 + 15 * 60],
      vars: { press: 94, air: 100, found: 0, patched: 0, isolated: 0, repress: 0 },
      causeOptions: [
        { id: 'micrometeoroid', label: '微小デブリが外壁を貫通し、積荷の陰から空気が漏れている', category: 'accident' },
        { id: 'airlock_seal', label: 'エアロックの内扉シールから空気が漏れている', category: 'accident' },
        { id: 'vent_valve', label: '誰かが通気弁を開けて空気を逃がしている', category: 'sabotage' },
        { id: 'fatigue', label: '船体の金属疲労でひびが入った', category: 'accident' },
        { id: 'thermal', label: '恒星の熱で外板の継ぎ目が開いた', category: 'phenomenon' },
      ],
      unlock: {
        'cause:micrometeoroid': ['impact_log', 'hiss', 'hole'], 'cause:airlock_seal': ['seal_flag', 's_claim'], 'cause:vent_valve': ['press_alarm'],
        'cause:fatigue': ['hiss'], 'cause:thermal': ['press_log'],
        'order:o_stack': ['stow_plan', 'r_confess'], 'order:o_band': ['debris_fc'], 'order:o_hit': ['impact_log', 'w_knock'], 'order:o_alarm': ['press_alarm'],
        'plan:patchRepress': ['hiss', 'hole'], 'plan:isolate': ['hiss', 'impact_log'], 'plan:repressNow': ['press_alarm'], 'plan:fixAirlock': ['seal_flag', 's_claim'],
      },
      respond: { label: '漏れ箇所を探す', desc: 'まず漏れの疑いが強いエアロックを調べる', room: 'airlock', waitLabel: 'エアロックで次の指示待ち' },
      fieldActions: [
        { id: 'moveCrates', room: 'cargo', needs: 'F_hiss', label: '木箱をどかして音の元を探す', ask: '木箱の裏から空気の音がします。積荷を崩してどかしてよいですか', why: '音の元を見ないと手の打ちようがないと判断', action: 'moveCrates' },
        { id: 'patch', room: 'cargo', needs: 'F_hole', label: '穴に応急パッチを当てる', ask: '外壁に小さな穴があります。応急パッチで塞いでよいですか', why: '空気が漏れ続けているので、すぐ塞ぐべきだと判断', skill: 'mech', minSkill: 1, action: 'patch' },
      ],
      plans: [
        { id: 'patchRepress', label: '漏れ箇所を塞いでから予備の空気で再加圧', score: 1,
          steps: (p) => (p.knowsCause
            ? [{ room: 'cargo', action: 'moveCrates', label: '積荷をどかす' }, { room: 'cargo', action: 'patch', label: '穴の封止' }, { room: 'bridge', action: 'repress', label: '再加圧' }]
            : [{ room: 'airlock', action: 'inspectAL', label: '想定した漏れ箇所の点検' }, { room: 'bridge', action: 'repress', label: '再加圧' }]) },
        { id: 'isolate', label: `${cargoName}の隔壁を閉じて他の区画を守る`, score: 0.5, steps: () => [{ room: 'corridor', action: 'isolate', label: '隔壁の閉鎖' }] },
        { id: 'repressNow', label: '予備の空気でただちに再加圧', warn: '漏れが止まっていなければ、予備の空気を無駄にする', score: 0.1, steps: () => [{ room: 'bridge', action: 'repress', label: '再加圧' }] },
        { id: 'fixAirlock', label: 'エアロックの内扉シールを交換', score: 0, steps: () => [{ room: 'airlock', action: 'replaceSeal', label: 'シールの交換' }] },
      ],
      actions: {
        moveCrates: { minutes: () => 10, run: (a, c) => {
          if (!a.v.found) {
            a.v.found = 1;
            a.learn(c, 'F_hole');
            a.report(c, `［外壁の穴］${a.evText('hole')}`, { evidence: ['hole'], reason: '穴の位置と形を正確に伝えるべきだと判断' });
          }
        } },
        patch: { minutes: (a, c) => (a.v.patched ? 1 : 6 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech)), run: (a, c) => {
          if (!a.v.found) { a.report(c, '穴の位置が分からず、塞げなかった。'); return 'fail'; }
          if (!a.v.patched) { a.v.patched = 1; a.report(c, '外壁の穴に応急パッチを当てた。空気の音は止まった。'); }
          return 'ok';
        } },
        inspectAL: { minutes: () => 6, run: (a, c) => a.report(c, 'エアロックを点検したが、目立つ漏れは見つからなかった。') },
        repress: { minutes: () => 2, run: (a, c) => { a.v.repress = 1; a.report(c, '予備の空気で再加圧を始めた。', { important: false }); } },
        isolate: { minutes: () => 3, run: (a, c) => { a.v.isolated = 1; a.report(c, `${cargoName}の隔壁を閉じた。他の区画の気圧の下がり方は緩やかになった。`); } },
        replaceSeal: { minutes: () => 12, run: (a, c) => a.report(c, 'エアロックの内扉シールを交換した。気圧の下がり方は変わらない。') },
      },
      tick(a) {
        const v = a.v;
        const loss = v.patched ? 0 : 0.035 * (v.isolated ? 0.3 : 1);
        v.press -= loss;
        if (v.repress) {
          if (v.air > 0 && v.press < 99) { v.press += 0.25; v.air = Math.max(0, v.air - 0.3); }
          else v.repress = 0;
        }
        v.press = Math.max(40, Math.min(100, v.press));
        if (v.press < 88 && a.once('p88')) a.alarm('船内気圧が88%を下回った。息苦しさを訴える者が出始める。', '気圧低下');
        if (v.press < 78 && a.once('p78')) a.alarm('船内気圧が78%を下回った。長くいると危険。', '気圧が危険域');
        if (v.air <= 0 && a.once('air0')) a.alarm('予備の空気を使い切った。', '予備の空気が尽きた');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          c.impair = v.press < 88 ? Math.min(0.5, (88 - v.press) * 0.04) : 0;
          if (v.press < 80) c.health -= (80 - v.press) * 0.012;
        }
        a.setComm(grp, !v['relay_' + grp]);
        a.w.o2 = v.press;
        if (a.once('holehit')) a.w.hull = Math.max(0, a.w.hull - 2); // 貫通の傷
      },
      meters: (m) => [
        pct('船内気圧', m.v.press, 90, 80),
        pct('予備の空気', m.v.air, 40, 15),
        { label: '船体', value: m.hull, text: Math.round(m.hull) + '%', level: '' },
      ],
      marks: (m) => (m.has('hole') ? [{ room: 'cargo', text: '外壁の穴（報告）', color: '#9fb8d8' }] : m.has('hiss') ? [{ room: 'cargo', text: '空気の音（報告）', color: '#9fb8d8' }] : []),
      resolved: (a) => !!(a.v.patched && a.v.press >= 95),
      resolvedText: '穴が塞がり、船内の気圧が戻った。',
      epilogue: (e) => genericEpilogue(e, {
        [R.id]: e.crew.find((c) => c.id === R.id)!.confessed ? `${R.name}は積付図を描き直し、点検口の前に黄色い線を引いた。` : `${R.name}は崩れた木箱を黙って積み直した。今度は点検口の前を空けて。`,
        [E.id]: e.v.patched ? `${E.name}は応急パッチの上から本格的な補修板を当て、「寄港まではこれで持つ」と言った。` : `${E.name}は気圧計の針を見つめ続けた。`,
        [S.id]: e.has('seal_test') ? `${S.name}はエアロックの件を気にしていたが、試験の数字を見て肩の力を抜いた。` : `${S.name}は今もエアロックの内扉を疑っている。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'investigate', room: 'cargo' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }] },
        hyp: { category: 'accident', cause: 'micrometeoroid', order: ['o_stack', 'o_band', 'o_hit', 'o_alarm'], person: { crew: R.id, role: 'falsified' }, evidence: ['impact_log', 'hiss', 'stow_plan', 'press_log'], plan: 'patchRepress' },
      },
    };
  },
};
