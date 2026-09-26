// 犯罪（同情できる動機）：怪我を隠していた乗員が鎮痛剤を盗み、飲みすぎて下層で倒れている。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { find, genericEpilogue, hullMeter, inComm, pct, placeRest, line } from './common';

export const PAINKILLER: CaseTemplate = {
  id: 'painkiller',
  title: '鎮痛剤の盗難',
  category: 'sabotage',
  needSide: ['medbay', 'cargo', 'quarters'],
  needLower: ['waterplant'],
  build(g) {
    const M = g.byRole('medic')!;
    const E = g.byRole('engineer')!;
    const P = find(g, (c) => ['cargo', 'security', 'cook'].includes(c.roleId), [M, E], g.cast);
    const Q = find(g, () => true, [M, E, P]);
    const Z = find(g, () => true, [M, E, P, Q]);
    const T = g.clock;
    const T0 = g.hm(g.int(0, 1), g.int(0, 50));
    const enter = T0 + g.int(6, 10) * 60;
    const collapse = T0 + g.int(55, 65) * 60;
    const start = T0 + g.int(75, 90) * 60;
    const maintEnd = start + g.int(65, 80) * 60;
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string; health?: number }> = {
      [P.id]: { room: 'waterplant', label: '意識がない', health: 70, known: ['F_p_did'], hides: ['F_p_did'] },
      [E.id]: { room: 'engineering', label: '中継器の定期整備中', known: ['F_e_saw'] },
      [M.id]: { room: 'medbay', known: ['F_m_code'] },
      [Q.id]: { room: 'quarters', known: ['F_q_saw'] },
      [Z.id]: { room: 'bridge', known: ['F_z_belief'] },
    };
    placeRest(g, crewInit, ['galley', 'lab', 'comms', 'bridge', 'corridor']);
    const live = inComm(g, crewInit, ['lower']);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [M, P]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。医務室の薬品庫で、管理薬品の数が記録と合わない。`,
        `下層の通信中継器は定期整備で止まっていて、${T(maintEnd)}ごろまで下層とは連絡が取れない。`,
        '薬がどこへ行ったのか、誰が持ち出したのかを突き止めてほしい。',
        '仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 医務室の薬品庫：開閉記録と管理薬品の在庫が合わない。下層の中継器は定期整備で停止中。`,
      initialEvidence: ['stock_alarm', 'maint_plan'],
      truth: {
        cause: 'overdose_theft',
        events: [
          { id: 'ev_injury', sec: T0 - 3 * 86400, room: 'cargo', actor: P.id, text: line(P, 'painkiller.injury', `3日前、${P.name}は荷役中に重い箱を落として手首と腰を痛めた。契約を切られるのが怖くて、申告しなかった。`), causes: ['ev_theft'] },
          { id: 'ev_theft', sec: T0, room: 'medbay', actor: P.id, text: `${T(T0)}、${P.name}は以前盗み見た${M.name}の暗証番号で薬品庫を開け、鎮痛剤を持ち出した。`, causes: ['ev_enter'] },
          { id: 'ev_enter', sec: enter, room: 'waterplant', actor: P.id, text: `${T(enter)}、${P.name}は人目を避けて水再生室に入り、痛みに耐えかねて多めに飲んだ。`, causes: ['ev_collapse'] },
          { id: 'ev_collapse', sec: collapse, room: 'waterplant', actor: P.id, text: `${T(collapse)}ごろ、${P.name}は呼吸が浅くなり、意識を失った。`, causes: [] },
          { id: 'ev_maint', sec: start - 20 * 60, room: 'engineering', actor: E.id, text: `${E.name}は予定どおり下層の中継器を整備していた（無関係）。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_injury', label: line(P, 'painkiller.o_injury', '荷役中に箱が落ちる'), sec: T0 - 3 * 86400 },
          { id: 'o_theft', label: '薬品庫が開けられる', sec: T0 },
          { id: 'o_enter', label: '誰かが水再生室に入る', sec: enter },
          { id: 'o_collapse', label: '誰かが倒れる', sec: collapse },
        ],
        responsible: { crew: P.id, role: 'sabotage' },
        evidence: [
          ev('stock_alarm', '薬品庫の警告', `${T(start)} 管理薬品の在庫が開閉記録と合わない。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('maint_plan', '整備予定', `今夜：下層の通信中継器の定期整備（担当：${E.name}、${T(start - 20 * 60)}〜${T(maintEnd)}）。`, { room: 'bridge', source: 'record', work: 0, fact: 'F_maint', where: '初期情報' }),
          ev('locker_log', '薬品庫の解錠記録', `${T(T0)} 薬品庫を解錠（暗証番号：${M.name}のもの）。`, { room: 'medbay', work: 2, fact: 'F_locker', key: true, where: '医務室の薬品庫' }),
          ev('med_count', '薬の数', '鎮痛剤（オピオイド系）が10錠足りない。飲みすぎると呼吸が弱くなる種類だ。', { room: 'medbay', skill: 'med', minSkill: 1, work: 3, fact: 'F_opioid', key: true, where: '医務室（医療技能が必要）' }),
          ev('fiber', '取っ手の繊維', '薬品庫の取っ手に、厚手の作業用手袋の繊維が付いている。', { room: 'medbay', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_fiber', key: true, where: '医務室の薬品庫' }),
          ev('m_alibi', '当直の引き継ぎ記録', `${T(T0 - 5 * 60)}〜${T(T0 + 15 * 60)} ${M.name}は司令室で当直の引き継ぎ中。`, { room: 'bridge', source: 'record', skill: 'inv', minSkill: 1, work: 3, fact: 'F_m_alibi', key: true, where: '司令室のログイン記録' }),
          ev('work_log', '荷役の作業記録', line(P, 'painkiller.worklog', `3日前：${P.name}が重い箱を落として作業を中断。負傷の申告はない。`), { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_injury', key: true, where: `${g.rn('cargo')}の作業記録` }),
          ev('bunk', '寝台のまわり', `${P.name}の寝台の下に、湿布の空き袋が山になっている。`, { room: 'quarters', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_bunk', where: `${g.rn('quarters')}` }),
          ev('p_found', '倒れていた乗員', `${P.name}が水再生室の床に倒れている。呼吸が浅く、瞳孔が針の先のように小さい。`, { room: null, source: 'report', fact: 'F_found', where: '水再生室へ行く' }),
          said('e_saw', E.name, `${T(enter)}ごろ、${P.name}が水再生室へ入っていくのを見ました。具合が悪そうでした`, 'F_e_saw', `${E.name}から話を聞く（下層の通信が戻ってから）`),
          said('m_claim', M.name, '暗証番号は変えていません。……後ろから見られていたのかもしれません', 'F_m_code', `${M.name}から話を聞く`),
          said('q_claim', Q.name, `${P.name}さん、最近は重い物を持つたびに顔をしかめていました`, 'F_q_saw', `${Q.name}から話を聞く`),
          said('z_claim', Z.name, '闇で売るつもりの誰かの仕業じゃないですか。管理薬品は高く売れますから', 'F_z_belief', `${Z.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'locker_log', resolvedBy: ['m_alibi'], explain: `解錠は${M.name}の暗証番号だったが、${M.name}本人はその時刻に司令室にいた。番号を盗み見た者がいた。` },
          { evidence: 'z_claim', resolvedBy: ['work_log', 'bunk'], explain: `売るための盗みではなかった。${P.name}は怪我を隠していて、痛みを抑えるために持ち出した。` },
        ],
      },
      rootEvent: 'ev_injury',
      damageEvent: 'ev_collapse',
      testimonies: [
        { crew: E.id, evidence: 'e_saw' },
        { crew: M.id, evidence: 'm_claim' },
        { crew: Q.id, evidence: 'q_claim' },
        { crew: Z.id, evidence: 'z_claim' },
      ],
      confessions: [],
      crewInit,
      whereabouts: [
        { crew: P.id, sec: T0, room: 'medbay' }, { crew: P.id, sec: enter, room: 'waterplant' },
        { crew: M.id, sec: T0 - 5 * 60, room: 'bridge' }, { crew: M.id, sec: T0 + 15 * 60, room: 'bridge' },
        { crew: E.id, sec: enter, room: 'engineering' },
      ],
      commDown: ['lower'],
      statedTimes: [maintEnd, T0 - 5 * 60, T0 + 15 * 60],
      vars: { saved: 0, found: 0, ['down_' + P.id]: 1, ['untreatable_' + P.id]: 1, ph: 70 },
      causeOptions: [
        { id: 'overdose_theft', label: '怪我を隠していた乗員が鎮痛剤を盗み、飲みすぎて倒れた', category: 'sabotage' },
        { id: 'resale', label: '転売目的で管理薬品が盗まれた', category: 'sabotage' },
        { id: 'medic_error', label: '医務官の在庫管理の誤りで数が合わない', category: 'accident' },
        { id: 'fall', label: '乗員が下層で足を滑らせて頭を打った', category: 'accident' },
        { id: 'gas', label: '下層に漂う未知のガスで乗員が倒れた', category: 'phenomenon' },
      ],
      unlock: {
        'cause:overdose_theft': ['med_count', 'work_log', 'bunk', 'p_found'], 'cause:resale': ['med_count', 'z_claim'], 'cause:medic_error': ['locker_log'],
        'cause:fall': ['p_found'], 'cause:gas': ['p_found'],
        'order:o_injury': ['work_log', 'q_claim', 'bunk'], 'order:o_theft': ['locker_log'], 'order:o_enter': ['e_saw', 'p_found'], 'order:o_collapse': ['p_found'],
        'plan:naloxone': ['med_count'], 'plan:searchLower': ['stock_alarm'], 'plan:lockMed': ['locker_log'],
      },
      respond: { label: '薬品庫を調べる', desc: '医務室で薬品庫と在庫を確認する', room: 'medbay', waitLabel: '医務室で待機' },
      fieldActions: [],
      plans: [
        { id: 'naloxone', label: '拮抗薬を持って「関係人物」のもとへ向かい、投与する', warn: '「関係人物」で選んだ乗員のもとへ向かう', score: 1, skill: 'med',
          steps: (p, a) => {
            if (!p.target) return [];
            const t = a.crew(p.target);
            return p.knowsCause ? [{ room: 'medbay', action: 'takeNalox', label: '拮抗薬の準備' }, { room: t.room, action: 'giveNalox', label: '拮抗薬の投与' }]
              : [{ room: t.room, action: 'examine', label: '診察' }];
          } },
        { id: 'searchLower', label: '下層をくまなく捜索する', score: 0.3, steps: () => [{ room: 'engineering', action: 'look', label: '機関区の捜索' }, { room: 'waterplant', action: 'look', label: '水再生室の捜索' }] },
        { id: 'lockMed', label: '薬品庫の暗証番号を変える', score: 0.1, steps: () => [{ room: 'medbay', action: 'relock', label: '暗証番号の変更' }] },
      ],
      actions: {
        takeNalox: { minutes: () => 2, run: (a, c) => a.report(c, '拮抗薬（ナロキソン）を用意した。', { important: false }) },
        giveNalox: { minutes: () => 3, run: (a, c) => {
          const P2 = a.crew(P.id);
          if (P2.alive && P2.room === c.room) {
            a.v.saved = 1; a.v['down_' + P.id] = 0; a.v['untreatable_' + P.id] = 0;
            a.report(c, `${P.name}に拮抗薬を投与した。呼吸が戻り、うっすら目を開けた。`);
          } else a.report(c, '拮抗薬を投与したが、倒れていたのは別の理由のようだ。効き目がない。');
        } },
        examine: { minutes: () => 4, run: (a, c) => a.report(c, '診察したが、想定した原因では説明がつかない。') },
        look: { minutes: () => 4, run: (a, c) => a.report(c, `${a.rn(c.room)}を見て回った。`, { important: false }) },
        relock: { minutes: () => 2, run: (a, c) => a.report(c, '薬品庫の暗証番号を変えた。') },
      },
      tick(a) {
        const v = a.v;
        const p = a.crew(P.id);
        if (p.alive && !v.saved) p.health -= 0.08;
        if (v.saved && p.alive) p.health = Math.min(100, p.health + 0.03);
        v.ph = p.health;
        if (!v.found && p.alive) {
          const finder = a.crews().find((c) => c.alive && c.id !== P.id && c.room === p.room && c.task.t !== 'move');
          if (finder) {
            v.found = 1;
            a.learn(finder, 'F_found');
            a.report(finder, `［倒れていた乗員］${a.evText('p_found')}`, { evidence: ['p_found'], kind: 'danger', reason: '一刻を争う容体なので最優先で伝える' });
          }
        }
        // 下層の通信が戻れば、生体モニタで倒れていることが分かる
        if (!v.found && p.alive && !a.w.commDown.includes('lower')) {
          v.found = 1;
          a.log(`生体モニタ：${P.name}の呼吸と脈が弱い。水再生室で動いていない。`, 'danger', `${P.name}の容体`, ['p_found']);
        }
        if (a.now() >= maintEnd && a.once('maint_end')) { v.relay_lower = 1; a.log(`下層の中継器の定期整備が終わり、通信が戻った。`); }
        a.setComm('lower', !v.relay_lower);
      },
      meters: (m) => [pct('酸素', m.o2), hullMeter(m), { label: '管理薬品', value: 60, text: '10錠不明', level: 'warn' }],
      marks: (m) => (m.has('p_found') ? [{ room: 'waterplant', text: '倒れた乗員（報告）', color: '#e36b5b' }] : []),
      resolved: (a) => !!a.v.saved,
      resolvedText: `${P.name}の呼吸が戻った。`,
      epilogue: (e) => genericEpilogue(e, {
        [P.id]: e.crew.find((c) => c.id === P.id)!.alive ? (e.v.saved ? `${P.name}は医務室の寝台で、怪我を隠していたことを${M.name}に打ち明けた。寄港後に治療を受けることになった。` : `${P.name}は命を取り留めたが、何があったのかをまだ話せずにいる。`) : '',
        [M.id]: `${M.name}は薬品庫の暗証番号を変え、「痛いときは言って」と医務室の扉に貼り紙をした。`,
        [E.id]: e.has('e_saw') ? `${E.name}は、あの夜${P.name}を見かけたのに声をかけなかったことを悔やんでいる。` : '',
      }),
      solve: {
        policies: { [M.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'cargo' }] },
        hyp: { category: 'sabotage', cause: 'overdose_theft', order: ['o_injury', 'o_theft', 'o_enter', 'o_collapse'], person: { crew: P.id, role: 'sabotage' }, evidence: ['locker_log', 'med_count', 'm_alibi', 'work_log'], plan: 'naloxone' },
      },
    };
  },
};
