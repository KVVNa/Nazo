// 工作：密輸品を拾うため、乗員が他人のログインで自動航法に経由点を足した。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';

export const NAVTAMPER: CaseTemplate = {
  id: 'nav_tamper',
  title: '航路データの改ざん',
  category: 'sabotage',
  needSide: ['comms', 'cargo', 'medbay'],
  needLower: [],
  build(g) {
    const M = g.byRole('medic')!;
    const S = find(g, (c) => ['comms', 'cargo', 'security', 'navigator', 'cook'].includes(c.roleId), [M, g.byRole('engineer')], g.cast);
    const B = find(g, (c) => c.roleId === 'navigator' || c.roleId === 'scientist', [M, S]);
    const N = find(g, () => true, [M, S, B]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 2), g.int(0, 55));
    const door = T0 - 4 * 60;
    const pull = T0 + 6 * 60;
    const start = T0 + g.int(55, 75) * 60;
    const eta = g.int(140, 160);
    const grp = g.groupOf('comms');
    const relayRoom = g.relayOf(grp);
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [S.id]: { room: 'corridor', known: ['F_s_did'], hides: ['F_s_did'] },
      [B.id]: { room: 'medbay', known: ['F_b_alibi'] },
      [M.id]: { room: 'medbay' },
      [N.id]: { room: 'bridge', known: ['F_n_belief'] },
    };
    placeRest(g, crewInit, ['quarters', 'galley', 'lab', 'bridge', 'engineering']);
    if (g.groupOf(crewInit[B.id].room) === grp) crewInit[B.id].room = 'corridor';
    if (g.groupOf('medbay') === grp) crewInit[M.id].room = 'corridor';
    const live = inComm(g, crewInit, [grp]);
    const pilot = find(g, (c) => live(c) && c.skills.inv >= 1, [S]);
    const inv = find(g, (c) => live(c) && c.skills.inv >= 1, [S, pilot]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。船が予定航路から外れ、見覚えのない経由点に向かっている。`,
        `このまま進むと、約${eta}分後に岩屑の多い宙域に入る。`,
        `${GROUP_NAME[grp]}系統の通信中継器が応答しない。`,
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 航路逸脱を検知。自動航法が登録外の経由点へ向かっている。${GROUP_NAME[grp]}系統の中継器が応答しない。`,
      initialEvidence: ['course_alarm'],
      truth: {
        cause: 'smuggling_tamper',
        events: [
          { id: 'ev_debt', sec: T0 - 10 * 86400, room: 'corridor', actor: null, text: `${S.name}は借金の取り立て屋から、漂流する貨物ポッドを拾うよう頼まれていた。`, causes: ['ev_door'] },
          { id: 'ev_door', sec: door, room: 'comms', actor: S.id, text: `${T(door)}、${S.name}は通信室に入った。`, causes: ['ev_tamper'] },
          { id: 'ev_tamper', sec: T0, room: 'comms', actor: S.id, text: `${T(T0)}、${S.name}は付箋で知った${B.name}のパスワードを使い、通信室の端末から自動航法に経由点を足した。`, causes: ['ev_course'] },
          { id: 'ev_pull', sec: pull, room: relayRoom, actor: S.id, text: `${T(pull)}、${S.name}は${GROUP_NAME[grp]}系統の中継器のプラグを抜き、通信室まわりの様子を隠した。`, causes: [] },
          { id: 'ev_course', sec: T0 + 60, room: 'bridge', actor: null, text: '船は新しい経由点に向かって進路を変えた。その先は岩屑の多い宙域だった。', causes: ['ev_alarm'] },
          { id: 'ev_alarm', sec: start, room: 'bridge', actor: null, text: `${T(start)}、航路逸脱の警報が鳴った。`, causes: [] },
          { id: 'ev_check', sec: T0 - 10 * 60, room: 'medbay', actor: B.id, text: `そのころ${B.name}は、医務室で${M.name}の健康診断を受けていた。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_door', label: '通信室のドアが開く', sec: door },
          { id: 'o_tamper', label: '経由点が追加される', sec: T0 },
          { id: 'o_pull', label: '中継器のプラグが抜かれる', sec: pull },
          { id: 'o_alarm', label: '航路逸脱の警報が鳴る', sec: start },
        ],
        responsible: { crew: S.id, role: 'sabotage' },
        evidence: [
          ev('course_alarm', '航路逸脱の警報', `${T(start)} 予定航路から逸脱。自動航法が登録外の経由点へ向かっている。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('nav_log', '自動航法の変更記録', `${T(T0)} 経由点を1か所追加。ログイン：${B.name}。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_waypoint', key: true, where: '司令室の航法ログ' }),
          ev('debris_chart', '宙域図', '追加された経由点の周辺は岩屑の多い宙域。元の航路計画では避けていた。', { room: 'bridge', work: 3, fact: 'F_debris', where: '司令室の宙域図' }),
          ev('door_comms', '通信室のドア記録', `${T(door)} 通信室ドア開閉（認証：${S.name}）。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_door', key: true, where: '司令室の船内ドア記録' }),
          ev('login_trace', 'ログインの発信元', `${T(T0)}の${B.name}のログインは、通信室の端末から行われている。${B.name}の個人端末ではない。`, { room: 'comms', skill: 'inv', minSkill: 1, work: 4, fact: 'F_trace', key: true, where: '通信室の端末' }),
          ev('beacon', 'ビーコンの受信記録', '経由点の近くから、登録のない貨物ポッドの弱いビーコン。', { room: 'comms', skill: 'mech', minSkill: 1, work: 3, fact: 'F_beacon', where: '通信室の受信機' }),
          ev('manifest', '貨物室の積付表', '空きコンテナ1個が「受け入れ準備済み」になっている。積む予定の申告はない。', { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_container', key: true, where: '貨物室の積付表' }),
          ev('med_record', '健康診断の記録', `${T(T0 - 10 * 60)}〜${T(T0 + 15 * 60)} ${B.name}：定期健康診断（担当：${M.name}）。`, { room: 'medbay', source: 'record', work: 2, fact: 'F_b_alibi', where: '医務室の記録' }),
          ev('relay_pulled', '中継器のプラグ', '中継器の電源プラグが抜かれていた。差し込みは固く、偶然抜けることはない。', { relay: true, room: relayRoom, source: 'trace', work: 3, fact: 'F_pulled', where: `${g.rn(relayRoom)}の中継器` }),
          said('s_claim', S.name, `その時間は${g.has('quarters') ? g.rn('quarters') : '自分の寝台'}で寝ていました。何も知りません`, 'F_s_lie', `${S.name}から話を聞く`),
          { ...said('s_confess', S.name, '……借金の取り立て屋に、ポッドを拾ってこいと言われて。積荷を拾ったら、すぐ航路を戻すつもりでした', 'F_s_did', `${S.name}にドア記録かログインの発信元を突きつける`), title: `${S.name}の告白` },
          said('b_claim', B.name, 'その時間は医務室で健康診断を受けていました。……パスワード、端末に付箋で貼っていました', 'F_b_alibi', `${B.name}から話を聞く`),
          said('n_claim', N.name, '自動航法の不具合じゃないですか。前にも表示がおかしくなったことがあります', 'F_n_belief', `${N.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'nav_log', resolvedBy: ['login_trace', 'med_record'], explain: `記録上は${B.name}のログインだったが、${B.name}はその時間医務室にいた。ログインは通信室の端末からで、付箋のパスワードが使われていた。` },
          { evidence: 'n_claim', resolvedBy: ['nav_log'], explain: `${N.name}は不具合を疑ったが、経由点は人の手で追加されていた。` },
          { evidence: 's_claim', resolvedBy: ['door_comms', 's_confess'], explain: `${S.name}は寝ていたと言ったが、同じ時刻に通信室へ入った記録が残っていた。` },
        ],
      },
      rootEvent: 'ev_debt',
      damageEvent: 'ev_course',
      testimonies: [
        { crew: S.id, evidence: 's_claim', lie: true },
        { crew: B.id, evidence: 'b_claim' },
        { crew: N.id, evidence: 'n_claim' },
      ],
      confessions: [{ crew: S.id, triggeredBy: ['door_comms', 'login_trace'], evidence: 's_confess' }],
      crewInit,
      whereabouts: [
        { crew: S.id, sec: door, room: 'comms' }, { crew: S.id, sec: pull, room: relayRoom }, { crew: S.id, sec: pull + 10 * 60, room: 'corridor' },
        { crew: B.id, sec: T0 - 10 * 60, room: 'medbay' }, { crew: B.id, sec: T0 + 15 * 60, room: 'medbay' },
        { crew: M.id, sec: T0 - 10 * 60, room: 'medbay' }, { crew: M.id, sec: T0 + 15 * 60, room: 'medbay' },
      ],
      commDown: [grp],
      vars: { onCourse: 0, locked: 0, eta, readd: 0, hit: 0 },
      causeOptions: [
        { id: 'smuggling_tamper', label: '乗員が私的な目的で航法データを書き換えた', category: 'sabotage' },
        { id: 'nav_bug', label: '自動航法のソフトの不具合で経由点が作られた', category: 'accident' },
        { id: 'hijack_signal', label: '外部からの信号で航法を乗っ取られた', category: 'sabotage' },
        { id: 'star_sensor', label: '星追跡センサーの誤差で航路がずれた', category: 'accident' },
        { id: 'grav', label: '未知の重力の乱れで航路がそれた', category: 'phenomenon' },
      ],
      unlock: {
        'cause:smuggling_tamper': ['nav_log', 'login_trace'], 'cause:nav_bug': ['course_alarm'], 'cause:hijack_signal': ['beacon'],
        'cause:star_sensor': ['course_alarm'], 'cause:grav': ['debris_chart'],
        'order:o_door': ['door_comms'], 'order:o_tamper': ['nav_log'], 'order:o_pull': ['relay_pulled'], 'order:o_alarm': ['course_alarm'],
        'plan:restoreLock': ['nav_log'], 'plan:evade': ['course_alarm'], 'plan:rebootNav': ['course_alarm'],
      },
      respond: { label: '航路を点検', desc: '司令室で航法の記録と計算を調べる', room: 'bridge', waitLabel: '司令室で航路を監視中' },
      fieldActions: [
        { id: 'deleteWp', room: 'bridge', needs: 'F_waypoint', label: '経由点を消して元の航路に戻す', ask: '経由点が人の手で足されています。消して元の航路に戻してよいですか', why: '岩屑の宙域に入る前に戻すべきだと判断', skill: 'inv', minSkill: 1, action: 'restore' },
      ],
      plans: [
        { id: 'restoreLock', label: '経由点を消して航路を戻し、航法の変更権限を止める', score: 1, skill: 'inv',
          steps: (p) => [{ room: 'bridge', action: 'restore', label: '航路の復旧' }, ...(p.knowsCause ? [{ room: 'bridge', action: 'lockNav', label: '変更権限の停止' }] : [])] },
        { id: 'evade', label: '手動で回避軌道に入り、時間を稼ぐ', score: 0.4, skill: 'inv', steps: () => [{ room: 'bridge', action: 'evade', label: '回避軌道への変更' }] },
        { id: 'rebootNav', label: '航法コンピュータを再起動する', warn: '書き換えが残っていれば同じことが起きる', score: 0.1, steps: () => [{ room: 'bridge', action: 'restore', label: '航法の再起動' }] },
      ],
      actions: {
        restore: { minutes: () => 4, run: (a, c) => { a.v.onCourse = 1; a.v.readd = a.now() + 20 * 60; a.report(c, '追加された経由点を消し、元の航路に戻した。'); } },
        lockNav: { minutes: () => 3, run: (a, c) => { a.v.locked = 1; a.report(c, '全員の航法変更権限を止め、船長の承認がないと変えられないようにした。'); } },
        evade: { minutes: () => 5, run: (a, c) => { a.v.eta += 60; a.report(c, '手動で回避軌道に入った。岩屑の宙域に入るまで1時間延びた。'); } },
      },
      tick(a) {
        const v = a.v;
        const s = a.crew(S.id);
        if (!v.onCourse && !v.hit) {
          v.eta -= 1 / 6;
          if (v.eta <= 30 && a.once('eta30')) a.alarm('岩屑の宙域まで30分。', '衝突の危険');
          if (v.eta <= 0) {
            v.hit = 1;
            a.w.hull -= 45;
            for (const c of a.crews()) if (c.alive) a.hurt(c.id, 20);
            a.alarm('岩屑の宙域に入った。船体に次々と衝突、損傷が大きい。', '衝突');
          }
        }
        // 権限が止められず、本人が自由なら、また経由点を足す
        if (v.onCourse && !v.locked && s.alive && s.policy.kind !== 'detained' && a.now() >= v.readd && v.readd > 0) {
          v.onCourse = 0; v.readd = 0;
          a.alarm('経由点が再び追加された。船がまた航路を外れた。', '航路が再び書き換えられた');
        }
        a.setComm(grp, !v['relay_' + grp]);
      },
      meters: (m) => [
        m.v.onCourse ? { label: '航路', value: 100, text: '予定航路', level: '' } : m.v.hit ? { label: '航路', value: 0, text: '衝突した', level: 'bad' } :
          { label: '岩屑の宙域まで', value: Math.max(0, (m.v.eta / 160) * 100), text: `${Math.max(0, Math.round(m.v.eta))}分`, level: m.v.eta < 30 ? 'bad' : m.v.eta < 60 ? 'warn' : '' },
        pct('酸素', m.o2),
        hullMeter(m),
      ],
      marks: (m) => (m.has('relay_pulled') ? [{ room: relayRoom, text: '抜かれたプラグ（報告）', color: '#d88a3a' }] : []),
      resolved: (a) => !!(a.v.onCourse && (a.v.locked || a.crew(S.id).policy.kind === 'detained')),
      resolvedText: '船は予定航路に戻り、勝手に書き換えられることもなくなった。',
      epilogue: (e) => genericEpilogue(e, {
        [S.id]: e.crew.find((c) => c.id === S.id)!.confessed ? `${S.name}は取り立て屋とのやり取りをすべて差し出し、寄港後に当局の聴取を受けることになった。` : e.grade === '真相解明' ? `${S.name}は証拠を前に黙り込んだ。` : `${S.name}は何食わぬ顔で持ち場に戻った。空きコンテナは、まだ「受け入れ準備済み」のままだ。`,
        [B.id]: e.has('login_trace') ? `${B.name}は付箋を剥がし、パスワードを変えた。疑いが晴れて、ほっとした顔をしている。` : `${B.name}は、記録に自分の名前が残ったことを気に病んでいる。`,
      }),
      solve: {
        policies: { [pilot.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'comms' }, { kind: 'investigate', room: 'cargo' }, ...(['comms', 'cargo'].includes(relayRoom) ? [] : [{ kind: 'investigate' as const, room: relayRoom }])] },
        hyp: { category: 'sabotage', cause: 'smuggling_tamper', order: ['o_door', 'o_tamper', 'o_pull', 'o_alarm'], person: { crew: S.id, role: 'sabotage' }, evidence: ['nav_log', 'login_trace', 'door_comms', 'manifest'], plan: 'restoreLock' },
      },
    };
  },
};
