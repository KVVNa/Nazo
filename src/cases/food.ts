// 事故＋隠し事：冷蔵庫が止まって傷んだ肉を、司厨員が捨てずにシチューに使った。
import type { CaseTemplate } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import { find, genericEpilogue, hullMeter, inComm, pct, placeRest } from './common';

export const FOOD: CaseTemplate = {
  id: 'food',
  title: '集団食中毒',
  category: 'accident',
  needSide: ['galley', 'medbay'],
  needLower: ['waterplant'],
  needRoles: ['cook'],
  build(g) {
    const C = g.byRole('cook')!;
    const M = g.byRole('medic')!;
    const others = g.shuffle(g.others(C, M));
    const sick = [C, ...others.slice(0, 3)];
    const healthy = others.slice(3);
    const V = sick[1 + g.int(0, 2)];
    const T = g.clock;
    const D = g.hm(19, g.int(15, 45));
    const F0 = D - g.int(300, 340) * 60;
    const R0 = D - g.int(25, 45) * 60;
    const onset = D + g.int(360, 390) * 60;
    const start = onset + g.int(15, 30) * 60;
    const breakfast = start + 2 * 3600;
    const names = sick.map((c) => c.name).join('・');
    const crewInit: Record<string, { room: string; known?: string[]; hides?: string[]; label?: string; health?: number }> = {
      [C.id]: { room: 'galley', known: ['F_fridge_off'], hides: ['F_fridge_off'], label: '腹を押さえてうずくまっている', health: 86 },
      [M.id]: { room: 'medbay' },
    };
    for (const c of sick.slice(1)) crewInit[c.id] = { room: g.has('quarters') ? 'quarters' : 'medbay', health: c === V ? 72 : 88, label: '寝台で横になっている' };
    placeRest(g, crewInit, ['bridge', 'corridor', 'lab', 'comms']);
    const vars: Record<string, number> = { treated: 0, discarded: 0, served: 0, vh: 72 };
    for (const c of sick) { vars['sick_' + c.id] = 1; vars['untreatable_' + c.id] = 1; }
    vars['severe_' + V.id] = 1;
    const live = inComm(g, crewInit, ['lower']);
    const inv = find(g, (c) => c.skills.inv >= 1 && c.skills.mech >= 1 && live(c) && !sick.includes(c), [M, C])
      ?? find(g, (c) => live(c) && !sick.includes(c), [M, C]);
    const Hs = healthy[0] ?? M;
    const Wc = sick[3];
    return {
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: [
        `船内時刻 ${T(start)}。乗員が次々と嘔吐と下痢で動けなくなっている。`,
        `発症しているのは${sick.length}人。${V.name}の容体が特に悪い。`,
        '下層の通信中継器は、水再生室の結露で故障していて連絡が取れない。',
        '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
      ],
      alarmText: `${T(start)} 医務室より：乗員${sick.length}人が嘔吐・下痢で動けない。下層の通信中継器は故障中。`,
      initialEvidence: ['sick_alarm'],
      truth: {
        cause: 'spoiled_food',
        events: [
          { id: 'ev_fridge', sec: F0, room: 'galley', actor: null, text: `昨日${T(F0)}、食堂の冷蔵庫の圧縮機が止まった。`, causes: ['ev_spoil'] },
          { id: 'ev_spoil', sec: R0 - 60, room: 'galley', actor: null, text: '庫内が18℃まで上がり、鶏肉に細菌が増えた。', causes: ['ev_dinner'] },
          { id: 'ev_reset', sec: R0, room: 'galley', actor: C.id, text: `${T(R0)}、${C.name}は冷蔵庫が止まっていたことに気づいて入れ直したが、肉を捨てず、記録も付けなかった。`, causes: ['ev_dinner'] },
          { id: 'ev_dinner', sec: D, room: 'galley', actor: C.id, text: `${T(D)}、その鶏肉でシチューを作り、${names}が食べた。`, causes: ['ev_onset'] },
          { id: 'ev_onset', sec: onset, room: 'medbay', actor: null, text: `${T(onset)}ごろ、食べた者が次々と発症した。`, causes: [] },
          { id: 'ev_relay', sec: start - 40 * 60, room: 'engineering', actor: null, text: '水再生室の結露が配線を伝い、下層の中継器がショートした（無関係）。', causes: [] },
          { id: 'ev_water', sec: D + 3600, room: 'waterplant', actor: null, text: '同じ夜、水再生系はフィルタ交換の定期警告を出していたが、水質は正常だった（無関係）。', causes: [] },
        ],
        orderCards: [
          { id: 'o_fridge', label: '冷蔵庫が止まる', sec: F0 },
          { id: 'o_reset', label: '冷蔵庫が入れ直される', sec: R0 },
          { id: 'o_dinner', label: '夕食にシチューが出る', sec: D },
          { id: 'o_onset', label: '最初の発症', sec: onset },
        ],
        responsible: { crew: C.id, role: 'falsified' },
        evidence: [
          ev('sick_alarm', '医務室からの一報', `${T(start)} 嘔吐・下痢で動けない乗員が${sick.length}人。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
          ev('symptoms', '発症者の診察記録', `症状は嘔吐・下痢・発熱。発症はいずれも昨夜の夕食から6〜7時間後。食べていない者は発症していない。`, { room: 'medbay', skill: 'med', minSkill: 1, work: 4, fact: 'F_symptoms', key: true, where: '医務室（医療技能が必要）' }),
          ev('menu', '夕食の記録', `昨夜の夕食：チキンシチュー（冷蔵庫の鶏肉）。配膳：${names}。${[M, ...healthy].map((c) => c.name).join('・')}は非常食とパン。`, { room: 'galley', source: 'record', work: 3, fact: 'F_menu', key: true, where: '食堂の献立記録' }),
          ev('fridge_log', '冷蔵庫の記録', `昨日${T(F0)} 圧縮機が停止。${T(R0)} 手動で再起動。庫内は最高18℃まで上がっていた。`, { room: 'galley', skill: 'mech', minSkill: 1, work: 4, fact: 'F_fridge_off', key: true, where: '食堂の冷蔵庫（整備技能が必要）' }),
          ev('leftovers', '鍋の残り', '鍋に残ったシチュー。酸っぱい匂いがする。', { room: 'galley', source: 'trace', skill: 'inv', minSkill: 1, work: 2, fact: 'F_leftover', key: true, where: '食堂の鍋' }),
          ev('water_warn', '水再生の警告記録', '昨夜：水再生フィルタ交換の定期警告。', { room: 'bridge', source: 'record', work: 2, fact: 'F_waterwarn', where: '司令室の整備記録' }),
          ev('water_test', '飲料水の検査', '飲料水の細菌検査は陰性。フィルタの状態も規定内。', { room: 'waterplant', skill: 'inv', minSkill: 1, work: 4, fact: 'F_waterok', where: '水再生室（下層・通信断）' }),
          said('c_claim', C.name, '冷蔵庫はずっと動いていました。材料は新鮮でした', 'F_c_lie', `${C.name}から話を聞く`),
          { ...said('c_confess', C.name, '……夕方、止まっていたのに気づいて入れ直しました。肉を捨てるのが惜しくて、火を通せば大丈夫だと', 'F_fridge_off', `${C.name}に冷蔵庫の記録か鍋の残りを突きつける`), title: `${C.name}の告白` },
          said('h_claim', Hs.name, '私はシチューを食べずにパンだけでした。なんともないです', 'F_menu', `${Hs.name}から話を聞く`),
          said('w_claim', Wc.name, '昨日の夜、水が少し変な味がした気がします', 'F_w_belief', `${Wc.name}から話を聞く`),
        ],
        misleads: [
          { evidence: 'water_warn', resolvedBy: ['water_test', 'menu'], explain: '水再生の警告は定期のフィルタ交換の知らせで、水質は正常だった。発症者はシチューを食べた者に限られていた。' },
          { evidence: 'w_claim', resolvedBy: ['water_test', 'menu'], explain: `${Wc.name}の「水が変な味」は気のせいで、水は全員が飲んでいた。発症を分けたのはシチューだった。` },
          { evidence: 'c_claim', resolvedBy: ['fridge_log', 'leftovers', 'c_confess'], explain: `${C.name}は冷蔵庫が動いていたと言ったが、記録には半日近い停止が残っていた。` },
        ],
      },
      rootEvent: 'ev_fridge',
      damageEvent: 'ev_onset',
      testimonies: [
        { crew: C.id, evidence: 'c_claim', lie: true },
        { crew: Hs.id, evidence: 'h_claim' },
        { crew: Wc.id, evidence: 'w_claim' },
      ],
      confessions: [{ crew: C.id, triggeredBy: ['fridge_log', 'leftovers'], evidence: 'c_confess' }],
      crewInit,
      whereabouts: [{ crew: C.id, sec: R0, room: 'galley' }, { crew: C.id, sec: D, room: 'galley' }],
      commDown: ['lower'],
      vars,
      causeOptions: [
        { id: 'spoiled_food', label: '冷蔵庫が止まって傷んだ肉が料理に使われた', category: 'accident' },
        { id: 'water_contam', label: '水再生系が汚染され、飲料水に細菌が混じった', category: 'accident' },
        { id: 'poisoning', label: '誰かが食事に毒を入れた', category: 'sabotage' },
        { id: 'alien_microbe', label: '採取した試料の未知の微生物が広がった', category: 'phenomenon' },
        { id: 'allergy', label: '新しい食材に全員がアレルギーを起こした', category: 'accident' },
      ],
      respond: { label: '患者を診る', desc: '医務室で発症者を診察する', room: 'medbay', waitLabel: '医務室で発症者を見守っている' },
      fieldActions: [
        { id: 'fluids', room: 'medbay', needs: 'F_symptoms', label: '発症者に補液を始める', ask: '脱水が進んでいます。発症者全員に補液を始めてよいですか。医療品を使います', why: '脱水を止めるのが最優先だと判断', skill: 'med', minSkill: 1, action: 'rehydrate' },
        { id: 'discard', room: 'galley', needs: 'F_leftover', label: '残った料理を捨てる', ask: '鍋のシチューが傷んでいます。朝食に出る前に捨ててよいですか', why: '同じものがまた出されると被害が広がると判断', action: 'discard' },
      ],
      plans: [
        { id: 'treatFull', label: '傷んだ料理を捨て、発症者に補液と抗菌薬を投与', score: 1, skill: 'med',
          steps: (p) => (p.knowsCause ? [{ room: 'galley', action: 'discard', label: '料理の廃棄' }, { room: 'medbay', action: 'treatFull', label: '補液と抗菌薬の投与' }]
            : [{ room: 'medbay', action: 'rehydrate', label: '補液' }]) },
        { id: 'rehydrate', label: '発症者に補液だけ行う', score: 0.5, skill: 'med', steps: () => [{ room: 'medbay', action: 'rehydrate', label: '補液' }] },
        { id: 'flushWater', label: '飲料水を止めて水再生系を洗浄', warn: '水を止めると脱水が進む', score: 0, steps: () => [{ room: 'waterplant', action: 'flush', label: '水再生系の洗浄' }] },
        { id: 'searchPoison', label: '全員の持ち物を調べて毒物を探す', warn: '見当違いなら乗員の信頼を損なう', score: 0, skill: 'inv', steps: () => [{ room: 'corridor', action: 'searchBags', label: '持ち物検査' }] },
      ],
      actions: {
        rehydrate: { minutes: (a, c) => 8 * Math.max(0.7, 1.6 - 0.3 * c.skills.med), run: (a, c) => {
          if (a.v.treated < 1) a.v.treated = 1;
          for (const x of a.crews()) a.v['untreatable_' + x.id] = 0;
          a.w.supplies.medkits = Math.max(0, a.w.supplies.medkits - 1);
          a.report(c, '発症者に補液を始めた。脱水の進みは止まったが、熱と腹痛は続いている。');
        } },
        treatFull: { minutes: (a, c) => 10 * Math.max(0.7, 1.6 - 0.3 * c.skills.med), run: (a, c) => {
          a.v.treated = 2;
          for (const x of a.crews()) a.v['untreatable_' + x.id] = 0;
          a.w.supplies.medkits = Math.max(0, a.w.supplies.medkits - 1);
          a.report(c, '食中毒の治療として、補液と抗菌薬を投与した。熱が下がり始めた。');
        } },
        discard: { minutes: () => 3, run: (a, c) => { a.v.discarded = 1; a.report(c, '鍋に残ったシチューと、同じ冷蔵庫の肉を捨てた。'); } },
        flush: { minutes: () => 12, run: (a, c) => {
          for (const x of a.crews()) if (a.v['sick_' + x.id] && x.alive) a.hurt(x.id, 5);
          a.report(c, '水再生系を洗浄した。そのあいだ飲料水が止まり、発症者の脱水が進んだ。');
        } },
        searchBags: { minutes: () => 12, run: (a, c) => {
          for (const x of a.crews()) x.trust = Math.max(0, x.trust - 5);
          a.report(c, '全員の持ち物を調べたが、毒物らしいものは見つからなかった。乗員の間に気まずい空気が流れている。');
        } },
      },
      tick(a) {
        const v = a.v;
        // 朝食：捨てていなければ、残りが温め直して出される
        if (!v.discarded && !v.served && a.now() >= breakfast) {
          const cook = a.crew(C.id);
          if (cook.alive && cook.policy.kind !== 'detained') {
            v.served = 1;
            for (const x of a.crews()) if (x.alive && !v['sick_' + x.id]) { v['sick_' + x.id] = 1; if (v.treated < 1) v['untreatable_' + x.id] = 1; x.health = Math.min(x.health, 90); }
            a.alarm(`朝食に昨夜のシチューが温め直して出された。食べた乗員が腹痛を訴えている。`, '朝食で被害拡大');
          }
        }
        for (const c of a.crews()) {
          if (!c.alive || !v['sick_' + c.id]) continue;
          const severe = v['severe_' + c.id];
          if (v.treated >= 2) { c.health = Math.min(100, c.health + 0.04); c.impair = Math.max(0, c.impair - 0.002); }
          else if (v.treated === 1) { c.health -= severe ? 0.012 : 0; c.impair = 0.25; }
          else { c.health -= severe ? 0.07 : 0.022; c.impair = severe ? 0.6 : 0.4; }
        }
        a.setComm('lower', !v.relay_lower);
        v.vh = a.crew(V.id).health;
        a.w.o2 = 100;
      },
      meters: (m) => {
        let n = 0;
        for (const k of Object.keys(m.v)) if (k.startsWith('sick_') && m.v[k]) n++;
        return [
          { label: '発症者', value: 100 - n * 15, text: `${n}人`, sub: m.v.treated >= 2 ? '治療中' : m.v.treated ? '補液中' : '未治療', level: m.v.treated >= 2 ? '' : n >= 5 ? 'bad' : 'warn' },
          pct(`${V.name}の体力`, m.v.vh ?? 72, 50, 25, '最も重い発症者'),
          hullMeter(m),
        ];
      },
      marks: (m) => (m.has('leftovers') ? [{ room: 'galley', text: '傷んだ料理（報告）', color: '#b3c24a' }] : []),
      resolved: (a) => a.v.treated >= 2 && !!a.v.discarded,
      resolvedText: '原因の料理が片付き、発症者の治療が始まった。',
      epilogue: (e) => genericEpilogue(e, {
        [C.id]: e.crew.find((c) => c.id === C.id)!.confessed ? `${C.name}は冷蔵庫に温度記録計を付け、「捨てる勇気」と書いた紙を扉に貼った。` : `${C.name}は黙って厨房を磨き続けた。冷蔵庫が止まった件は、誰にも話していない。`,
        [M.id]: e.v.treated >= 2 ? `${M.name}は発症者の熱が下がるまで、一晩中医務室を離れなかった。` : `${M.name}は補液の袋を数えながら、原因の分からない不安を抱えている。`,
        [V.id]: e.crew.find((c) => c.id === V.id)!.alive ? `いちばん重かった${V.name}は、三日後にようやく粥を口にした。` : '',
      }),
      solve: {
        policies: { [M.id]: [{ kind: 'respond' }], [inv.id]: [{ kind: 'investigate', room: 'galley' }] },
        hyp: { category: 'accident', cause: 'spoiled_food', order: ['o_fridge', 'o_reset', 'o_dinner', 'o_onset'], person: { crew: C.id, role: 'falsified' }, evidence: ['symptoms', 'menu', 'fridge_log', 'leftovers'], plan: 'treatFull' },
      },
    };
  },
};
