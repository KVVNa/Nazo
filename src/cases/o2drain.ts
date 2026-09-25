// 事故＋隠し事：規格違いのCO₂除去カートリッジを、当直が善意で交換して黙っていた。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';
import { GROUP_NAME } from '../sim/ship';

export const O2DRAIN: CaseTemplate = {
  id: 'o2_drain',
  title: '酸素の減りが早い',
  category: 'accident',
  needSide: ['lifesupport', 'cargo', 'medbay'],
  needLower: ['airlock'],
  build(g) {
    const E = g.byRole('engineer')!;
    const M = g.byRole('medic')!;
    const Y = find(g, (c) => ['navigator', 'comms', 'security', 'scientist'].includes(c.roleId), [E, M]);
    const X = find(g, (c) => ['cargo', 'cook', 'security'].includes(c.roleId), [E, M, Y]);
    const Z = find(g, () => true, [E, M, Y, X]);
    const T = g.clock;
    const T0 = g.hm(23, g.int(5, 50));
    const swap = T0 + 4 * 60;
    const vent = T0 + g.int(36, 44) * 60;
    const lock = T0 + g.int(75, 95) * 60;
    const medUse = T0 - g.int(25, 50) * 60;
    const start = T0 + g.int(140, 165) * 60;
    const grp = g.groupOf('lifesupport');
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [E.id]: { room: g.has('quarters') ? 'quarters' : 'corridor', label: '呼び出されて起きたところ', known: ['F_e_belief'] },
      [M.id]: { room: 'medbay', known: ['F_med_o2'] },
      [Y.id]: { room: 'bridge', known: ['F_y_swap'], hides: ['F_y_swap', 'F_warn'] },
      [X.id]: { room: g.has('quarters') ? 'quarters' : 'cargo', known: ['F_x_belief'] },
      [Z.id]: { room: g.has('quarters') ? 'quarters' : 'corridor', known: ['F_z_eva'] },
    };
    placeRest(g, crewInit, ['quarters', 'lab', 'galley', 'comms', 'bridge']);
    const live = inComm(g, crewInit, [grp]);
    const fixer = bestLive(g, crewInit, [grp], 'mech', [Y]);
    const inv = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, Y]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。酸素備蓄の減り方が、通常の約3倍になっている。`,
        `生命維持室のある${GROUP_NAME[grp]}系統の通信中継器が落ちていて、その区画の様子が分からない。`,
        '酸素備蓄が尽きれば、換気で二酸化炭素を捨てられなくなる。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 酸素備蓄の減りが通常の約3倍。${GROUP_NAME[grp]}系統の中継器が応答しない。`,
      initialEvidence: ['reserve_alarm'],
      truth: {
        cause: 'wrong_cartridge',
        events: [
          { id: 'ev_receive', sec: T0 - 2 * 86400, room: 'cargo', actor: null, text: `2日前の補給で、旧型船用のCO₂除去カートリッジ（容量が3分の1）が届き、${X.name}が正規品だと思って受け取った。`, causes: ['ev_swap'] },
          { id: 'ev_warn', sec: T0, room: 'bridge', actor: null, text: `${T(T0)}、生命維持が「カートリッジ交換推奨」を表示した。`, causes: ['ev_swap'] },
          { id: 'ev_swap', sec: swap, room: 'lifesupport', actor: Y.id, text: `${T(swap)}、当直の${Y.name}が善意で貨物室の予備に交換した。型番を確かめず、記録も付けなかった。`, causes: ['ev_low'] },
          { id: 'ev_low', sec: swap + 60, room: 'lifesupport', actor: null, text: 'CO₂の除去能力が3分の1に落ちた。', causes: ['ev_vent'] },
          { id: 'ev_vent', sec: vent, room: 'lifesupport', actor: null, text: `${T(vent)}ごろから、換気制御がCO₂を船外へ捨てては酸素で補う運転を繰り返し、備蓄が早く減り始めた。`, causes: ['ev_relay'] },
          { id: 'ev_relay', sec: vent + 5 * 60, room: 'lifesupport', actor: null, text: `排気サイクルの負荷で、${GROUP_NAME[grp]}系統の中継器の保護回路が落ちた。`, causes: [] },
          { id: 'ev_med', sec: medUse, room: 'medbay', actor: M.id, text: `${T(medUse)}、${M.name}は医療用配管の漏れ試験で酸素ボンベを2本使った（無関係）。`, causes: [] },
          { id: 'ev_lock', sec: lock, room: 'airlock', actor: Z.id, text: `${T(lock)}、${Z.name}は予定どおり船体の外部点検でエアロックを使った（無関係）。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_receive', label: '型番違いのカートリッジが届く', sec: T0 - 2 * 86400 },
          { id: 'o_swap', label: 'カートリッジが交換される', sec: swap },
          { id: 'o_vent', label: '換気が排気と補充を繰り返し始める', sec: vent },
          { id: 'o_lock', label: 'エアロックが作動する', sec: lock },
        ],
        responsible: { crew: Y.id, role: 'falsified' },
        evidence: [
          ev('reserve_alarm', '酸素備蓄の警報', `${T(start)} 酸素備蓄の消費が平常の約3倍。原因の表示なし。`, { room: 'bridge', fact: 'F_alarm', work: 0, where: '初期情報' }),
          ev('scrub_log', 'CO₂除去率の記録', `CO₂の除去率が${T(swap)}以降、通常の3分の1に落ちている。`, { room: 'lifesupport', skill: 'mech', minSkill: 1, work: 4, fact: 'F_scrub_low', key: true, where: '生命維持室の制御盤' }),
          ev('cartridge_label', '装着中のカートリッジ', '型番LX-2（旧型船用）。この船の規格LX-4の3分の1しか吸収できない。', { room: 'lifesupport', source: 'trace', work: 2, fact: 'F_wrong_cart', key: true, where: '生命維持室の除去装置' }),
          ev('vent_log', '換気制御の記録', `${T(vent)}から、CO₂を船外へ排気しては酸素で補充する運転を繰り返している。`, { room: 'lifesupport', skill: 'mech', minSkill: 1, work: 3, fact: 'F_vent', where: '生命維持室の換気制御盤' }),
          ev('receipt', '補給の受領記録', `2日前：CO₂除去カートリッジ4本 受領（型番LX-2）。受領確認：${X.name}。`, { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_receipt', key: true, where: '貨物室の受領端末' }),
          ev('stock', 'カートリッジの在庫', 'LX-2：残り3本（4本から1本減）。LX-4：在庫0。', { room: 'cargo', source: 'record', work: 3, fact: 'F_stock', where: '貨物室の棚' }),
          ev('warn_log', '生命維持の表示記録', `${T(T0)} 「カートリッジ交換推奨」を表示。${T(swap)} 表示解除。交換作業の記録入力はない。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 4, fact: 'F_warn', key: true, where: '司令室の生命維持ログ' }),
          ev('med_o2', '医療用酸素の使用記録', `${T(medUse)} 医療用酸素ボンベ2本使用（${M.name}）。`, { room: 'medbay', source: 'record', work: 2, fact: 'F_med_o2', where: '医務室の記録' }),
          ev('airlock_log', 'エアロックの作動記録', `${T(lock)} 減圧・加圧1回（${Z.name}：船体外部点検、予定どおり）。`, { room: 'airlock', work: 2, fact: 'F_z_eva', where: 'エアロックの記録' }),
          said('y_claim', Y.name, '交換？ 当直のあいだ、司令室から出ていません', 'F_y_lie', `${Y.name}から話を聞く`),
          { ...said('y_confess', Y.name, '……表示が出ていたので、貨物室の予備で替えました。型番までは見ていません。記録を付け忘れて、言い出せなくて', 'F_y_swap', `${Y.name}に表示記録かカートリッジを突きつける`), title: `${Y.name}の告白` },
          said('x_claim', X.name, '受け取ったのは正規品のはずです。箱の色も同じでしたから', 'F_x_belief', `${X.name}から話を聞く`),
          said('m_claim', M.name, `${T(medUse)}に医療用配管の漏れ試験で2本使いました。いつもの点検です`, 'F_med_o2', `${M.name}から話を聞く`),
          said('z_claim', Z.name, `${T(lock)}に外部点検でエアロックを使いました。予定表どおりです`, 'F_z_eva', `${Z.name}から話を聞く`),
          said('e_claim', E.name, '除去カートリッジは前の寄港で替えたばかりのはずです。こんなに早く弱るはずがない', 'F_e_belief', `${E.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'med_o2', resolvedBy: ['vent_log'], explain: `医療用酸素2本は${M.name}の定期点検によるもので、備蓄が減った量とは桁が違う。本当の消費は、換気がCO₂を捨てるたびに補充していた分だった。` },
          { evidence: 'airlock_log', resolvedBy: ['vent_log', 'scrub_log'], explain: `エアロックの作動は${Z.name}の予定どおりの外部点検で、減り方が変わった時刻とも合わない。` },
          { evidence: 'x_claim', resolvedBy: ['receipt', 'cartridge_label'], explain: `${X.name}は正規品だと思い込んでいたが、届いたのは型番違いの旧型品だった。` },
          { evidence: 'y_claim', resolvedBy: ['warn_log', 'stock', 'y_confess'], explain: `${Y.name}は司令室を出ていないと言ったが、交換推奨の表示が数分で消えており、在庫も1本減っていた。` },
        ],
      },
      rootEvent: 'ev_receive',
      damageEvent: 'ev_vent',
      testimonies: [
        { crew: Y.id, evidence: 'y_claim', lie: true },
        { crew: X.id, evidence: 'x_claim' },
        { crew: M.id, evidence: 'm_claim' },
        { crew: Z.id, evidence: 'z_claim' },
        { crew: E.id, evidence: 'e_claim' },
      ],
      confessions: [{ crew: Y.id, triggeredBy: ['warn_log', 'cartridge_label', 'stock'], evidence: 'y_confess' }],
      crewInit,
      whereabouts: [
        { crew: Y.id, sec: T0 - 5 * 60, room: 'bridge' }, { crew: Y.id, sec: swap - 60, room: 'lifesupport' }, { crew: Y.id, sec: swap + 6 * 60, room: 'bridge' },
        { crew: M.id, sec: medUse, room: 'medbay' },
        { crew: Z.id, sec: lock - 10 * 60, room: 'corridor' }, { crew: Z.id, sec: lock, room: 'airlock' }, { crew: Z.id, sec: lock + 20 * 60, room: 'corridor' },
      ],
      commDown: [grp],
      vars: { reserve: 36, co2: 1.3, cap: 0.35, rest: 0, purge: 1, carts: 3 },
      causeOptions: [
        { id: 'wrong_cartridge', label: '規格違いのCO₂除去カートリッジが使われ、換気が酸素を捨て続けた', category: 'accident' },
        { id: 'o2_theft', label: '誰かが酸素を持ち出している', category: 'sabotage' },
        { id: 'airlock_leak', label: 'エアロックの密閉不良で空気が漏れている', category: 'accident' },
        { id: 'sensor_fault', label: '酸素備蓄の計器が故障している', category: 'accident' },
        { id: 'offgas', label: '船内の材料から出た未知のガスが除去装置を飽和させた', category: 'phenomenon' },
      ],
      respond: { label: '生命維持を点検', desc: '生命維持室で除去装置と換気を調べる', room: 'lifesupport', waitLabel: '生命維持室で指示待ち' },
      fieldActions: [
        { id: 'rest', room: 'lifesupport', needs: 'F_scrub_low', label: '全員に活動を控えるよう呼びかけ', ask: 'CO₂の除去が追いついていません。全員に横になって活動を控えるよう呼びかけてよいですか', why: '除去が追いつかない分、CO₂を出す量を減らすのが先だと判断', action: 'restCall' },
      ],
      plans: [
        { id: 'tripleCart', label: '旧型カートリッジを3本まとめて装着し、除去容量を補う', score: 1,
          steps: (p) => (p.knowsCause ? [{ room: 'cargo', action: 'takeCarts', label: 'カートリッジの搬出' }, { room: 'lifesupport', action: 'installCarts', label: 'カートリッジの装着' }]
            : [{ room: 'lifesupport', action: 'inspectLS', label: '除去装置の点検' }]) },
        { id: 'restAll', label: '全員の活動を減らしてCO₂の発生を抑える', score: 0.4, steps: () => [{ room: 'corridor', action: 'restCall', label: '全員への呼びかけ' }] },
        { id: 'stopVent', label: '換気の自動排気を止めて酸素備蓄を守る', warn: '排気を止めるとCO₂が船内にたまっていく', score: 0.2, steps: () => [{ room: 'lifesupport', action: 'stopPurge', label: '自動排気の停止' }] },
        { id: 'sealAirlock', label: 'エアロックの内扉を締め直して空気漏れを止める', score: 0, steps: () => [{ room: 'airlock', action: 'sealAL', label: 'エアロックの点検' }] },
      ],
      actions: {
        restCall: { minutes: () => 2, run: (a, c) => { a.v.rest = 1; a.learn(c, 'S_rest'); a.report(c, '全員に、しばらく横になって活動を控えるよう呼びかけた。CO₂の発生が4割ほど減る。'); } },
        inspectLS: { minutes: () => 6, run: (a, c) => a.report(c, '除去装置の配管と弁を点検したが、壊れているところは見つからなかった。') },
        takeCarts: { minutes: () => 3, run: (a, c) => {
          if (a.v.carts < 3) { a.report(c, 'カートリッジが足りない。'); return 'fail'; }
          a.v.carts = 0; a.report(c, '貨物室から旧型カートリッジを3本持ち出した。', { important: false }); return 'ok';
        } },
        installCarts: { minutes: (a, c) => 8 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.cap = 1.05; a.report(c, '旧型カートリッジを3本並べて装着した。除去能力は規格品1本分に戻った。'); } },
        stopPurge: { minutes: () => 3, run: (a, c) => { a.v.purge = 0; a.report(c, '換気の自動排気を止めた。酸素備蓄の減りは止まったが、CO₂は船内にたまっていく。'); } },
        sealAL: { minutes: () => 6, run: (a, c) => a.report(c, 'エアロックの内扉を締め直した。気密はもともと正常だった。') },
      },
      tick(a) {
        const v = a.v;
        const deficit = (v.rest ? 0.6 : 1) - v.cap;
        if (deficit > 0) {
          if (v.purge && v.reserve > 0) { v.reserve = Math.max(0, v.reserve - deficit * 0.13); v.co2 += (1.2 - v.co2) * 0.01; }
          else v.co2 += deficit * 0.02;
        } else { v.co2 = Math.max(0.4, v.co2 + deficit * 0.01); v.reserve = Math.min(100, v.reserve + 0.01); }
        if (v.reserve < 25 && a.once('res25')) a.alarm('酸素備蓄が25%を下回った。', '酸素備蓄の低下');
        if (v.reserve <= 0 && a.once('res0')) a.alarm('酸素備蓄が尽きた。換気でCO₂を捨てられなくなった。', '酸素備蓄が尽きた');
        if (v.co2 > 3 && a.once('co2_3')) a.alarm('CO₂濃度が3%を超えた。頭痛や判断の遅れが出始める。', 'CO₂上昇');
        if (v.co2 > 5 && a.once('co2_5')) a.alarm('CO₂濃度が5%を超えた。長くいると命に関わる。', 'CO₂危険域');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          c.impair = v.co2 > 3 ? Math.min(0.6, (v.co2 - 3) * 0.2) : 0;
          if (v.co2 > 4.5) c.health -= (v.co2 - 4.5) * 0.08;
        }
        a.setComm(grp, !v['relay_' + grp]);
        a.w.o2 = 100 - Math.max(0, v.co2 - 2) * 6;
      },
      meters: (m) => [
        pct('酸素備蓄', m.v.reserve, 40, 15, m.v.purge ? '換気で補充中' : '自動排気停止'),
        { label: 'CO₂', value: Math.min(100, (m.v.co2 / 8) * 100), text: m.v.co2.toFixed(1) + '%', sub: '3%で体調に影響', level: m.v.co2 > 4 ? 'bad' : m.v.co2 > 2.5 ? 'warn' : '' },
        hullMeter(m),
      ],
      marks: (m) => (m.has('cartridge_label') ? [{ room: 'lifesupport', text: '型番違い（報告）', color: '#c9a23a' }] : []),
      resolved: (a) => a.v.cap >= 1,
      resolvedText: 'CO₂の除去能力が戻り、酸素備蓄の減りが止まった。',
      epilogue: (e) => genericEpilogue(e, {
        [Y.id]: e.crew.find((c) => c.id === Y.id)!.confessed ? `${Y.name}は作業記録の付け方を一から教わり直し、交換の手順書に「型番確認」の一行を書き足した。` : `${Y.name}は何も言わないまま当直に戻った。あの夜の交換を知る者は少ない。`,
        [X.id]: e.has('receipt') ? `${X.name}は次の補給から、受け取る品の型番を一つずつ読み上げるようになった。` : `${X.name}は、なぜ酸素が減ったのか腑に落ちないままだ。`,
        [E.id]: e.resolved ? `${E.name}は規格品が届くまで、3本並べたカートリッジを毎時点検すると決めた。` : `${E.name}は除去装置の前で、寝不足の目をこすり続けた。`,
      }),
      solve: {
        policies: { [fixer.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'cargo' }] },
        hyp: { category: 'accident', cause: 'wrong_cartridge', order: ['o_receive', 'o_swap', 'o_vent', 'o_lock'], person: { crew: Y.id, role: 'falsified' }, evidence: ['cartridge_label', 'receipt', 'warn_log', 'scrub_log'], plan: 'tripleCart' },
      },
    };
  },
};
