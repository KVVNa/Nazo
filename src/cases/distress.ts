// 工作：申告外の積荷を調べられたくない乗員が、外向きの送信を捨てるフィルタを仕込んでいた。救難信号の中継も止まった。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest, line } from './common';
import { GROUP_NAME } from '../sim/ship';

export const DISTRESS: CaseTemplate = {
  id: 'distress',
  title: '救難信号の妨害',
  category: 'sabotage',
  needSide: ['comms', 'cargo'],
  needLower: [],
  build(g) {
    const E = g.byRole('engineer')!;
    const S = find(g, (c) => ['comms', 'security', 'cargo', 'navigator'].includes(c.roleId), [E, g.byRole('medic')], g.cast);
    const F = find(g, (c) => c.roleId === 'scientist' || c.roleId === 'navigator', [S]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 2), g.int(0, 50));
    const login = T0 - 2 * 60;
    const loop = T0 + 5 * 60;
    const R = T0 + g.int(30, 45) * 60;
    const start = R + g.int(8, 15) * 60;
    const heron0 = g.int(66, 74);
    const grp = g.groupOf('comms');
    const relayRoom = g.relayOf(grp);
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [S.id]: { room: 'bridge', known: ['F_s_did'], hides: ['F_s_did'] },
      [F.id]: { room: 'bridge', known: ['F_f_belief'] },
    };
    placeRest(g, crewInit, ['quarters', 'medbay', 'galley', 'lab', 'engineering', 'corridor']);
    const down = [grp];
    const live = inComm(g, crewInit, down);
    const fixer = bestLive(g, crewInit, down, 'mech', [S]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, S]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `${T(R)}、採掘艇〈ヘロン〉から救難信号を受けた。乗員3名、酸素はあと${Math.round(heron0 / 0.5 / 6) / 10}時間ほどしかもたない。`,
        `救難センターへの自動中継が失敗している（船内時刻 ${T(start)}）。`,
        `通信室のある${GROUP_NAME[grp]}系統の中継器が再起動を繰り返し、その区画と連絡が取れない。`,
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(R)} 採掘艇〈ヘロン〉から救難信号。救難センターへの自動中継が失敗。${GROUP_NAME[grp]}系統の中継器が再起動を繰り返している。`,
      initialEvidence: ['distress'],
      truth: {
        cause: 'jam_filter',
        events: [
          { id: 'ev_cargo', sec: T0 - 5 * 86400, room: 'cargo', actor: null, text: line(S, 'distress.cargo', `${S.name}は書類のない精製金属2tを、前の港で密かに積み込ませていた。`), causes: ['ev_login'] },
          { id: 'ev_login', sec: login, room: 'comms', actor: S.id, text: `${T(login)}、${S.name}は通信室の端末に管理者権限でログインした。`, causes: ['ev_filter'] },
          { id: 'ev_filter', sec: T0, room: 'comms', actor: S.id, text: `${T(T0)}、外向きの送信をすべて捨てるフィルタを仕込んだ。` + line(S, 'distress.fear', '港への定時連絡で積荷のことが漏れるのを恐れたためだった。'), causes: ['ev_loop', 'ev_fail'] },
          { id: 'ev_loop', sec: loop, room: relayRoom, actor: null, text: `設定の書き換えの影響で、${GROUP_NAME[grp]}系統の中継器が再起動を繰り返し始めた。`, causes: [] },
          { id: 'ev_distress', sec: R, room: 'bridge', actor: null, text: `${T(R)}、〈ヘロン〉の救難信号が届いた。`, causes: ['ev_fail'] },
          { id: 'ev_fail', sec: R + 60, room: 'comms', actor: null, text: '自動中継はフィルタに捨てられ、救難センターに届かなかった。', causes: [] },
        ],
        orderCards: [
          { id: 'o_login', label: '通信室に管理者ログインがある', sec: login },
          { id: 'o_filter', label: '送信フィルタが追加される', sec: T0 },
          { id: 'o_loop', label: '中継器が再起動を繰り返し始める', sec: loop },
          { id: 'o_distress', label: '救難信号を受信する', sec: R },
        ],
        responsible: { crew: S.id, role: 'sabotage' },
        evidence: [
          ev('distress', '救難信号の記録', `${T(R)} 採掘艇〈ヘロン〉から救難信号。乗員3名。救難センターへの自動中継：送信失敗。`, { room: 'bridge', work: 0, fact: 'F_distress', where: '初期情報' }),
          ev('tx_log', '送信記録', `${T(T0)}以降、外向きの送信がすべて、送り出す前に破棄されている。`, { room: 'comms', skill: 'mech', minSkill: 1, work: 3, fact: 'F_tx', key: true, where: '通信室の送信機' }),
          ev('filter_rule', '送信フィルタの設定', `規則が1つ追加されている：宛先を問わず全破棄。追加 ${T(T0)}、管理者権限、通信室2番端末。`, { room: 'comms', skill: 'mech', minSkill: 2, work: 4, fact: 'F_filter', key: true, where: '通信室の端末（整備技能2以上）' }),
          ev('login', 'ログイン記録', `${T(login)} 通信室2番端末に管理者ログイン：${S.name}。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_login', key: true, where: '司令室のログイン記録' }),
          ev('antenna_ok', 'アンテナの点検', 'アンテナと増幅器は正常。受信も送信出力も規定どおり。', { room: 'engineering', skill: 'mech', minSkill: 1, work: 4, fact: 'F_antenna_ok', where: '下層機関区のアンテナ制御盤' }),
          ev('solar', '宇宙天気の記録', '太陽活動は静穏。通信障害の予報はない。', { room: 'bridge', work: 2, fact: 'F_solar', where: '司令室の宇宙天気' }),
          ev('undeclared', '積荷の照合', line(S, 'distress.undeclared', '書類のない積荷がある：精製金属2t。受け入れの署名は空欄。'), { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_undeclared', key: true, where: `${g.rn('cargo')}の積荷` }),
          ev('relay_loop', '中継器の状態', '中継器の設定が書き換えられ、再起動を繰り返している。管理者権限の操作の跡。', { relay: true, room: relayRoom, work: 3, fact: 'F_loop', where: `${g.rn(relayRoom)}の中継器` }),
          said('s_claim', S.name, 'アンテナの劣化でしょう。前から送信が不安定でしたから', 'F_s_lie', `${S.name}から話を聞く`),
          { ...said('s_confess', S.name, line(S, 'distress.confess', '……積荷を調べられたら終わりなんです。救助隊が来れば、港の検査も来る。まさか救難信号まで止まるなんて'), 'F_s_did', `${S.name}にフィルタの設定かログイン記録を突きつける`), title: `${S.name}の告白` },
          said('f_claim', F.name, '太陽フレアの影響じゃないでしょうか。この時期は多いと聞きます', 'F_f_belief', `${F.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 's_claim', resolvedBy: ['antenna_ok', 'filter_rule', 's_confess'], explain: `${S.name}はアンテナの劣化だと言ったが、アンテナは正常で、送信はフィルタで捨てられていた。` },
          { evidence: 'f_claim', resolvedBy: ['solar', 'tx_log'], explain: '太陽活動は静穏で、送信は電波になる前に捨てられていた。' },
        ],
      },
      rootEvent: 'ev_cargo',
      damageEvent: 'ev_fail',
      testimonies: [
        { crew: S.id, evidence: 's_claim', lie: true },
        { crew: F.id, evidence: 'f_claim' },
      ],
      confessions: [{ crew: S.id, triggeredBy: ['filter_rule', 'login'], evidence: 's_confess' }],
      crewInit,
      whereabouts: [{ crew: S.id, sec: login, room: 'comms' }, { crew: S.id, sec: T0 + 10 * 60, room: 'bridge' }],
      commDown: down,
      vars: { filter: 1, revoked: 0, link: 0, divert: 0, arrive: 0, heron: heron0, lost: 0, readd: 0 },
      causeOptions: [
        { id: 'jam_filter', label: '乗員が送信を捨てるフィルタを仕込んでいた', category: 'sabotage' },
        { id: 'antenna', label: 'アンテナの劣化で送信できない', category: 'accident' },
        { id: 'software', label: '通信ソフトの更新に失敗した', category: 'accident' },
        { id: 'external_jam', label: 'よその船が妨害電波を出している', category: 'sabotage' },
        { id: 'solar', label: '太陽活動の乱れで通信が妨げられている', category: 'phenomenon' },
      ],
      unlock: {
        'cause:jam_filter': ['tx_log', 'filter_rule'], 'cause:antenna': ['distress', 's_claim'], 'cause:software': ['tx_log'],
        'cause:external_jam': ['distress'], 'cause:solar': ['f_claim'],
        'order:o_login': ['login'], 'order:o_filter': ['filter_rule', 'tx_log'], 'order:o_loop': ['relay_loop'], 'order:o_distress': ['distress'],
        'plan:removeFilter': ['filter_rule', 'tx_log'], 'plan:divert': ['distress'], 'plan:rebootComms': ['distress'],
      },
      respond: { label: '通信系を点検', desc: '通信室で送信機と設定を調べる', room: 'comms', waitLabel: '通信室で指示待ち' },
      fieldActions: [
        { id: 'delFilter', room: 'comms', needs: 'F_filter', label: '不審な送信フィルタを消す', ask: '送信フィルタに不審な規則があります。消して救難信号を中継してよいですか', why: '救難信号が届かないままでは人が死ぬと判断', skill: 'mech', minSkill: 2, action: 'removeFilter' },
      ],
      plans: [
        { id: 'removeFilter', label: '送信フィルタを消して救難信号を中継し、管理者権限を止める', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'comms', action: 'removeFilter', label: 'フィルタの削除' }, { room: 'comms', action: 'revoke', label: '管理者権限の停止' }]
            : [{ room: 'engineering', action: 'checkAntenna', label: 'アンテナの点検' }]) },
        { id: 'divert', label: '自船が〈ヘロン〉の救助に向かう', warn: '到着まで2時間近くかかる', score: 0.5, skill: 'inv', steps: () => [{ room: 'bridge', action: 'divert', label: '救助航路への変更' }] },
        { id: 'rebootComms', label: '通信系を再起動する', score: 0.1, steps: () => [{ room: 'comms', action: 'reboot', label: '通信系の再起動' }] },
      ],
      actions: {
        removeFilter: { minutes: () => 4, run: (a, c) => { a.v.filter = 0; a.v.readd = a.now() + 15 * 60; a.report(c, '不審な送信フィルタを消した。救難信号の中継が始まった。'); } },
        revoke: { minutes: () => 3, run: (a, c) => { a.v.revoked = 1; a.report(c, '全員の管理者権限を止めた。設定は船長の承認なしに変えられない。'); } },
        checkAntenna: { minutes: () => 8, run: (a, c) => a.report(c, 'アンテナと増幅器を点検した。どこも壊れていない。') },
        divert: { minutes: () => 5, run: (a, c) => { a.v.divert = 1; a.v.arrive = a.now() + 110 * 60; a.report(c, '〈ヘロン〉へ向けて航路を変えた。到着はおよそ110分後。'); } },
        reboot: { minutes: () => 6, run: (a, c) => a.report(c, '通信系を再起動したが、送信は失敗したままだ。') },
      },
      tick(a) {
        const v = a.v;
        const s = a.crew(S.id);
        if (!v.lost && !a.w.resolved) {
          v.heron -= 0.5 / 6;
          if (v.heron <= 20 && a.once('h20')) a.alarm('〈ヘロン〉：「酸素が2割を切った」', '〈ヘロン〉の酸素が残りわずか');
          if (v.heron <= 0) { v.lost = 1; a.alarm('〈ヘロン〉からの信号が途絶えた。', '〈ヘロン〉の信号が途絶'); }
        }
        if (!v.filter) v.link += 1;
        if (!v.filter && !v.revoked && s.alive && s.policy.kind !== 'detained' && v.readd && a.now() >= v.readd && v.link < 180) {
          v.filter = 1; v.link = 0; v.readd = 0;
          a.alarm('送信がまた止まった。フィルタが再び追加されている。', '送信が再び止まった');
        }
        if (v.link === 180) a.log('救難センターが〈ヘロン〉の位置を受け取り、救助艇の発進を知らせてきた。');
        a.setComm(grp, !v['relay_' + grp]);
      },
      meters: (m) => [
        m.v.lost ? { label: '〈ヘロン〉', value: 0, text: '信号途絶', level: 'bad' } : pct('〈ヘロン〉の酸素', m.v.heron, 40, 20, m.v.filter ? '中継できていない' : '中継中'),
        pct('酸素', m.o2),
        hullMeter(m),
      ],
      marks: () => [],
      resolved: (a) => !a.v.lost && (a.v.link >= 180 || (!!a.v.divert && a.now() >= a.v.arrive)),
      resolvedText: '〈ヘロン〉の乗員に救助の手が届く。',
      epilogue: (e) => genericEpilogue(e, {
        [S.id]: e.crew.find((c) => c.id === S.id)!.confessed ? line(S, 'distress.epi', `${S.name}は積荷の件をすべて話し、港での検査に立ち会うと約束した。`) : e.grade === '真相解明' ? `${S.name}は最後まで目を合わせなかった。` : `${S.name}は何事もなかったように通信の当番に戻った。`,
        [F.id]: e.v.lost ? `${F.name}は、〈ヘロン〉の最後の通信を何度も聞き返している。` : `${F.name}は〈ヘロン〉の乗員から届いた礼のメッセージを、船内の掲示板に貼った。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'cargo' }, ...(['bridge', 'cargo', 'comms'].includes(relayRoom) ? [] : [{ kind: 'investigate' as const, room: relayRoom }])] },
        hyp: { category: 'sabotage', cause: 'jam_filter', order: ['o_login', 'o_filter', 'o_loop', 'o_distress'], person: { crew: S.id, role: 'sabotage' }, evidence: ['tx_log', 'filter_rule', 'login', 'undeclared'], plan: 'removeFilter' },
      },
    };
  },
};
