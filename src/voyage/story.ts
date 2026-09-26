// 航海モードの文章：プロローグ、出港前夜の顔合わせ、各段階の導入、事件の合間の会話、到着。
// 人物・数字・日付は crew8.ts と docs/Phase3_人物とプロローグ.md に合わせる。
// 固定の数字：146光年、入植地340人、第二次入植団1,200人、所要62日、事件は出港3・16・29・44・61日目、到着は62日目。

export interface Line { who: string; text: string } // who: 乗員ID / 'narr'（地の文） / 'captain' / 'radio'
export interface Choice { label: string; reply: Line[]; trust: number; flag?: string; needs?: string } // needs: この事実を知っているときだけ出る選択肢
export interface Talk { minDone: number; minTrust: number; lines: Line[]; choices?: Choice[]; fact?: string }

export interface Page { heading: string; lines: Line[]; order?: boolean }

export const PROLOGUE: Page[] = [
  {
    heading: '一　記録',
    lines: [
      { who: 'narr', text: '二十一世紀のはじめ、古い宇宙望遠鏡の記録の中に、十時間だけの影が見つかった。' },
      { who: 'narr', text: '天秤座の方角、百四十六光年。地球とほとんど同じ大きさの惑星が、ほとんど一年の周期で、太陽より小さく暗い星をめぐっている――かもしれない。' },
      { who: 'narr', text: '影は一度しか記録されていなかった。液体の水を保てる距離にあるかどうかも、五分五分だった。' },
      { who: 'narr', text: '人類が恒星間の跳躍を覚えて、まだ五十年。' },
      { who: 'narr', text: 'その星には今、三百四十人が暮らしている。赤道の谷で、入植地の建設が続いている。' },
      { who: 'narr', text: '外気が零下五十度を下回る日は珍しくない。それでも入植者たちは、その星を〈ハース〉と呼んだ。' },
      { who: 'narr', text: '炉、という意味だ。' },
    ],
  },
  {
    heading: '二　指令',
    order: true,
    lines: [
      { who: 'narr', text: '宛　調査船〈ケストレル〉船長' },
      { who: 'narr', text: '外縁中継ステーションを出港し、〈ハース〉周回軌道へ向かえ。所要六十二日。' },
      { who: 'narr', text: '任務　〈ハース〉大気および地表の実測。' },
      { who: 'narr', text: '貴船の報告をもって、第二次入植団（1,200名）の出発可否を決定する。' },
      { who: 'narr', text: '報告書は船長の署名をもって提出すること。' },
      { who: 'narr', text: '――ヘリオス開拓公社　入植事業部' },
    ],
  },
  {
    heading: '三　前任者',
    lines: [
      { who: 'narr', text: 'あなたがこの船に乗るのは初めてだ。' },
      { who: 'narr', text: '前の船長は、出港の二週間前に船を降りた。理由は知らされていない。ステーションの酒場では「報告書に署名したくなかったのだ」と噂されていた。' },
      { who: 'narr', text: '乗員は八人。まだ誰とも、まともに話していない。' },
    ],
  },
];

