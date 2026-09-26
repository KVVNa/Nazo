// 未知の現象：温まった貯水槽で硫酸還元菌が増え、硫化水素が出ている。臭いは慣れて感じなくなる（嗅覚疲労）。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';

export const H2S: CaseTemplate = {
  id: 'h2s',
  title: '判断が鈍る乗員たち',
  category: 'phenomenon',
  needSide: ['quarters', 'lab', 'medbay'],
  needLower: ['waterplant'],
  build(g) {
    const E = g.byRole('engineer')!;
    const M = g.byRole('medic')!;
    const C = find(g, (c) => ['navigator', 'comms', 'security', 'cargo', 'cook'].includes(c.roleId), [E, M], g.cast);
    const W = find(g, () => true, [E, M, C]);
    const T = g.clock;
    const T0 = g.hm(g.int(1, 3), g.int(0, 50));
    const fail = T0 - 2 * 86400 - g.int(2, 5) * 3600;
    const ack = fail + g.int(60, 120) * 60;
    const smell = T0 - g.int(7, 8) * 3600;
    const corrode = T0 - g.int(50, 70) * 60;
    const start = T0 + g.int(10, 25) * 60;
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [C.id]: { room: 'bridge', known: ['F_c_ack'], hides: ['F_c_ack'] },
      [W.id]: { room: 'quarters', known: ['F_w_smell'], label: '頭を押さえている' },
      [E.id]: { room: 'quarters', known: ['F_e_belief'], label: '頭を押さえている' },
      [M.id]: { room: 'medbay' },
    };
    placeRest(g, crewInit, ['quarters', 'galley', 'lab', 'bridge', 'corridor']);
    const live = inComm(g, crewInit, ['lower']);
    const fixer = [E, ...g.others(E)].find((c) => live(c) && c.skills.mech >= 1 && c.id !== C.id)!;
    const sci = find(g, (c) => live(c) && c.skills.inv >= 2, [fixer, C]);
    const med = live(M) && M.id !== fixer.id && M.id !== sci.id ? M : find(g, (c) => live(c) && c.skills.med >= 1, [fixer, sci]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。頭痛やめまいを訴える乗員が相次ぎ、作業の手が遅くなっている。`,
        '下層の通信中継器が故障していて、下層の様子が分からない。',
        '体調が悪いのは、下層で働いた者と居住区で寝ていた者に多いようだ。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 医務室より：頭痛・めまい・目の痛みを訴える乗員が相次いでいる。下層の中継器は故障中。`,
      initialEvidence: ['headache'],
      truth: {
        cause: 'h2s_bloom',
        events: [
          { id: 'ev_fail', sec: fail, room: 'waterplant', actor: null, text: `2日前、水再生室の貯水槽のヒーターの温度調節器が壊れ、水温が32℃まで上がった。`, causes: ['ev_bloom', 'ev_alarm'] },
          { id: 'ev_alarm', sec: fail + 10 * 60, room: 'bridge', actor: null, text: '貯水槽の高温警報が鳴った。', causes: ['ev_ack'] },
          { id: 'ev_ack', sec: ack, room: 'bridge', actor: C.id, text: `${C.name}は誤報だと思い、警報を「確認済み」にして誰にも伝えなかった。`, causes: [] },
          { id: 'ev_bloom', sec: fail + 86400, room: 'waterplant', actor: null, text: '温まった水の中で硫酸還元菌が増え、硫化水素を出し始めた。', causes: ['ev_smell', 'ev_corrode', 'ev_symptom'] },
          { id: 'ev_smell', sec: smell, room: 'quarters', actor: W.id, text: `${T(smell)}ごろ、${W.name}は卵の腐ったような臭いに気づいた。濃くなると鼻が慣れて、臭いを感じなくなる。`, causes: [] },
          { id: 'ev_corrode', sec: corrode, room: 'engineering', actor: null, text: `${T(corrode)}、硫化水素で下層の中継器の銀の接点が黒く変わり、落ちた。`, causes: [] },
          { id: 'ev_symptom', sec: T0, room: 'medbay', actor: null, text: `${T(T0)}ごろから、頭痛とめまいを訴える乗員が増えた。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_fail', label: '貯水槽のヒーターの調節器が壊れる', sec: fail },
          { id: 'o_ack', label: '高温警報が「確認済み」にされる', sec: ack },
          { id: 'o_smell', label: '卵の腐ったような臭いがする', sec: smell },
          { id: 'o_corrode', label: '下層の中継器が落ちる', sec: corrode },
        ],
        responsible: { crew: C.id, role: 'falsified' },
        evidence: [
          ev('headache', '医務室からの一報', `${T(start)} 頭痛・めまい・目の痛みを訴える乗員が相次いでいる。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('tank_temp', '貯水槽の温度記録', '2日前から水温が32℃（通常は18℃）。ヒーターの温度調節器が故障している。', { room: 'waterplant', skill: 'mech', minSkill: 1, work: 4, fact: 'F_tank', key: true, where: '水再生室の貯水槽（下層）' }),
          ev('biofilm', '槽の内壁', '槽の内壁に黒いぬめり。かすかに卵の腐ったような臭いがする。', { room: 'waterplant', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_biofilm', key: true, where: '水再生室の貯水槽（下層）' }),
          ev('gas_reading', '空気の分析', '硫化水素を検出：下層40ppm、居住区15ppm、司令室5ppm。濃いところでは臭いを感じなくなる濃さだ。', { room: 'lab', skill: 'inv', minSkill: 2, work: 5, fact: 'F_h2s', key: true, where: `${g.rn('lab')}の分析装置（調査技能2以上）` }),
          ev('symptoms', '診察記録', '症状は頭痛・めまい・目の刺激。下層で働いた者と居住区で寝ていた者ほど重い。', { room: 'medbay', skill: 'med', minSkill: 1, work: 3, fact: 'F_symptoms', key: true, where: '医務室（医療技能が必要）' }),
          ev('alarm_ack', '警報の操作記録', `2日前：貯水槽の高温警報を「確認済み」に変更（${C.name}）。対応の記録はない。`, { room: 'bridge', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_ack', where: '司令室の警報記録' }),
          ev('relay_corr', '中継器の接点', '下層の中継器の銀の接点が黒く変色している。硫黄の化合物で錆びたものだ。', { relay: true, room: 'engineering', skill: 'mech', minSkill: 1, work: 3, fact: 'F_corr', where: '下層機関区の中継器' }),
          ev('ref_ok', '冷媒の点検', '冷媒の圧力は正常。漏れはない。', { room: 'engineering', skill: 'mech', minSkill: 1, work: 3, fact: 'F_ref_ok', where: '下層機関区の冷却系' }),
          said('w_claim', W.name, '夕方は卵が腐ったような臭いがしましたけど、夜にはもうしなくなりました。換気で抜けたんだと思います', 'F_w_smell', `${W.name}から話を聞く`),
          said('e_claim', E.name, '冷媒が漏れてるんじゃないか。頭が痛いのはそのせいだと思う', 'F_e_belief', `${E.name}から話を聞く`),
          said('c_claim', C.name, '警報ですか？ ここ数日、特に何も鳴っていませんよ', 'F_c_lie', `${C.name}から話を聞く`),
          { ...said('c_confess', C.name, '……貯水槽の高温警報、前にも誤報があったので、確認済みにしてしまいました', 'F_c_ack', `${C.name}に警報の操作記録か水温の記録を突きつける`), title: `${C.name}の告白` },
        ],
        misleads: [
          { evidence: 'w_claim', resolvedBy: ['gas_reading'], explain: '臭いが消えたのは抜けたからではなく、硫化水素が濃くなって鼻が慣れたからだった。' },
          { evidence: 'e_claim', resolvedBy: ['ref_ok', 'gas_reading'], explain: `${E.name}は冷媒を疑ったが、冷媒は正常で、空気から出たのは硫化水素だった。` },
          { evidence: 'c_claim', resolvedBy: ['alarm_ack', 'c_confess'], explain: `${C.name}は警報は鳴っていないと言ったが、2日前に自分で「確認済み」にした記録が残っていた。` },
        ],
      },
      rootEvent: 'ev_fail',
      damageEvent: 'ev_symptom',
      testimonies: [
        { crew: W.id, evidence: 'w_claim' },
        { crew: E.id, evidence: 'e_claim' },
        { crew: C.id, evidence: 'c_claim', lie: true },
      ],
      confessions: [{ crew: C.id, triggeredBy: ['alarm_ack', 'tank_temp'], evidence: 'c_confess' }],
      crewInit,
      whereabouts: [{ crew: W.id, sec: smell, room: 'quarters' }, { crew: C.id, sec: ack - 5 * 60, room: 'bridge' }, { crew: C.id, sec: ack + 5 * 60, room: 'bridge' }],
      commDown: ['lower'],
      vars: { gas: 40, heater: 1, clean: 0, vent: 0 },
      causeOptions: [
        { id: 'h2s_bloom', label: '温まった貯水槽で微生物が増え、硫化水素を出している', category: 'phenomenon' },
        { id: 'refrigerant', label: '冷媒が漏れている', category: 'accident' },
        { id: 'co_leak', label: 'どこかで一酸化炭素が出ている', category: 'accident' },
        { id: 'food', label: '食べ物に当たった', category: 'accident' },
        { id: 'gas_sabotage', label: '誰かが有毒なガスをまいた', category: 'sabotage' },
      ],
      unlock: {
        'cause:h2s_bloom': ['biofilm', 'gas_reading', 'tank_temp'], 'cause:refrigerant': ['e_claim'], 'cause:co_leak': ['headache'],
        'cause:food': ['headache'], 'cause:gas_sabotage': ['gas_reading'],
        'order:o_fail': ['tank_temp'], 'order:o_ack': ['alarm_ack', 'c_confess'], 'order:o_smell': ['w_claim', 'biofilm'], 'order:o_corrode': ['headache'],
        'plan:treatTank': ['biofilm', 'tank_temp'], 'plan:ventOnly': ['headache'], 'plan:evacLower': ['symptoms', 'gas_reading'], 'plan:refrigerant': ['e_claim'],
      },
      respond: { label: '体調不良の原因を探す', desc: '下層の機関区で空調と冷却系を調べる', room: 'engineering', waitLabel: '機関区で指示待ち' },
      fieldActions: [
        { id: 'heaterOff', room: 'waterplant', needs: 'F_tank', label: '貯水槽のヒーターを止める', ask: '貯水槽が32℃まで温まっています。ヒーターを止めてよいですか', why: '水温が上がり続けるのはまずいと判断', skill: 'mech', minSkill: 1, action: 'heaterOff' },
      ],
      plans: [
        { id: 'treatTank', label: '防毒マスクを着けて貯水槽を塩素処理し、ヒーターを止め、下層を換気する', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'waterplant', action: 'heaterOff', label: 'ヒーターの停止' }, { room: 'waterplant', action: 'chlorinate', label: '塩素処理' }, { room: 'engineering', action: 'ventLower', label: '下層の換気' }]
            : [{ room: 'engineering', action: 'ventLower', label: '下層の換気' }]) },
        { id: 'ventOnly', label: '下層を強制換気する', warn: '出どころが残っていれば、また濃くなる', score: 0.5, steps: () => [{ room: 'engineering', action: 'ventLower', label: '下層の換気' }] },
        { id: 'evacLower', label: '下層を立入禁止にし、寝る場所を司令室に移す', score: 0.3, steps: () => [{ room: 'corridor', action: 'evac', label: '立入禁止と移動の指示' }] },
        { id: 'refrigerant', label: '冷媒系統を止めて点検する', score: 0, steps: () => [{ room: 'engineering', action: 'refCheck', label: '冷媒系統の点検' }] },
      ],
      actions: {
        heaterOff: { minutes: () => 3, run: (a, c) => { a.v.heater = 0; a.report(c, '貯水槽のヒーターを止めた。水温はゆっくり下がり始める。'); } },
        chlorinate: { minutes: (a, c) => 8 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.clean = 1; a.report(c, '貯水槽を塩素処理した。ぬめりの菌が死に、ガスの元が止まった。'); } },
        ventLower: { minutes: () => 5, run: (a, c) => { a.v.gas = a.v.gas * 0.4; a.v.vent = 1; a.report(c, '下層を強制換気した。空気の濃さが一気に下がった。'); } },
        evac: { minutes: () => 3, run: (a, c) => {
          for (const x of a.crews()) if (x.alive && x.policy.kind !== 'plan') a.order(x, { kind: 'guard', room: 'bridge' });
          a.report(c, '下層を立入禁止にし、通信の届く全員を司令室に集めた。');
        } },
        refCheck: { minutes: () => 10, run: (a, c) => a.report(c, '冷媒系統を止めて点検したが、漏れはなかった。') },
      },
      tick(a) {
        const v = a.v;
        const src = v.clean ? 0 : v.heater ? 1 : 0.5;
        v.gas = Math.max(0, v.gas + src * 0.03 - (v.clean ? 0.08 : 0));
        if (v.gas > 55 && a.once('g55')) a.alarm('下層で強い刺激臭の苦情。立ちくらみで倒れかけた者がいる。', '体調悪化');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          const lower = ['engineering', 'waterplant', 'powerroom', 'airlock'].includes(c.room);
          const ppm = v.gas * (lower ? 1 : c.room === 'quarters' ? 0.6 : 0.15) * (c.policy.kind === 'plan' ? 0.2 : 1);
          c.impair = Math.min(0.6, ppm * 0.01);
          if (ppm > 25) c.health -= (ppm - 25) * 0.006;
        }
        a.setComm('lower', !v.relay_lower);
      },
      meters: (m) => [
        m.has('gas_reading') ? pct('下層の空気', Math.max(0, 100 - m.v.gas * 1.5), 55, 30, `硫化水素 約${Math.round(m.v.gas)}ppm`) : { label: '空気', value: 70, text: '未分析', sub: '分析すれば分かる', level: 'warn' },
        pct('酸素', m.o2),
        hullMeter(m),
      ],
      marks: (m) => (m.has('biofilm') ? [{ room: 'waterplant', text: '黒いぬめり（報告）', color: '#6f7a3a' }] : []),
      resolved: (a) => !!(a.v.clean && !a.v.heater),
      resolvedText: '貯水槽の菌が止まり、空気がきれいになり始めた。',
      epilogue: (e) => genericEpilogue(e, {
        [C.id]: e.crew.find((c) => c.id === C.id)!.confessed ? `${C.name}は「確認済み」にした警報は必ず誰かに伝えると決め、当直の引き継ぎ表に欄を作った。` : `${C.name}は、あの警報のことを誰にも話さないままだ。`,
        [W.id]: e.has('gas_reading') ? `${W.name}は「臭いが消えたら安心」ではないと知って、少し青ざめた。` : '',
        [E.id]: e.v.clean ? `${E.name}は貯水槽に温度の二重監視を付けた。` : '',
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'investigate', room: 'waterplant' }], [sci.id]: [{ kind: 'investigate', room: 'lab' }, { kind: 'investigate', room: 'bridge' }], [med.id]: [{ kind: 'investigate', room: 'medbay' }] },
        hyp: { category: 'phenomenon', cause: 'h2s_bloom', order: ['o_fail', 'o_ack', 'o_smell', 'o_corrode'], person: { crew: C.id, role: 'falsified' }, evidence: ['tank_temp', 'biofilm', 'gas_reading', 'symptoms'], plan: 'treatTank' },
      },
    };
  },
};
