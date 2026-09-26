// 航海モードの固定乗員8人。人物像・口調・隠し事は docs/Phase3_人物とプロローグ.md と対応させる。
// ここは表示と事件生成の両方から読むデータだけを置く（真相や判定は持たない）。
import type { FixedSeed } from '../core/types';

export interface Profile {
  id: string;
  fullName: string;
  age: number;
  title: string; // 名簿に出す肩書き
  speech: string; // 口調の見本
  reason: string; // 乗った理由（初めから分かっていること）
  secretFact: string; // 隠し事の事実ID
  secretText: string; // 隠し事が明らかになったときに名簿に出す一文
}

export const CREW8: FixedSeed[] = [
  {
    id: 'dmitri', name: 'ドミトリ', roleId: 'engineer', role: '機関長', history: 'この船に30年。就役のときから機関部にいる',
    skills: { mech: 3, med: 0, inv: 1 }, exp: 3, trust: 60, bold: false,
    look: { skin: 0, hair: 2, hairStyle: 3, suit: 0, eyes: 1, extra: 2 },
  },
  {
    id: 'aisha', name: 'アイシャ', roleId: 'medic', role: '医務官', history: '救急救命室の医師を経て、開拓公社の医務官に',
    skills: { mech: 0, med: 3, inv: 2 }, exp: 3, trust: 55, bold: false,
    look: { skin: 2, hair: 0, hairStyle: 1, suit: 2, eyes: 0 },
  },
  {
    id: 'haru', name: 'ハル', roleId: 'navigator', role: '航法士', history: '航法学校を首席で卒業。深宇宙は初めて',
    skills: { mech: 1, med: 0, inv: 2 }, exp: 1, trust: 55, bold: true,
    look: { skin: 1, hair: 0, hairStyle: 0, suit: 1, eyes: 0 },
  },
  {
    id: 'hahn', name: 'ハーン', roleId: 'security', role: '保安・監査役', history: 'ヘリオス開拓公社の本社から派遣された監査役',
    skills: { mech: 1, med: 1, inv: 2 }, exp: 2, trust: 40, bold: false,
    look: { skin: 0, hair: 1, hairStyle: 0, suit: 3, eyes: 0, extra: 1 },
  },
  {
    id: 'niko', name: 'ニコ', roleId: 'comms', role: '通信士', history: '軍の通信隊を経て民間船へ',
    skills: { mech: 2, med: 0, inv: 2 }, exp: 2, trust: 50, bold: true,
    look: { skin: 0, hair: 4, hairStyle: 3, suit: 1, eyes: 1 },
  },
  {
    id: 'elena', name: 'エレナ', roleId: 'scientist', role: '科学士官', history: '惑星科学者。〈ハース〉の温室効果モデルの著者',
    skills: { mech: 1, med: 1, inv: 3 }, exp: 3, trust: 55, bold: true,
    look: { skin: 1, hair: 1, hairStyle: 2, suit: 2, eyes: 0, extra: 1 },
  },
  {
    id: 'tomas', name: 'トマス', roleId: 'cook', role: '司厨員', history: '元は月面の建設作業員。膝を壊して厨房へ',
    skills: { mech: 1, med: 1, inv: 1 }, exp: 2, trust: 60, bold: false,
    look: { skin: 3, hair: 2, hairStyle: 0, suit: 3, eyes: 0, extra: 2 },
  },
  {
    id: 'lin', name: 'リン', roleId: 'cargo', role: '荷役担当', history: '建設資材の管理係。前の船を事故のあとで降りた',
    skills: { mech: 2, med: 0, inv: 1 }, exp: 2, trust: 45, bold: true,
    look: { skin: 0, hair: 0, hairStyle: 1, suit: 0, eyes: 0 },
  },
];

export const CREW8_NAMES = CREW8.map((c) => c.name);

