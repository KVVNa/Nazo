// 到着と報告書。署名の選び方・添付・乗員の状態から結末の文章を組み立てる。
import type { Line } from './story';

export interface EndCtx {
  alive(id: string): boolean; // 生きていて拘束されていない
  dead(id: string): boolean;
  confined(id: string): boolean;
  trust(id: string): number;
  fact(f: string): boolean;
}

export type ReportChoice = 'truth' | 'conditional' | 'wait';
export interface Attach { id: 'deaths' | 'model' | 'order'; label: string; desc: string }

// 実測値（固定）。モデルが仮定したのは二酸化炭素1.8気圧と、赤道で半年ほど氷が解けること
export const MEASURED = {
  pressure: '0.7気圧（うち二酸化炭素 0.5気圧）',
  equator: '赤道の年平均 零下31度',
  thaw: '氷点を上回るのは、谷の底で年に40日ほど',
};

export function arrivalLines(e: EndCtx): Line[] {
  const L: Line[] = [
    { who: 'narr', text: '出港六十二日目。〈ケストレル〉は〈ハース〉の周回軌道に入った。' },
    { who: 'narr', text: '窓の下の星は、どこまでも白かった。赤道の谷にだけ、入植地の灯が細い線になって見えた。' },
    { who: 'narr', text: '大気と地表を測り終えるのに、六日かかった。' },
  ];
  const nums = `地表の気圧 ${MEASURED.pressure}。${MEASURED.equator}。${MEASURED.thaw}。`;
  if (e.alive('elena')) {
    L.push({ who: 'elena', text: nums });
    if (e.fact('S_model')) L.push({ who: 'elena', text: '船長にお見せした、赤い線の図のとおりです。私のモデルは、間違っていました' });
    else L.push({ who: 'narr', text: 'エレナは長いあいだ黙っていた。' }, { who: 'elena', text: '……知っていました。出港して十日目に、自分の計算の誤りに気づいていた。言えなかったんです。私のモデルは、間違っていました' });
  } else {
    const reader = ['haru', 'niko', 'dmitri', 'aisha', 'lin', 'tomas', 'hahn'].find((id) => e.alive(id));
    if (reader) L.push({ who: reader, text: `エレナさんの観測手順どおりに測りました。${nums}` });
    else L.push({ who: 'narr', text: nums });
    L.push({ who: 'narr', text: 'モデルが仮定していた二酸化炭素1.8気圧には、遠く届かなかった。' });
  }
  L.push({ who: 'narr', text: '第二次入植団の温室の計画は、赤道で半年ほど氷が解けることを前提にしていた。' });
  if (e.alive('hahn')) {
    L.push({ who: 'narr', text: 'ハーンが、封をした命令書を開いた。' });
    L.push({ who: 'hahn', text: '実測値は基準を下回りました。本社の命令により、報告の送信の前に本社の承認を得ていただきます' });
    if (e.fact('S_order')) L.push({ who: 'hahn', text: '……船長はもう、この紙の中身をご存じでしたね' });
  } else {
    L.push({ who: 'radio', text: 'ヘリオス開拓公社より〈ケストレル〉船長へ。実測値が基準を下回る場合、報告の送信前に本社の承認を得ること' });
  }
  if (e.alive('aisha')) {
    if (e.fact('S_deaths')) L.push({ who: 'aisha', text: '入植地の診療記録の原本を確かめました。三人とも、会社の記録にはありません。報告書に添えられます' });
    else L.push({ who: 'aisha', text: '……船長。入植地では、この一年に三人が死んでいます。会社の記録にはありません。いま言わなければ、私は一生黙ったままになる' });
  }
  L.push({ who: 'narr', text: '報告書の署名欄は、まだ空いている。' });
  return L;
}

export function attachments(e: EndCtx): Attach[] {
  const out: Attach[] = [];
  if (e.alive('aisha')) out.push({ id: 'deaths', label: '入植地の診療記録（三人の死）', desc: 'アイシャが原本を確かめた。会社の記録には載っていない。' });
  if (e.alive('elena')) out.push({ id: 'model', label: 'エレナの訂正図', desc: '恒星の明るさを直した温度分布。第二次入植団の温室計画の前提が崩れる。' });
  if (e.fact('S_order')) out.push({ id: 'order', label: '本社の命令書の写し', desc: '「基準を下回れば、送信の前に本社の承認を得よ」。' });
  return out;
}

