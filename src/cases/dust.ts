// 未知の現象：小惑星の帯電した微粒子が、除塵を省いた船外活動で船内に入り込み、フィルタや感知器に張り付いた。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';

export const DUST: CaseTemplate = {
  id: 'dust',
  title: '帯電した塵',
  category: 'phenomenon',
  needSide: ['lifesupport', 'lab'],
  needLower: ['airlock'],
  needRoles: ['scientist'],
  build(g) {
    const SC = g.byRole('scientist')!;
    const E = g.byRole('engineer')!;
    const F = find(g, () => true, [SC, E]);
    const W = find(g, () => true, [SC, E, F]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 2), g.int(0, 55));
    const A = T0 - g.int(170, 190) * 60;
    const EVA = T0 - g.int(110, 130) * 60;
    const Fs = T0 - g.int(280, 320) * 60;
    const start = T0 + g.int(40, 60) * 60;
    const grp = g.groupOf('lifesupport');
    const relayRoom = g.rooms.find((r) => r.group === grp && r.rect[1] === 4)!.id;
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [SC.id]: { room: 'lab', known: ['F_skip'], hides: ['F_skip'] },
      [F.id]: { room: 'corridor', known: ['F_fan'] },
      [W.id]: { room: 'bridge', known: ['F_w_smell'] },
    };
    placeRest(g, crewInit, ['quarters', 'medbay', 'galley', 'bridge', 'engineering', 'corridor']);
    if (g.groupOf('lab') === grp) crewInit[SC.id].room = 'corridor';
    const down = [grp];
    const live = inComm(g, crewInit, down);
    const fixer = bestLive(g, crewInit, down, 'mech', [SC]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, SC]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。${T(T0)}から煙感知器が何度も鳴っているが、火は見つからない。`,
        '換気の流れが弱くなり、二酸化炭素が少しずつたまり始めている。',
        `生命維持室のある${GROUP_NAME[grp]}系統の中継器が落ちて、その区画と連絡が取れない。`,
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(T0)}以降、煙感知器の作動が相次ぐ。換気流量が低下。${GROUP_NAME[grp]}系統の中継器が応答しない。`,
      initialEvidence: ['smoke_alarms'],
      truth: {
        cause: 'charged_dust',
        events: [
          { id: 'ev_fan', sec: Fs, room: 'lifesupport', actor: F.id, text: `${T(Fs)}、${F.name}はうるさい3番ファンを手で止めた（今回の件とはほぼ無関係）。`, causes: [] },
          { id: 'ev_approach', sec: A, room: 'bridge', actor: null, text: `${T(A)}、観測のため小惑星に400mまで近づいた。日の当たる面では、微粒子が帯電して浮いていた。`, causes: ['ev_eva'] },
          { id: 'ev_eva', sec: EVA, room: 'airlock', actor: SC.id, text: `${T(EVA)}、${SC.name}が船外で試料を採った。急いでいて、帰りの除塵手順を省いた。`, causes: ['ev_inside'] },
          { id: 'ev_inside', sec: EVA + 20 * 60, room: 'airlock', actor: null, text: '帯電した微粒子が宇宙服と試料袋について船内に入り、換気に乗って広がった。', causes: ['ev_alarm', 'ev_clog'] },
          { id: 'ev_alarm', sec: T0, room: 'lifesupport', actor: null, text: `${T(T0)}、粒子が光電式の煙感知器に入り込み、火がないのに警報が鳴り始めた。`, causes: [] },
          { id: 'ev_clog', sec: T0 + 5 * 60, room: 'lifesupport', actor: null, text: '静電気で吸気フィルタに張り付いた粒子が目を詰まらせ、換気が弱まった。中継器の接点にも付いて火花が飛び、落ちた。', causes: [] },
        ],
        orderCards: [
          { id: 'o_fan', label: '3番ファンが止められる', sec: Fs },
          { id: 'o_approach', label: '小惑星に近づく', sec: A },
          { id: 'o_eva', label: '船外活動が行われる', sec: EVA },
          { id: 'o_alarm', label: '煙感知器が鳴り始める', sec: T0 },
        ],
        responsible: { crew: SC.id, role: 'falsified' },
        evidence: [
          ev('smoke_alarms', '煙感知器の作動記録', `${T(T0)}以降、煙感知器が5回作動。どれも温度は上がっていない。`, { room: 'bridge', work: 0, fact: 'F_alarms', where: '初期情報' }),
          ev('dust_filter', '吸気フィルタ', '灰色の極細の粉がびっしり付いている。払っても静電気で離れない。', { room: 'lifesupport', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_dust', key: true, where: '生命維持室の吸気口' }),
          ev('flow_log', '換気の記録', `${T(T0 + 5 * 60)}から換気の流量が少しずつ落ちている。フィルタの前後の圧力差が上がり続けている。`, { room: 'lifesupport', skill: 'mech', minSkill: 1, work: 3, fact: 'F_flow', key: true, where: '生命維持室の換気制御盤' }),
          ev('eva_log', '船外活動の記録', `${T(EVA)} 船外活動：小惑星の試料採取（${SC.name}）。帰還時の除塵手順：未実施。`, { room: 'airlock', source: 'record', work: 3, fact: 'F_eva', key: true, where: 'エアロックの記録' }),
          ev('approach', '航行記録', `${T(A)} 観測のため小惑星に400mまで接近。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_approach', key: true, where: '司令室の航行記録' }),
          ev('sample_bag', '試料袋', '試料袋の外側にも同じ灰色の粉。袋の口が静電気で閉じない。', { room: 'lab', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_bag', where: `${g.rn('lab')}の試料棚` }),
          ev('lab_note', '観測メモ', '「日照側の表面では、帯電した微粒子が浮いている可能性が高い。近づくときは注意」', { room: 'lab', source: 'record', skill: 'inv', minSkill: 2, work: 3, fact: 'F_note', where: `${g.rn('lab')}の端末` }),
          ev('fan_stop', 'ファンの操作記録', `${T(Fs)} 3番ファンを手動停止（${F.name}：騒音のため）。`, { room: 'lifesupport', work: 2, fact: 'F_fan', where: '生命維持室の換気制御盤' }),
          ev('relay_dust', '中継器の接点', '中継器の接点に灰色の粉が付き、小さな火花の跡がある。', { room: relayRoom, source: 'trace', work: 3, fact: 'F_relay_dust', where: `${g.rn(relayRoom)}の中継器` }),
          said('sc_claim', SC.name, '船外活動のあとの除塵は、ちゃんとやりました', 'F_sc_lie', `${SC.name}から話を聞く`),
          { ...said('sc_confess', SC.name, '……急いでいて、除塵を省きました。まさか中まで入り込んで、こんなことになるなんて', 'F_skip', `${SC.name}に船外活動の記録か試料袋を突きつける`), title: `${SC.name}の告白` },
          said('w_claim', W.name, '焦げ臭い気がしました。どこかで火がくすぶっているんじゃないですか', 'F_w_smell', `${W.name}から話を聞く`),
          said('f_claim', F.name, `3番ファンなら${T(Fs)}に止めました。音がうるさかったので。まずかったですか`, 'F_fan', `${F.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'fan_stop', resolvedBy: ['flow_log'], explain: `3番ファンは${T(Fs)}に止められていたが、流量が落ち始めたのはその何時間も後で、原因はフィルタの目詰まりだった。` },
          { evidence: 'w_claim', resolvedBy: ['smoke_alarms', 'dust_filter'], explain: '煙感知器は粒子に反応しただけで、温度は一度も上がっていなかった。火事ではなかった。' },
          { evidence: 'sc_claim', resolvedBy: ['eva_log', 'sample_bag', 'sc_confess'], explain: `${SC.name}は除塵をしたと言ったが、記録には手順を省いたことが残っていた。` },
        ],
      },
      rootEvent: 'ev_approach',
      damageEvent: 'ev_clog',
      testimonies: [
        { crew: SC.id, evidence: 'sc_claim', lie: true },
        { crew: W.id, evidence: 'w_claim' },
        { crew: F.id, evidence: 'f_claim' },
      ],
      confessions: [{ crew: SC.id, triggeredBy: ['eva_log', 'sample_bag'], evidence: 'sc_confess' }],
      crewInit,
      whereabouts: [
        { crew: F.id, sec: Fs, room: 'lifesupport' }, { crew: F.id, sec: Fs + 10 * 60, room: 'corridor' },
        { crew: SC.id, sec: EVA, room: 'airlock' }, { crew: SC.id, sec: EVA + 30 * 60, room: 'corridor' },
      ],
      commDown: down,
      vars: { flow: 72, co2: 1.4, clean: 0, sealed: 0, source: 1 },
      causeOptions: [
        { id: 'charged_dust', label: '小惑星の帯電した微粒子が船内に入り込み、フィルタや感知器に張り付いた', category: 'phenomenon' },
        { id: 'smolder', label: 'どこかで小さな火災がくすぶっている', category: 'accident' },
        { id: 'fan_sabotage', label: '誰かが換気ファンを止めて回っている', category: 'sabotage' },
        { id: 'filter_wear', label: '吸気フィルタが寿命を迎えた', category: 'accident' },
        { id: 'mold', label: '船内でカビの胞子が大量に発生した', category: 'phenomenon' },
      ],
      respond: { label: '換気を点検', desc: '生命維持室で換気とフィルタを調べる', room: 'lifesupport', waitLabel: '生命維持室で換気を見張っている' },
      fieldActions: [
        { id: 'brush', room: 'lifesupport', needs: 'F_dust', label: 'フィルタの粉を払い落とす', ask: 'フィルタに粉が張り付いています。いったん払い落としてよいですか', why: '換気が弱まる一方なので、まず流れを戻すべきだと判断', action: 'brush' },
      ],
      plans: [
        { id: 'cleanSeal', label: '予備フィルタに替え、除電器で吸気口を清掃し、エアロックを除塵して閉じる', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'lifesupport', action: 'swapFilter', label: '予備フィルタへの交換' }, { room: 'lifesupport', action: 'ionize', label: '除電器での清掃' }, { room: 'airlock', action: 'sealDust', label: 'エアロックの除塵' }]
            : [{ room: 'lifesupport', action: 'swapFilter', label: '予備フィルタへの交換' }]) },
        { id: 'swapFilter', label: '予備フィルタに替えるだけ', warn: '粉の出どころが残っていれば、また詰まる', score: 0.5, steps: () => [{ room: 'lifesupport', action: 'swapFilter', label: '予備フィルタへの交換' }] },
        { id: 'fireSup', label: '消火系統を作動させる', warn: '消火剤で機器が汚れる', score: 0, steps: () => [{ room: 'lifesupport', action: 'fireSup', label: '消火系統の作動' }] },
        { id: 'restartFan', label: '3番ファンを再起動する', score: 0.1, steps: () => [{ room: 'lifesupport', action: 'restartFan', label: 'ファンの再起動' }] },
      ],
      actions: {
        brush: { minutes: () => 5, run: (a, c) => { a.v.flow = Math.min(100, a.v.flow + 12); a.report(c, 'フィルタの粉を払い落とした。流れは少し戻ったが、粉はまた付いてくる。'); } },
        swapFilter: { minutes: () => 6, run: (a, c) => { a.v.flow = 100; a.report(c, '予備の吸気フィルタに交換した。流量が戻った。'); } },
        ionize: { minutes: () => 8, run: (a, c) => { a.v.clean = 1; a.report(c, '除電器で吸気口と配管の粉を落とした。静電気が抜けて、粉が張り付かなくなった。'); } },
        sealDust: { minutes: () => 8, run: (a, c) => { a.v.sealed = 1; a.v.source = 0; a.report(c, 'エアロックと宇宙服、試料袋を除塵し、内扉を閉じた。粉の出どころが止まった。'); } },
        fireSup: { minutes: () => 3, run: (a, c) => { a.w.hull -= 3; a.report(c, '消火系統を作動させた。消火剤が機器を汚したが、火元はどこにもなかった。'); } },
        restartFan: { minutes: () => 3, run: (a, c) => { a.v.flow = Math.min(100, a.v.flow + 5); a.report(c, '3番ファンを再起動した。流れはほとんど変わらない。'); } },
      },
      tick(a) {
        const v = a.v;
        if (v.source && !v.clean) v.flow = Math.max(20, v.flow - 0.03);
        else if (v.source) v.flow = Math.max(20, v.flow - 0.012);
        if (v.flow < 75) v.co2 += (75 - v.flow) * 0.0006;
        else v.co2 = Math.max(0.5, v.co2 - 0.01);
        if (v.co2 > 3 && a.once('co2_3')) a.alarm('CO₂濃度が3%を超えた。頭痛や判断の遅れが出始める。', 'CO₂上昇');
        if (v.co2 > 5 && a.once('co2_5')) a.alarm('CO₂濃度が5%を超えた。危険域。', 'CO₂危険域');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          c.impair = v.co2 > 3 ? Math.min(0.6, (v.co2 - 3) * 0.2) : 0;
          if (v.co2 > 4.5) c.health -= (v.co2 - 4.5) * 0.05;
        }
        a.setComm(grp, !v['relay_' + grp]);
        a.w.o2 = 100 - Math.max(0, v.co2 - 2) * 6;
      },
      meters: (m) => [
        pct('換気流量', m.v.flow, 75, 50),
        { label: 'CO₂', value: Math.min(100, (m.v.co2 / 8) * 100), text: m.v.co2.toFixed(1) + '%', sub: '3%で体調に影響', level: m.v.co2 > 4 ? 'bad' : m.v.co2 > 2.5 ? 'warn' : '' },
        hullMeter(m),
      ],
      marks: (m) => (m.has('dust_filter') ? [{ room: 'lifesupport', text: '灰色の粉（報告）', color: '#a7a7b5' }] : []),
      resolved: (a) => !!(a.v.clean && a.v.sealed && a.v.flow >= 85),
      resolvedText: '粉の出どころが止まり、換気が元に戻った。',
      epilogue: (e) => genericEpilogue(e, {
        [SC.id]: e.crew.find((c) => c.id === SC.id)!.confessed ? `${SC.name}は除塵手順を自分で書き直し、試料袋を二重にすると決めた。採った粉の分析結果は、論文になりそうだという。` : `${SC.name}は、あの粉がどこから来たのか誰にも話さなかった。`,
        [F.id]: `${F.name}は3番ファンの騒音について、止める代わりに整備依頼を出すことにした。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'airlock' }] },
        hyp: { category: 'phenomenon', cause: 'charged_dust', order: ['o_fan', 'o_approach', 'o_eva', 'o_alarm'], person: { crew: SC.id, role: 'falsified' }, evidence: ['dust_filter', 'flow_log', 'eva_log', 'approach'], plan: 'cleanSeal' },
      },
    };
  },
};
