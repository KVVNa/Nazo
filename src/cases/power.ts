// 事故＋怠慢の隠蔽：冷却液の漏れで主配電盤が地絡。予備セルは交換を偽装されていて半分しか持たない。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { bestLive, find, genericEpilogue, hullMeter, inComm, o2Meter, placeRest } from './common';

const DRAIN = 100 / 180 / 6; // 定格100で3時間（1 tick あたり）

export const POWER: CaseTemplate = {
  id: 'lost_power',
  title: '消えた電力',
  category: 'accident',
  needSide: ['medbay', 'cargo'],
  needLower: ['powerroom'],
  build(g) {
    const E = g.byRole('engineer')!;
    const M = g.byRole('medic')!;
    const R = find(g, (c) => ['security', 'cargo', 'comms', 'cook'].includes(c.roleId), [E, M], g.cast);
    const K = find(g, () => true, [E, M, R]);
    const trip = g.hm(g.int(1, 3), g.int(0, 50));
    const start = trip + 6 * 60;
    const crack = trip - g.int(28, 40) * 60;
    const snack = trip - g.int(7, 11) * 60;
    const flick = trip - 2 * 60;
    const T = (s: number) => g.clock(s);
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string }> = {
      [E.id]: { room: g.has('quarters') ? 'quarters' : 'corridor', known: ['F_aging_pipe'], label: '仮眠から起きたところ' },
      [M.id]: { room: 'medbay', known: ['F_sora_saw'] },
      [K.id]: { room: 'bridge', known: ['F_door_k'] },
      [R.id]: { room: 'corridor', known: ['F_not_replaced'], hides: ['F_not_replaced', 'F_cell_half'] },
    };
    placeRest(g, crewInit, ['quarters', 'lab', 'galley', 'comms', 'lifesupport', 'bridge']);
    const live = inComm(g, crewInit, ['lower']);
    const fixer = bestLive(g, crewInit, ['lower'], 'mech', [R]);
    const investigator = find(g, (c) => c.skills.inv >= 1 && live(c), [fixer, R]);
    const mechanic = find(g, (c) => c.skills.mech >= 1 && live(c), [fixer, R, investigator]);
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `${T(trip)}に主電源が停止し、船は予備電源で動いている（現在 ${T(start)}）。`,
        '予備電源の残量は、定格どおりなら約3時間分と表示されている。',
        '下層機関区と配電室は、機関区の通信中継器が止まって連絡が取れない。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(trip)} 主電源喪失。予備電源で運転中。機関区の通信中継器が停止し、下層区画は通信断。`,
      initialEvidence: ['alarm'],
      truth: {
        cause: 'coolant_leak',
        events: [
          { id: 'ev_skip', sec: trip - 22 * 86400, room: 'powerroom', actor: R.id, text: `22日前、${R.name}は予備セルの交換を記録だけして実施しなかった。`, causes: ['ev_half'] },
          { id: 'ev_half', sec: trip, room: 'powerroom', actor: null, text: '古いセルのため、予備電源は定格の約半分しか持たなかった。', causes: [] },
          { id: 'ev_crack', sec: crack, room: 'powerroom', actor: null, text: `${T(crack)}ごろ、経年劣化した冷却ループB系の継手に亀裂が入り、配電室の天井から冷却液が漏れ始めた。`, causes: ['ev_pressure', 'ev_pool'] },
          { id: 'ev_pressure', sec: crack, room: 'engineering', actor: null, text: '冷却圧がゆるやかに下がり始めた。', causes: [] },
          { id: 'ev_pool', sec: trip - 6 * 60, room: 'powerroom', actor: null, text: '滴った冷却液が主配電盤に回り、絶縁が下がり始めた。', causes: ['ev_flicker', 'ev_trip'] },
          { id: 'ev_door', sec: snack, room: 'cargo', actor: K.id, text: `${T(snack)}、${K.name}は夜食を取りに貨物室へ行った（事件とは無関係）。`, causes: [] },
          { id: 'ev_flicker', sec: flick, room: 'engineering', actor: null, text: `${T(flick)}ごろ、電圧低下で機関区の照明が点滅した。通路にいた${M.name}はこれを火花だと思った。`, causes: [] },
          { id: 'ev_trip', sec: trip, room: 'powerroom', actor: null, text: `${T(trip)}、地絡を検出した主配電盤が保護遮断し、予備電源へ切り替わった。`, causes: ['ev_half', 'ev_clock'] },
          { id: 'ev_clock', sec: trip, room: 'medbay', actor: null, text: `切替で医務室の時計が再起動し、18分進んだまま動いた。`, causes: ['ev_back'] },
          { id: 'ev_back', sec: flick + 4 * 60, room: 'medbay', actor: M.id, text: `${T(flick + 4 * 60)}、医務室に戻った${M.name}は、18分進んだ時計を見て「光を見たのは${T(flick + 22 * 60)}の少し前」と思い込んだ。`, causes: [] },
        ],
        orderCards: [
          { id: 'o_pressure', label: '冷却圧の低下が始まる', sec: crack },
          { id: 'o_door', label: '貨物室のドアが開閉される', sec: snack },
          { id: 'o_flicker', label: '機関区で光が明滅する', sec: flick },
          { id: 'o_trip', label: '主配電盤が保護遮断する', sec: trip },
        ],
        responsible: { crew: R.id, role: 'falsified' },
        evidence: [
          ev('alarm', '警報記録', `${T(trip)} 主電源喪失。保護遮断器が作動し、予備電源へ自動切替。機関区の通信中継器が停止。`, { room: 'bridge', fact: 'F_trip', work: 0, where: '司令室の警報記録（初期情報）' }),
          ev('panel_log', '配電盤ログ', `${T(trip)} 地絡検出 → 主遮断器トリップ。直前の数分間、絶縁抵抗が急に下がっている。`, { room: 'powerroom', fact: 'F_ground_fault', key: true, where: '配電室の配電盤' }),
          ev('coolant_trace', '床の冷却液痕', '配電盤の下に青い冷却液の溜まり。天井を通る冷却配管の継手から、今も滴っている。', { room: 'powerroom', source: 'trace', skill: 'inv', work: 2, fact: 'F_leak', key: true, where: '配電室の床と天井配管', destroyedByFire: true }),
          ev('pressure_log', '冷却圧ログ', `冷却ループB系の圧力が${T(crack)}ごろから少しずつ下がり続けている。急な変化はない。`, { room: 'engineering', skill: 'mech', minSkill: 1, work: 4, fact: 'F_pressure', key: true, where: '下層機関区の冷却制御盤' }),
          ev('cell_measure', '予備セルの実測残量', '予備セルの実容量は定格の約半分しかない。劣化した古いセルの特徴がある。', { room: 'powerroom', source: 'trace', skill: 'mech', minSkill: 1, work: 5, fact: 'F_cell_half', where: '配電室の予備セル（整備技能が必要）' }),
          ev('maint_record', '整備記録', `22日前：予備電源セル交換 完了（担当：${R.name}）。`, { room: 'bridge', source: 'record', skill: 'inv', work: 4, fact: 'F_record_claims', key: true, where: '司令室の整備記録' }),
          ev('inventory', '部品在庫記録', '予備電源セル 在庫2個。22日前以降、出庫の記録はない。', { room: 'cargo', source: 'record', skill: 'inv', minSkill: 1, work: 4, fact: 'F_not_replaced', key: true, where: '貨物室の在庫端末' }),
          ev('door_log', '貨物室ドア記録', `${T(snack)} 貨物室ドア開閉（認証：${K.name}）。`, { room: 'bridge', skill: 'inv', minSkill: 1, fact: 'F_door_k', where: '司令室の船内ドア記録' }),
          ev('medclock', '医務室の時計記録', `${T(trip)} 電源切替で医務室の時計が再起動。外部同期に失敗し、+18分ずれたまま動作していた。`, { room: 'medbay', skill: 'inv', minSkill: 1, fact: 'F_clock_skew', where: '医務室の端末' }),
          ev('light_log', '照明回路ログ', `${T(flick - 120)}〜${T(flick + 60)} 機関区の照明回路で電圧低下と点滅を記録。`, { room: 'engineering', fact: 'F_flicker', where: '下層機関区の照明制御盤' }),
          ev('old_cell', '取り外したセル', '交換作業で外したセルの製造番号は、22日前より前の点検記録と同じだった。', { room: null, source: 'report', fact: 'F_not_replaced', where: '予備セルの交換作業' }),
          said('sora_flash', M.name, `通路から機関区の点検窓越しに、青白い火花みたいな光を見ました。すぐ医務室に戻って時計を見たら${T(flick + 22 * 60)}でした。誰かが何かしていたのかも`, 'F_sora_saw', `${M.name}から話を聞く`),
          said('duran_claim', R.name, '予備セルは前回の整備で交換しました。記録にも残っています', 'F_r_lie', `${R.name}から話を聞く`),
          { ...said('duran_confess', R.name, '……交換は記録だけです。在庫を減らしたくなくて後回しにして、そのまま忘れていました', 'F_not_replaced', `${R.name}に在庫記録か取り外したセルを突きつける`), title: `${R.name}の告白` },
          said('kei_cargo', K.name, `${T(snack)}に夜食を取りに貨物室へ行きました。変わった様子はなかったです`, 'F_door_k', `${K.name}から話を聞く`),
          said('mina_coolant', E.name, 'B系の冷却ループは前から圧が不安定でした。継手の交換部品は次の寄港待ちです', 'F_aging_pipe', `${E.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'sora_flash', resolvedBy: ['medclock', 'light_log'], explain: `${M.name}が見た「火花」は、遮断直前（${T(flick)}ごろ）の電圧低下による照明の点滅だった。医務室に戻ったのは${T(flick + 4 * 60)}だったが、時計が電源切替で18分進んでいたため、遮断より後の出来事だと思い込んだ。` },
          { evidence: 'duran_claim', resolvedBy: ['inventory', 'old_cell', 'duran_confess'], explain: `${R.name}は予備セルを交換したと記録していたが、実際には交換していなかった。在庫が減っていないことから矛盾が分かる。` },
          { evidence: 'door_log', resolvedBy: ['kei_cargo', 'panel_log'], explain: `${T(snack)}の貨物室ドアの開閉は${K.name}が夜食を取りに行っただけで、停電とは関係がない。` },
        ],
      },
      rootEvent: 'ev_crack',
      damageEvent: 'ev_trip',
      testimonies: [
        { crew: M.id, evidence: 'sora_flash' },
        { crew: R.id, evidence: 'duran_claim', lie: true },
        { crew: K.id, evidence: 'kei_cargo' },
        { crew: E.id, evidence: 'mina_coolant' },
      ],
      confessions: [{ crew: R.id, triggeredBy: ['inventory', 'old_cell', 'cell_measure'], evidence: 'duran_confess' }],
      crewInit,
      whereabouts: [
        { crew: K.id, sec: snack - 5 * 60, room: 'bridge' }, { crew: K.id, sec: snack, room: 'cargo' }, { crew: K.id, sec: snack + 5 * 60, room: 'bridge' },
        { crew: M.id, sec: flick - 2 * 60, room: 'medbay' }, { crew: M.id, sec: flick, room: 'corridor' }, { crew: M.id, sec: flick + 4 * 60, room: 'medbay' },
      ],
      commDown: ['lower'],
      statedTimes: [flick - 120, flick + 60, flick + 22 * 60],
      vars: { main: 0, backup: 50 - 6 * 6 * DRAIN, shed: 0, sealed: 0, wet: 45, cap: 50, gauge: 50, damaged: 0, cells: 2, relay_lower: 0 },
      causeOptions: [
        { id: 'coolant_leak', label: '冷却配管の亀裂から漏れた冷却液が配電盤を地絡させた', category: 'accident' },
        { id: 'panel_sabotage', label: '何者かが配電盤に細工して遮断させた', category: 'sabotage' },
        { id: 'cell_failure', label: '予備セルの故障が主電源を巻き込んで落とした', category: 'accident' },
        { id: 'overload', label: '機器の過負荷で主遮断器が落ちた', category: 'accident' },
        { id: 'radiation', label: '宇宙線の突発的な増加で制御系が誤作動した', category: 'phenomenon' },
      ],
      unlock: {
        'cause:coolant_leak': ['coolant_trace', 'pressure_log', 'mina_coolant'], 'cause:panel_sabotage': ['sora_flash', 'door_log'],
        'cause:cell_failure': ['cell_measure', 'maint_record'], 'cause:overload': ['panel_log'], 'cause:radiation': ['light_log'],
        'order:o_pressure': ['pressure_log', 'mina_coolant'], 'order:o_door': ['door_log', 'kei_cargo'], 'order:o_flicker': ['light_log', 'sora_flash'], 'order:o_trip': ['alarm'],
        'plan:sealDryRestart': ['coolant_trace'], 'plan:dryRestart': ['panel_log', 'coolant_trace'], 'plan:restartNow': ['alarm'], 'plan:shed': ['alarm'], 'plan:swapCell': ['cell_measure', 'maint_record', 'inventory'],
      },
      respond: { label: '電源を復旧', desc: '配電室へ向かい、点検と復旧作業', room: 'powerroom', waitLabel: '主電源の再投入は船長の判断待ち' },
      fieldActions: [
        { id: 'seal', room: 'powerroom', needs: 'F_leak', label: '漏れている配管を仮封止', ask: '配電室の天井配管から冷却液が漏れています。仮封止してよいですか', why: '漏れを放置すると配電盤がさらに濡れて復旧が遠のくと判断', skill: 'mech', minSkill: 1, action: 'seal' },
        { id: 'shed', room: 'powerroom', needs: 'F_cell_half', label: '不要な負荷を切り離し', ask: '予備セルが想定より弱いです。照明や使っていない区画の電源を切って、酸素再生を優先してよいですか', why: '予備セルの残りが少なく、酸素再生を守るのが先だと判断', action: 'shed' },
      ],
      plans: [
        { id: 'sealDryRestart', label: '漏れを封止し、乾燥させてから主電源を再投入', score: 1,
          steps: (p) => [p.knowsCause ? { room: 'powerroom', action: 'seal', label: '冷却配管の封止' } : { room: 'powerroom', action: 'inspect', label: '想定した原因箇所の点検' },
            { room: 'powerroom', action: 'dry', label: '配電盤の乾燥' }, { room: 'powerroom', action: 'restart', label: '主電源の再投入' }] },
        { id: 'dryRestart', label: '配電盤を乾燥させて主電源を再投入', warn: '漏れの元が残っていれば、また濡れて遮断するかもしれない', score: 0.3,
          steps: () => [{ room: 'powerroom', action: 'dry', label: '配電盤の乾燥' }, { room: 'powerroom', action: 'restart', label: '主電源の再投入' }] },
        { id: 'restartNow', label: '主電源をただちに再投入', warn: '原因が残ったまま通電すると、再遮断や発火のおそれがある', score: 0,
          steps: () => [{ room: 'powerroom', action: 'restart', label: '主電源の再投入' }] },
        { id: 'shed', label: '負荷を切り離して酸素再生を優先', score: 0.5, steps: () => [{ room: 'powerroom', action: 'shed', label: '負荷の切り離し' }] },
        { id: 'swapCell', label: '予備セルを在庫品と交換', score: 0.5,
          steps: () => [{ room: 'cargo', action: 'takeCell', label: '予備セルの搬出' }, { room: 'powerroom', action: 'installCell', label: '予備セルの交換' }] },
      ],
      actions: {
        seal: { minutes: (a, c) => (a.v.sealed ? 1 : 6 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech)),
          run: (a, c) => { if (!a.v.sealed) { a.v.sealed = 1; a.report(c, '天井の冷却配管の継手を仮封止した。漏れは止まった。床はまだ濡れている。'); } a.learn(c, 'S_seal'); } },
        inspect: { minutes: () => 6, run: (a, c) => a.report(c, '指示された原因の痕跡を探したが、それらしいものは見つからなかった。') },
        shed: { minutes: () => 3, run: (a, c) => { a.v.shed = 1; a.learn(c, 'S_shed'); a.report(c, '照明と使っていない区画の電源を切り、酸素再生と通信を優先した。予備電源の消費は4割ほど減る。'); } },
        dry: { minutes: () => 8, run: (a, c) => { a.v.wet = 0; a.report(c, '配電盤と床を乾燥させた。', { important: false }); } },
        restart: { minutes: (a, c) => 2 + (a.v.damaged ? 12 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech) : 0),
          run: (a, c) => {
            if (a.w.fire) { a.report(c, '火災中のため再投入を見送った。', { kind: 'danger' }); return; }
            if (a.v.wet >= 25) {
              a.v.damaged = 1;
              a.hurt(c.id, 35);
              a.report(c, '再投入した瞬間、濡れた配電盤から火が出た！ 主電源は入らない。', { kind: 'danger', reason: '指示どおり通電したが、配電盤がまだ濡れていた' });
              a.fire('powerroom', 70);
              return;
            }
            a.v.main = 1; a.v.damaged = 0;
            c.trust = Math.min(100, c.trust + 5);
            a.report(c, a.v.sealed ? '主電源の再投入に成功した。配電盤は安定している。' : '主電源が入った。ただ、天井からまだ何か滴っている気がする。');
          } },
        takeCell: { minutes: () => 2, run: (a, c) => {
          if (a.v.cells <= 0) { a.report(c, '貨物室に予備セルが残っていない。'); return 'fail'; }
          a.v.cells--; a.report(c, '貨物室から予備セルを1個持ち出した。在庫の封印は切られていなかった。', { important: false }); return 'ok';
        } },
        installCell: { minutes: (a, c) => 6 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech) + (a.v.damaged ? 5 : 0), run: (a, c) => {
          a.v.cap = 100; a.v.gauge = 0; a.v.backup = 100;
          a.learn(c, 'F_not_replaced');
          if (c.mind.hides.includes('F_not_replaced')) a.report(c, '予備セルを新品に交換した。残量は満タン。');
          else {
            a.report(c, '予備セルを新品に交換した。残量は満タン。');
            a.report(c, `［取り外したセル］${a.evText('old_cell')}`, { evidence: ['old_cell'], reason: '外したセルの製造番号が古い記録と同じだったので、念のため伝える' });
          }
        } },
      },
      tick(a) {
        const v = a.v;
        if (!v.sealed) v.wet = Math.min(100, v.wet + 0.35);
        if (v.main) {
          v.backup = Math.min(v.cap, v.backup + 0.05);
          if (!v.sealed && v.wet >= 40) { v.main = 0; a.alarm('主電源が再び遮断した。予備電源に切り替わった。', '主電源が再び遮断'); }
        } else if (v.backup > 0) {
          v.backup = Math.max(0, v.backup - DRAIN * (v.shed ? 0.6 : 1));
          if (v.backup === 0) a.alarm('予備電源が尽きた。照明が落ち、酸素再生機が止まった。', '予備電源が尽きた');
        }
        a.setComm('lower', !v.main && !v.relay_lower);
        a.w.o2 += v.main || v.backup > 0 ? 0.2 : -100 / 360;
      },
      meters(m) {
        const v = m.v;
        const rate = (100 / 180) * (v.shed ? 0.6 : 1);
        let power;
        if (v.main) power = { label: '主電源', value: 100, text: '稼働中', level: '' as const };
        else if (v.backup <= 0) power = { label: '予備電源', value: 0, text: '0%', sub: '停止', level: 'bad' as const };
        else if (m.has('cell_measure') || m.has('old_cell') || v.gauge === 0) power = { label: '予備電源（実測）', value: v.backup, text: Math.round(v.backup) + '%', sub: `残り約${Math.floor(v.backup / rate)}分`, level: v.backup < 25 ? 'warn' as const : '' as const };
        else { const e = Math.min(100, v.backup + v.gauge); power = { label: '予備電源（推定）', value: e, text: Math.round(e) + '%', sub: `設計値で残り約${Math.floor(e / rate)}分`, level: e < 25 ? 'warn' as const : '' as const }; }
        return [power, o2Meter(m), hullMeter(m)];
      },
      marks: (m) => (m.has('coolant_trace') ? [{ room: 'powerroom', text: '冷却液（報告）', color: '#3aa0d8' }] : []),
      resolved: (a) => !!(a.v.main && a.v.sealed),
      resolvedText: '主電源が安定した。電力の危機は去った。',
      epilogue: (e) => genericEpilogue(e, {
        [R.id]: e.crew.find((c) => c.id === R.id)!.confessed ? `${R.name}は整備記録を自分で訂正し、次の寄港で処分を受けると申し出た。` : e.grade === '真相解明' ? `${R.name}は記録の件を問われ、しばらく黙ってからうなずいた。` : `${R.name}は何事もなかったように持ち場に戻った。予備セルの記録は、誰にも見直されていない。`,
        [E.id]: e.v.sealed ? `${E.name}は封止した継手を何度も叩いて確かめ、「次の寄港で必ず交換する」と整備計画に書き込んだ。` : `${E.name}は濡れた配電室の前で腕を組んだまま、長いこと動かなかった。`,
        [M.id]: e.has('medclock') ? `${M.name}は医務室の時計を合わせ直し、「火花」の件を自分から訂正しに来た。` : `${M.name}は今も、あの夜の火花は誰かの仕業だったのではと考えている。`,
      }),
      solve: {
        policies: {
          [fixer.id]: [{ kind: 'respond' }],
          [investigator.id]: [{ kind: 'investigate', room: 'bridge' }, { kind: 'investigate', room: 'cargo' }],
          [mechanic.id]: [{ kind: 'investigate', room: 'engineering' }],
        },
        hyp: { category: 'accident', cause: 'coolant_leak', order: ['o_pressure', 'o_door', 'o_flicker', 'o_trip'], person: { crew: R.id, role: 'falsified' }, evidence: ['panel_log', 'coolant_trace', 'maint_record', 'inventory'], plan: 'sealDryRestart' },
      },
    };
  },
};
