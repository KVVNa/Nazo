// 組み立て式の工作事件。動機 → 目的 → 手口（陽動）→ 部屋への入り方 → 痕跡 → 絞り込みの手がかり、を部品から組み立てる。
// 毎回、犯人・動機・目的（盗む／消す／複製する）・陽動の手口（偽の火災警報／区画の停電／換気の逆流）・
// 入り方（他人のカード／ドア記録の書き換え／共用番号）・時計のトリック・目撃者・アリバイの記録が変わる。
// 生成した事件は、必須証拠だけで犯人が一人に絞れること（identify）と、
// 誤った原因の候補がどれも客観証拠で否定できること（causeRefutes）を検証器が確かめる。
import type { CaseDef, CaseTemplate, CrewSeed, GenCtx, PlanDef, ActionDef, FieldAction } from '../gen/case_api';
import { ev, said } from '../gen/case_api';
import type { EvidenceDef, Group, RoomId, TruthEvent } from '../core/types';
import { bestLive, genericEpilogue, hullMeter, inComm, pct } from './common';
import { GROUP_NAME } from '../sim/ship';

// ---------- 目的（何をしたかったか） ----------
type GoalId = 'take_sample' | 'take_drug' | 'erase_maint' | 'erase_med' | 'erase_comm' | 'erase_train' | 'erase_data' | 'erase_manifest' | 'copy_records';
interface Goal {
  id: GoalId;
  room: RoomId;
  cause: string; // 原因の候補の後半「その隙に〜」
  act: string; // 真相の出来事の後半
  traceTitle: string;
  trace: (t: string) => string;
  terminal: boolean; // 端末の操作（消去の復元で名前の一文字が分かる）
  content: string; // 何が盗まれた／消されたか（既定の文。乗員ごとに差し替え）
  contentTitle: string;
  intactTitle: string;
  intact: string; // 候補として否定するときの「無事だった」記録
  order: string;
  thing: string; // 手袋の繊維が付いていた場所
}
const GOALS: Record<GoalId, Goal> = {
  take_sample: { id: 'take_sample', room: 'cargo', cause: '貨物室のコンテナから積荷を抜き取った', act: 'コンテナ7番の封印を切り、中身を抜き取った',
    traceTitle: 'コンテナ7番の封印', trace: (t) => `封印が切られ、中の試料ケースが空になっている。封印センサーの切断記録：${t}。`, terminal: false,
    contentTitle: '積荷目録', content: 'コンテナ7番：希少鉱物の試料1点（高価・保険付き）。', intactTitle: 'コンテナの封印', intact: '貨物室のコンテナの封印は、すべて無事だった。', order: 'コンテナ7番の封印が切られる', thing: 'コンテナの留め金' },
  take_drug: { id: 'take_drug', room: 'medbay', cause: '医務室の薬品庫から鎮痛剤を持ち出した', act: '医務室の薬品庫を開け、鎮痛剤を持ち出した',
    traceTitle: '薬品庫の記録', trace: (t) => `鎮痛剤（オピオイド系）が10錠足りない。薬品庫の扉センサー：${t} 開閉。`, terminal: false,
    contentTitle: '処方の記録', content: 'この鎮痛剤は、今回の航海で誰にも処方されていない。', intactTitle: '薬品庫の在庫', intact: '薬品庫の在庫は、記録どおりだった。', order: '薬品庫の扉が開く', thing: '薬品庫の取っ手' },
  erase_maint: { id: 'erase_maint', room: 'engineering', cause: '機関区の端末から整備記録を消した', act: '機関区の端末から整備記録を1件消した',
    traceTitle: '整備記録の端末', trace: (t) => `整備記録が1件消されている。消去の時刻：${t}。`, terminal: true,
    contentTitle: '消された整備記録', content: '消されたのは、継手の締め直しの記録（「完了」とあるが実施されていない）。', intactTitle: '整備記録', intact: '整備記録に、消去や書き換えの跡はなかった。', order: '整備記録が1件消される', thing: '端末のキーボード' },
  erase_med: { id: 'erase_med', room: 'medbay', cause: '医務室の端末から医療記録を消した', act: '医務室の端末から医療記録を1件消した',
    traceTitle: '医療記録の端末', trace: (t) => `医療記録が1件消されている。消去の時刻：${t}。`, terminal: true,
    contentTitle: '消された医療記録', content: '消されたのは、ある乗員の健康診断の結果だった。', intactTitle: '医療記録', intact: '医療記録に、消去や書き換えの跡はなかった。', order: '医療記録が消される', thing: '端末のキーボード' },
  erase_comm: { id: 'erase_comm', room: 'comms', cause: '通信室の端末から受信記録を消した', act: '通信室の端末から受信記録を消した',
    traceTitle: '受信記録の端末', trace: (t) => `受信記録が何件か消されている。消去の時刻：${t}。`, terminal: true,
    contentTitle: '消された受信記録', content: '消されたのは、ある乗員宛ての私的な通信だった。', intactTitle: '受信記録', intact: '受信記録に、消去の跡はなかった。', order: '受信記録が消される', thing: '端末のキーボード' },
  erase_train: { id: 'erase_train', room: 'lab', cause: '研究室の訓練装置の記録を書き換えた', act: '研究室の訓練装置の記録を書き換えた',
    traceTitle: '訓練装置の記録', trace: (t) => `訓練時間の記録が書き換えられている。変更の時刻：${t}。`, terminal: true,
    contentTitle: '書き換えられた訓練記録', content: '書き換えられたのは、ある乗員の実技時間だった。', intactTitle: '訓練装置の記録', intact: '訓練装置の記録に、書き換えの跡はなかった。', order: '訓練記録が書き換えられる', thing: '訓練装置の操作盤' },
  erase_data: { id: 'erase_data', room: 'lab', cause: '研究室の観測データを差し替えた', act: '研究室の観測データを差し替えた',
    traceTitle: '観測データの保管庫', trace: (t) => `観測データの一部が差し替えられている。変更の時刻：${t}。`, terminal: true,
    contentTitle: '差し替えられたデータ', content: '差し替えられたのは、観測データの一部だった。', intactTitle: '観測データ', intact: '観測データに、差し替えの跡はなかった。', order: '観測データが差し替えられる', thing: '保管庫の操作盤' },
  erase_manifest: { id: 'erase_manifest', room: 'cargo', cause: '貨物室の端末から積荷目録の行を消した', act: '貨物室の端末から積荷目録の行を消した',
    traceTitle: '積荷目録の端末', trace: (t) => `積荷目録から数行が消されている。消去の時刻：${t}。`, terminal: true,
    contentTitle: '消された目録の行', content: '消されたのは、資材の箱の行だった。', intactTitle: '積荷目録', intact: '積荷目録に、消去の跡はなかった。', order: '積荷目録の行が消される', thing: '端末のキーボード' },
  copy_records: { id: 'copy_records', room: 'comms', cause: '通信室の保管庫から非公開の記録を複製した', act: '通信室の保管庫から非公開の記録を複製した',
    traceTitle: '保管庫の閲覧記録', trace: (t) => `${t}、非公開の記録がまとめて複製されている。認証は保守用の共用番号。`, terminal: false,
    contentTitle: '複製された記録', content: '複製されたのは、非公開の記録だった。', intactTitle: '保管庫の閲覧記録', intact: '保管庫の非公開記録は、今夜は誰も開いていなかった。', order: '保管庫の記録が複製される', thing: '保管庫の操作盤' },
};