// 出港前夜の食堂。一人ずつ一言、船長は一言返す
export interface Intro { id: string; line: string; choices: Choice[] }
export const DINNER_OPEN: Line[] = [
  { who: 'narr', text: '四　出港前夜' },
  { who: 'narr', text: '食堂には、最後の生卵で作ったオムレツが並んでいた。' },
];
export const INTROS: Intro[] = [
  { id: 'tomas', line: '今夜を逃すと、次の卵は六十二日後だ。冷めないうちにどうぞ、船長', choices: [
    { label: '「ありがとう。いただきます」', trust: 4, reply: [{ who: 'tomas', text: '素直な人は長生きする。船の上じゃ特にな' }] },
    { label: '「皆が食べてからでいい」', trust: 2, reply: [{ who: 'tomas', text: '……前の船長も、同じことを言ったよ' }] },
  ] },
  { id: 'dmitri', line: '船長。機関部に来るときは、先に声をかけてくれ。勝手に触られるのは好かん', choices: [
    { label: '「分かった。あなたの持ち場だ」', trust: 5, reply: [{ who: 'dmitri', text: '話が早い' }] },
    { label: '「船の全部が、私の責任だ」', trust: -2, reply: [{ who: 'dmitri', text: '……そうかい' }] },
  ] },
  { id: 'aisha', line: '着任の健康診断は明日の朝です。船長も例外ではありません', choices: [
    { label: '「もちろん受ける」', trust: 4, reply: [{ who: 'aisha', text: '助かります。例外を作る人から、船は壊れますから' }] },
    { label: '「落ち着いたらにしよう」', trust: -2, reply: [{ who: 'aisha', text: '落ち着く日は来ませんよ、この船では' }] },
  ] },
  { id: 'haru', line: 'あの、航路の最終確認、三回やりました！ 船長も見ますか？ いや、見てください', choices: [
    { label: '「見せてくれ」', trust: 4, reply: [{ who: 'haru', text: 'はい！ ……あ、四回目もやっておきます' }] },
    { label: '「三回やったなら信じる」', trust: 2, reply: [{ who: 'haru', text: '……ありがとうございます。責任重大ですね' }] },
  ] },
  { id: 'hahn', line: 'ヘリオス開拓公社のハーンです。船長のご判断を尊重します。記録には残しますが', choices: [
    { label: '「記録は好きに残してくれ」', trust: 0, reply: [{ who: 'hahn', text: 'ええ。そうさせていただきます' }] },
    { label: '「何を記録したか、あとで見せてほしい」', trust: 3, reply: [{ who: 'hahn', text: '……もちろんです。求められれば' }] },
  ] },
  { id: 'niko', line: '通信は全部聞こえてます。聞こえすぎてるくらい。船長の寝言も拾っちゃうかも', choices: [
    { label: '「拾ったら内緒にしてくれ」', trust: 4, reply: [{ who: 'niko', text: '高くつきますよ' }] },
    { label: '「私用の通信は拾うな」', trust: 0, reply: [{ who: 'niko', text: '了解。……冗談ですって' }] },
  ] },
  { id: 'elena', line: '着いたら最初の一週間で、大気を全部測ります。二酸化炭素が1.8気圧あれば、赤道は溶けます。「あれば」、ですけど', choices: [
    { label: '「なければ？」', trust: 2, reply: [{ who: 'narr', text: 'エレナは一瞬、フォークを止めた。' }, { who: 'elena', text: '……なければ、書き直すだけです' }] },
    { label: '「期待している」', trust: 3, reply: [{ who: 'elena', text: '期待は、観測には邪魔なんですけどね' }] },
  ] },
  { id: 'lin', line: '積荷は412個。411個じゃ困る。出港前に数えました。二回', choices: [
    { label: '「412個、確かに」', trust: 4, reply: [{ who: 'lin', text: '……船長は数えてないでしょう' }] },
    { label: '「中身も確かめたか」', trust: -2, reply: [{ who: 'narr', text: '少し間があった。' }, { who: 'lin', text: '書類どおりです' }] },
  ] },
];
export const DINNER_CLOSE: Line[] = [
  { who: 'narr', text: '食事の終わりごろ、〈ハース〉からの定時通信が届いた。四時間前の声だ。' },
  { who: 'radio', text: '……第一建設隊、通信室より。外気温、零下五十四度。風、弱し。みんな元気です。それから、ケストレルの皆さんへ。待ってます' },
  { who: 'narr', text: '配管工のカリム・ラーマンの声だった。' },
  { who: 'narr', text: '医務官が、ほんの少しだけ顔を上げた。' },
  { who: 'narr', text: '五　出港' },
  { who: 'captain', text: '〈ケストレル〉、出港' },
  { who: 'narr', text: '外縁中継ステーションの灯が、ゆっくりと後ろへ流れていく。' },
];

// 航海の段階。事件はこの順に起きる
export interface Stage { day: number; name: string; pool: string[]; intro: string[] }
export const STAGES: Stage[] = [
  { day: 3, name: '出港直後', pool: ['lost_power', 'o2_drain', 'food'], intro: [
    '出港三日目。外縁中継ステーションの灯は、もう肉眼では見えない。',
    '当直は三交代。まだ誰も、この船の夜の音に慣れていない。',
  ] },
  { day: 16, name: '深宇宙', pool: ['seu', 'h2s'], intro: [
    '出港十六日目。恒星からも中継ステーションからも遠い、何もない宙域を進んでいる。',
    'ステーションとの通信は、届くまでに何時間もかかるようになった。船の中の声のほうが、ずっと近い。',
  ] },
  { day: 29, name: '小惑星帯', pool: ['dust', 'pressure', 'plot'], intro: [
    '出港二十九日目。小惑星帯に入った。岩屑の少ない航路を選んでいるが、船体を打つ細かな音が絶えない。',
    'エレナは観測窓のそばを離れようとしない。',
  ] },
  { day: 44, name: '恒星スイングバイ', pool: ['creak', 'distress', 'plot'], intro: [
    '出港四十四日目。恒星に近づき、その重力で船の向きと速さを変える。スイングバイの前後は、船体の片側だけが強い光を浴びる。',
    'このあたりの宙域では、入植地の採掘艇が働いている。〈ハース〉からの定時通信は、ほとんど遅れずに届くようになった。',
  ] },
  { day: 61, name: '到着前夜', pool: ['nav_tamper', 'painkiller', 'false_fire', 'plot'], intro: [
    '出港六十一日目。〈ハース〉は、窓の外で白く小さな円盤になった。明日には周回軌道に入る。',
    '船内は静かだ。誰もが、着いたあとのことを考えている。',
  ] },
];