// 実測値のまま送ろうとしたとき、回線を止められるか
export function sendBlocked(e: EndCtx): { blocked: boolean; lines: Line[] } {
  if (!e.alive('hahn')) return { blocked: false, lines: [] };
  if (e.fact('S_order') && e.trust('hahn') >= 65) {
    return { blocked: false, lines: [{ who: 'narr', text: 'ハーンは回線の制御盤の前に立ったが、手を伸ばさなかった。' }, { who: 'hahn', text: '……記録には、止めようとしたと書いておきます。止められなかった、とも' }] };
  }
  if (e.fact('S_order') && (e.alive('niko') || e.alive('dmitri'))) {
    const who = e.alive('niko') ? 'niko' : 'dmitri';
    return { blocked: false, lines: [
      { who: 'narr', text: 'ハーンが回線を止めた。だが、命令書の中身を知っていた船長は、前の晩のうちに手を打っていた。' },
      { who, text: who === 'niko' ? '予備の送信機、暖めておきました。聞こえすぎる通信士なんで' : '予備の送信機に、電源を回しておいた。背広の男の紙一枚で、船は止まらん' },
    ] };
  }
  if (e.alive('niko') && e.trust('niko') >= 60) {
    return { blocked: false, lines: [
      { who: 'narr', text: '送信の直前、データ回線が止まった。ハーンが命令書の権限を使った。' },
      { who: 'niko', text: '……迂回します。軍にいたころ、こういうのは得意でした' },
      { who: 'narr', text: '報告は、別の経路から出ていった。' },
    ] };
  }
  return { blocked: true, lines: [
    { who: 'narr', text: '送信の直前、データ回線が止まった。ハーンが命令書の権限を使った。' },
    { who: 'hahn', text: '申し訳ありません、船長。命令です' },
    { who: 'narr', text: '回線を取り戻す手立ては、船の中になかった。' },
  ] };
}

export function outcomeLines(choice: ReportChoice, att: string[], blocked: boolean): Line[] {
  const L: Line[] = [];
  if (choice === 'truth' && !blocked) {
    L.push({ who: 'narr', text: '報告は、実測値のまま、本社と入植地の両方に届いた。' });
    if (att.includes('deaths')) L.push({ who: 'narr', text: '添えられた三人の診療記録は、本社の中からも声を上げさせた。' });
    if (att.includes('model')) L.push({ who: 'narr', text: 'エレナの訂正図は、第二次入植団の温室計画を、その場で止めた。' });
    if (att.includes('order')) L.push({ who: 'narr', text: '命令書の写しが公になり、入植事業部の責任者が職を退いた。' });
    if (att.includes('deaths') || att.includes('model')) {
      L.push({ who: 'narr', text: '第二次入植団の出発は延期された。代わりに、補給船と医療隊が〈ハース〉へ向かうことになった。' });
      L.push({ who: 'narr', text: '三百四十人は、谷の底で冬を越す準備を始めた。今度は、本当の数字をもとに。' });
    } else {
      L.push({ who: 'narr', text: '本社は「観測誤差の範囲」と反論した。出発は半年延期され、議論は今も続いている。' });
    }
    return L;
  }
  if (choice === 'conditional') {
    L.push({ who: 'narr', text: '報告書には「条件付きで出発可」と書かれた。温室を倍に増やせば、という条件だった。' });
    L.push({ who: 'narr', text: '第二次入植団は、予定より四か月遅れて出発した。温室は、倍にはならなかった。' });
    return L;
  }
  L.push({ who: 'narr', text: '報告は、本社の承認を待った。' });
  L.push({ who: 'narr', text: '三週間後に公表された版では、赤道の気温は「季節により氷点を上回る」と書かれていた。' });
  L.push({ who: 'narr', text: '第二次入植団の千二百人は、予定どおり出発した。' });
  return L;
}