// 固定乗員でないときの動機（役目で選べるものを絞る）
interface Motive { goal: GoalId; roles?: string[]; motive: (n: string) => string; confess: string; epi: (n: string) => string; content?: (n: string) => string }
const GENERIC: Motive[] = [
  { goal: 'take_sample', motive: (n) => `${n}は借金の返済に追われていた。コンテナ7番には高価な試料があった。`, confess: '……借金です。一つ売れば、しばらくは息がつけると思った', epi: (n) => `${n}は試料を返した。借金のことは、到着後に相談することになった。` },
  { goal: 'erase_maint', roles: ['engineer', 'cargo', 'comms'], motive: (n) => `${n}は継手の締め直しを忘れたまま「完了」と記録していた。点検で見つかるのを恐れた。`, confess: '……締め直しを忘れていたんです。記録を消せば、なかったことになると思った', epi: (n) => `${n}は整備記録を自分で書き直し、継手を締め直した。`, content: (n) => `消されたのは、${n}が担当した継手の締め直しの記録（「完了」とあるが実施されていない）。` },
  { goal: 'take_drug', motive: (n) => `${n}は作業中に腰を痛め、申告しないまま痛みをこらえていた。`, confess: '……腰が、もう限界で。言えば持ち場を外されると思った', epi: (n) => `${n}は残りの薬を返し、医務室で腰を診てもらうことになった。` },
  { goal: 'erase_comm', motive: (n) => `${n}は、家族との私的な通信が監査で読まれるのを嫌った。`, confess: '……家族とのやり取りです。誰にも読まれたくなかった', epi: (n) => `${n}は消した記録を戻した。読まれたくない気持ちは、船長にだけ話した。`, content: (n) => `消されたのは、${n}宛ての私的な通信が9通。` },
  { goal: 'erase_med', motive: (n) => `${n}には持病があった。健康診断の結果が本社に届けば、次の契約はないと思っていた。`, confess: '……持病のことです。知られたら、次の船には乗れない', epi: (n) => `${n}は消した記録を戻し、医務官と今後のことを話し合った。`, content: (n) => `消されたのは、${n}の健康診断の結果だった。` },
  { goal: 'copy_records', motive: (n) => `${n}は、会社が事故の記録を隠していると疑っていた。通信室の保管庫に、非公開の記録がある。`, confess: '……会社が何か隠していると思ったんです。確かめたかった', epi: (n) => `${n}は複製した記録を船長に差し出した。中身は、到着後に確かめることになった。`, content: () => '複製されたのは、過去の船内事故の非公開の報告書だった。' },
];

// ---------- 絞り込みの手がかり ----------
const SUIT_WORD = ['橙色', '青', '白', '緑'];
const ROLE_WORD: Record<string, string> = { engineer: '機関', medic: '医務', navigator: '航法', security: '保安', comms: '通信', scientist: '科学', cook: '厨房', cargo: '荷役' };
const TOOL_ROLES = ['engineer', 'cargo', 'cook', 'security']; // 工具棚の暗証番号を知らされている
const PANEL_ROLES = ['engineer', 'comms', 'cargo']; // 配電盤の封の外し方を教わる
const VENT_ROLES = ['engineer', 'medic', 'scientist']; // 生命維持の操作盤の番号を知らされている
const REWRITE_ROLES = ['engineer', 'comms']; // ドア記録を書き換えられる整備権限
const WORK_GLOVE = ['engineer', 'cargo', 'cook'];
const MED_GLOVE = ['medic', 'scientist'];
const roleList = (rs: string[]) => rs.map((r) => ROLE_WORD[r]).join('・');

type Means = 'alarm' | 'breaker' | 'vent';
type Access = 'card' | 'rewrite' | 'code' | 'dark';
type AlibiKind = 'watch' | 'bed' | 'med' | 'galley' | 'eng' | 'muster';
const MIN = 60;