export const PROFILES: Profile[] = [
  { id: 'dmitri', fullName: 'ドミトリ・ヴォルコフ', age: 58, title: '機関長', speech: '急ぐな。冷却材は待ってくれるが、火は待たん。',
    reason: 'この船に30年乗ってきた。会社は航海のあとで船を売る。最後まで面倒を見るつもりだ。',
    secretFact: 'S_tremor', secretText: '半年前から手が震える。健康診断の結果を伏せて乗った。' },
  { id: 'aisha', fullName: 'アイシャ・ラーマン', age: 41, title: '医務官', speech: '痛みは嘘をつきません。人はつきますが。',
    reason: '配管工の夫カリムと娘が、第一陣として〈ハース〉にいる。',
    secretFact: 'S_deaths', secretText: '夫の私信で、入植地で3人が死んだのに会社の記録にないと知っている。' },
  { id: 'haru', fullName: '瀬尾ハル', age: 23, title: '航法士', speech: '計算、三回やりました！ たぶん合ってます、いや合ってます。',
    reason: '航法学校の首席。深宇宙は今回が初めて。',
    secretFact: 'S_sim', secretText: '深宇宙の実技時間の一部を、同期に代わってもらっていた。' },
  { id: 'hahn', fullName: 'ユリウス・ハーン', age: 46, title: '保安・監査役', speech: '船長のご判断を尊重します。記録には残しますが。',
    reason: '出資者への説明責任がある。第二次入植団の1,200人分の契約金は、もう払われている。',
    secretFact: 'S_order', secretText: '封をした命令書を持つ。「実測値が基準を下回れば、報告の前に本社の承認を取れ」。' },
  { id: 'niko', fullName: 'ニコ・ラウタ', age: 34, title: '通信士', speech: '聞こえてます。聞こえすぎてるくらい。',
    reason: '本人いわく「危険手当が高いから」。',
    secretFact: 'S_debt', secretText: '賭けの借金がある。取り立て屋が中継ステーションまで来ていた。' },
  { id: 'elena', fullName: 'エレナ・マルケス', age: 37, title: '科学士官（惑星科学）', speech: '二酸化炭素が1.8気圧あれば、赤道は溶けます。「あれば」、ですけど。',
    reason: '〈ハース〉が住める根拠になった温室効果モデルの著者。自分の目で確かめに来た。',
    secretFact: 'S_model', secretText: 'モデルの恒星の明るさの見積もりが甘かった。直すと、赤道でも一年の大半は氷点下になる。' },
  { id: 'tomas', fullName: 'トマス・ベイ', age: 52, title: '司厨員', speech: '腹が減ってるときに決めたことは、たいてい間違いだ。',
    reason: '〈ハース〉の居住棟の基礎を打っているのは、月面時代の同僚たちだ。',
    secretFact: 'S_knee', secretText: '膝の痛みがひどく、鎮痛剤を私物として持ち込んでいた。' },
  { id: 'lin', fullName: 'リン・ジアユ', age: 29, title: '荷役担当', speech: '積荷は412個。411個じゃ困る。',
    reason: '前の船で積荷事故の責任を負わされた。雇ってくれたのはここだけだった。',
    secretFact: 'S_letters', secretText: '入植者の家族から預かった、検閲を通していない手紙と記録媒体を資材の箱に紛れ込ませている。' },
];

