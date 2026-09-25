// 工作：はんだごてで煙感知器をあぶって火災警報を偽装し、騒ぎの隙に積荷の試料を盗んだ。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';

export const FALSEFIRE: CaseTemplate = {
  id: 'false_fire',
  title: '偽の火災警報',
  category: 'sabotage',
  needSide: ['lab', 'cargo'],
  needLower: [],
  build(g) {
    const E = g.byRole('engineer')!;
    const S = find(g, (c) => ['comms', 'cargo', 'security', 'navigator', 'cook'].includes(c.roleId), [E, g.byRole('medic')]);
    const SC = find(g, (c) => c.roleId === 'scientist', [S]);
    const W = find(g, () => true, [S, SC]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 2), g.int(0, 55));
    const take = T0 - g.int(18, 25) * 60;
    const steal = T0 + 3 * 60;
    const grp = g.groupOf('cargo');
    const relayRoom = g.rooms.find((r) => r.group === grp && r.rect[1] === 4)!.id;
    const pull = T0 + 8 * 60;
    const start = T0 + g.int(22, 30) * 60;
    const heaterOff = T0 - g.int(55, 70) * 60;
    const labName = g.rn('lab');
    const sRoom = g.pick(['bridge', 'galley', 'medbay', 'quarters', 'comms'].filter((r) => g.has(r) && g.groupOf(r) !== grp));
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [S.id]: { room: 'corridor', known: ['F_s_did'], hides: ['F_s_did'] },
      [SC.id]: { room: 'corridor', known: ['F_sc_belief'] },
      [W.id]: { room: 'corridor', known: ['F_w_nosmoke'] },
    };
    placeRest(g, crewInit, ['bridge', 'medbay', 'galley', 'quarters', 'engineering']);
    const down = [grp];
    const live = inComm(g, crewInit, down);
    const fixer = bestLive(g, crewInit, down, 'mech', [S]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, S]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `${T(T0)}、${labName}で火災警報が鳴り、消火系統が作動した。`,
        `いまも排気弁が開いたまま閉じず、船内の空気が少しずつ逃げている（船内時刻 ${T(start)}）。`,
        `騒ぎのさなかに、${GROUP_NAME[grp]}系統の通信中継器も応答しなくなった。`,
        '何が起きたのかを突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(T0)} ${labName}で火災警報。消火系統が作動。${T(start)} 排気弁が開いたまま閉じない。${GROUP_NAME[grp]}系統の中継器が応答しない。`,
      initialEvidence: ['fire_alarm'],
      truth: {
        cause: 'diversion_theft',
        events: [
          { id: 'ev_motive', sec: T0 - 30 * 86400, room: 'cargo', actor: null, text: `${S.name}は前の船で給料を踏み倒され、金に困っていた。この船の積荷には高価な鉱物試料があった。`, causes: ['ev_take'] },
          { id: 'ev_take', sec: take, room: 'engineering', actor: S.id, text: `${T(take)}、${S.name}は機関区の工具棚からはんだごてを持ち出した。`, causes: ['ev_heat'] },
          { id: 'ev_heat', sec: T0 - 60, room: 'lab', actor: S.id, text: `${T(T0 - 60)}、${S.name}ははんだごてで${labName}の煙感知器をあぶった。`, causes: ['ev_alarm'] },
          { id: 'ev_alarm', sec: T0, room: 'lab', actor: null, text: `${T(T0)}、火災警報が鳴り、消火系統が作動した。排気弁が開いたまま固着した。`, causes: ['ev_valve'] },
          { id: 'ev_valve', sec: T0 + 60, room: 'lab', actor: null, text: '開いたままの排気弁から、船内の空気が少しずつ逃げ始めた。', causes: [] },
          { id: 'ev_steal', sec: steal, room: 'cargo', actor: S.id, text: `${T(steal)}、皆が${labName}へ向かう隙に、${S.name}はコンテナ7番の封印を切って試料を抜き取った。`, causes: [] },
          { id: 'ev_pull', sec: pull, room: relayRoom, actor: S.id, text: `${T(pull)}、${S.name}は${GROUP_NAME[grp]}系統の中継器のプラグを抜き、貨物室まわりの様子を隠した。`, causes: [] },
          { id: 'ev_heater', sec: heaterOff, room: 'lab', actor: SC.id, text: `${SC.name}は${T(heaterOff)}に加熱装置を正常に止めていた（無関係）。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_take', label: 'はんだごてが持ち出される', sec: take },
          { id: 'o_alarm', label: '火災警報が鳴る', sec: T0 },
          { id: 'o_steal', label: '貨物室のドアが開く', sec: steal },
          { id: 'o_pull', label: '中継器のプラグが抜かれる', sec: pull },
        ],
        responsible: { crew: S.id, role: 'sabotage' },
        evidence: [
          ev('fire_alarm', '火災警報の記録', `${T(T0)} ${labName}の煙感知器が作動。消火系統が作動し、排気弁が開いた。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('smoke_log', '感知器の記録', `${T(T0 - 60)} 感知器の温度だけが急上昇。煙の濃度は一度も上がっていない。`, { room: 'lab', skill: 'mech', minSkill: 1, work: 3, fact: 'F_heat_only', key: true, where: `${labName}の感知器` }),
          ev('heat_mark', '感知器の焦げ跡', '感知器の外装に小さな焦げ跡。はんだごての先の形をしている。', { room: 'lab', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_mark', key: true, where: `${labName}の天井` }),
          ev('valve_log', '消火系統の記録', `${T(T0)} 消火系統作動。排気弁が開いたまま固着。`, { room: 'lab', skill: 'mech', minSkill: 1, work: 2, fact: 'F_valve', where: `${labName}の制御盤` }),
          ev('heater_log', '加熱装置の記録', `${T(heaterOff)} 加熱装置は正常に停止。以後は通電していない。`, { room: 'lab', work: 2, fact: 'F_heater_off', where: `${labName}の加熱装置` }),
          ev('tool_log', '工具の持ち出し記録', `${T(take)} はんだごてを持ち出し（${S.name}）。返却の記録はない。`, { room: 'engineering', source: 'record', skill: 'inv', minSkill: 1, work: 3, fact: 'F_tool', key: true, where: '下層機関区の工具棚' }),
          ev('seal_broken', 'コンテナの封印', 'コンテナ7番の封印が切られ、中の試料ケースが空になっている。', { room: 'cargo', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_seal', key: true, where: `${g.rn('cargo')}のコンテナ` }),
          ev('manifest', '積荷目録', 'コンテナ7番：希少鉱物の試料1点（高価・保険付き）。', { room: 'cargo', source: 'record', work: 2, fact: 'F_manifest', where: `${g.rn('cargo')}の目録` }),
          ev('door_cargo', '貨物室のドア記録', `${T(steal)} 貨物室ドア開閉（認証：${S.name}）。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_door', key: true, where: '司令室の船内ドア記録' }),
          ev('relay_pulled', '中継器のプラグ', '中継器の電源プラグが抜かれていた。偶然抜けることはない。', { room: relayRoom, source: 'trace', work: 3, fact: 'F_pulled', where: `${g.rn(relayRoom)}の中継器` }),
          ev('bag', '私物の袋', `${S.name}の私物袋から、コンテナ7番の試料ケースの中身が見つかった。`, { room: null, source: 'report', fact: 'F_bag', where: '持ち物検査' }),
          said('s_claim', S.name, `警報のときは${g.rn(sRoom)}にいました。そのあとはみんなと一緒に研究室の前です`, 'F_s_lie', `${S.name}から話を聞く`),
          { ...said('s_confess', S.name, '……前の船で給料を踏み倒されて。この試料一つで取り返せると思ったんです', 'F_s_did', `${S.name}に工具の記録かドア記録を突きつける`), title: `${S.name}の告白` },
          said('sc_claim', SC.name, '研究室の加熱装置、止め忘れたかもしれません……私のせいかも', 'F_sc_belief', `${SC.name}から話を聞く`),
          said('w_claim', W.name, '警報のあと研究室の前まで行きましたが、煙は見えませんでした。焦げ臭くもなかった', 'F_w_nosmoke', `${W.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'sc_claim', resolvedBy: ['heater_log', 'smoke_log'], explain: `${SC.name}は加熱装置の消し忘れを疑ったが、装置は1時間前に正常に止まっていた。感知器は熱だけで反応していた。` },
          { evidence: 's_claim', resolvedBy: ['door_cargo', 'tool_log', 's_confess'], explain: `${S.name}は別の区画にいたと言ったが、警報の直後に貨物室へ入った記録が残っていた。` },
        ],
      },
      rootEvent: 'ev_motive',
      damageEvent: 'ev_valve',
      testimonies: [
        { crew: S.id, evidence: 's_claim', lie: true },
        { crew: SC.id, evidence: 'sc_claim' },
        { crew: W.id, evidence: 'w_claim' },
      ],
      confessions: [{ crew: S.id, triggeredBy: ['tool_log', 'door_cargo', 'bag'], evidence: 's_confess' }],
      crewInit,
      whereabouts: [
        { crew: S.id, sec: take, room: 'engineering' }, { crew: S.id, sec: T0 - 60, room: 'lab' }, { crew: S.id, sec: steal, room: 'cargo' },
        { crew: S.id, sec: pull, room: relayRoom }, { crew: S.id, sec: pull + 10 * 60, room: 'corridor' },
        { crew: SC.id, sec: heaterOff - 5 * 60, room: 'lab' }, { crew: SC.id, sec: heaterOff + 5 * 60, room: 'corridor' },
      ],
      commDown: down,
      vars: { press: 97, valve: 1, isolated: 0, searched: 0 },
      causeOptions: [
        { id: 'diversion_theft', label: '誰かが火災警報を偽装し、その隙に積荷を盗んだ', category: 'sabotage' },
        { id: 'real_fire', label: '研究室で小さな火災が起き、消し止められた', category: 'accident' },
        { id: 'heater', label: '加熱装置の消し忘れで感知器が作動した', category: 'accident' },
        { id: 'sensor_fault', label: '煙感知器の故障で警報が鳴った', category: 'accident' },
        { id: 'static', label: '静電気の放電で感知器が誤作動した', category: 'phenomenon' },
      ],
      respond: { label: '火災に対応', desc: `${labName}へ向かい、火元と消火系統を確かめる`, room: 'lab', waitLabel: `${labName}の前で待機` },
      fieldActions: [
        { id: 'closeValve', room: 'lab', needs: 'F_heat_only', label: '消火系統を止めて排気弁を閉じる', ask: '煙は出ていません。熱だけです。消火系統を止めて排気弁を手で閉じてよいですか', why: '火は出ておらず、空気を逃がし続けるほうが危ないと判断', skill: 'mech', minSkill: 1, action: 'closeValve' },
      ],
      plans: [
        { id: 'closeValve', label: '誤報と判断して消火系統を止め、排気弁を手で閉じる', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'lab', action: 'closeValve', label: '排気弁を閉じる' }] : [{ room: 'lab', action: 'fireCheck', label: '火元の確認' }]) },
        { id: 'isolateLab', label: `${labName}の隔壁を閉じて空気の流出を抑える`, warn: `${labName}には入れなくなり、中の手がかりも調べられなくなる`, score: 0.5, steps: () => [{ room: 'corridor', action: 'isolate', label: '隔壁の閉鎖' }] },
        { id: 'searchBags', label: '全員の持ち物を調べる', warn: '乗員の信頼を少し損なう', score: 0.3, skill: 'inv', steps: () => [{ room: 'corridor', action: 'searchBags', label: '持ち物検査' }] },
      ],
      actions: {
        closeValve: { minutes: (a, c) => 5 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.valve = 0; a.report(c, '消火系統を止め、排気弁を手で閉じた。空気の流出は止まった。'); } },
        fireCheck: { minutes: () => 8, run: (a, c) => a.report(c, '火元を探したが、燃えた跡は見つからない。消火系統は念のため作動させたままにした。') },
        isolate: { minutes: () => 3, run: (a, c) => {
          a.v.isolated = 1;
          a.destroy(a.s.truth.evidence.filter((e) => e.room === 'lab').map((e) => e.id));
          a.report(c, `${labName}の隔壁を閉じた。空気の減りは緩やかになったが、中には入れない。`);
        } },
        searchBags: { minutes: () => 12, run: (a, c) => {
          a.v.searched = 1;
          for (const x of a.crews()) x.trust = Math.max(0, x.trust - 3);
          a.report(c, `［私物の袋］${a.evText('bag')}`, { evidence: ['bag'] });
        } },
      },
      tick(a) {
        const v = a.v;
        if (v.valve) v.press -= 0.03 * (v.isolated ? 0.2 : 1);
        else v.press = Math.min(100, v.press + 0.02);
        if (v.press < 85 && a.once('p85')) a.alarm('船内気圧が85%を下回った。', '気圧低下');
        if (v.press < 75 && a.once('p75')) a.alarm('船内気圧が75%を下回った。危険域。', '気圧が危険域');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          c.impair = v.press < 85 ? Math.min(0.5, (85 - v.press) * 0.04) : 0;
          if (v.press < 78) c.health -= (78 - v.press) * 0.012;
        }
        a.setComm(grp, !v['relay_' + grp]);
        a.w.o2 = v.press;
      },
      meters: (m) => [pct('船内気圧', m.v.press, 88, 78, m.v.valve ? '排気弁が開いたまま' : '排気弁は閉じている'), pct('酸素', m.o2), hullMeter(m)],
      marks: (m) => [
        ...(m.has('heat_mark') ? [{ room: 'lab', text: '焦げ跡（報告）', color: '#d8a03a' }] : []),
        ...(m.has('seal_broken') ? [{ room: 'cargo', text: '切られた封印（報告）', color: '#d88a3a' }] : []),
      ],
      resolved: (a) => !a.v.valve,
      resolvedText: '排気弁が閉じ、空気の流出が止まった。',
      epilogue: (e) => genericEpilogue(e, {
        [S.id]: e.crew.find((c) => c.id === S.id)!.confessed ? `${S.name}は試料を返し、寄港後に自分から保安当局へ出向くと言った。` : e.has('bag') ? `試料は${S.name}の袋から見つかった。${S.name}は最後まで理由を語らなかった。` : `コンテナ7番の試料は見つからないまま、寄港の日を迎えた。`,
        [SC.id]: e.has('heater_log') ? `${SC.name}は自分のせいではなかったと知り、長い息をついた。` : `${SC.name}は今も、加熱装置を止め忘れたのではと自分を責めている。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'engineering' }, { kind: 'investigate', room: 'cargo' }] },
        hyp: { category: 'sabotage', cause: 'diversion_theft', order: ['o_take', 'o_alarm', 'o_steal', 'o_pull'], person: { crew: S.id, role: 'sabotage' }, evidence: ['smoke_log', 'heat_mark', 'tool_log', 'door_cargo'], plan: 'closeValve' },
      },
    };
  },
};