export const PLOT: CaseTemplate = {
  id: 'plot',
  title: '誰が、何のために（組み立て式）',
  category: 'sabotage',
  needSide: [],
  needLower: [],
  build(g: GenCtx): CaseDef {
    const T = g.clock;
    const crew = g.crew;
    const E = g.byRole('engineer')!;
    const plain = (c: CrewSeed) => c.lines?.voice === 'plain';
    const say = (c: CrewSeed, polite: string, casual: string) => (plain(c) ? casual : polite);

    // ---- 犯人と動機 ----
    const pool = g.shuffle(crew.filter((c) => c.id !== E.id || crew.length > 7));
    const C = (g.cast && crew.find((c) => c.id === g.cast)) || pool[0];
    const slots = ['plot', 'plot2'].filter((k) => C.lines?.[k + '.goal']);
    const slot = slots.length ? g.pick(slots) : null;
    const gm = g.shuffle(GENERIC.filter((m) => !m.roles || m.roles.includes(C.roleId)))[0];
    const L = (k: string, fb: string) => (slot ? C.lines?.[`${slot}.${k}`] ?? fb : fb);
    const goal = GOALS[(slot ? C.lines![slot + '.goal'] : gm.goal) as GoalId];
    const motiveText = L('motive', gm.motive(C.name));
    const confessText = L('confess', gm.confess);
    const epiText = L('epi', gm.epi(C.name));
    const contentText = L('content', !slot && gm.goal === goal.id && gm.content ? gm.content(C.name) : goal.content);
    const goalRoom = goal.room;
    const goalName = g.rn(goalRoom);
    const grp = g.groupOf(goalRoom);
    const GN = GROUP_NAME[grp];
    const relay = g.relayOf(grp);

    // ---- 手口と入り方 ----
    const feasible: Means[] = ['alarm'];
    if (PANEL_ROLES.includes(C.roleId) && (grp === 'port' || grp === 'starboard')) feasible.push('breaker');
    if (grp !== g.groupOf('lifesupport')) feasible.push('vent');
    const means = g.pick(feasible);
    const accessOpts: Access[] = means === 'breaker' ? ['dark'] : ['card', 'code', ...(REWRITE_ROLES.includes(C.roleId) ? ['rewrite' as const] : [])];
    const access = g.pick(accessOpts);
    const sideRooms = g.rooms.filter((r) => (r.group === 'port' || r.group === 'starboard') && r.group !== grp).map((r) => r.id);
    const X = g.pick(sideRooms.length ? sideRooms : ['galley']); // 警報を鳴らす区画
    const XName = g.rn(X);
    const LS = 'lifesupport';
    const odorRooms = ['quarters', 'galley']; // 換気の逆流で排気が流れ込む区画

    // ---- 時刻 ----
    const Tm = g.hm(g.int(0, 2), g.int(0, 50));
    const Tcard = Tm - g.int(40, 50) * MIN;
    const Tiron = Tm - g.int(18, 26) * MIN;
    const Theat = Tm - MIN;
    const Tact = Tm + (means === 'alarm' ? 4 : means === 'vent' ? 8 : 6) * MIN;
    const Tpull = Tact + 6 * MIN;
    const Trw = Tpull + 6 * MIN;
    const Tdark = Tm + MIN;
    const Todor = Tm + MIN;
    const lastC = means === 'breaker' ? Tact : access === 'rewrite' ? Trw : Tpull;
    const start = lastC + g.int(22, 32) * MIN;
    const Tco2 = start - g.int(4, 8) * MIN;
    const musterA = means === 'vent' ? Tm + 6 * MIN : Tm + 2 * MIN;
    const musterB = means === 'vent' ? Tm + 18 * MIN : Tm + 15 * MIN;
    const winA = means === 'breaker' ? Tact - 15 * MIN : musterA;
    const winB = means === 'breaker' ? Tact + 10 * MIN : musterB;

    // ---- 絞り込み ----
    const others = crew.filter((c) => c.id !== C.id);
    const ids = (f: (c: CrewSeed) => boolean) => crew.filter(f).map((c) => c.id);
    type Clue = { key: string; suspects: string[] };
    const cand: Clue[] = [{ key: 'witness', suspects: ids((c) => c.look.suit === C.look.suit) }];
    if (means === 'alarm' && TOOL_ROLES.includes(C.roleId)) cand.push({ key: 'tools', suspects: ids((c) => TOOL_ROLES.includes(c.roleId)) });
    if (means === 'breaker') cand.push({ key: 'panel', suspects: ids((c) => PANEL_ROLES.includes(c.roleId)) });
    if (means === 'vent' && VENT_ROLES.includes(C.roleId)) cand.push({ key: 'ventpanel', suspects: ids((c) => VENT_ROLES.includes(c.roleId)) });
    const gloveSet = WORK_GLOVE.includes(C.roleId) ? WORK_GLOVE : MED_GLOVE.includes(C.roleId) ? MED_GLOVE : null;
    if (gloveSet) cand.push({ key: 'glove', suspects: ids((c) => gloveSet.includes(c.roleId)) });
    // 一つで決まってしまう手がかり、何も絞れない手がかりは使わない。書き換えの手口なら、その手がかりは必ず残る
    const informative = (x: Clue) => x.suspects.length >= 2 && x.suspects.length < crew.length;
    const rewriteClue: Clue | null = access === 'rewrite' ? { key: 'rewrite', suspects: ids((c) => REWRITE_ROLES.includes(c.roleId)) } : null;
    const usable = g.shuffle(cand.filter(informative));
    const clues = rewriteClue && informative(rewriteClue) ? [rewriteClue, ...usable.slice(0, 1)] : usable.slice(0, 2);
    let left = new Set(crew.map((c) => c.id));
    for (const cl of clues) left = new Set([...left].filter((x) => cl.suspects.includes(x)));
    if (rewriteClue && !clues.includes(rewriteClue)) left = new Set([...left].filter((x) => rewriteClue.suspects.includes(x)));
    const mustAlibi = [...left].filter((x) => x !== C.id);
    const useWitness = clues.some((c) => c.key === 'witness');

    // ---- 名前を使われた者（他人のカード、または書き換え） ----
    const V = access === 'card' || access === 'rewrite' ? g.shuffle(others.filter((c) => !mustAlibi.includes(c.id)))[0] ?? others[0] : undefined;
    const needAlibi = [...new Set([...mustAlibi, ...(V ? [V.id] : [])])];

    // ---- アリバイの記録 ----
    interface Src { kind: AlibiKind; room: RoomId; cap: number; members: string[] }
    const cut: Group | null = means === 'breaker' ? grp : null;
    const avail: Src[] = ([
      { kind: 'watch', room: 'bridge', cap: 2, members: [] },
      { kind: 'bed', room: 'quarters', cap: 3, members: [] },
      { kind: 'med', room: 'medbay', cap: 2, members: [] },
      { kind: 'galley', room: 'galley', cap: 2, members: [] },
      { kind: 'eng', room: 'engineering', cap: 2, members: [] },
      ...(means !== 'breaker' ? [{ kind: 'muster' as const, room: means === 'vent' ? 'bridge' : 'corridor', cap: 8, members: [] as string[] }] : []),
    ] as Src[]).filter((s) => s.room !== goalRoom
      && !(means === 'alarm' && s.room === X)
      && !(means === 'vent' && odorRooms.includes(s.room))
      && (!cut || g.groupOf(s.room) !== cut));
    // 時計のトリック（停電・換気のとき）：犯人は記録の残る部屋の時計を25分進めておき、犯行の前にそこにいた。
    // 記録の上では、犯行の時刻にその部屋にいたことになる。部屋には犯人しかいなかった。
    const SKEW = 25 * MIN;
    const clockSrc = means !== 'alarm' && g.rand() < 0.5 ? g.shuffle(avail.filter((x) => x.kind === 'eng' || (means === 'breaker' && x.kind === 'galley')))[0] : undefined;
    if (clockSrc) { clockSrc.members.push(C.id); clockSrc.cap = 1; }
    const place = (id: string, pref?: AlibiKind[]) => {
      const opts = g.shuffle(avail.filter((s) => s.members.length < s.cap));
      const pick = (pref && opts.find((s) => pref.includes(s.kind))) || opts[0];
      if (!pick) return false;
      pick.members.push(id);
      return true;
    };
    let alibiOk = true;
    // 目撃者：犯行の時刻に通路にいた者。警報のときは点呼へ向かう途中なので、点呼の記録にも載る
    const W = useWitness ? g.shuffle(others.filter((c) => c.id !== V?.id && (means === 'alarm' || !needAlibi.includes(c.id))))[0] : undefined;
    if (useWitness && !W) alibiOk = false;
    if (W && means === 'alarm' && !place(W.id, ['muster'])) alibiOk = false;
    for (const id of needAlibi) if (id !== W?.id && !place(id, means === 'breaker' ? undefined : ['muster', 'watch'])) alibiOk = false;
    for (const c of g.shuffle(others)) {
      if (needAlibi.includes(c.id) || c.id === W?.id) continue;
      if (g.rand() < 0.5) place(c.id);
    }
    const used = avail.filter((s) => s.members.length > 0);
    const lieSrc = clockSrc ?? used.find((s) => s.kind === 'muster') ?? used.find((s) => s.kind === 'bed') ?? used.find((s) => s.kind !== 'watch') ?? used[0];
    const N = g.shuffle(others.filter((c) => c.id !== W?.id && c.id !== V?.id))[0];

    const nm = (id: string) => crew.find((c) => c.id === id)!.name;
    const srcRoomFor = (s: Src) => s.room;
    const srcEv = (s: Src): EvidenceDef => {
      const names = s.members.map(nm).join('・') || 'なし';
      const w = s === clockSrc ? `${T(Tm - 30 * MIN + SKEW)}〜${T(Tm - 10 * MIN + SKEW)}` : `${T(s.kind === 'muster' ? musterA : winA)}〜${T(s.kind === 'muster' ? musterB : winB)}`;
      switch (s.kind) {
        case 'watch': return ev('rec_watch', '当直記録', `${w} 司令室の当直：${names}。席を離れた記録はない。`, { room: 'bridge', source: 'record', work: 2, fact: 'F_rec_watch', where: '司令室の当直記録' });
        case 'bed': return ev('rec_bed', '在床センサーの記録', `${w} ${g.rn('quarters')}の寝台に在床：${names}。`, { room: 'quarters', source: 'record', work: 2, fact: 'F_rec_bed', where: `${g.rn('quarters')}の在床センサー` });
        case 'med': return ev('rec_med', '医務室の利用記録', `${w} ${g.rn('medbay')}にいた：${names}（夜間の診察と在庫整理）。`, { room: 'medbay', source: 'record', work: 2, fact: 'F_rec_med', where: `${g.rn('medbay')}の利用記録` });
        case 'galley': return ev('rec_galley', '食堂の利用記録', `${w} ${g.rn('galley')}にいた：${names}（冷蔵庫の開閉と配膳の記録）。`, { room: 'galley', source: 'record', work: 2, fact: 'F_rec_galley', where: `${g.rn('galley')}の利用記録` });
        case 'eng': return ev('rec_eng', '機関区の作業記録', `${w} ${g.rn('engineering')}で作業：${names}（作業ログの入力が続いている）。`, { room: 'engineering', source: 'record', work: 2, fact: 'F_rec_eng', where: `${g.rn('engineering')}の作業記録` });
        case 'muster': return means === 'vent'
          ? ev('rec_muster', '退避の点呼記録', `${w} 司令室に退避：${names}。`, { room: 'bridge', source: 'record', work: 2, fact: 'F_rec_muster', where: '司令室の点呼記録' })
          : ev('rec_muster', '警報の点呼記録', `${w} ${XName}の前で点呼：${names}。`, { room: 'bridge', source: 'record', work: 2, fact: 'F_rec_muster', where: '司令室の点呼記録' });
      }
    };
    const recs = used.map((s) => ({ s, e: srcEv(s) }));
    const recFor = (id: string) => recs.find((r) => r.s.members.includes(id));
    const keyRecs = new Set<string>();
    for (const id of needAlibi) { const r = recFor(id); if (r) keyRecs.add(r.e.id); }
    const lieRec = lieSrc ? recs.find((r) => r.s === lieSrc)!.e.id : null;
    if (lieRec) keyRecs.add(lieRec);
    for (const r of recs) if (keyRecs.has(r.e.id)) r.e.key = true;

    // ---- 証拠 ----
    const evs: EvidenceDef[] = [];
    const goalSkill = goal.terminal ? { skill: 'mech' as const, minSkill: 1 } : { skill: 'inv' as const, minSkill: 1 };
    const initial = means === 'alarm' ? 'alarm0' : means === 'vent' ? 'odor0' : 'co2_0';
    const okEv: Record<Means, EvidenceDef> = {
      alarm: ev('alarm_ok', '火災警報の記録', '今夜、火災警報は一度も鳴っていない。', { room: 'bridge', work: 2, fact: 'F_alarm_ok', where: '司令室の警報記録' }),
      breaker: ev('breaker_ok', '配電盤の記録', '遮断器はすべて正常。今夜、手で操作された記録はない。', { room: 'powerroom', work: 2, fact: 'F_breaker_ok', where: `${g.rn('powerroom')}の配電盤` }),
      vent: ev('damper_ok', '換気ダンパーの記録', '換気ダンパーは通常の設定のまま。今夜、手で操作された記録はない。', { room: LS, work: 2, fact: 'F_damper_ok', where: `${g.rn(LS)}の換気盤` }),
    };
    const otherMeans = g.pick((['alarm', 'breaker', 'vent'] as Means[]).filter((m) => m !== means));
    evs.push(okEv[otherMeans]);
    if (clockSrc) evs.push(ev('clock_skew', '端末の時計', `${g.rn(clockSrc.room)}の端末の時計が25分進んでいる。外部との時刻合わせが切られ、手で合わせた跡がある。記録の時刻もその分ずれている。`, { room: clockSrc.room, source: 'trace', skill: 'mech', minSkill: 1, work: 3, fact: 'F_skew', key: true, where: `${g.rn(clockSrc.room)}の端末` }));
    if (means === 'alarm') {
      evs.push(
        ev('alarm0', '火災警報の記録', `${T(Tm)} ${XName}の煙感知器が作動。消火系統が作動し、排気弁が開いた。`, { room: 'bridge', work: 0, fact: 'F_alarm', where: '初期情報' }),
        ev('smoke_log', '感知器の記録', `${T(Theat)} 感知器の温度だけが急上昇。煙の濃度は一度も上がっていない。`, { room: X, skill: 'mech', minSkill: 1, work: 3, fact: 'F_heat_only', key: true, where: `${XName}の感知器` }),
        ev('heat_mark', '感知器の焦げ跡', '感知器の外装に小さな焦げ跡。はんだごての先の形をしている。', { room: X, source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_mark', where: `${XName}の天井` }),
        ev('iron_missing', '工具棚', TOOL_ROLES.includes(C.roleId) ? '工具棚のはんだごてが1本なくなっている。持ち出しの記録は付けられていない。' : '工具棚の暗証番号式の錠が、かけ忘れで開いたままだった。はんだごてが1本なくなっている。', { room: 'engineering', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_iron', where: `${g.rn('engineering')}の工具棚` }),
      );
    } else if (means === 'vent') {
      evs.push(
        ev('odor0', '異臭の報告', `${T(Todor)} ${g.rn('quarters')}と${g.rn('galley')}に焦げたような異臭。火の気は見つからず、全員を司令室へ退避させた。`, { room: 'bridge', work: 0, fact: 'F_odor', where: '初期情報' }),
        ev('damper_log', '換気ダンパーの記録', `${T(Tm)} 換気ダンパーを手で切り替え。生命維持の排気が${g.rn('quarters')}・${g.rn('galley')}側へ戻る設定になっている。故障の記録はない。`, { room: LS, skill: 'mech', minSkill: 1, work: 3, fact: 'F_damper', key: true, where: `${g.rn(LS)}の換気盤` }),
        ev('odor_src', '吹き出し口', '吹き出し口から、生命維持の排気の臭い（焦げた絶縁材のような臭い）。どこにも燃えた跡はない。', { room: 'quarters', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_odor_src', where: `${g.rn('quarters')}の吹き出し口` }),
      );
    } else {
      evs.push(
        ev('co2_0', 'CO₂の警報', `${T(Tco2)} 船内のCO₂濃度が上がり始めた。${GN}区画の電源が落ちている。`, { room: 'bridge', work: 0, fact: 'F_co2', where: '初期情報' }),
        ev('breaker_log', '配電盤の記録', `${T(Tm)} ${GN}区画の遮断器：手で開放。過電流や地絡の記録はない。`, { room: 'powerroom', skill: 'mech', minSkill: 1, work: 3, fact: 'F_manual', key: true, where: `${g.rn('powerroom')}の配電盤` }),
        ev('vent_log', '生命維持の記録', `${T(Tdark)} ${GN}区画の照明と換気が止まった（電源断）。再循環が片側だけの運転になっている。`, { room: 'bridge', work: 2, fact: 'F_vent', where: '司令室の生命維持盤' }),
        ev('door_gap', 'ドア記録の欠落', `${T(Tm)}以降、${GN}区画のドア記録が途切れている（電源断）。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_gap', where: '司令室の船内ドア記録' }),
      );
    }
    if (means !== 'breaker') {
      evs.push({ ...ev('relay_pulled', '中継器のプラグ', '中継器の電源プラグが抜かれていた。偶然抜けることはない。', { room: relay, source: 'trace', work: 3, fact: 'F_pulled', where: `${g.rn(relay)}の中継器` }), relay: true });
      const who = access === 'code' ? '保守用の共用番号' : `${V!.name}のカード`;
      evs.push(ev('door_goal', `${goalName}のドア記録`, `${T(Tact)} ${goalName}ドア開閉（認証：${who}）。`, { room: 'bridge', skill: 'inv', minSkill: 1, work: 3, fact: 'F_door', key: access !== 'code', where: '司令室の船内ドア記録' }));
      if (access === 'rewrite') evs.push(ev('door_backup', 'ドア記録のバックアップ', `バックアップと照らすと、${T(Tact)}の開閉の認証は本記録と違い「消去済み」になっている。本記録は${T(Trw)}に書き換えられた。書き換えには、${roleList(REWRITE_ROLES)}の担当者の整備権限が要る。`, { room: 'bridge', source: 'record', skill: 'mech', minSkill: 1, work: 5, fact: 'F_backup', key: true, where: '司令室のドア記録のバックアップ' }));
    }
    evs.push(ev('goal_trace', goal.traceTitle, goal.trace(T(Tact)), { room: goalRoom, source: 'trace', ...goalSkill, work: 3, fact: 'F_goal', key: true, where: `${goalName}` }));
    evs.push(ev('content', goal.contentTitle, contentText, { room: goalRoom, source: 'record', skill: goal.terminal ? 'mech' : 'inv', minSkill: goal.terminal ? 2 : 1, work: 5, fact: 'F_content', where: `${goalName}（${goal.terminal ? '整備技能2以上で復元' : '詳しく調べる'}）` }));
    if (goal.terminal) evs.push(ev('restore', '消去の操作記録', `操作記録の一部を復元できた。操作者の名前の最初の一文字は「${C.name[0]}」。`, { room: goalRoom, source: 'record', skill: 'mech', minSkill: 2, work: 6, fact: 'F_restore', where: `${goalName}の端末（整備技能2以上）` }));
    for (const cl of clues) {
      if (cl.key === 'tools') evs.push(ev('clue_tools', '工具棚の錠', `工具棚は暗証番号式。番号を知らされているのは、${roleList(TOOL_ROLES)}の担当者だけ。`, { room: 'engineering', source: 'record', skill: 'inv', minSkill: 1, work: 2, fact: 'F_tools', key: true, where: `${g.rn('engineering')}の工具棚` }));
      if (cl.key === 'panel') evs.push(ev('clue_panel', '遮断器の封', `遮断器の封が、正しい手順で外されている。この手順を教わるのは、${roleList(PANEL_ROLES)}の担当者だけ。`, { room: 'powerroom', source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_panel', key: true, where: `${g.rn('powerroom')}の遮断器` }));
      if (cl.key === 'ventpanel') evs.push(ev('clue_ventpanel', '換気盤の錠', `換気盤は暗証番号で守られている。番号を知らされているのは、${roleList(VENT_ROLES)}の担当者だけ。こじ開けた跡はない。`, { room: LS, source: 'record', skill: 'inv', minSkill: 1, work: 2, fact: 'F_ventpanel', key: true, where: `${g.rn(LS)}の換気盤` }));
      if (cl.key === 'glove') evs.push(ev('clue_glove', '手袋の繊維', gloveSet === WORK_GLOVE ? `${goal.thing}に、厚手の作業用手袋の繊維が付いている。作業用手袋を使うのは、${roleList(WORK_GLOVE)}の担当者。` : `${goal.thing}に、医療用の薄い手袋の粉が付いている。この手袋を使うのは、${roleList(MED_GLOVE)}の担当者。`, { room: goalRoom, source: 'trace', skill: 'inv', minSkill: 1, work: 3, fact: 'F_glove', key: true, where: `${goalName}の${goal.thing}` }));
    }
    for (const r of recs) evs.push(r.e);
    const altGoals = g.shuffle(Object.values(GOALS).filter((x) => x.id !== goal.id && x.intactTitle !== goal.intactTitle)).slice(0, 2);
    for (const a of altGoals) evs.push(ev('intact_' + a.id, a.intactTitle, a.intact, { room: a.room, work: 2, fact: 'F_intact_' + a.id, where: `${g.rn(a.room)}` }));

    // 証言（乗員の口調に合わせる）
    const q = g.rn('quarters');
    const lieText = clockSrc ? say(C, `その時間は${g.rn(clockSrc.room)}にいました。記録にも残っているはずです`, `その時間は${g.rn(clockSrc.room)}にいた。記録にも残ってるはずだ`)
      : !lieSrc ? say(C, '部屋で寝ていました。何も知りません', '部屋で寝てた。何も知らない')
      : lieSrc.kind === 'muster' ? (means === 'vent' ? say(C, '皆と一緒に司令室へ退避していました', '皆と司令室に退避してた') : say(C, `警報のあとは、皆と一緒に${XName}の前にいました`, `警報のあとは、皆と${XName}の前にいた`))
      : lieSrc.kind === 'bed' ? say(C, `その時間は${q}で寝ていました。何も知りません`, `その時間は${q}で寝てた。何も知らない`)
      : lieSrc.kind === 'galley' ? say(C, `その時間は${g.rn('galley')}で夜食を食べていました`, `その時間は${g.rn('galley')}で夜食を食ってた`)
      : lieSrc.kind === 'med' ? say(C, `その時間は${g.rn('medbay')}で薬をもらっていました`, `その時間は${g.rn('medbay')}で薬をもらってた`)
      : lieSrc.kind === 'eng' ? say(C, `その時間は${g.rn('engineering')}で点検を手伝っていました`, `その時間は${g.rn('engineering')}で点検をしてた`)
      : say(C, 'その時間は司令室の近くにいました', 'その時間は司令室の近くにいた');
    evs.push(said('c_claim', C.name, lieText, 'F_c_lie', `${C.name}から話を聞く`));
    evs.push({ ...said('c_confess', C.name, confessText, 'F_c_did', `${C.name}に証拠を突きつける`), title: `${C.name}の告白` });
    const suit = SUIT_WORD[C.look.suit];
    if (W) {
      const scene = means === 'alarm' ? ['点呼に向かう途中で', '点呼に向かう途中で'] : means === 'vent' ? ['退避が遅れて通路に出たとき', '退避が遅れて通路に出たとき'] : ['非常灯の明かりで', '非常灯の明かりで'];
      evs.push({ ...said('w_saw', W.name, say(W, `${T(Tact)}ごろ、${scene[0]}、${goalName}へ入っていく${suit}の作業着を見ました。顔は見えませんでした`, `${T(Tact)}ごろ、${scene[1]}、${goalName}へ入っていく${suit}の作業着を見た。顔までは見えなかった`), 'F_w_saw', `${W.name}から話を聞く`), key: true });
    }
    if (V) evs.push(said('v_card', V.name, access === 'card'
      ? say(V, `認証カードですか？ ${g.rn('galley')}に掛けた上着のポケットに入れたままでした。${T(Tact)}ごろは別の場所にいました`, `カード？ ${g.rn('galley')}に掛けた上着に入れっぱなしだった。${T(Tact)}ごろは別の場所にいた`)
      : say(V, `カードはずっと身につけていました。${T(Tact)}ごろに${goalName}へは行っていません`, `カードはずっと持ってた。${T(Tact)}ごろ${goalName}には行ってない`), 'F_v_card', `${V.name}から話を聞く`));
    const nText = means === 'alarm' ? say(N, '本当に火が出ていたんじゃないですか。焦げ臭い気がしました', '本当に火が出てたんじゃないか。焦げ臭かった')
      : means === 'vent' ? say(N, 'どこかの配線がくすぶっているんじゃないですか。あの臭いは普通じゃない', 'どこかの配線がくすぶってるんだろう。あの臭いは普通じゃない')
      : say(N, '配電盤の故障でしょう。古い船ですから', '配電盤の故障だろう。古い船だからな');
    evs.push(said('n_claim', N.name, nText, 'F_n_belief', `${N.name}から話を聞く`));

    // ---- 真相の出来事 ----
    const first = access === 'card' ? 'ev_card' : means === 'alarm' ? 'ev_iron' : means === 'vent' ? 'ev_damper' : 'ev_cut';
    const events: TruthEvent[] = [{ id: 'ev_motive', sec: Tm - 3 * 86400, room: goalRoom, actor: null, text: motiveText, causes: [first] }];
    const next = means === 'alarm' ? 'ev_iron' : means === 'vent' ? 'ev_damper' : 'ev_cut';
    if (access === 'card') events.push({ id: 'ev_card', sec: Tcard, room: 'galley', actor: C.id, text: `${T(Tcard)}、${C.name}は${g.rn('galley')}に掛けてあった${V!.name}の上着から、認証カードを抜き取った。`, causes: [next] });
    const how = access === 'card' ? `${V!.name}のカードで` : access === 'code' ? '保守用の共用番号で' : access === 'rewrite' ? '自分のカードで' : '';
    if (means === 'alarm') {
      events.push(
        { id: 'ev_iron', sec: Tiron, room: 'engineering', actor: C.id, text: `${T(Tiron)}、${C.name}は工具棚からはんだごてを持ち出した。`, causes: ['ev_heat'] },
        { id: 'ev_heat', sec: Theat, room: X, actor: C.id, text: `${T(Theat)}、${C.name}ははんだごてで${XName}の煙感知器をあぶった。`, causes: ['ev_alarm'] },
        { id: 'ev_alarm', sec: Tm, room: X, actor: null, text: `${T(Tm)}、火災警報が鳴り、消火系統が作動した。皆が${XName}へ向かった。排気弁は開いたまま固着した。`, causes: ['ev_valve', 'ev_goal'] },
        { id: 'ev_valve', sec: Tm + MIN, room: X, actor: null, text: '開いたままの排気弁から、船内の空気が少しずつ逃げ始めた。', causes: [] },
        { id: 'ev_goal', sec: Tact, room: goalRoom, actor: C.id, text: `${T(Tact)}、騒ぎの隙に、${C.name}は${how}${goalName}に入り、${goal.act}。`, causes: ['ev_pull'] },
      );
    } else if (means === 'vent') {
      events.push(
        { id: 'ev_damper', sec: Tm, room: LS, actor: C.id, text: `${T(Tm)}、${C.name}は${g.rn(LS)}の換気盤で、排気が${q}と${g.rn('galley')}へ戻るようにダンパーを切り替えた。`, causes: ['ev_odor'] },
        { id: 'ev_odor', sec: Todor, room: 'quarters', actor: null, text: `${T(Todor)}、焦げたような排気の臭いが${q}と${g.rn('galley')}に流れ込み、皆が司令室へ退避した。換気は同じ空気を回すだけになった。`, causes: ['ev_goal', 'ev_co2'] },
        { id: 'ev_goal', sec: Tact, room: goalRoom, actor: C.id, text: `${T(Tact)}、皆が退避した隙に、${C.name}は${how}${goalName}に入り、${goal.act}。`, causes: ['ev_pull'] },
        { id: 'ev_co2', sec: Tco2, room: 'bridge', actor: null, text: `${T(Tco2)}ごろから、船内のCO₂が上がり始めた。`, causes: [] },
      );
    } else {
      events.push(
        { id: 'ev_cut', sec: Tm, room: 'powerroom', actor: C.id, text: `${T(Tm)}、${C.name}は${g.rn('powerroom')}で${GN}区画の遮断器の封を外し、手で開放した。`, causes: ['ev_dark'] },
        { id: 'ev_dark', sec: Tdark, room: relay, actor: null, text: `${GN}区画の照明・換気・ドア記録・通信中継器が止まった。`, causes: ['ev_goal', 'ev_co2'] },
        { id: 'ev_goal', sec: Tact, room: goalRoom, actor: C.id, text: `${T(Tact)}、暗がりの中で、${C.name}は${goalName}に入り、${goal.act}。`, causes: [] },
        { id: 'ev_co2', sec: Tco2, room: 'bridge', actor: null, text: `換気が片側だけになり、${T(Tco2)}ごろから船内のCO₂が上がり始めた。`, causes: [] },
      );
    }
    if (means !== 'breaker') events.push({ id: 'ev_pull', sec: Tpull, room: relay, actor: C.id, text: `${T(Tpull)}、${C.name}は${GN}系統の中継器のプラグを抜き、${goalName}まわりの様子を隠した。`, causes: access === 'rewrite' ? ['ev_rewrite'] : [] });
    if (access === 'rewrite') events.push({ id: 'ev_rewrite', sec: Trw, room: 'engineering', actor: C.id, text: `${T(Trw)}、${C.name}は${g.rn('engineering')}の保守端末から、${goalName}のドア記録の認証を${V!.name}のカードに書き換えた。`, causes: [] });
    if (clockSrc) events.push({ id: 'ev_clock', sec: Tm - 30 * MIN, room: clockSrc.room, actor: C.id, text: `${T(Tm - 30 * MIN)}、${C.name}は${g.rn(clockSrc.room)}の端末の時計を25分進め、そこで作業をしているふりをした。記録の上では、犯行の時刻にそこにいたことになる。`, causes: [] });

    const orderCards = means === 'alarm'
      ? [{ id: 'o_heat', label: '感知器が熱せられる', sec: Theat }, { id: 'o_alarm', label: '火災警報が鳴る', sec: Tm }, { id: 'o_goal', label: goal.order, sec: Tact }, { id: 'o_pull', label: '中継器のプラグが抜かれる', sec: Tpull }]
      : means === 'vent'
        ? [{ id: 'o_damper', label: '換気ダンパーが切り替えられる', sec: Tm }, { id: 'o_odor', label: '居住区に異臭が流れ込む', sec: Todor }, { id: 'o_goal', label: goal.order, sec: Tact }, { id: 'o_pull', label: '中継器のプラグが抜かれる', sec: Tpull }]
        : [{ id: 'o_cut', label: '遮断器が手で開放される', sec: Tm }, { id: 'o_dark', label: `${GN}区画の換気が止まる`, sec: Tdark }, { id: 'o_goal', label: goal.order, sec: Tact }, { id: 'o_co2', label: 'CO₂が上がり始める', sec: Tco2 }];
    if (access === 'rewrite') orderCards.push({ id: 'o_rewrite', label: 'ドア記録が書き換えられる', sec: Trw });

    // ---- 原因の候補 ----
    const meansLabel: Record<Means, string> = {
      alarm: '誰かが火災警報を偽装し、その隙に',
      breaker: `誰かが${GN}区画の電源を手で切り、その暗がりで`,
      vent: '誰かが換気を逆流させて皆を退避させ、その隙に',
    };
    const otherLabel = otherMeans === 'breaker' ? '誰かが区画の電源を手で切り、その暗がりで' : meansLabel[otherMeans];
    const accidents = means === 'alarm'
      ? [{ id: 'acc_fire', label: `${XName}で小さな火災が起き、消し止められた`, refute: ['smoke_log', 'heat_mark'] }, { id: 'acc_sensor', label: '煙感知器の故障で警報が鳴った', refute: ['heat_mark'] }]
      : means === 'vent'
        ? [{ id: 'acc_wire', label: '配線がくすぶって異臭が出た', refute: ['odor_src', 'damper_log'] }, { id: 'acc_filter', label: '生命維持のフィルタが焼けて、臭いと換気の不調が起きた', refute: ['damper_log'] }]
        : [{ id: 'acc_breaker', label: '古い遮断器が過負荷で落ちた', refute: ['breaker_log'] }, { id: 'acc_ground', label: '冷却液の漏れで地絡が起き、遮断器が落ちた', refute: ['breaker_log'] }];
    const causeOptions = [
      { id: 'plot_true', label: meansLabel[means] + goal.cause, category: 'sabotage' as const },
      ...altGoals.map((a) => ({ id: 'plot_' + a.id, label: meansLabel[means] + a.cause, category: 'sabotage' as const })),
      { id: 'plot_other_means', label: otherLabel + goal.cause, category: 'sabotage' as const },
      ...accidents.map((a) => ({ id: a.id, label: a.label, category: 'accident' as const })),
    ];
    const meansTrace = means === 'alarm' ? 'smoke_log' : means === 'vent' ? 'damper_log' : 'breaker_log';
    const causeRefutes: Record<string, string[]> = {
      ...Object.fromEntries(altGoals.map((a) => ['plot_' + a.id, ['intact_' + a.id]])),
      plot_other_means: [okEv[otherMeans].id],
      ...Object.fromEntries(accidents.map((a) => [a.id, a.refute])),
    };

    // ---- 人物の絞り込み（検証用） ----
    const identify: { evidence: string; suspects: string[] }[] = [];
    const clueEv: Record<string, string> = { witness: 'w_saw', tools: 'clue_tools', panel: 'clue_panel', ventpanel: 'clue_ventpanel', glove: 'clue_glove', rewrite: 'door_backup' };
    for (const cl of clues) identify.push({ evidence: clueEv[cl.key], suspects: cl.suspects });
    if (rewriteClue && !clues.includes(rewriteClue)) identify.push({ evidence: 'door_backup', suspects: rewriteClue.suspects });
    for (const r of recs) identify.push({ evidence: r.e.id, suspects: crew.map((c) => c.id).filter((id) => id === C.id || !r.s.members.includes(id)) });
    if (clockSrc) identify.push({ evidence: 'clock_skew', suspects: crew.map((c) => c.id) });
    if (goal.terminal) identify.push({ evidence: 'restore', suspects: ids((c) => c.name[0] === C.name[0]) });
    // 手がかりが一つもない、アリバイの記録が足りないときは、検証で落として作り直す
    if (!alibiOk || !clues.length) identify.push({ evidence: 'goal_trace', suspects: [] });

    // ---- 初期配置 ----
    const commRooms = ['bridge', 'corridor', 'galley', 'quarters', 'medbay', 'lab', 'engineering', 'comms'].filter((r) => g.groupOf(r) !== grp);
    const crewInit: CaseDef['crewInit'] = {};
    crewInit[C.id] = { room: 'corridor', known: ['F_c_did'], hides: ['F_c_did'] };
    if (W) crewInit[W.id] = { room: g.pick(commRooms), known: ['F_w_saw'] };
    if (V && V.id !== W?.id) crewInit[V.id] = { room: g.pick(commRooms), known: ['F_v_card'] };
    if (!crewInit[N.id]) crewInit[N.id] = { room: g.pick(commRooms), known: ['F_n_belief'] };
    else crewInit[N.id].known = [...(crewInit[N.id].known ?? []), 'F_n_belief'];
    for (const c of crew) if (!crewInit[c.id]) crewInit[c.id] = { room: g.pick(commRooms) };
    if (means === 'breaker' && E.id !== C.id) crewInit[E.id].room = 'engineering';

    // ---- 居場所 ----
    const whereabouts: CaseDef['whereabouts'] = [];
    const at = (sec: number, room: RoomId) => whereabouts.push({ crew: C.id, sec, room });
    if (access === 'card') at(Tcard, 'galley');
    if (clockSrc) { at(Tm - 30 * MIN, clockSrc.room); at(Tm - 10 * MIN, clockSrc.room); }
    if (means === 'alarm') { at(Tiron, 'engineering'); at(Theat, X); }
    if (means === 'vent') at(Tm, LS);
    if (means === 'breaker') at(Tm, 'powerroom');
    at(Tact, goalRoom);
    if (means !== 'breaker') at(Tpull, relay);
    if (access === 'rewrite') at(Trw, 'engineering');
    at(lastC + 10 * MIN, 'corridor');
    for (const r of recs) for (const id of r.s.members) {
      if (id === C.id) continue; // 時計のトリックの記録（本当の居場所は上に書いた）
      const a = r.s.kind === 'muster' ? musterA : winA, b = r.s.kind === 'muster' ? musterB : winB;
      whereabouts.push({ crew: id, sec: a, room: srcRoomFor(r.s) }, { crew: id, sec: b, room: srcRoomFor(r.s) });
    }
    if (W && !whereabouts.some((x) => x.crew === W.id)) whereabouts.push({ crew: W.id, sec: Tact, room: 'corridor' });

    // ---- 危機と対処 ----
    const fixer = bestLive(g, crewInit, [grp], 'mech', [C]);
    const live = inComm(g, crewInit, [grp]);
    const invs = g.others(C, fixer).filter(live).sort((a, b) => b.skills.inv + b.skills.mech - a.skills.inv - a.skills.mech || b.exp - a.exp).slice(0, 3);
    const keyEvs = evs.filter((e) => e.key && e.room && e.source !== 'testimony');
    const keyRooms = [...new Set(keyEvs.map((e) => e.room!))];
    if (means !== 'breaker' && !keyRooms.includes(relay)) keyRooms.push(relay);
    const policies: CaseDef['solve']['policies'] = { [fixer.id]: [{ kind: 'respond' }] };
    const load: Record<string, number> = Object.fromEntries(invs.map((c) => [c.id, 0]));
    for (const c of invs) policies[c.id] = [];
    for (const room of keyRooms) {
      const need = keyEvs.filter((e) => e.room === room);
      const ok = invs.filter((c) => need.every((e) => !e.skill || c.skills[e.skill] >= e.minSkill)).sort((a, b) => load[a.id] - load[b.id]);
      const who = ok[0] ?? [...invs].sort((a, b) => load[a.id] - load[b.id])[0];
      if (!who) continue;
      policies[who.id].push({ kind: 'investigate', room });
      load[who.id]++;
    }

    const co2Crisis = means !== 'alarm';
    const plans: PlanDef[] = means === 'alarm' ? [
      { id: 'closeValve', label: '誤報と判断して消火系統を止め、排気弁を手で閉じる', score: 1,
        steps: (p) => (p.knowsCause ? [{ room: X, action: 'closeValve', label: '排気弁を閉じる' }] : [{ room: X, action: 'fireCheck', label: '火元の確認' }]) },
      { id: 'isolate', label: `${XName}の隔壁を閉じて空気の流出を抑える`, warn: `${XName}には入れなくなり、中の手がかりも調べられなくなる`, score: 0.5, steps: () => [{ room: 'corridor', action: 'isolate', label: '隔壁の閉鎖' }] },
      { id: 'resetDet', label: '煙感知器の系統を再起動する', warn: '排気弁が固着していれば閉じない', score: 0.1, steps: () => [{ room: X, action: 'resetDet', label: '感知器の再起動' }] },
    ] : means === 'vent' ? [
      { id: 'restoreDamper', label: '換気ダンパーを元に戻し、換気盤を施錠する', score: 1, skill: 'mech',
        steps: (p) => [{ room: LS, action: 'restore', label: 'ダンパーを戻す' }, ...(p.knowsCause ? [{ room: LS, action: 'lockPanel', label: '換気盤の施錠' }] : [])] },
      { id: 'maxVent', label: '居住区の吹き出し口を閉じ、残りの換気を最大にする', score: 0.4, steps: () => [{ room: 'bridge', action: 'maxVent', label: '換気の最大化' }] },
      { id: 'rebootLS', label: '生命維持の制御装置を再起動する', warn: 'ダンパーが切り替えられたままなら元に戻らない', score: 0.1, steps: () => [{ room: 'bridge', action: 'rebootLS', label: '制御装置の再起動' }] },
    ] : [
      { id: 'restorePower', label: `${GN}区画の遮断器を戻し、配電盤を施錠する`, score: 1, skill: 'mech',
        steps: (p) => [{ room: 'powerroom', action: 'restore', label: '遮断器の復帰' }, ...(p.knowsCause ? [{ room: 'powerroom', action: 'lockPanel', label: '配電盤の施錠' }] : [])] },
      { id: 'maxVent', label: '残った区画の換気を最大にして時間を稼ぐ', score: 0.4, steps: () => [{ room: 'bridge', action: 'maxVent', label: '換気の最大化' }] },
      { id: 'rebootLS', label: '生命維持の制御装置を再起動する', warn: '電源が戻らなければ換気は止まったまま', score: 0.1, steps: () => [{ room: 'bridge', action: 'rebootLS', label: '制御装置の再起動' }] },
    ];
    const fieldActions: FieldAction[] = means === 'alarm'
      ? [{ id: 'closeValve', room: X, needs: 'F_heat_only', label: '消火系統を止めて排気弁を閉じる', ask: '煙は出ていません。熱だけです。消火系統を止めて排気弁を手で閉じてよいですか', why: '火は出ておらず、空気を逃がし続けるほうが危ないと判断', skill: 'mech', minSkill: 1, action: 'closeValve' }]
      : means === 'vent'
        ? [{ id: 'restore', room: LS, needs: 'F_damper', label: '換気ダンパーを元に戻す', ask: 'ダンパーが手で切り替えられています。元に戻してよいですか', why: '故障ではなく設定が変えられていたので、戻せば換気が回復すると判断', skill: 'mech', minSkill: 1, action: 'restore' }]
        : [{ id: 'restore', room: 'powerroom', needs: 'F_manual', label: '遮断器を戻して電源を復帰する', ask: '遮断器が手で開けられています。戻して電源を復帰してよいですか', why: '故障ではなく手で開けられていたので、戻せば換気が動くと判断', skill: 'mech', minSkill: 1, action: 'restore' }];
    const actions: Record<string, ActionDef> = means === 'alarm' ? {
      closeValve: { minutes: (a, c) => 5 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.valve = 0; a.report(c, '消火系統を止め、排気弁を手で閉じた。空気の流出は止まった。'); } },
      fireCheck: { minutes: () => 8, run: (a, c) => a.report(c, '火元を探したが、燃えた跡は見つからない。消火系統は念のため作動させたままにした。') },
      isolate: { minutes: () => 3, run: (a, c) => {
        a.v.isolated = 1;
        a.destroy(a.s.truth.evidence.filter((e) => e.room === X).map((e) => e.id));
        a.report(c, `${XName}の隔壁を閉じた。空気の減りは緩やかになったが、中には入れない。`);
      } },
      resetDet: { minutes: () => 4, run: (a, c) => a.report(c, '感知器の系統を再起動した。警報は止まったが、排気弁は開いたままだ。') },
    } : {
      restore: { minutes: (a, c) => 4 * Math.max(0.7, 1.6 - 0.3 * c.skills.mech), run: (a, c) => { a.v.fixed = 1; a.report(c, means === 'vent' ? '換気ダンパーを元に戻した。排気が正しく船外へ流れ始めた。' : `${GN}区画の遮断器を戻した。照明と換気が動き出した。`); } },
      lockPanel: { minutes: () => 3, run: (a, c) => { a.v.locked = 1; a.report(c, means === 'vent' ? '換気盤を施錠した。船長の承認がないと開けられない。' : '配電盤を施錠し、封を付け直した。船長の承認がないと開けられない。'); } },
      maxVent: { minutes: () => 3, run: (a, c) => { a.v.vent = 1; a.report(c, '換気の設定を変えた。CO₂の上がり方が緩やかになった。'); } },
      rebootLS: { minutes: () => 5, run: (a, c) => a.report(c, means === 'vent' ? '生命維持の制御装置を再起動した。ダンパーは切り替えられたまま戻らない。' : '生命維持の制御装置を再起動した。電源が戻らないので、換気は止まったままだ。') },
    };

    const unlock: Record<string, string[]> = {
      'cause:plot_true': ['goal_trace'],
      ...Object.fromEntries(altGoals.map((a) => ['cause:plot_' + a.id, [initial]])),
      'cause:plot_other_means': ['goal_trace'],
      ...Object.fromEntries(accidents.map((a) => ['cause:' + a.id, [initial]])),
      ...(means === 'alarm'
        ? { 'order:o_heat': ['smoke_log'], 'order:o_alarm': [initial], 'order:o_goal': ['goal_trace', 'door_goal'], 'order:o_pull': ['relay_pulled'],
          'plan:closeValve': ['smoke_log', 'heat_mark'], 'plan:isolate': [initial], 'plan:resetDet': [initial] }
        : means === 'vent'
          ? { 'order:o_damper': ['damper_log'], 'order:o_odor': [initial], 'order:o_goal': ['goal_trace', 'door_goal'], 'order:o_pull': ['relay_pulled'],
            'plan:restoreDamper': ['damper_log'], 'plan:maxVent': [initial], 'plan:rebootLS': [initial] }
          : { 'order:o_cut': ['breaker_log'], 'order:o_dark': ['vent_log', initial], 'order:o_goal': ['goal_trace'], 'order:o_co2': [initial],
            'plan:restorePower': ['breaker_log'], 'plan:maxVent': [initial], 'plan:rebootLS': [initial] }),
      ...(access === 'rewrite' ? { 'order:o_rewrite': ['door_backup'] } : {}),
    };

    const keyEv = evs.filter((e) => e.key).map((e) => e.id);
    const vRec = V ? recFor(V.id)?.e.id : undefined;
    const misleads = [
      clockSrc
        ? { evidence: 'c_claim', resolvedBy: ['clock_skew', 'c_confess'], explain: `${C.name}は記録どおり${g.rn(clockSrc.room)}にいたと言ったが、その部屋の時計は25分進められていた。本当にいたのは犯行の前だった。` }
        : { evidence: 'c_claim', resolvedBy: lieRec ? [lieRec, 'c_confess'] : ['c_confess'], explain: `${C.name}は「${lieText}」と言ったが、${lieRec ? 'その時刻の記録に名前がなかった' : '記録と合わなかった'}。` },
      ...(clockSrc ? [{ evidence: lieRec!, resolvedBy: ['clock_skew'], explain: `${g.rn(clockSrc.room)}の記録では${C.name}がそこにいたことになっていたが、時計が25分進められていた。` }] : []),
      { evidence: 'n_claim', resolvedBy: [meansTrace], explain: means === 'alarm' ? `${N.name}は本当の火災を疑ったが、感知器は熱だけで反応していた。煙は出ていなかった。`
        : means === 'vent' ? `${N.name}は配線のくすぶりを疑ったが、臭いの正体は、ダンパーを切り替えられて戻ってきた排気だった。`
        : `${N.name}は故障を疑ったが、遮断器は手で開けられていた。過電流の記録もなかった。` },
      ...(V ? [{ evidence: 'door_goal', resolvedBy: [vRec, access === 'rewrite' ? 'door_backup' : undefined].filter(Boolean) as string[],
        explain: access === 'card'
          ? `ドア記録は${V.name}のカードだったが、${V.name}本人はその時刻に別の場所にいた。カードは${g.rn('galley')}の上着から抜き取られていた。`
          : `ドア記録には${V.name}のカードとあったが、記録はあとから書き換えられていた。${V.name}本人はその時刻に別の場所にいた。` }] : []),
    ];
    const title = means === 'alarm' ? '警報の陰で' : means === 'vent' ? '戻ってきた排気' : `${GN}の灯りが消えた`;

    return {
      title,
      identify,
      causeRefutes,
      startSec: start,
      deadlineSec: start + 3 * 3600,
      briefing: means === 'alarm' ? [
        `${T(Tm)}、${XName}で火災警報が鳴り、消火系統が作動した。`,
        `いまも排気弁が開いたまま閉じず、船内の空気が少しずつ逃げている（船内時刻 ${T(start)}）。`,
        `騒ぎのさなかに、${GN}系統の通信中継器も応答しなくなった。`,
        'ただの故障か、誰かの仕業か。誰が、何のために、どうやったのかを突き止めてほしい。提出は最大3回まで。',
      ] : means === 'vent' ? [
        `${T(Todor)}、${q}と${g.rn('galley')}に焦げたような異臭が流れ込み、全員を司令室へ退避させた。火の気は見つからない。`,
        `船内時刻 ${T(start)}。二酸化炭素の濃度が上がり続けている。${GN}系統の通信中継器も応答しない。`,
        'ただの故障か、誰かの仕業か。誰が、何のために、どうやったのかを突き止めてほしい。提出は最大3回まで。',
      ] : [
        `船内時刻 ${T(start)}。二酸化炭素の濃度が上がり続けている。`,
        `${GN}区画の電源が落ち、照明・換気・ドア記録・通信中継器が止まっている。`,
        'ただの故障か、誰かの仕業か。誰が、何のために、どうやったのかを突き止めてほしい。提出は最大3回まで。',
      ],
      alarmText: means === 'alarm'
        ? `${T(Tm)} ${XName}で火災警報。消火系統が作動。${T(start)} 排気弁が開いたまま閉じない。${GN}系統の中継器が応答しない。`
        : means === 'vent'
          ? `${T(Todor)} ${q}と${g.rn('galley')}に異臭。全員退避。${T(Tco2)} CO₂濃度が上昇。${GN}系統の中継器が応答しない。`
          : `${T(Tco2)} CO₂濃度が上昇。${GN}区画の電源が落ち、区画と連絡が取れない。`,
      initialEvidence: [initial],
      truth: { cause: 'plot_true', events, orderCards, responsible: { crew: C.id, role: 'sabotage' }, evidence: evs, misleads },
      rootEvent: 'ev_motive',
      damageEvent: means === 'alarm' ? 'ev_valve' : 'ev_co2',
      testimonies: [
        { crew: C.id, evidence: 'c_claim', lie: true },
        ...(W ? [{ crew: W.id, evidence: 'w_saw' }] : []),
        ...(V ? [{ crew: V.id, evidence: 'v_card' }] : []),
        { crew: N.id, evidence: 'n_claim' },
      ],
      statedTimes: clockSrc ? [Tm - 30 * MIN + SKEW, Tm - 10 * MIN + SKEW] : [],
      confessions: [{ crew: C.id, triggeredBy: [...(clockSrc ? ['clock_skew'] : lieRec ? [lieRec] : []), 'goal_trace', ...(access === 'rewrite' ? ['door_backup'] : []), ...evs.filter((e) => e.id.startsWith('clue_') || e.id === 'restore').map((e) => e.id)], evidence: 'c_confess' }],
      crewInit,
      whereabouts,
      commDown: [grp],
      vars: co2Crisis ? { co2: 1.1, fixed: 0, locked: 0, vent: 0 } : { press: 97, valve: 1, isolated: 0 },
      causeOptions,
      unlock,
      respond: means === 'alarm'
        ? { label: '火災に対応', desc: `${XName}へ向かい、火元と消火系統を確かめる`, room: X, waitLabel: `${XName}の前で待機` }
        : means === 'vent'
          ? { label: '換気を確認', desc: `${g.rn(LS)}で換気の設定と生命維持を確かめる`, room: LS, waitLabel: `${g.rn(LS)}で待機` }
          : { label: '配電を確認', desc: `${g.rn('powerroom')}で遮断器と電源系統を確かめる`, room: 'powerroom', waitLabel: `${g.rn('powerroom')}で待機` },
      fieldActions,
      plans,
      actions,
      tick(a) {
        const v = a.v;
        if (!co2Crisis) {
          if (v.valve) v.press -= 0.03 * (v.isolated ? 0.2 : 1);
          else v.press = Math.min(100, v.press + 0.02);
          if (v.press < 85 && a.once('p85')) a.alarm('船内気圧が85%を下回った。', '気圧低下');
          if (v.press < 75 && a.once('p75')) a.alarm('船内気圧が75%を下回った。危険域。', '気圧が危険域');
          for (const c of a.crews()) {
            if (!c.alive) continue;
            c.impair = v.press < 85 ? Math.min(0.5, (85 - v.press) * 0.04) : 0;
            if (v.press < 78) c.health -= (78 - v.press) * 0.012;
          }
          a.setComm(grp, !v['relay_' + grp]);
          a.w.o2 = v.press;
          return;
        }
        if (!v.fixed) v.co2 += 0.005 * (v.vent ? 0.5 : 1);
        else v.co2 = Math.max(0.6, v.co2 - 0.01);
        if (v.co2 > 2.5 && a.once('c25')) a.alarm('CO₂濃度が2.5%を超えた。頭痛を訴える乗員が出始めた。', 'CO₂上昇');
        if (v.co2 > 4 && a.once('c40')) a.alarm('CO₂濃度が4%を超えた。危険域。', 'CO₂が危険域');
        for (const c of a.crews()) {
          if (!c.alive) continue;
          c.impair = v.co2 > 2.5 ? Math.min(0.5, (v.co2 - 2.5) * 0.25) : 0;
          if (v.co2 > 4) c.health -= (v.co2 - 4) * 0.4;
        }
        a.setComm(grp, means === 'breaker' ? !(v.fixed || v['relay_' + grp]) : !v['relay_' + grp]);
        a.w.o2 = Math.max(0, Math.min(100, 100 - (v.co2 - 0.6) * 12));
      },
      meters: (m) => !co2Crisis
        ? [pct('船内気圧', m.v.press, 88, 78, m.v.valve ? '排気弁が開いたまま' : '排気弁は閉じている'), pct('酸素', m.o2), hullMeter(m)]
        : [{ label: 'CO₂濃度', value: Math.max(0, 100 - (m.v.co2 / 5) * 100), text: m.v.co2.toFixed(1) + '%', sub: m.v.fixed ? '換気は戻った' : means === 'vent' ? '換気が同じ空気を回している' : `${GN}区画は電源断`, level: m.v.co2 >= 4 ? 'bad' : m.v.co2 >= 2.5 ? 'warn' : '' }, pct('酸素', m.o2), hullMeter(m)],
      marks: (m) => [
        ...(m.has('heat_mark') ? [{ room: X, text: '焦げ跡（報告）', color: '#d8a03a' }] : []),
        ...(m.has('goal_trace') ? [{ room: goalRoom, text: '荒らされた跡（報告）', color: '#d88a3a' }] : []),
      ],
      resolved: (a) => (co2Crisis ? !!a.v.fixed : !a.v.valve),
      resolvedText: means === 'alarm' ? '排気弁が閉じ、空気の流出が止まった。' : means === 'vent' ? '換気が元に戻り、CO₂が下がり始めた。' : `${GN}区画の電源が戻り、換気が動き出した。`,
      epilogue: (e) => genericEpilogue(e, {
        [C.id]: e.crew.find((c) => c.id === C.id)!.confessed ? epiText : e.grade === '真相解明' ? `${C.name}は証拠を前に黙り込んだ。` : `${C.name}は何事もなかったように持ち場に戻った。`,
        ...(V ? { [V.id]: e.has(vRec ?? '') ? (access === 'card' ? `${V.name}は、カードを上着に入れっぱなしにするのをやめた。` : `${V.name}は、自分の名前が書き込まれた記録を見て、しばらく黙っていた。`) : `${V.name}は、記録に自分のカードが残ったことを気に病んでいる。` } : {}),
        ...(W ? { [W.id]: `${W.name}は、あの夜見た${suit}の作業着のことを、何度も思い返している。` } : {}),
      }),
      solve: {
        policies,
        hyp: { category: 'sabotage', cause: 'plot_true', order: [...orderCards].sort((a, b) => a.sec - b.sec).map((o) => o.id), person: { crew: C.id, role: 'sabotage' }, evidence: keyEv.slice(0, 4), plan: means === 'alarm' ? 'closeValve' : means === 'vent' ? 'restoreDamper' : 'restorePower' },
      },
    };
  },
};