// 事件の関係人物に選びたい乗員（その乗員の人物像に合う型だけ）
export const CAST: Record<string, string> = {
  lost_power: 'lin', o2_drain: 'haru', food: 'tomas', h2s: 'niko', pressure: 'lin', dust: 'elena',
  creak: 'haru', distress: 'lin', nav_tamper: 'niko', painkiller: 'tomas', false_fire: 'hahn',
};
// 関係人物が明かすと、その乗員の隠し事も明らかになる型
export const CASE_SECRET: Record<string, string> = { distress: 'S_letters', nav_tamper: 'S_debt', painkiller: 'S_knee', false_fire: 'S_order' };
// 会話で手を打っておくと、その乗員はその型の事件を起こさない
export const PREVENTS: Record<string, { template: string; crew: string; note: string }> = {
  P_tomas: { template: 'painkiller', crew: 'tomas', note: 'トマスは医務室で膝の手当てを受け、鎮痛剤はアイシャが管理している。' },
  P_niko: { template: 'nav_tamper', crew: 'niko', note: 'ニコが、取り立て屋から届いた通信を黙って船長に差し出した。「頼まれごとです。断ります」' },
  P_lin: { template: 'distress', crew: 'lin', note: 'リンの手紙の箱は、船長の私物として船長室に置かれている。' },
};