// 事件の型ごとの差し替え文。関係人物になったときだけ使われる（src/cases/*.ts の line() 呼び出し）。
export const LINES: Record<string, Record<string, string>> = {
  elena: {
    'plot2.goal': "copy_records",
    'plot2.motive': "エレナは、自分のモデルが入植計画の審査でどう使われたのかを知らなかった。通信室の保管庫に、非公開の審査資料がある。",
    'plot2.content': "複製されたのは、入植計画の非公開の審査資料だった。「赤道の温暖化」の根拠は、エレナのモデル一本だけ。",
    'plot2.confess': "……審査の資料です。私のモデルが、どれだけの重さで使われたのか。確かめずにはいられなかった",
    'plot2.epi': "エレナは複製した資料を船長に渡した。「私のモデル一本で、千二百人が決まっていました」",
    'plot.goal': "erase_data",
    'plot.motive': "エレナは、恒星の明るさを測り直したデータを持っていた。それが本社に届けば、自分のモデルの誤りが明らかになる。",
    'plot.content': "差し替えられたのは、恒星の明るさを測り直したデータだった。元のデータでは、〈ハース〉が受け取る光はモデルの想定より少ない。",
    'plot.confess': "……恒星の明るさの測り直しです。これが届けば、私のモデルは終わる。千二百人の計画も。……分かっています。終わらせるべきなのは",
    'plot.epi': "エレナは元のデータを戻し、自分の名前で訂正の添え書きをつけた。",
  },
  niko: {
    'plot2.goal': "take_sample",
    'plot2.motive': "ニコは取り立て屋から、積荷を一つ持ってこいと言われていた。コンテナ7番には高価な試料があった。",
    'plot2.content': "コンテナ7番：希少鉱物の試料1点（高価・保険付き）。",
    'plot2.confess': "……取り立て屋に言われたんです。一つ持ってくれば、利子を待つと",
    'plot2.epi': "ニコは試料を返し、取り立て屋とのやり取りをすべて船長に差し出した。",
    'plot.goal': "erase_comm",
    'plot.motive': "船の受信記録には、取り立て屋からの督促が残っていた。ニコは、到着後の監査で読まれるのを恐れた。",
    'plot.content': "消されたのは、ニコ宛ての督促の通信が11通。差出人は名乗っていない。",
    'plot.confess': "……取り立て屋の通信です。監査で読まれたら、職も失う。消せば、少なくとも船の上では終わると思った",
    'plot.epi': "ニコは消した記録を戻した。督促の11通は、船長の立ち会いで読み上げられた。",
  },
  haru: {
    'plot2.goal': "erase_comm",
    'plot2.motive': "ハルは、実技の時間を代わってくれた同期とのやり取りを、船の通信で続けていた。監査で読まれれば、替え玉がばれる。",
    'plot2.content': "消されたのは、ハルと同期のやり取りの受信記録。「実技の件、誰にも言うな」とある。",
    'plot2.confess': "……同期とのやり取りです。読まれたら、あいつまで処分される",
    'plot2.epi': "ハルは記録を戻し、同期に「自分から話す」と送った。",
    'plot.goal': "erase_train",
    'plot.motive': "ハルの深宇宙の実技時間は、記録より80時間ほど少なかった。到着後の資格審査で見つかるのを恐れた。",
    'plot.content': "書き換えられたのは、ハルの深宇宙実技の時間だった。元の記録では、120時間ほどしかない。",
    'plot.confess': "……訓練の時間です。足りないのがばれたら、降下の航法から外される。ドミトリさんにも、合わせる顔がない",
    'plot.epi': "ハルは書き換えを元に戻し、足りない時間を航海日誌に正直に書いた。",
  },
  aisha: {
    'plot2.goal': "erase_comm",
    'plot2.motive': "アイシャは出港の前の晩、検閲を通らない経路で夫の私信を受け取っていた。その痕跡が、船の受信記録に残っていた。",
    'plot2.content': "消されたのは、アイシャ宛ての私信の受信記録。差出人はカリム・ラーマン、経路は検閲を通っていない。",
    'plot2.confess': "……夫の手紙です。検閲を通っていないと分かれば、夫が職を失う",
    'plot2.epi': "アイシャは消した記録を戻し、私信の中身を船長にだけ見せた。",
    'plot.goal': "copy_records",
    'plot.motive': "アイシャは、夫の私信にあった入植地の三人の死を確かめたかった。会社の保管庫には、非公開の診療記録がある。",
    'plot.content': "複製されたのは、入植地の非公開の診療記録だった。この一年の死亡が三件、会社の公開記録には載っていない。",
    'plot.confess': "……入植地の記録です。三人が死んでいる。会社は載せていない。確かめずにはいられなかった",
    'plot.epi': "アイシャは複製した記録を船長に預けた。「着いたら、原本と照らし合わせます」",
  },
  dmitri: {
    'voice': "plain",
    'plot2.goal': "erase_maint",
    'plot2.motive': "ドミトリが締め直した継手が、手の震えで締まりきっていなかった。点検記録に残れば、震えのことも知られる。",
    'plot2.content': "消されたのは、ドミトリが担当した継手の締め直しの記録だった。「完了」とあるが、トルクの値が規定に届いていない。",
    'plot2.confess': "……継手だ。手が震えて、締め切れなかった。記録に残れば、全部ばれる",
    'plot2.epi': "ドミトリは継手をハルと二人で締め直し、記録を正しく書き直した。",
    'plot.goal': "erase_med",
    'plot.motive': "ドミトリは半年前から手が震えていた。健康診断の結果が本社に届けば、この船を降ろされる。",
    'plot.content': "消されたのは、ドミトリの健康診断の結果だった：「手指の振戦。精密作業は要注意」。",
    'plot.confess': "……手の震えだ。結果が本社に届けば、降ろされる。この船の最後くらい、自分の手で見届けたかった",
    'plot.epi': "ドミトリは消した記録を自分で戻し、診断の結果をアイシャに渡した。",
  },
  lin: {
    'voice': "plain",
    'plot2.goal': "erase_comm",
    'plot2.motive': "リンは、手紙を預かる約束を家族たちと船の通信で交わしていた。監査で読まれれば、箱のことが知られる。",
    'plot2.content': "消されたのは、入植者の家族とのやり取りの受信記録。「手紙は箱に入れて運ぶ」とある。",
    'plot2.confess': "……家族たちとの約束のやり取りです。読まれたら、手紙が全部取り上げられる",
    'plot2.epi': "リンは記録を戻した。家族たちとの約束は、船長も知ることになった。",
    'plot.goal': "erase_manifest",
    'plot.motive': "リンは、検閲を通していない手紙の箱を資材に紛れ込ませていた。到着前の積荷照合で見つかるのを恐れた。",
    'plot.content': "消されたのは、資材の箱の3行だった。中身の記載はない。",
    'plot.confess': "……手紙の箱です。照合で見つかれば全部没収される。三百通、家族からの手紙なんです",
    'plot.epi': "リンは目録を元に戻した。箱の中身は、船長の預かりになった。",
    'distress.cargo': 'リンは、入植者の家族から預かった検閲を通していない手紙と記録媒体を、資材の箱に紛れ込ませて積んでいた。',
    'distress.fear': '救難の報告に積荷目録の照合が添えられ、申告外の箱が見つかるのを恐れたためだった。',
    'distress.undeclared': '書類のない箱がある：資材の箱に紛れた手紙と記録媒体、約300通分。受け入れの署名は空欄。',
    'distress.confess': '……手紙なんです。家族からの。会社を通すと、半分は黒く塗られて届く。照合が走ったら全部没収される。救難信号まで止まるなんて、思わなかった',
    'distress.epi': 'リンは箱の中身をすべて話した。手紙は到着まで船長の預かりになった。',
  },
  hahn: {
    'plot2.goal': "erase_med",
    'plot2.motive': "アイシャは、入植地から届いた診療記録の写しを医務室の端末に集めていた。本社の命令書は、非公開の記録を船外に出さないことを求めていた。",
    'plot2.content': "消されたのは、入植地から届いた診療記録の写しだった。この一年の死亡が三件。",
    'plot2.confess': "……命令です。非公開の記録を、報告書に紛れ込ませるわけにはいかなかった。消したのは写しだけです。原本は、入植地にある",
    'plot2.epi': "ハーンは消した写しを自分で戻した。命令書のことは、まだ誰にも話していない。",
    'plot.goal': "take_sample",
    'plot.motive': "ハーンは本社の封をした命令書を持っていた。コンテナ7番には、〈ハース〉の大気を測る分析計の校正試料が入っていた。",
    'plot.content': "コンテナ7番：大気分析計の校正試料1組（〈ハース〉観測用・替えはない）。",
    'plot.confess': "……命令です。基準に届かない数字が出る前に、校正試料を押さえておけと。私の判断ではありません。そう言えば、少しは楽になるのでしょうね",
    'plot.epi': "ハーンは校正試料を返した。封をした命令書の写しを、黙って船長の机に置いていった。",
    'falsefire.motive': 'ハーンは本社の封をした命令書を持っていた。コンテナ7番には、〈ハース〉の大気を測る分析計の校正試料が入っていた。',
    'falsefire.confess': '……命令です。基準に届かない数字が出る前に、校正試料を押さえておけと。私の判断ではありません。そう言えば、少しは楽になるのでしょうね',
    'falsefire.manifest': 'コンテナ7番：大気分析計の校正試料1組（〈ハース〉観測用・替えはない）。',
    'falsefire.epi': 'ハーンは校正試料を返した。封をした命令書の写しを、黙って船長の机に置いていった。',
  },
  tomas: {
    'voice': "plain",
    'plot2.goal': "erase_med",
    'plot2.motive': "トマスの膝の診断は、出港前の健康診断の記録に残っていた。到着後の審査で読まれれば、現場には立てない。",
    'plot2.content': "消されたのは、トマスの健康診断の結果だった：「右膝の変形。重作業は不可」。",
    'plot2.confess': "……膝の診断だ。あれが残ってたら、基礎の上には立たせてもらえない",
    'plot2.epi': "トマスは記録を戻し、アイシャに膝を診せた。",
    'plot.goal': "take_drug",
    'plot.motive': "トマスの古傷の膝は、日ごとに悪くなっていた。私物として持ち込んだ鎮痛剤は、もう尽きていた。",
    'plot.content': "この鎮痛剤は、今回の航海で誰にも処方されていない。",
    'plot.confess': "……膝だ。着いたら、昔の仲間と基礎の上に立ちたかった。痛いと言えば、降ろされる",
    'plot.epi': "トマスは残りの薬を返し、アイシャに膝を診せた。",
    'painkiller.injury': '3日前、トマスは貨物室で食料の箱を運んでいて、古傷の膝を痛めた。持ち込んだ鎮痛剤はもう尽きていた。船を降ろされるのが怖くて、申告しなかった。',
    'painkiller.worklog': '3日前：トマスが食料の箱を運ぶ途中で作業を中断。負傷の申告はない。',
    'painkiller.o_injury': '貨物室で食料の運び出しが中断される',
  },
};

// 死亡や拘束で欠けた役目を、残った乗員が代わりに務めるときの肩書き
export const ACTING_LABEL: Record<string, string> = {
  engineer: '機関代行', medic: '医務代行', scientist: '観測代行', cook: '厨房代行',
};
