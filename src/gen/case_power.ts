// 事件テンプレート「消えた電力」。先に真相（因果グラフ）を決め、証拠と証言はそこから派生させる。
import type { CrewId, EvidenceDef, RoomId, Skill, Truth } from '../core/types';

const hm = (h: number, m: number) => h * 3600 + m * 60;

export interface CrewSeed {
  id: CrewId;
  name: string;
  role: string;
  history: string;
  skills: Record<Skill, number>;
  exp: number;
  trust: number;
  bold: boolean;
  room: RoomId;
  known: string[];
  hides: string[];
  look: { skin: number; hair: number; hairStyle: number; suit: number; eyes: number };
}

// 事件前の各乗員の居場所（時空間整合の検証に使う）
export interface Whereabout { crew: CrewId; sec: number; room: RoomId }

export interface Testimony {
  crew: CrewId;
  evidence: string; // 話を聞くと得られる証拠カードID
  requires?: string; // この事実を知っていれば話す
  lie?: boolean;
}

export interface CaseTemplate {
  truth: Truth;
  crew: CrewSeed[];
  whereabouts: Whereabout[];
  testimonies: Testimony[];
  confessions: { crew: CrewId; triggeredBy: string[]; evidence: string }[];
  causeOptions: { id: string; label: string; category: Truth['category'] }[];
  briefing: string[];
  initialEvidence: string[];
  deadlineSec: number;
}