// 乗員ごとの後日談
export function crewEpilogue(id: string, e: EndCtx, choice: ReportChoice, sent: boolean): string {
  const honest = choice === 'truth' && sent;
  if (e.dead(id)) {
    return ({
      dmitri: 'ドミトリの工具箱は、機関区の棚に置かれたままになった。船は売られ、工具箱も一緒に行った。',
      aisha: 'アイシャの遺品は、〈ハース〉の夫と娘のもとへ届けられた。娘は、母の顔を写真で覚えることになった。',
      haru: 'ハルの名前は、〈ハース〉に降りた航法士の記録には載らなかった。〈ケストレル〉の航海日誌の最後の頁にだけ残った。',
      hahn: 'ハーンの個室の机には、本社への報告書の下書きが残っていた。最後の一行は書きかけだった。',
      niko: 'ニコの受信機は、誰も切らないまま、しばらく〈ハース〉の定時通信を拾い続けた。',
      elena: e.alive('haru') ? 'エレナの観測手順書は、ハルが清書して本社に送った。表紙には彼女の名前だけが書かれていた。' : 'エレナの観測手順書は、表紙に彼女の名前だけを書いて本社に送られた。',
      tomas: '〈ハース〉の居住棟の基礎に、トマスの名前が刻まれた。月面時代の仲間たちが刻んだ。',
      lin: 'リンの荷札の束は、最後まで412枚そろっていた。',
    } as Record<string, string>)[id];
  }
  if (e.confined(id)) {
    return ({
      hahn: 'ハーンは拘束されたまま〈ハース〉に着いた。本社は彼を守らなかった。',
      niko: 'ニコは拘束されたまま〈ハース〉に着き、当局の聴取を受けた。取り立て屋の名前を、すべて話した。',
      lin: 'リンは拘束されたまま着いた。預かった手紙は、船長の手で入植者たちに配られた。',
      tomas: 'トマスは拘束を解かれないまま着いた。基礎の上には、立てなかった。',
    } as Record<string, string>)[id] ?? `${NAMES[id]}は拘束されたまま〈ハース〉に着き、処分を待っている。`;
  }
  switch (id) {
    case 'dmitri': return e.fact('S_tremor') ? 'ドミトリは到着後に精密検査を受けた。〈ケストレル〉を送り出す日、最後の点検だけは自分の手でやった。' + (e.alive('haru') ? 'ハルが横で工具を渡した。' : '') : 'ドミトリは〈ケストレル〉を最後まで整備し、売却の書類に黙って署名した。';
    case 'aisha': return honest ? 'アイシャは入植地の診療所に残った。娘は、母の顔をちゃんと覚えていた。' : 'アイシャは入植地の診療所に残った。夜になると、届かなかった報告のことを考える。';
    case 'haru': return e.fact('S_sim') ? 'ハルは〈ハース〉への最初の降下で、手動操船の補助を務めた。記録の時間は、もう水増しではなかった。' : 'ハルは〈ハース〉への最初の降下で航法を務め、記録に名前が残った。';
    case 'hahn': return honest ? 'ハーンは本社に呼び戻された。帰りの船で、第二次入植団の名簿を一人ずつ読み直していたという。' : 'ハーンは本社から表彰された。受け取ったかどうかは、誰も知らない。';
    case 'niko': return e.fact('S_debt') ? 'ニコは入植地の通信所に職を得た。給料の半分は、今も取り立て屋に消えている。前より、よく眠れるそうだ。' : 'ニコは次の船に乗った。危険手当が高いから、と本人は言う。';
    case 'elena': return honest ? 'エレナは〈ハース〉に残り、訂正したモデルで、谷の底で作物が育つ季節を探している。' : 'エレナは本社に戻った。訂正図は、彼女の机の引き出しに入ったままだ。';
    case 'tomas': return e.fact('S_knee') ? 'トマスはアイシャの治療を受けて、月面時代の仲間と一度だけ、居住棟の基礎の上に立った。' : 'トマスは〈ハース〉の食堂で働き始めた。膝のことは、まだ誰にも言っていない。';
    case 'lin': return e.fact('S_letters') ? '三百通の手紙は、黒く塗られずに入植者たちの手に届いた。' : 'リンの箱は、誰にも開けられないまま入植地の倉庫に運び込まれた。';
  }
  return '';
}

const NAMES: Record<string, string> = { dmitri: 'ドミトリ', aisha: 'アイシャ', haru: 'ハル', hahn: 'ハーン', niko: 'ニコ', elena: 'エレナ', tomas: 'トマス', lin: 'リン' };

export const ABORT_LINES: Line[] = [
  { who: 'narr', text: '残った乗員だけでは、もう船を回しきれない。' },
  { who: 'narr', text: '〈ケストレル〉は救難信号を出し、入植地の採掘艇に曳かれて〈ハース〉へ向かった。' },
  { who: 'narr', text: '報告書は、ほかの誰かが書くことになった。' },
];
export const LOST_LINES: Line[] = [
  { who: 'narr', text: '〈ケストレル〉は、〈ハース〉に着かなかった。' },
  { who: 'narr', text: '入植地の通信室では、しばらくのあいだ、誰かが定時通信の最後に「待ってます」と付け加え続けた。' },
];
