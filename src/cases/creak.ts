// 未知の現象（に見える）：恒星の近くで熱平衡回転を止めたため、日照側だけが熱せられて外板の継ぎ目が鳴っている。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';

export const CREAK: CaseTemplate = {
  id: 'creak',
  title: '船体が鳴る',
  category: 'phenomenon',
  needSide: [],
  needLower: [],
  build(g) {
    const E = g.byRole('engineer')!;
    const N = find(g, (c) => c.roleId === 'navigator' || c.roleId === 'comms', [E], g.cast);
    const W = find(g, () => true, [E, N]);
    const T = g.clock;
    const portRooms = g.rooms.filter((r) => r.group === 'port').sort((a, b) => a.rect[1] - b.rect[1]).map((r) => r.id);
    const sun = portRooms[0];
    const sun2 = portRooms[1];
    const memo = g.hm(9, 0) - 5 * 86400;
    const R = g.hm(g.int(22, 23), g.int(0, 55));
    const T0 = R + g.int(80, 100) * 60;
    const relay = T0 + g.int(30, 45) * 60;
    const start = relay + g.int(10, 20) * 60;
    const heard = T0 + g.int(15, 25) * 60;
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [N.id]: { room: 'bridge', known: ['F_n_stop'], hides: ['F_n_stop'] },
      [W.id]: { room: 'corridor', known: ['F_w_steps'] },
      [E.id]: { room: 'corridor', known: ['F_e_roll'] },
    };
    placeRest(g, crewInit, ['bridge', 'engineering', 'corridor', ...g.rooms.filter((r) => r.group === 'starboard').map((r) => r.id)]);
    const live = inComm(g, crewInit, ['port']);
    const fixer = bestLive(g, crewInit, ['port'], 'mech', [N]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, N]);
    const inv2 = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, N, inv]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。${T(T0)}から、左舷のほうで「ガン」という大きな音が数分おきに続いている。`,
        '乗員の中には、誰かが潜んでいるのではと言い出す者もいる。',
        '左舷系統の通信中継器が落ちて、左舷の区画と連絡が取れない。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(T0)}から左舷で衝撃音が続いている。${T(relay)} 左舷系統の中継器が保護停止。`,
      initialEvidence: ['bang_alarm'],
      truth: {
        cause: 'thermal_roll',
        events: [
          { id: 'ev_memo', sec: memo, room: 'bridge', actor: null, text: '5日前、運航会社から「燃料節約のため不要な姿勢制御を控えること」という通達が来た。', causes: ['ev_stop'] },
          { id: 'ev_stop', sec: R, room: 'bridge', actor: N.id, text: `${T(R)}、${N.name}は通達に従うつもりで、熱平衡回転（ロール）を止めた。恒星に近づいている最中だった。`, causes: ['ev_heat'] },
          { id: 'ev_heat', sec: R + 30 * 60, room: sun, actor: null, text: '回転が止まり、左舷だけが日に当たり続けて熱くなった。反対側は冷えていった。', causes: ['ev_bang', 'ev_relay'] },
          { id: 'ev_bang', sec: T0, room: sun, actor: null, text: `${T(T0)}、熱で伸びた外板が継ぎ目で引っかかっては滑り、大きな音を立て始めた。`, causes: [] },
          { id: 'ev_heard', sec: heard, room: 'corridor', actor: W.id, text: `${T(heard)}、${W.name}は通路でその音を聞き、誰かの足音だと思った。`, causes: [] },
          { id: 'ev_relay', sec: relay, room: sun, actor: null, text: `${T(relay)}、左舷の中継器が熱で保護停止した。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_memo', label: '燃料節約の通達が届く', sec: memo },
          { id: 'o_stop', label: '熱平衡回転が止められる', sec: R },
          { id: 'o_bang', label: '最初の大きな音', sec: T0 },
          { id: 'o_relay', label: '左舷の中継器が止まる', sec: relay },
        ],
        responsible: { crew: N.id, role: 'falsified' },
        evidence: [
          ev('bang_alarm', '衝撃音の記録', `${T(T0)}から左舷で衝撃音。数分おきに続いている。`, { room: 'bridge', work: 0, fact: 'F_bang', where: '初期情報' }),
          ev('hull_temp', '外壁の温度', '外壁温度：左舷（日照側）は140℃を超え、上限の150℃に迫っている。右舷（日陰側）はマイナス60℃。', { room: sun, skill: 'mech', minSkill: 1, work: 3, fact: 'F_hot', key: true, where: `${g.rn(sun)}の外壁センサー` }),
          ev('joint_marks', '継ぎ目の擦れ跡', '外壁の継ぎ目に新しい擦れ跡。熱で伸び縮みして、こすれ合っている。', { room: sun2, source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_joint', key: true, where: `${g.rn(sun2)}の外壁` }),
          ev('roll_log', '姿勢制御の記録', `${T(R)} 熱平衡回転（ロール）を停止。操作者：${N.name}。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_roll', key: true, where: '司令室の姿勢制御ログ' }),
          ev('bang_period', '音の間隔', '衝撃音の間隔は、左舷の温度が上がるほど短くなっている。', { room: 'bridge', skill: 'inv', minSkill: 1, work: 4, fact: 'F_period', key: true, where: '司令室の音響センサー' }),
          ev('fuel_memo', '運航会社の通達', '5日前：燃料節約のため、不要な姿勢制御を控えること。', { room: 'bridge', source: 'record', work: 2, fact: 'F_memo', where: '司令室の受信記録' }),
          ev('headcount', '所在の記録', '衝撃音がした時刻に、左舷の区画にいた乗員はいない。未登録の人の出入りの記録もない。', { room: 'bridge', source: 'record', skill: 'inv', minSkill: 1, work: 3, fact: 'F_headcount', where: '司令室のドア記録' }),
          said('w_claim', W.name, '左舷のほうで足音みたいな音がしました。誰か潜んでいるんじゃないですか', 'F_w_steps', `${W.name}から話を聞く`),
          said('n_claim', N.name, 'ロールは自動で止まったんです。私は何もしていません', 'F_n_lie', `${N.name}から話を聞く`),
          { ...said('n_confess', N.name, '……燃料節約の通達があったので、止めても大丈夫だと思ったんです。恒星に近いことまで考えていませんでした', 'F_n_stop', `${N.name}に姿勢制御の記録を突きつける`), title: `${N.name}の告白` },
          said('e_claim', E.name, '恒星に近いあいだは、船を回しておかないと片側だけ焼けるんです。回ってますよね？', 'F_e_roll', `${E.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'w_claim', resolvedBy: ['headcount', 'bang_period'], explain: '足音に聞こえたのは、熱で伸びた外板の継ぎ目が鳴る音だった。左舷に人はいなかった。' },
          { evidence: 'n_claim', resolvedBy: ['roll_log', 'n_confess'], explain: `${N.name}は自動で止まったと言ったが、記録には本人が止めた操作が残っていた。` },
        ],
      },
      rootEvent: 'ev_stop',
      damageEvent: 'ev_bang',
      testimonies: [
        { crew: W.id, evidence: 'w_claim' },
        { crew: N.id, evidence: 'n_claim', lie: true },
        { crew: E.id, evidence: 'e_claim' },
      ],
      confessions: [{ crew: N.id, triggeredBy: ['roll_log'], evidence: 'n_confess' }],
      crewInit,
      whereabouts: [{ crew: N.id, sec: R, room: 'bridge' }, { crew: W.id, sec: heard, room: 'corridor' }],
      commDown: ['port'],
      vars: { temp: 142, roll: 0, coolant: 0, closed: 0 },
      causeOptions: [
        { id: 'thermal_roll', label: '回転を止めた船体の片側だけが熱せられ、外板の継ぎ目が鳴っている', category: 'phenomenon' },
        { id: 'stowaway', label: '密航者が船内に潜んでいる', category: 'sabotage' },
        { id: 'debris', label: '小さなデブリが当たり続けている', category: 'accident' },
        { id: 'loose_cargo', label: '固定の外れた積荷が動いてぶつかっている', category: 'accident' },
        { id: 'resonance', label: 'ポンプの振動が船体と共振している', category: 'accident' },
      ],
      unlock: {
        'cause:thermal_roll': ['hull_temp', 'joint_marks', 'roll_log'], 'cause:stowaway': ['w_claim', 'bang_alarm'], 'cause:debris': ['bang_alarm'],
        'cause:loose_cargo': ['bang_alarm'], 'cause:resonance': ['bang_period'],
        'order:o_memo': ['fuel_memo'], 'order:o_stop': ['roll_log'], 'order:o_bang': ['bang_alarm'], 'order:o_relay': ['bang_alarm'],
        'plan:resumeRoll': ['roll_log', 'e_claim'], 'plan:coolant': ['hull_temp'], 'plan:closeSun': ['hull_temp'], 'plan:search': ['w_claim', 'bang_alarm'],
      },
      respond: { label: '異音の出どころを調べる', desc: `左舷の${g.rn(sun)}で音の元を探す`, room: sun, waitLabel: `${g.rn(sun)}で音を聞いている` },
      fieldActions: [
        { id: 'cool', room: sun, needs: 'F_hot', label: '冷却材を左舷に回す', ask: '左舷の外壁が上限近くまで熱くなっています。冷却材を左舷に回してよいですか', why: '上限を超える前に少しでも熱を逃がすべきだと判断', skill: 'mech', minSkill: 1, action: 'coolant' },
      ],
      plans: [
        { id: 'resumeRoll', label: '熱平衡回転を再開して、船体の熱を均す', score: 1, skill: 'inv',
          steps: (p) => (p.knowsCause ? [{ room: 'bridge', action: 'resumeRoll', label: '回転の再開' }] : [{ room: sun, action: 'searchIntruder', label: '左舷の捜索' }]) },
        { id: 'coolant', label: '冷却材を左舷に回して温度上昇を抑える', score: 0.5, steps: () => [{ room: sun, action: 'coolant', label: '冷却材の切り替え' }] },
        { id: 'closeSun', label: '左舷の区画を閉鎖して機器を止める', score: 0.3, steps: () => [{ room: 'corridor', action: 'closeSun', label: '左舷の閉鎖' }] },
        { id: 'search', label: '密航者を探して船内を捜索する', score: 0, skill: 'inv', steps: () => [{ room: sun, action: 'searchIntruder', label: '捜索' }] },
      ],
      actions: {
        resumeRoll: { minutes: () => 4, run: (a, c) => { a.v.roll = 1; a.report(c, '熱平衡回転を再開した。左舷の温度が下がり始め、音の間隔が延びていく。'); } },
        coolant: { minutes: () => 5, run: (a, c) => { a.v.coolant = 1; a.report(c, '冷却材を左舷に回した。温度の上がり方がゆるやかになった。'); } },
        closeSun: { minutes: () => 3, run: (a, c) => { a.v.closed = 1; a.report(c, '左舷の区画を閉じ、機器を止めた。熱による機器の損傷は抑えられる。'); } },
        searchIntruder: { minutes: () => 10, run: (a, c) => a.report(c, '左舷を探したが、人の気配はどこにもない。音は壁の中から聞こえる。') },
      },
      tick(a) {
        const v = a.v;
        if (v.roll) v.temp = Math.max(60, v.temp - 0.15);
        else v.temp += 0.02 * (v.coolant ? 0.3 : 1);
        if (v.temp > 150 && a.once('t150')) a.alarm('左舷の外壁が上限150℃を超えた。継ぎ目のシールが傷み始める。', '外壁が上限超え');
        if (v.temp > 150) { a.w.hull = Math.max(0, a.w.hull - (v.temp - 150) * 0.01 * (v.closed ? 0.5 : 1)); }
        a.setComm('port', !v.relay_port && v.temp > 100);
      },
      meters: (m) => [
        m.has('hull_temp') ? { label: '左舷外壁', value: Math.min(100, (m.v.temp / 160) * 100), text: `${Math.round(m.v.temp)}℃`, sub: '上限150℃', level: m.v.temp > 148 ? 'bad' : m.v.temp > 140 ? 'warn' : '' }
          : { label: '左舷外壁', value: 50, text: '未確認', level: '' },
        pct('酸素', m.o2),
        hullMeter(m),
      ],
      marks: (m) => (m.has('joint_marks') ? [{ room: sun2, text: '継ぎ目の擦れ（報告）', color: '#d8b060' }] : []),
      resolved: (a) => !!a.v.roll,
      resolvedText: '船が再び回り始め、外壁の温度が下がっていく。音もやがて止むだろう。',
      epilogue: (e) => genericEpilogue(e, {
        [N.id]: e.crew.find((c) => c.id === N.id)!.confessed ? `${N.name}は運航会社に、通達には恒星の近くでの例外が必要だと報告書を送った。` : `${N.name}は姿勢制御の画面を、何度も確かめるようになった。`,
        [W.id]: e.has('headcount') ? `${W.name}は「足音」の正体を聞いて、しばらく照れくさそうにしていた。` : `${W.name}は今も、左舷の通路を一人で歩くのを避けている。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }], [inv2.id]: [{ kind: 'investigate', room: sun2 }] },
        hyp: { category: 'phenomenon', cause: 'thermal_roll', order: ['o_memo', 'o_stop', 'o_bang', 'o_relay'], person: { crew: N.id, role: 'falsified' }, evidence: ['hull_temp', 'joint_marks', 'roll_log', 'bang_period'], plan: 'resumeRoll' },
      },
    };
  },
};