const evidence: EvidenceDef[] = [
  { id: 'alarm', title: '警報記録', text: '02:14:07 主電源喪失。保護遮断器が作動し、予備電源へ自動切替。機関区の通信中継器が停止。', source: 'log', room: 'bridge', skill: null, minSkill: 0, work: 0, fact: 'F_trip', key: false, where: '司令室の警報記録（初期情報）' },
  { id: 'panel_log', title: '配電盤ログ', text: '02:14:07 地絡検出 → 主遮断器トリップ。直前の約4分間、絶縁抵抗が急に下がっている。', source: 'log', room: 'powerroom', skill: null, minSkill: 0, work: 3, fact: 'F_ground_fault', key: true, where: '配電室の配電盤' },
  { id: 'coolant_trace', title: '床の冷却液痕', text: '配電盤の下に青い冷却液の溜まり。天井を通る冷却配管の継手から、今も滴っている。', source: 'trace', room: 'powerroom', skill: 'inv', minSkill: 0, work: 2, fact: 'F_leak', key: true, where: '配電室の床と天井配管', destroyedByFire: true },
  { id: 'pressure_log', title: '冷却圧ログ', text: '冷却ループB系の圧力が01:40ごろから少しずつ下がり続けている。急な変化はない。', source: 'log', room: 'engineering', skill: 'mech', minSkill: 1, work: 4, fact: 'F_pressure', key: true, where: '下層機関区の冷却制御盤' },
  { id: 'cell_measure', title: '予備セルの実測残量', text: '予備セルの実容量は定格の約半分しかない。劣化した古いセルの特徴がある。', source: 'trace', room: 'powerroom', skill: 'mech', minSkill: 1, work: 5, fact: 'F_cell_half', key: false, where: '配電室の予備セル（整備技能が必要）' },
  { id: 'maint_record', title: '整備記録', text: '22日前：予備電源セル交換 完了（担当：ドゥラン）。', source: 'record', room: 'bridge', skill: 'inv', minSkill: 0, work: 4, fact: 'F_record_claims', key: true, where: '司令室の整備記録' },
  { id: 'inventory', title: '部品在庫記録', text: '予備電源セル 在庫2個。22日前以降、出庫の記録はない。', source: 'record', room: 'cargo', skill: 'inv', minSkill: 1, work: 4, fact: 'F_not_replaced', key: true, where: '貨物室の在庫端末' },
  { id: 'door_log', title: '貨物室ドア記録', text: '02:05 貨物室ドア開閉（認証：ケイ）。', source: 'log', room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_door_kei', key: false, where: '司令室の船内ドア記録' },
  { id: 'medclock', title: '医務室の時計記録', text: '02:14 電源切替で医務室の時計が再起動。外部同期に失敗し、+18分ずれたまま動作していた。', source: 'log', room: 'medbay', skill: 'inv', minSkill: 1, work: 3, fact: 'F_clock_skew', key: false, where: '医務室の端末' },
  { id: 'light_log', title: '照明回路ログ', text: '02:10〜02:13 機関区の照明回路で電圧低下と点滅を記録。', source: 'log', room: 'engineering', skill: null, minSkill: 0, work: 3, fact: 'F_flicker', key: false, where: '下層機関区の照明制御盤' },
  { id: 'old_cell', title: '取り外したセル', text: '交換作業で外したセルの製造番号は、22日前より前の点検記録と同じだった。', source: 'report', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_not_replaced', key: false, where: '予備セルの交換作業' },
  // 証言
  { id: 'sora_flash', title: 'ソラの証言', text: '「02:30ごろ、通路から機関区の点検窓越しに青白い火花みたいな光を見ました。誰かが何かしていたのかも」', source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_sora_saw', key: false, where: 'ソラから話を聞く' },
  { id: 'duran_claim', title: 'ドゥランの証言', text: '「予備セルは前回の整備で交換しました。記録にも残っています」', source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_duran_lie', key: false, where: 'ドゥランから話を聞く' },
  { id: 'duran_confess', title: 'ドゥランの告白', text: '「……交換は記録だけです。在庫を減らしたくなくて後回しにして、そのまま忘れていました」', source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_not_replaced', key: false, where: 'ドゥランに在庫記録か取り外したセルを突きつける' },
  { id: 'kei_cargo', title: 'ケイの証言', text: '「02:05に夜食を取りに貨物室へ行きました。変わった様子はなかったです」', source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_door_kei', key: false, where: 'ケイから話を聞く' },
  { id: 'mina_coolant', title: 'ミナの証言', text: '「B系の冷却ループは前から圧が不安定でした。継手の交換部品は次の寄港待ちです」', source: 'testimony', room: null, skill: null, minSkill: 0, work: 0, fact: 'F_aging_pipe', key: false, where: 'ミナから話を聞く' },
];

export const POWER_CASE: CaseTemplate = {
  truth: {
    caseId: 'lost_power',
    title: '消えた電力',
    category: 'accident',
    cause: 'coolant_leak',
    events: [
      { id: 'ev_skip_swap', sec: hm(2, 0) - 22 * 86400, room: 'powerroom', actor: 'duran', text: '22日前、ドゥランは予備セルの交換を記録だけして実施しなかった。', causes: ['ev_half_cell'] },
      { id: 'ev_half_cell', sec: hm(2, 14), room: 'powerroom', actor: null, text: '古いセルのため、予備電源は定格の約半分しか持たなかった。', causes: [] },
      { id: 'ev_crack', sec: hm(1, 40), room: 'powerroom', actor: null, text: '01:40ごろ、経年劣化した冷却ループB系の継手に亀裂が入り、配電室の天井から冷却液が漏れ始めた。', causes: ['ev_pressure', 'ev_pool'] },
      { id: 'ev_pressure', sec: hm(1, 40), room: 'engineering', actor: null, text: '冷却圧がゆるやかに下がり始めた。', causes: [] },
      { id: 'ev_pool', sec: hm(2, 8), room: 'powerroom', actor: null, text: '滴った冷却液が主配電盤に回り、絶縁が下がり始めた。', causes: ['ev_flicker', 'ev_trip'] },
      { id: 'ev_door', sec: hm(2, 5), room: 'cargo', actor: 'kei', text: '02:05、ケイは夜食を取りに貨物室へ行った（事件とは無関係）。', causes: [] },
      { id: 'ev_flicker', sec: hm(2, 12), room: 'engineering', actor: null, text: '02:12ごろ、電圧低下で機関区の照明が点滅した。通路にいたソラはこれを火花だと思った。', causes: [] },
      { id: 'ev_trip', sec: hm(2, 14), room: 'powerroom', actor: null, text: '02:14、地絡を検出した主配電盤が保護遮断し、予備電源へ切り替わった。', causes: ['ev_half_cell', 'ev_clock'] },
      { id: 'ev_clock', sec: hm(2, 14), room: 'medbay', actor: null, text: '切替で医務室の時計が再起動し、18分進んだまま動いた。ソラの時刻の記憶はこの時計に基づく。', causes: [] },
    ],
    orderCards: [
      { id: 'o_pressure', label: '冷却圧の低下が始まる', sec: hm(1, 40) },
      { id: 'o_door', label: '貨物室のドアが開閉される', sec: hm(2, 5) },
      { id: 'o_flicker', label: '機関区で光が明滅する', sec: hm(2, 12) },
      { id: 'o_trip', label: '主配電盤が保護遮断する', sec: hm(2, 14) },
    ],
    responsible: { crew: 'duran', role: 'falsified' },
    evidence,
    misleads: [
      { evidence: 'sora_flash', resolvedBy: ['medclock', 'light_log'], explain: 'ソラが見た「火花」は、遮断直前の電圧低下による照明の点滅だった。時刻が02:30とずれていたのは、医務室の時計が電源切替で18分進んでいたため。' },
      { evidence: 'duran_claim', resolvedBy: ['inventory', 'old_cell', 'duran_confess'], explain: 'ドゥランは予備セルを交換したと記録していたが、実際には交換していなかった。在庫が減っていないことから矛盾が分かる。' },
      { evidence: 'door_log', resolvedBy: ['kei_cargo', 'panel_log'], explain: '02:05の貨物室ドアの開閉はケイが夜食を取りに行っただけで、停電とは関係がない。' },
    ],
    spareCells: 2,
    leakRatePerTick: 0.35,
  },
  crew: [
    { id: 'mina', name: 'ミナ', role: '機関士', history: '採掘船の機関部に12年', skills: { mech: 3, med: 0, inv: 1 }, exp: 3, trust: 60, bold: true, room: 'quarters', known: ['F_aging_pipe'], hides: [], look: { skin: 1, hair: 3, hairStyle: 1, suit: 0, eyes: 0 } },
    { id: 'sora', name: 'ソラ', role: '医務官', history: '救急救命室の看護師出身', skills: { mech: 0, med: 3, inv: 2 }, exp: 2, trust: 55, bold: false, room: 'medbay', known: ['F_sora_saw'], hides: [], look: { skin: 0, hair: 1, hairStyle: 2, suit: 2, eyes: 1 } },
    { id: 'kei', name: 'ケイ', role: '航法士', history: '航法学校を今年卒業', skills: { mech: 1, med: 0, inv: 2 }, exp: 1, trust: 50, bold: false, room: 'bridge', known: ['F_door_kei'], hides: [], look: { skin: 2, hair: 0, hairStyle: 0, suit: 1, eyes: 0 } },
    { id: 'duran', name: 'ドゥラン', role: '保安員', history: '港湾警備を経て乗船3年目', skills: { mech: 1, med: 1, inv: 1 }, exp: 2, trust: 50, bold: true, room: 'corridor', known: ['F_not_replaced'], hides: ['F_not_replaced', 'F_cell_half'], look: { skin: 3, hair: 2, hairStyle: 3, suit: 3, eyes: 1 } },
  ],
  whereabouts: [
    { crew: 'kei', sec: hm(2, 0), room: 'bridge' },
    { crew: 'kei', sec: hm(2, 5), room: 'cargo' },
    { crew: 'kei', sec: hm(2, 10), room: 'bridge' },
    { crew: 'sora', sec: hm(2, 10), room: 'medbay' },
    { crew: 'sora', sec: hm(2, 12), room: 'corridor' },
    { crew: 'sora', sec: hm(2, 16), room: 'medbay' },
    { crew: 'mina', sec: hm(0, 30), room: 'quarters' },
    { crew: 'duran', sec: hm(2, 0), room: 'quarters' },
    { crew: 'duran', sec: hm(2, 18), room: 'corridor' },
  ],
  testimonies: [
    { crew: 'sora', evidence: 'sora_flash' },
    { crew: 'duran', evidence: 'duran_claim', lie: true },
    { crew: 'kei', evidence: 'kei_cargo' },
    { crew: 'mina', evidence: 'mina_coolant' },
  ],
  confessions: [{ crew: 'duran', triggeredBy: ['inventory', 'old_cell', 'cell_measure'], evidence: 'duran_confess' }],
  causeOptions: [
    { id: 'coolant_leak', label: '冷却配管の亀裂から漏れた冷却液が配電盤を地絡させた', category: 'accident' },
    { id: 'panel_sabotage', label: '何者かが配電盤に細工して遮断させた', category: 'sabotage' },
    { id: 'cell_failure', label: '予備セルの故障が主電源を巻き込んで落とした', category: 'accident' },
    { id: 'overload', label: '機器の過負荷で主遮断器が落ちた', category: 'accident' },
    { id: 'radiation', label: '宇宙線の突発的な増加で制御系が誤作動した', category: 'phenomenon' },
  ],
  briefing: [
    '船内時刻 02:14、主電源が停止した。船は予備電源で動いている。',
    '予備電源の残量は、定格どおりなら約3時間分と表示されている。',
    '下層機関区と配電室は通信中継器が止まり、連絡が取れない。',
    '乗員は4人。あなたは司令室から、各自に行動方針を与える。',
    '原因を突き止め、仮説と対処を提出してほしい。提出は最大3回まで。',
  ],
  initialEvidence: ['alarm'],
  deadlineSec: hm(5, 30),
};