// 事件の合間の会話。各乗員3つ、順に進む。minDone は終えた事件の数、minTrust は必要な信頼
export const TALKS: Record<string, Talk[]> = {
  dmitri: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '機関区。ドミトリは配管の継ぎ目に耳を当てていた。' },
      { who: 'dmitri', text: 'この船は、音で具合が分かる。今のは機嫌がいいほうだ' },
      { who: 'dmitri', text: '就役したとき、俺は二十八だった。船体番号の塗装も、まだ白く光ってた' },
      { who: 'dmitri', text: '会社はこの航海のあと、こいつを売る。解体屋か、どこかの採掘会社か。どっちでも同じことだ' },
    ], choices: [
      { label: '「最後まで頼む」', trust: 4, reply: [{ who: 'dmitri', text: '言われなくてもな' }] },
      { label: '「新しい船に移る気は？」', trust: 1, reply: [{ who: 'dmitri', text: '……俺も、売られる歳だよ' }] },
    ] },
    { minDone: 2, minTrust: 50, fact: 'H_prevcap', lines: [
      { who: 'narr', text: '食堂。ドミトリはスープの匙を、右手から左手に持ち替えた。' },
      { who: 'dmitri', text: 'ハルは筋がいい。計算は俺より速い。だが、速いのを自慢しているうちは、まだだ' },
      { who: 'dmitri', text: '前の船長か？ 会社の人間とよく揉めてた。最後の晩、命令書を一枚読んで、黙って荷物をまとめた' },
      { who: 'dmitri', text: '中身は知らん。持ってきたのは、ハーンだ' },
    ], choices: [
      { label: '「話してくれて感謝する」', trust: 3, reply: [{ who: 'dmitri', text: '礼を言われる話じゃない' }] },
      { label: '「なぜ今まで黙っていた」', trust: -1, reply: [{ who: 'dmitri', text: '聞かれなかったからだ' }] },
    ] },
    { minDone: 3, minTrust: 65, fact: 'S_tremor', lines: [
      { who: 'narr', text: '夜の当直。ドミトリの手からスパナが落ち、床で乾いた音を立てた。' },
      { who: 'dmitri', text: '……拾わなくていい' },
      { who: 'dmitri', text: '半年前からだ。細かい作業になると、手が言うことを聞かん。健康診断の結果は、出す前に破った' },
      { who: 'dmitri', text: '降ろされたら、この船の最後を他人に任せることになる。それだけは嫌だった' },
      { who: 'dmitri', text: '医務官には言うな。……いや、あんたが決めろ。船長だ' },
    ], choices: [
      { label: '「細かい作業はハルに回そう。あなたは指示を」', trust: 5, reply: [{ who: 'dmitri', text: '……それが筋か' }] },
      { label: '「アイシャに診てもらうべきだ」', trust: 0, reply: [{ who: 'dmitri', text: '……分かった。着いたらな' }] },
    ] },
  ],
  aisha: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '医務室。アイシャは薬品庫の在庫表に、一行ずつ印をつけていた。' },
      { who: 'aisha', text: '夫は配管工です。〈ハース〉の第一建設隊に。娘も向こうの学校にいます。九歳になりました' },
      { who: 'aisha', text: '会うのは二年ぶりです。娘は、私の顔を覚えているでしょうか' },
    ], choices: [
      { label: '「着いたら、真っ先に会いに行ってくれ」', trust: 4, reply: [{ who: 'aisha', text: '……船長がそう言うなら、そうします' }] },
      { label: '「任務が先だ」', trust: 0, reply: [{ who: 'aisha', text: '分かっています。だから、この船に乗ったんです' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: 'アイシャは、ハーンが出ていったばかりの扉を見ていた。' },
      { who: 'aisha', text: '乗員の健康記録を、本社にもまとめて送るよう言われました。入植地から届く分も、一緒に' },
      { who: 'aisha', text: '医療記録は本人のものです。会社のものではありません' },
      { who: 'aisha', text: '……船長は、入植地の診療記録を見たことがありますか。会社が公開している分だけでも' },
    ], choices: [
      { label: '「見ていない。気になることが？」', trust: 3, reply: [{ who: 'aisha', text: '今は、まだ言えません。確かめてからにします' }] },
      { label: '「必要なら本社に出すべきだ」', trust: -3, reply: [{ who: 'aisha', text: '……そうですか' }] },
    ] },
    { minDone: 3, minTrust: 65, fact: 'S_deaths', lines: [
      { who: 'narr', text: 'アイシャは、端末に一通の私信を開いて見せた。差出人はカリム・ラーマン。' },
      { who: 'aisha', text: '出港の前の晩に、ステーションで受け取りました。検閲を通らない経路で' },
      { who: 'aisha', text: '入植地で、この一年に三人が死んでいます。凍傷と、原因の分からない頭痛のあとで。会社の記録には、一人も載っていません' },
      { who: 'aisha', text: '夫は、書けば職を失うと知っていて、書きました' },
      { who: 'aisha', text: '着いたら、診療記録の原本を確かめます。報告書に添えられるなら、添えたい' },
    ], choices: [
      { label: '「添えよう。署名するのは私だ」', trust: 6, reply: [{ who: 'aisha', text: '……ありがとうございます' }] },
      { label: '「確かめてからだ」', trust: 2, reply: [{ who: 'aisha', text: 'ええ。それでいいんです' }] },
    ] },
  ],
  haru: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '司令室。ハルは航路図の上で、指を何度も往復させていた。' },
      { who: 'haru', text: 'スイングバイの窓、三回計算したら三回とも同じでした！ ……同じなのが逆に怖いっていうか' },
      { who: 'haru', text: '〈ハース〉に最初に降りた航法士って、記録に名前が残るんですよ。ぼく、それになりたくて' },
    ], choices: [
      { label: '「名前より、全員を降ろすことだ」', trust: 2, reply: [{ who: 'haru', text: '……はい。そっちが先ですよね、もちろん' }] },
      { label: '「なれるさ」', trust: 4, reply: [{ who: 'haru', text: 'ほんとですか！ ……がんばります' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: '深夜。ハルは誰もいない司令室で、手動操船の訓練画面を開いていた。' },
      { who: 'haru', text: 'あ、船長。……寝られなくて' },
      { who: 'haru', text: '自動航法が止まったら、ぼくが手で回すんですよね。訓練では何度もやったんですけど' },
      { who: 'haru', text: '本物の星って、画面より暗いんですね' },
    ], choices: [
      { label: '「一緒に一回やってみよう」', trust: 5, reply: [{ who: 'narr', text: 'その夜、ハルは三回失敗して、四回目で成功した。' }, { who: 'haru', text: '……明日もやっていいですか' }] },
      { label: '「早く寝ろ。当直に響く」', trust: 0, reply: [{ who: 'haru', text: '……はい' }] },
    ] },
    { minDone: 3, minTrust: 65, fact: 'S_sim', lines: [
      { who: 'narr', text: 'ハルは、訓練記録の画面を船長のほうへ向けた。' },
      { who: 'haru', text: '深宇宙の実技、記録では二百時間になってます。本当は、百二十時間くらいです' },
      { who: 'haru', text: '足りない分は、同期に代わってもらいました。卒業試験に間に合わなくて。首席って、そういうことです' },
      { who: 'haru', text: 'ドミトリさんには言えません。あの人に失望されたら、ぼく、たぶん' },
    ], choices: [
      { label: '「残りの八十時間は、この船で埋めろ。ドミトリの横で」', trust: 6, reply: [{ who: 'haru', text: '……はい' }] },
      { label: '「着いたら報告する」', trust: -4, reply: [{ who: 'haru', text: '……分かってます。それが正しいです' }] },
    ] },
  ],
  hahn: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: 'ハーンの個室は、いつも片付いている。机の上には、封をした封筒が一つだけあった。' },
      { who: 'hahn', text: '船長。お茶でもいかがです。本社の配給品ですが' },
      { who: 'hahn', text: '第二次入植団の千二百人は、もう契約金を払っています。家を売った人もいる。出発が延びれば、その人たちの暮らしが止まる' },
      { who: 'hahn', text: '私の仕事は、その人たちに説明することです。説明できる数字を持ち帰ることです' },
    ], choices: [
      { label: '「説明できる数字、とは？」', trust: 2, reply: [{ who: 'hahn', text: '……正しい数字、と言い直しましょうか' }] },
      { label: '「数字は測ってみないと分からない」', trust: 1, reply: [{ who: 'hahn', text: 'ええ。だから、この船がある' }] },
    ] },
    { minDone: 2, minTrust: 42, lines: [
      { who: 'narr', text: 'ハーンは、乗員の当直表に目を落としたまま話した。' },
      { who: 'hahn', text: 'ラーマン医務官は、入植地の診療記録に関心がおありのようですね' },
      { who: 'hahn', text: '記録は大切です。ただ、公開されていない記録には、公開されていない理由がある' },
      { who: 'hahn', text: '船長。前任者がなぜ降りたか、ご存じですか' },
    ], choices: [
      { label: '「知らない。教えてくれ」', trust: 2, reply: [{ who: 'hahn', text: '本人の判断です。私が語ることではありません' }] },
      { label: '「あなたが命令書を渡したと聞いた」', needs: 'H_prevcap', trust: -2, reply: [{ who: 'hahn', text: '……誰から聞いたかは、伺わないでおきます' }] },
    ] },
    { minDone: 3, minTrust: 52, fact: 'S_order', lines: [
      { who: 'narr', text: 'ハーンは、机の上の封筒を船長の前に置いた。封はまだ切られていない。' },
      { who: 'hahn', text: '本社の命令書です。〈ハース〉の実測値が基準を下回った場合、報告の送信前に本社の承認を得ること。必要なら、データ回線を止める権限も私にある' },
      { who: 'hahn', text: '前任者は、この条件を読んで降りました' },
      { who: 'hahn', text: '私は降りませんでした。千二百人の顔を知っているからです。……少なくとも、そう自分に言い聞かせています' },
      { who: 'hahn', text: '見せたことは、記録に残しません' },
    ], choices: [
      { label: '「なぜ私に見せた」', trust: 3, reply: [{ who: 'hahn', text: 'あなたが、署名する人だからです' }] },
      { label: '「その権限を使うつもりか」', trust: 0, reply: [{ who: 'hahn', text: '使わずに済むことを、祈っています' }] },
    ] },
  ],
  niko: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '通信室。ニコは足を机に乗せ、三つの受信機の音を同時に聞いていた。' },
      { who: 'niko', text: '中継ステーションの定時、〈ハース〉の定時、それと会社の暗号通信。最後のは中身は読めません。読めたら困るでしょ' },
      { who: 'niko', text: 'なんでこの船にって？ 危険手当が高いから。それ以外の理由、要ります？' },
    ], choices: [
      { label: '「要らない」', trust: 3, reply: [{ who: 'niko', text: '話の分かる船長で助かります' }] },
      { label: '「本当にそれだけか」', trust: 0, reply: [{ who: 'niko', text: '……それだけですよ' }, { who: 'narr', text: 'ニコは受信機の音量を上げた。' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: 'ニコは、貨物室の前の通路で、資材の箱の荷札を指で弾いた。' },
      { who: 'niko', text: 'リンの箱、412個でしたっけ。そのうち何個かは、やけに軽い' },
      { who: 'niko', text: '告げ口じゃないですよ。軽い箱の話をしただけ。重い話を抱えてる人のほうが、この船には多いんで' },
    ], choices: [
      { label: '「聞かなかったことにする」', trust: 3, reply: [{ who: 'niko', text: '助かります。俺も、聞かれたくないことがあるんで' }] },
      { label: '「何が入っているか知っているのか」', trust: 1, reply: [{ who: 'niko', text: '知らないほうがいいこともある。俺もそう' }] },
    ] },
    { minDone: 3, minTrust: 65, fact: 'S_debt', lines: [
      { who: 'narr', text: '通信室の明かりは落ちていた。ニコは一枚の送金記録を画面に出した。' },
      { who: 'niko', text: '賭けです。軍にいたころからの。気づいたら、ステーションに取り立て屋が来てました' },
      { who: 'niko', text: '危険手当で返せる額じゃない。……だから、あいつらから頼まれごとが来たら、たぶん断れない' },
      { who: 'niko', text: '言っておきたかったんです。何かあったとき、船長が驚かないように' },
    ], choices: [
      { label: '「頼まれごとが来たら、まず私に言え」', trust: 6, flag: 'P_niko', reply: [{ who: 'niko', text: '……了解。約束します' }] },
      { label: '「船を危険にさらしたら、拘束する」', trust: 1, reply: [{ who: 'niko', text: 'それでいいです。そのほうが、断る理由になる' }] },
    ] },
  ],
  elena: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '観測室。エレナは〈ハース〉の古い観測記録を、壁一面に映していた。' },
      { who: 'elena', text: 'これが最初の記録です。十時間だけの影。この一回から、全部が始まった' },
      { who: 'elena', text: '私のモデルは、大気に二酸化炭素がたっぷりあると仮定しています。そうすれば、あの星は赤道のまわりだけ温まる' },
      { who: 'elena', text: '仮定です。だから測りに行くんです' },
    ], choices: [
      { label: '「仮定が外れたら？」', trust: 1, reply: [{ who: 'narr', text: '少し間があった。' }, { who: 'elena', text: '外れたら、外れたと書きます。……科学者ですから' }] },
      { label: '「あなたの仕事を信じる」', trust: 3, reply: [{ who: 'elena', text: '……信じないでください。測ってください' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: 'エレナの机に、書き直した計算の紙が重なっていた。ハーンが部屋を出ていくところだった。' },
      { who: 'elena', text: '本社とは、研究費の話をしていただけです。ええ、それだけ' },
      { who: 'elena', text: '私の研究費は、ずっとヘリオスから出ています。学生のころから。あのモデルがなければ、入植計画は通らなかった' },
      { who: 'elena', text: '……ハルに星図を教えていると、落ち着くんです。答えの決まっている問題だから' },
    ], choices: [
      { label: '「答えの決まっていない問題が、ほかにあるのか」', trust: 3, reply: [{ who: 'elena', text: '……いつか話します' }] },
      { label: '「研究費のことは気にするな」', trust: 0, reply: [{ who: 'elena', text: '気にしないでいられたら、いいんですけど' }] },
    ] },
    { minDone: 3, minTrust: 65, fact: 'S_model', lines: [
      { who: 'narr', text: 'エレナは、二枚の温度分布図を並べた。左は論文の図。右には、手書きの赤い線が入っている。' },
      { who: 'elena', text: '恒星の明るさの見積もりが甘かったんです。古い観測値をそのまま使っていた。出港して十日目に気づきました' },
      { who: 'elena', text: '直すと、赤道でも一年の大半は氷点下です。第二次入植団の温室の計画は、この左の図を前提にしています' },
      { who: 'elena', text: '実測で私の間違いが確かめられたら、そのとき言うつもりでした。……いいえ、違う。言うのが怖かった' },
    ], choices: [
      { label: '「実測値が出たら、この図も報告書に添えてくれ」', trust: 6, reply: [{ who: 'elena', text: '……はい。私の名前で' }] },
      { label: '「なぜもっと早く言わなかった」', trust: -2, reply: [{ who: 'elena', text: 'すみません。本当に' }] },
    ] },
  ],
  tomas: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '厨房。トマスは乾燥野菜を水に戻しながら、鼻歌を歌っていた。' },
      { who: 'tomas', text: '月面で十五年、穴を掘って柱を立ててた。いま〈ハース〉で基礎を打ってるのは、そのころの仲間だ' },
      { who: 'tomas', text: '落盤で膝をやって、厨房に回された。悪くない。人は、腹が減ってるときに決めたことを、たいてい間違える' },
    ], choices: [
      { label: '「だから船の食事は大事だ」', trust: 4, reply: [{ who: 'tomas', text: '分かってるじゃないか、船長' }] },
      { label: '「現場に戻りたいか」', trust: 2, reply: [{ who: 'tomas', text: '……この膝じゃな' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: 'トマスは、アイシャのカップにだけ、蜂蜜を多めに入れた。' },
      { who: 'tomas', text: '医務官は、ステーションを出てから、ろくに眠ってない。家族のことだけじゃないな、あれは' },
      { who: 'tomas', text: '俺は聞かない。話したくなったら話すだろう。船長も、そうしてやってくれ' },
    ], choices: [
      { label: '「分かった」', trust: 3, reply: [{ who: 'tomas', text: '頼む' }] },
      { label: '「何か知っているのか」', trust: 0, reply: [{ who: 'tomas', text: '知らんよ。知らんから、蜂蜜を入れてる' }] },
    ] },
    { minDone: 3, minTrust: 62, fact: 'S_knee', lines: [
      { who: 'narr', text: '夜の厨房。トマスは椅子に座ったまま、膝をさすっていた。立ち上がろうとして、やめた。' },
      { who: 'tomas', text: '私物の荷物に、鎮痛剤を入れて持ち込んだ。医務官には言ってない。言えば、着いても現場には行くなと言われる' },
      { who: 'tomas', text: '〈ハース〉に着いたら、昔の仲間と一度だけ、基礎の上に立ちたいんだ' },
      { who: 'tomas', text: '……もう、残りが少ない' },
    ], choices: [
      { label: '「アイシャに相談しよう。一緒に行く」', trust: 5, flag: 'P_tomas', reply: [{ who: 'tomas', text: '……船長に付き添われるのは、照れるな' }] },
      { label: '「黙っておく」', trust: 2, reply: [{ who: 'tomas', text: 'ありがとうよ。……たぶん、よくないことだがな' }] },
    ] },
  ],
  lin: [
    { minDone: 1, minTrust: 0, lines: [
      { who: 'narr', text: '貨物室。リンは荷札の番号を、声に出さずに唇だけで数えていた。' },
      { who: 'lin', text: '……四百十二。よし' },
      { who: 'lin', text: '前の船で、固定具が外れて人が一人、怪我をした。締めたのは私じゃない。でも、署名は私だった' },
      { who: 'lin', text: 'だから今は、全部自分で数える。二回' },
    ], choices: [
      { label: '「ここでは、署名した分だけ責任を持てばいい」', trust: 4, reply: [{ who: 'lin', text: '……そういう船なら、いいですけど' }] },
      { label: '「二回で足りるのか」', trust: 1, reply: [{ who: 'lin', text: '三回数える人は、二回目を信じてない人です' }] },
    ] },
    { minDone: 2, minTrust: 50, lines: [
      { who: 'narr', text: 'リンは、医療用の荷札がついた小さな箱を、棚の奥に押し込んだ。船長に気づいて、手を止めた。' },
      { who: 'lin', text: '医療用の消耗品です。……書類上は' },
      { who: 'lin', text: '入植地は、手紙一通送るのにも会社の検閲を通すんです。知ってました？' },
    ], choices: [
      { label: '「知らなかった」', trust: 3, reply: [{ who: 'lin', text: 'みんな知らないんです。向こうに行くまで' }] },
      { label: '「規則は規則だ」', trust: -3, reply: [{ who: 'lin', text: '……そうですね。船長ですもんね' }] },
    ] },
    { minDone: 3, minTrust: 62, fact: 'S_letters', lines: [
      { who: 'narr', text: 'リンは、資材の箱のひとつを開けた。中には、束ねた紙の手紙と小さな記録媒体が、ぎっしり詰まっていた。' },
      { who: 'lin', text: '入植者の家族から預かりました。三百通くらい。会社を通すと、半分は黒く塗られて届くから' },
      { who: 'lin', text: 'アイシャ先生の旦那さんの、ご両親からの手紙もあります' },
      { who: 'lin', text: '見つかれば、私は二度と船に乗れない。……それでも運びたかった' },
    ], choices: [
      { label: '「到着まで、私が預かる。船長の荷物として」', trust: 6, flag: 'P_lin', reply: [{ who: 'lin', text: '……いいんですか。船長まで' }] },
      { label: '「見なかったことにする」', trust: 3, reply: [{ who: 'lin', text: 'ありがとうございます。……箱、閉めますね' }] },
    ] },
  ],
};

