// 未知の現象：太陽フレアの高エネルギー陽子が、電子機器の記憶素子のビットを反転させている（シングルイベントアップセット）。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';
import type { Group } from '../core/types';

const GLITCH: Record<string, string> = {
  galley: '食堂のオーブンが勝手に加熱を始めた',
  quarters: '居住区のドアロックが開閉を繰り返した',
  waterplant: '水再生のポンプが止まり、すぐ再起動した',
  bridge: '航法表示の星図が一瞬ずれた',
  cargo: '貨物室の温度設定が40℃に書き換わった',
  lab: '研究室の冷凍庫の警報が鳴った',
  comms: '通信室の時計が3時間進んだ',
  medbay: '医務室の点滴ポンプが停止した',
  airlock: 'エアロックの表示灯が点滅した',
  powerroom: '配電盤の表示が一瞬全部0になった',
  lifesupport: '生命維持の制御装置が再起動した',
};

export const SEU: CaseTemplate = {
  id: 'seu',
  title: '機器がばらばらに誤作動する',
  category: 'phenomenon',
  needSide: ['medbay'],
  needLower: ['waterplant'],
  build(g) {
    const E = g.byRole('engineer')!;
    const M = g.byRole('medic')!;
    const X = find(g, (c) => c.roleId === 'security' || c.roleId === 'cargo', [E, M]);
    const Y = find(g, () => true, [E, M, X]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 2), g.int(0, 55));
    const notice = T0 - 8 * 3600;
    const start = T0 + g.int(50, 65) * 60;
    const glitchRooms = g.shuffle(g.rooms.map((r) => r.id).filter((r) => GLITCH[r])).slice(0, 4);
    const gtimes = glitchRooms.map((_, i) => T0 + (5 + i * 11 + g.int(0, 4)) * 60);
    const G = g.pick(['port', 'starboard', 'lower'] as Group[]);
    const relayRoom = g.relayOf(G);
    const relayAt = T0 + g.int(25, 35) * 60;
    const noticeRoom = g.has('comms') ? 'comms' : 'bridge';
    const lsRoom = g.has('lifesupport') ? 'lifesupport' : 'engineering';
    const rounds = glitchRooms.slice(0, 3).map((r) => g.rn(r)).join('→');
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [X.id]: { room: 'corridor', known: ['F_x_rounds'], label: '巡回の途中' },
      [Y.id]: { room: 'bridge', known: ['F_y_saw'] },
      [E.id]: { room: g.has('quarters') ? 'quarters' : 'corridor', known: ['F_e_redundant'], label: '起こされたところ' },
    };
    placeRest(g, crewInit, ['medbay', 'galley', 'lab', 'bridge', 'corridor']);
    const down = [G];
    const live = inComm(g, crewInit, down);
    const fixer = bestLive(g, crewInit, down, 'mech', []);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer]);
    const med = live(M) && M.id !== fixer.id && M.id !== inv.id ? M : find(g, (c) => c.skills.med >= 1 && live(c), [fixer, inv]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。この1時間ほど、船のあちこちで機器が勝手に誤作動している。`,
        `場所も時刻もばらばらで、${GROUP_NAME[G]}系統の通信中継器も落ちた。`,
        '船内の酸素濃度が、少しずつ下がり始めている。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 機器の誤作動が相次いでいる。${GROUP_NAME[G]}系統の中継器が応答しない。酸素濃度が低下中。`,
      initialEvidence: ['glitch_list'],
      truth: {
        cause: 'spe_seu',
        events: [
          { id: 'ev_flare', sec: notice - 2 * 3600, room: 'bridge', actor: null, text: '太陽で大きなフレアが起きた。', causes: ['ev_notice', 'ev_protons'] },
          { id: 'ev_notice', sec: notice, room: noticeRoom, actor: null, text: `${T(notice)}、宇宙天気の速報が届いていたが、誰も読んでいなかった。`, causes: [] },
          { id: 'ev_protons', sec: T0, room: 'bridge', actor: null, text: `${T(T0)}ごろ、フレアの高エネルギー陽子が船に届き始めた。`, causes: ['ev_flips'] },
          { id: 'ev_flips', sec: T0 + 60, room: 'engineering', actor: null, text: '陽子が電子機器の記憶素子を通り抜けるたびにビットが反転し、場所も時刻もばらばらに誤作動が起きた。', causes: ['ev_relay', 'ev_ls', ...glitchRooms.map((_, i) => 'ev_g' + i)] },
          ...glitchRooms.map((r, i) => ({ id: 'ev_g' + i, sec: gtimes[i], room: r, actor: null, text: `${T(gtimes[i])}、${GLITCH[r]}。`, causes: [] as string[] })),
          { id: 'ev_relay', sec: relayAt, room: relayRoom, actor: null, text: `${T(relayAt)}、${GROUP_NAME[G]}系統の中継器の設定が反転で壊れ、落ちた。`, causes: [] },
          { id: 'ev_ls', sec: start - 10 * 60, room: lsRoom, actor: null, text: '生命維持の制御装置が再起動を繰り返し、酸素の再生が途切れがちになった。', causes: [] },
          { id: 'ev_rounds', sec: T0 + 10 * 60, room: 'corridor', actor: null, text: `${X.name}はいつもの巡回で機器のそばを通っただけだった（無関係）。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_notice', label: '宇宙天気の速報が届く', sec: notice },
          { id: 'o_protons', label: '船外の陽子の量が跳ね上がる', sec: T0 },
          { id: 'o_first', label: '最初の誤作動', sec: gtimes[0] },
          { id: 'o_relay', label: '中継器が落ちる', sec: relayAt },
        ],
        responsible: null,
        evidence: [
          ev('glitch_list', '誤作動の一覧', glitchRooms.map((r, i) => `${T(gtimes[i])} ${GLITCH[r]}`).join('。') + '。', { room: 'bridge', work: 0, fact: 'F_glitches', where: '初期情報' }),
          ev('memory_err', '制御装置の記憶エラー', `${T(T0)}から、制御装置の記憶素子で訂正できないビット反転が多発している。起きる場所に規則性はない。`, { room: 'engineering', skill: 'mech', minSkill: 1, work: 4, fact: 'F_mem', key: true, where: '下層機関区の制御装置' }),
          ev('rad_monitor', '船外の放射線モニタ', `${T(T0)}から、高エネルギー陽子の量が平常の約200倍。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_rad', key: true, where: '司令室の放射線モニタ' }),
          ev('flare_notice', '宇宙天気の速報', `受信 ${T(notice)}：大規模な太陽フレア。高エネルギー粒子の到来予想は数時間後から半日。`, { room: noticeRoom, source: 'record', skill: 'inv', minSkill: 1, work: 3, fact: 'F_notice', key: true, where: `${g.rn(noticeRoom)}の受信記録` }),
          ev('dosimeter', '線量計の記録', '乗員の線量計：外壁に近い区画にいた者ほど高い。水再生室の近くにいた者は低い（水の層が遮っている）。', { room: 'medbay', skill: 'med', minSkill: 1, work: 3, fact: 'F_dose', key: true, where: '医務室（医療技能が必要）' }),
          ev('access_log', '機器の操作記録', '誤作動した機器の直前の操作者は、それぞれ別人か、操作なし。', { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_access', where: '司令室の操作記録' }),
          ev('rounds', '巡回の予定', `${X.name}の定時巡回ルート：${rounds}（毎晩同じ）。`, { room: 'bridge', source: 'record', work: 2, fact: 'F_rounds', where: '司令室の当直表' }),
          ev('ls_ctrl', '生命維持の制御装置', '生命維持の制御装置が記憶エラーで再起動を繰り返し、そのたびに酸素の再生が止まっている。', { room: lsRoom, skill: 'mech', minSkill: 1, work: 3, fact: 'F_ls', where: `${g.rn(lsRoom)}の制御装置` }),
          said('y_claim', Y.name, `夜中に${X.name}さんが、あちこちの機器のそばをうろうろしていました。何か触っていたのかも`, 'F_y_saw', `${Y.name}から話を聞く`),
          said('x_claim', X.name, '巡回はいつもどおりです。機器には触っていません', 'F_x_rounds', `${X.name}から話を聞く`),
          said('e_claim', E.name, '制御装置は冗長モードにすれば、三つの記憶を突き合わせて誤りを打ち消せます。ふだんは電気を食うので切っていますが', 'F_e_redundant', `${E.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'y_claim', resolvedBy: ['rounds', 'access_log'], explain: `${X.name}はいつもの巡回ルートを歩いていただけで、誤作動した機器には触れていなかった。` },
          { evidence: 'glitch_list', resolvedBy: ['memory_err', 'rad_monitor'], explain: '誤作動に規則性がなかったのは、陽子がどこに当たるかが偶然だったから。誰かの仕業ではなかった。' },
        ],
      },
      rootEvent: 'ev_flare',
      damageEvent: 'ev_flips',
      testimonies: [
        { crew: Y.id, evidence: 'y_claim' },
        { crew: X.id, evidence: 'x_claim' },
        { crew: E.id, evidence: 'e_claim' },
      ],
      confessions: [],
      crewInit,
      whereabouts: [],
      commDown: down,
      vars: { scrubbed: 0, shelter: 0 },
      causeOptions: [
        { id: 'spe_seu', label: '太陽フレアの高エネルギー粒子が電子機器の記憶を書き換えている', category: 'phenomenon' },
        { id: 'sabotage_x', label: '誰かが機器に細工して回っている', category: 'sabotage' },
        { id: 'power_surge', label: '電源の電圧変動で機器が誤作動している', category: 'accident' },
        { id: 'software', label: '制御ソフトの更新の不具合', category: 'accident' },
        { id: 'virus', label: '外から入り込んだ不正なプログラム', category: 'sabotage' },
      ],
      unlock: {
        'cause:spe_seu': ['rad_monitor', 'flare_notice', 'memory_err'], 'cause:sabotage_x': ['y_claim', 'glitch_list'], 'cause:power_surge': ['glitch_list'],
        'cause:software': ['memory_err'], 'cause:virus': ['glitch_list'],
        'order:o_notice': ['flare_notice'], 'order:o_protons': ['rad_monitor'], 'order:o_first': ['glitch_list'], 'order:o_relay': ['glitch_list'],
        'plan:shelterScrub': ['rad_monitor', 'dosimeter'], 'plan:scrubOnly': ['memory_err', 'e_claim'], 'plan:shelterOnly': ['rad_monitor', 'dosimeter'], 'plan:hunt': ['glitch_list'],
      },
      respond: { label: '誤作動の点検', desc: '機関区の制御装置を調べる', room: 'engineering', waitLabel: '機関区で制御装置を見張っている' },
      fieldActions: [
        { id: 'scrub', room: 'engineering', needs: 'F_mem', label: '制御装置を冗長モードで再起動', ask: '制御装置の記憶がおかしくなっています。冗長モードで再起動してよいですか。電力を少し多く使います', why: '誤りを打ち消す仕組みを使うのが先だと判断', skill: 'mech', minSkill: 2, action: 'scrub' },
      ],
      plans: [
        { id: 'shelterScrub', label: '全員を水再生室（水の遮蔽）へ避難させ、制御装置を冗長モードで再起動', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'engineering', action: 'scrub', label: '冗長モードで再起動' }, { room: 'engineering', action: 'shelterAll', label: '全員の避難' }]
            : [{ room: 'engineering', action: 'hunt', label: '機器の点検' }]) },
        { id: 'scrubOnly', label: '制御装置を冗長モードで再起動するだけ', score: 0.4, steps: () => [{ room: 'engineering', action: 'scrub', label: '冗長モードで再起動' }] },
        { id: 'shelterOnly', label: '全員を水再生室へ避難させるだけ', score: 0.5, steps: () => [{ room: 'corridor', action: 'shelterAll', label: '全員の避難' }] },
        { id: 'hunt', label: '機器に細工した者を探して全区画を見回る', score: 0, skill: 'inv', steps: () => [{ room: 'corridor', action: 'hunt', label: '見回り' }] },
      ],
      actions: {
        scrub: { minutes: (a, c) => 8 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.scrubbed = 1; a.report(c, '制御装置を冗長モードで再起動した。誤作動が止まり、生命維持も安定した。'); } },
        shelterAll: { minutes: () => 2, run: (a, c) => {
          a.v.shelter = 1;
          for (const x of a.crews()) if (x.alive && x.policy.kind !== 'plan') a.order(x, { kind: 'guard', room: 'waterplant' });
          a.order(c, { kind: 'guard', room: 'waterplant' });
          a.report(c, '通信の届く全員に、水再生室へ避難するよう伝えた。水槽の水が粒子を遮る。');
        } },
        hunt: { minutes: () => 10, run: (a, c) => a.report(c, '機器を見て回ったが、細工の跡はどこにもない。') },
      },
      tick(a) {
        const v = a.v;
        for (const c of a.crews()) {
          if (!c.alive) continue;
          const shield = c.room === 'waterplant' ? 0.1 : c.room === 'engineering' ? 0.5 : 1;
          c.health -= 0.03 * shield;
        }
        if (!v.scrubbed) a.w.o2 -= 0.1;
        else a.w.o2 += 0.2;
        a.setComm(G, !v['relay_' + G]);
      },
      meters: (m) => [pct('酸素', m.o2), { label: '船外の粒子', value: m.has('rad_monitor') ? 10 : 50, text: m.has('rad_monitor') ? '平常の200倍' : '未確認', level: m.has('rad_monitor') ? 'bad' : '' }, hullMeter(m)],
      marks: (m) => (m.has('dosimeter') ? [{ room: 'waterplant', text: '遮蔽が厚い（報告）', color: '#6fb4ff' }] : []),
      resolved: (a) => !!(a.v.scrubbed && a.v.shelter),
      resolvedText: '機器の誤作動が止まり、全員が遮蔽の厚い区画に移った。粒子の嵐が過ぎるのを待てばいい。',
      epilogue: (e) => genericEpilogue(e, {
        [X.id]: e.has('rounds') ? `${X.name}は疑われたことを笑い話にして、巡回の記録を前より細かくつけるようになった。` : `${X.name}は、あの夜から少し仲間と距離を置いている。`,
        [E.id]: e.v.scrubbed ? `${E.name}は宇宙天気の速報が届いたら警報が鳴るよう、受信機の設定を変えた。` : '',
        [M.id]: `${M.name}は全員の線量を記録にまとめ、寄港したら検査を受けるよう勧めた。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, ...(noticeRoom !== 'bridge' ? [{ kind: 'investigate' as const, room: noticeRoom }] : [])], [med.id]: [{ kind: 'investigate', room: 'medbay' }] },
        hyp: { category: 'phenomenon', cause: 'spe_seu', order: ['o_notice', 'o_protons', 'o_first', 'o_relay'], person: null, evidence: ['memory_err', 'rad_monitor', 'flare_notice', 'dosimeter'], plan: 'shelterScrub' },
      },
    };
  },
};