// 信頼が足りない、または時期が早いときの一言
export const GUARDED: Record<string, string> = {
  dmitri: '今は手が離せん。あとにしてくれ',
  aisha: '診察中です。急ぎでなければ、あとで',
  haru: 'あっ、いま計算中で！ あとでいいですか、すみません！',
  hahn: '報告書の下書き中です。後ほど伺います',
  niko: 'いま混線中。あとで、聞こえるときに',
  elena: 'いま観測窓のそばを離れられません。あとで',
  tomas: '仕込みの途中だ。あとで何か持っていくよ',
  lin: '数えてる途中なんで。……あとで',
};
// 3つ目まで話し終えたあとの一言
export const DONE_TALK: Record<string, string> = {
  dmitri: '機関は機嫌がいい。俺もな',
  aisha: '眠れるようになりました。少しだけ',
  haru: '今日の手動操船、ドミトリさんに一回だけ「悪くない」って言われました',
  hahn: '記録には残しません。この会話は',
  niko: '今日は静かです。俺の受信機も',
  elena: '測るのが、少しだけ楽しみになりました',
  tomas: '今夜は豆のスープだ。膝にいいらしい。嘘だがな',
  lin: '412個。今日も合ってます',
};

// ---------- 事件の合間の一場面 ----------
// 死んだ乗員を悼む一言（言う人が生きていなければ地の文）
export const GRIEF: Record<string, { by: string; text: string }> = {
  dmitri: { by: 'haru', text: '……ドミトリさんの工具、まだ温かい気がして' },
  aisha: { by: 'tomas', text: '蜂蜜、余っちまったな' },
  haru: { by: 'dmitri', text: '……計算は、俺より速かったんだ' },
  hahn: { by: 'elena', text: 'あの人の机、きれいに片付いたままでした。最後まで' },
  niko: { by: 'lin', text: '受信機の音、誰も止めてない。止め方が分からないんです' },
  elena: { by: 'haru', text: '星図の続き、教わるはずだったのに' },
  tomas: { by: 'aisha', text: '食堂の灯りが、今夜は点いていません' },
  lin: { by: 'niko', text: '412個、今日は俺が数えました。……合ってました' },
};
// 関係人物だと分かった乗員への、近しい者の一言
export const REACT: Record<string, { by: string; text: string }> = {
  dmitri: { by: 'haru', text: 'ドミトリさんでも、隠しごとをするんですね。……いや、ぼくもだ' },
  aisha: { by: 'tomas', text: '医務官を責める気にはなれんよ。俺も、同じことをしたかもしれん' },
  haru: { by: 'dmitri', text: 'ハル。次からは、最初に俺に言え' },
  hahn: { by: 'niko', text: '背広の人にも、眠れない夜はあるんですね' },
  niko: { by: 'lin', text: '言ってくれればよかったのに。……私も、言ってないことがあるけど' },
  elena: { by: 'haru', text: 'エレナさんの星図、ぼくはまだ信じてます' },
  tomas: { by: 'aisha', text: '痛いときは言って、と言ったのに。気づくべきだったのは私です' },
  lin: { by: 'niko', text: '几帳面なやつほど、ひとりで抱え込むんですよ' },
};
// 何事もなかった合間の、船の暮らし（その人が生きていなければ使わない）
export const DAILY: { needs: string[]; lines: Line[] }[] = [
  { needs: ['tomas'], lines: [{ who: 'narr', text: 'トマスが乾燥卵でオムレツを焼いた。本物にはほど遠い、といちばん文句を言っていたのは本人だった。' }] },
  { needs: ['haru', 'elena'], lines: [{ who: 'narr', text: 'ハルとエレナが、観測窓の前で星図を広げていた。〈ハース〉の恒星は、まだほかの星と見分けがつかない。' }] },
  { needs: ['lin'], lines: [{ who: 'narr', text: 'リンが貨物室で荷札を数える声が、通路まで聞こえてくる。' }, { who: 'lin', text: '……四百十二' }] },
  { needs: ['niko'], lines: [{ who: 'narr', text: '〈ハース〉からの定時通信が届いた。' }, { who: 'radio', text: '……みんな元気です' }, { who: 'narr', text: 'ニコが、受信機の音量を少しだけ上げた。' }] },
  { needs: [], lines: [{ who: 'narr', text: '当直の交代の合図が鳴った。船は、何事もなかったように進んでいる。' }] },
];
