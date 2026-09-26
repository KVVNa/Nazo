// 航海モードの画面：プロローグ、出港前夜、各話の導入、事件の合間、到着と報告書。
// 進行の変更は game（進行役）を通して行い、ここは文章と選択肢を見せるだけ。
import { game } from './game';
import { h, clear, openSheet, closeSheet, confirmSheet } from './dom';
import { portraitURL } from '../render/sprites';
import { CREW8, PROFILES } from '../voyage/crew8';
import { DINNER_CLOSE, DINNER_OPEN, DONE_TALK, GUARDED, INTROS, PROLOGUE, STAGES, type Line } from '../voyage/story';
import { ABORT_LINES, LOST_LINES, arrivalLines, attachments, crewEpilogue, outcomeLines, sendBlocked, type ReportChoice } from '../voyage/ending';
import { choicesFor, dayOf, endCtx, interludeScene, medicAvailable, repairer, nameOf, nextTalk, scoreVoyage, seedOf, vc, SLOTS_PER_INTERLUDE, type VoyageState } from '../voyage/voyage';

export interface Nav { title(): void; briefing(): void }
let nav: Nav;
const root = () => document.getElementById('app')!;
const V = (): VoyageState => game.campaign!;

const JP_NUM = ['一', '二', '三', '四', '五'];
const trustWord = (t: number) => (t >= 75 ? '厚い' : t >= 55 ? 'ふつう' : t >= 35 ? '揺らいでいる' : '低い');

// ---------- 語りの部品 ----------
function lineEl(l: Line, order = false): HTMLElement {
  if (l.who === 'narr') return h('div', { class: 'dl ' + (order ? 'order' : 'narr') }, l.text);
  if (l.who === 'captain' || l.who === 'radio') {
    return h('div', { class: 'dl ' + l.who }, h('div', { style: { flex: 1 } }, h('div', { class: 'who' }, l.who === 'captain' ? 'あなた（船長）' : '〈ハース〉からの通信'), h('div', { class: 'say' }, l.text)));
  }
  const s = seedOf(l.who);
  return h('div', { class: 'dl' }, h('img', { class: 'face', src: portraitURL(s.look, 2), alt: '' }),
    h('div', { style: { flex: 1 } }, h('div', { class: 'who' }, `${s.name}（${s.role}）`), h('div', { class: 'say' }, `「${l.text}」`)));
}

// 1行ずつ出す。画面のどこをタップしても次へ。「すべて表示」で飛ばせる
function playLines(box: HTMLElement, lines: Line[], done: () => void, order = false) {
  let i = 0;
  const tap = h('div', { class: 'tapnext' }, '▼ タップで次へ');
  const skip = h('button', { class: 'btn small', style: { alignSelf: 'flex-end' } }, 'すべて表示');
  const scroller = box.closest('.sheet') ?? box.closest('.screen') ?? box;
  const next = () => {
    if (i >= lines.length) return;
    tap.remove();
    box.appendChild(lineEl(lines[i++], order));
    if (i < lines.length) box.appendChild(tap);
    else finish();
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  };
  const finish = () => { scroller.removeEventListener('click', onClick); skip.remove(); tap.remove(); done(); };
  const onClick = (e: Event) => { if ((e.target as HTMLElement).closest('button')) return; next(); };
  skip.addEventListener('click', () => { while (i < lines.length - 1) { box.appendChild(lineEl(lines[i++], order)); } next(); });
  scroller.addEventListener('click', onClick);
  box.appendChild(skip);
  next();
}

function screen(...kids: any[]) {
  const r = root();
  clear(r);
  const sc = h('div', { class: 'screen' }, ...kids);
  r.appendChild(sc);
  return sc;
}

// ---------- 入口 ----------
export function openVoyage(n: Nav) {
  nav = n;
  const v = V();
  switch (v.phase) {
    case 'prologue': return showPrologue(0);
    case 'dinner': return showDinner();
    case 'stage': return showStage();
    case 'case': if (game.vResumeCase()) return nav.briefing(); return showStage();
    case 'interlude': return showInterlude();
    case 'ending': return showEnding();
    case 'done': return showDone();
  }
}

// ---------- プロローグ ----------
function showPrologue(i: number) {
  const p = PROLOGUE[i];
  const box = h('div', { class: 'story' });
  const btns = h('div', {});
  screen(h('p', { class: 'stage-no' }, 'プロローグ'), h('h2', {}, p.heading), box, btns);
  playLines(box, p.lines, () => {
    btns.appendChild(h('button', { class: 'btn primary', style: { marginTop: '16px' }, onclick: () => {
      if (i + 1 < PROLOGUE.length) showPrologue(i + 1);
      else { game.vSetPhase('dinner'); showDinner(); }
    } }, '次へ'));
  }, !!p.order);
}

// ---------- 出港前夜 ----------
function showDinner() {
  const v = V();
  const box = h('div', { class: 'story' });
  const tail = h('div', {});
  screen(h('p', { class: 'stage-no' }, 'プロローグ'), box, tail);
  const intros = INTROS.filter((x) => v.dinner[x.id] === undefined);
  const step = (k: number) => {
    if (k >= intros.length) {
      playLines(box, DINNER_CLOSE, () => {
        tail.appendChild(h('button', { class: 'btn primary', style: { marginTop: '16px' }, onclick: () => { game.vSetPhase('stage'); showStage(); } }, '航海へ'));
      });
      return;
    }
    const it = intros[k];
    box.appendChild(lineEl({ who: it.id, text: it.line }));
    const row = h('div', { style: { display: 'grid', gap: '6px' } }, it.choices.map((c, i) => h('button', { class: 'opt', style: { textAlign: 'left' }, onclick: () => {
      row.remove();
      game.vAnswerDinner(it.id, i);
      box.appendChild(lineEl({ who: 'captain', text: c.label.replace(/^「|」$/g, '') }));
      playLines(box, c.reply, () => step(k + 1));
    } }, c.label)));
    box.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };
  const start = () => step(0);
  if (Object.keys(v.dinner).length === 0) playLines(box, DINNER_OPEN, start); else start();
}

// ---------- 各話の導入 ----------
function crewFaces(v: VoyageState) {
  return h('div', { class: 'faces' }, CREW8.map((c) => {
    const x = vc(v, c.id);
    return h('img', { src: portraitURL(c.look, 2), class: x.alive ? '' : 'gone', alt: c.name, title: c.name + (x.alive ? '' : '（故人）') + (x.confined ? '（拘束中）' : '') });
  }));
}

function showStage() {
  const v = V();
  if (game.vMustAbort()) { v.phase = 'ending'; game.saveCamp(); return showEnding(); }
  const st = STAGES[v.stage];
  const msg = h('p', { class: 'small muted' });
  const go = h('button', { class: 'btn primary', onclick: () => {
    go.disabled = true;
    msg.textContent = '事件を組み立てて、辻褄を確かめています…';
    setTimeout(() => {
      try { game.vStartCase(); nav.briefing(); }
      catch (e) { go.disabled = false; msg.textContent = '事件を組み立てられなかった：' + (e as Error).message; }
    }, 30);
  } }, `第${v.stage + 1}話へ`);
  screen(
    h('p', { class: 'stage-no' }, `第${JP_NUM[v.stage]}話　${st.name}`),
    h('h2', { style: { margin: '4px 0 10px' } }, `出港${st.day}日目`),
    h('div', { class: 'story' }, st.intro.map((t) => lineEl({ who: 'narr', text: t }))),
    h('div', { class: 'card' }, h('div', { class: 'small muted' }, '乗員'), crewFaces(v)),
    go, msg,
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => nav.title() }, 'タイトルへ（航海は保存されます）'),
  );
}

// ---------- 事件の合間 ----------
function showInterlude() {
  const v = V();
  const last = v.results[v.results.length - 1];
  const nextSt = STAGES[v.stage];
  const injured = v.crew.filter((c) => c.alive && c.health < 100);
  const medic = medicAvailable(v);
  const rep = repairer(v);
  const aliveFree = v.crew.filter((c) => c.alive && !c.confined).length;
  const deathLines = last?.deaths.map((id) => `${nameOf(id)}が死んだ。遺体は冷蔵区画の一角に安置された。〈ハース〉まで、あと${62 - dayOf(last.stage)}日。`) ?? [];
  screen(
    h('p', { class: 'stage-no' }, `第${JP_NUM[last.stage]}話のあと`),
    h('h2', { style: { margin: '4px 0 6px' } }, `出港${dayOf(last.stage)}日目〜${nextSt.day - 1}日目`),
    h('div', { class: 'card' },
      h('div', { class: 'small muted' }, '終えた事件'),
      h('div', {}, h('b', {}, last.title), `　${last.grade}`),
      last.prevented ? h('p', { class: 'small', style: { margin: '6px 0 0' } }, last.prevented) : null,
      deathLines.map((t) => h('p', { class: 'small', style: { margin: '6px 0 0', color: 'var(--bad)' } }, t))),
    h('div', { class: 'story', style: { margin: '6px 0 10px' } }, interludeScene(v).map((l) => lineEl(l))),
    h('div', { class: 'card' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('b', {}, '次の事件までにできること'),
        h('span', { class: 'slots', 'aria-label': `残り${v.slots}` }, '●'.repeat(v.slots) + '○'.repeat(SLOTS_PER_INTERLUDE - v.slots))),
      h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, '話す・修理・手当て・休息のたびに一つ減る。誰と話すかで、見えてくるものが変わる。')),
    h('div', { class: 'card' },
      h('b', {}, '船の状態'),
      h('div', { class: 'res-row' }, h('span', {}, '船体'), h('span', { style: { color: v.hull < 50 ? 'var(--bad)' : v.hull < 80 ? 'var(--warn)' : '' } }, `${v.hull}%`)),
      h('div', { class: 'res-row' }, h('span', {}, '予備部品'), h('span', {}, `${v.parts}`)),
      h('div', { class: 'res-row' }, h('span', {}, '医療品'), h('span', {}, `${v.meds}`)),
      h('p', { class: 'small muted', style: { margin: '6px 0' } }, '船体の傷みは次の事件に持ち越す。0%になれば船は失われる。部品と医療品は、航海の途中では手に入りにくい。'),
      h('div', { style: { display: 'grid', gap: '6px' } },
        h('button', { class: 'btn small', style: { width: '100%' }, disabled: !rep || v.repaired || v.slots <= 0 || v.parts <= 0 || v.hull >= 100, onclick: () => { game.vRepair(); showInterlude(); } },
          v.repaired ? '修理済み' : v.hull >= 100 ? '修理の必要はない' : v.parts <= 0 ? '予備部品がない' : rep ? `船体を修理する（${nameOf(rep)}・部品1つ）` : '修理できる者がいない'),
        h('button', { class: 'btn small', style: { width: '100%' }, disabled: !injured.length || !medic || v.treated || v.slots <= 0 || v.meds <= 0, onclick: () => { game.vTreat(); showInterlude(); } },
          v.treated ? '手当て済み' : !injured.length ? '負傷者はいない' : v.meds <= 0 ? '医療品がない' : medic ? `負傷者を手当てする（${nameOf(medic)}・医療品1つ）` : '手当てできる者がいない'),
        h('button', { class: 'btn small', style: { width: '100%' }, disabled: v.rested || v.slots <= 0, onclick: () => { game.vRest(); showInterlude(); } },
          v.rested ? '休ませた' : '当直を減らして全員を休ませる（少し回復し、少し打ち解ける）')),
      injured.length ? h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, `負傷者：${injured.map((c) => `${nameOf(c.id)} ${c.health}%`).join('、')}`) : null),
    h('h3', {}, '乗員'),
    CREW8.map((s) => {
      const c = vc(v, s.id);
      if (!c.alive) return h('div', { class: 'crew-row', style: { opacity: 0.5 } }, h('img', { src: portraitURL(s.look), alt: '', style: { filter: 'grayscale(1)' } }),
        h('div', { class: 'body' }, h('div', { class: 'name' }, `${s.name}　`, h('span', { class: 'small muted' }, s.role)), h('div', { class: 'small muted' }, `出港${c.diedDay}日目に死亡`)));
      const talked = v.talkedNow.includes(s.id);
      return h('div', { class: 'crew-row' },
        h('img', { src: portraitURL(s.look), alt: '' }),
        h('div', { class: 'body' },
          h('div', { class: 'name' }, `${s.name}　`, h('span', { class: 'small muted' }, s.role)),
          h('div', { class: 'small' }, `信頼：${trustWord(c.trust)}${c.confined ? '　拘束中' : ''}`),
          h('div', { class: 'hbar' + (c.health < 50 ? ' low' : '') }, h('i', { style: { width: c.health + '%' } })),
          h('div', { class: 'btn-row', style: { marginTop: '6px' } },
            c.confined
              ? h('button', { class: 'btn small', onclick: () => confirmSheet('拘束を解く', `${s.name}の拘束を解き、次の事件から持ち場に戻します。`, '解く', () => { game.vConfine(s.id, false); showInterlude(); }) }, '拘束を解く')
              : h('button', { class: 'btn small', disabled: talked || v.slots <= 0, onclick: () => talkSheet(s.id) }, talked ? '話した' : '話す'),
            !c.confined && aliveFree > 5 && last.responsible === s.id
              ? h('button', { class: 'btn small danger', onclick: () => confirmSheet('拘束する', `${s.name}を到着まで拘束します。次の事件からは持ち場につきません。`, '拘束する', () => { game.vConfine(s.id, true); showInterlude(); }, true) }, '拘束する') : null)));
    }),
    h('button', { class: 'btn', onclick: () => rosterSheet() }, '乗員名簿と分かったこと'),
    h('button', { class: 'btn primary', style: { marginTop: '10px' }, onclick: () => {
      const go = () => { game.vLeave(); showStage(); };
      if (v.slots > 0) confirmSheet('先へ進む', `できることがまだ${v.slots}つ残っています。次の事件へ進みますか。`, '進む', go); else go();
    } }, `出港${nextSt.day}日目へ`),
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => nav.title() }, 'タイトルへ（航海は保存されます）'),
  );
}

function talkSheet(id: string) {
  const v = V();
  const n = nextTalk(v, id);
  const box = h('div', { class: 'story' });
  const tail = h('div', {});
  openSheet(h('div', { class: 'screen', style: { padding: 0, overflow: 'visible' } }, box, tail), () => showInterlude());
  if (n.guarded) {
    box.appendChild(lineEl({ who: id, text: GUARDED[id] }));
    tail.appendChild(h('p', { class: 'small muted' }, '今は話せる状態ではないようだ（時間は使わない）。信頼が深まるか、航海が進めば話してくれるかもしれない。'));
    return;
  }
  if (!n.talk) {
    game.vTalk(id, null);
    box.appendChild(lineEl({ who: id, text: DONE_TALK[id] }));
    return;
  }
  const t = n.talk;
  const chs = choicesFor(v, t);
  playLines(box, t.lines, () => {
    if (!chs.length) { game.vTalk(id, null); return; }
    const row = h('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } }, chs.map((c, i) => h('button', { class: 'opt', style: { textAlign: 'left' }, onclick: () => {
      row.remove();
      game.vTalk(id, i);
      box.appendChild(lineEl({ who: 'captain', text: c.label.replace(/^「|」$/g, '') }));
      playLines(box, c.reply, () => tail.appendChild(h('button', { class: 'btn', style: { marginTop: '12px' }, onclick: () => closeSheet() }, '戻る')));
    } }, c.label)));
    box.appendChild(row);
  });
}

const FACT_NOTES: Record<string, string> = {
  H_prevcap: '前の船長は、ハーンが持ってきた命令書を読んで船を降りた（ドミトリの話）。',
  P_niko: 'ニコは、取り立て屋から頼まれごとが来たら先に船長に言うと約束した。',
  P_tomas: 'トマスの膝は、アイシャが診ることになった。',
  P_lin: 'リンの手紙の箱は、到着まで船長が預かる。',
};

export function rosterSheet() {
  const v = V();
  openSheet(h('div', {},
    h('h2', {}, '乗員名簿'),
    PROFILES.map((p) => {
      const c = vc(v, p.id);
      const s = seedOf(p.id);
      return h('div', { class: 'card' },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
          h('img', { class: 'portrait', src: portraitURL(s.look, 2), width: 48, height: 48, alt: '', style: c.alive ? {} : { filter: 'grayscale(1)', opacity: '0.5' } }),
          h('div', {}, h('b', {}, p.fullName), h('div', { class: 'small muted' }, `${p.age}歳　${p.title}${c.alive ? '' : '　（故人）'}`))),
        h('p', { class: 'small', style: { margin: '8px 0 4px' } }, p.reason),
        h('p', { class: 'small muted', style: { margin: '0' } }, `「${p.speech}」`),
        v.facts.includes(p.secretFact) ? h('p', { class: 'small', style: { margin: '6px 0 0', color: 'var(--accent)' } }, '分かったこと：' + p.secretText) : null);
    }),
    Object.entries(FACT_NOTES).filter(([k]) => v.facts.includes(k)).length ? h('div', { class: 'card small' }, h('b', {}, 'そのほかに分かったこと'),
      Object.entries(FACT_NOTES).filter(([k]) => v.facts.includes(k)).map(([, t]) => h('p', { style: { margin: '4px 0' } }, t))) : null,
  ));
}

// ---------- 到着 ----------
function showEnding() {
  const v = V();
  const box = h('div', { class: 'story' });
  const tail = h('div', {});
  if (game.vMustAbort()) {
    screen(h('p', { class: 'stage-no' }, '航海の終わり'), box, tail);
    playLines(box, ABORT_LINES, () => tail.appendChild(h('button', { class: 'btn primary', style: { marginTop: '16px' }, onclick: () => { game.vAbort(); showDone(); } }, '結末へ')));
    return;
  }
  screen(h('p', { class: 'stage-no' }, '到着'), box, tail);
  const e = endCtx(v);
  playLines(box, arrivalLines(e), () => reportForm(tail));
}

function reportForm(tail: HTMLElement) {
  const v = V();
  const e = endCtx(v);
  const att = attachments(e);
  let choice: ReportChoice | null = null;
  const picked = new Set<string>();
  const attBox = h('div', { style: { display: 'none' } },
    h('p', { class: 'small muted', style: { margin: '8px 0 4px' } }, '添えるもの'),
    att.length ? att.map((a) => h('label', { class: 'radio' }, h('input', { type: 'checkbox', onchange: (ev: any) => { if (ev.target.checked) picked.add(a.id); else picked.delete(a.id); } }),
      h('span', {}, h('b', {}, a.label), h('span', { class: 'small muted' }, '　' + a.desc)))) : h('p', { class: 'small muted' }, '添えられるものはない。'));
  const opts: [ReportChoice, string, string][] = [
    ['truth', '実測値のまま署名して送る', '第二次入植団の出発は勧められない、と書く。'],
    ['conditional', '「条件付きで出発可」と書いて送る', '温室を増やせば、という条件をつける。'],
    ['wait', '本社の承認を待つ', '命令書に従い、送信は本社の判断に任せる。'],
  ];
  const sign = h('button', { class: 'btn primary', disabled: true, style: { marginTop: '12px' }, onclick: () => {
    if (!choice) return;
    const c = choice;
    confirmSheet('報告書に署名する', '署名すると、結末が決まります。', '署名する', () => {
      tail.remove();
      const box = document.querySelector('.story') as HTMLElement;
      const b = c === 'truth' ? sendBlocked(e) : { blocked: false, lines: [] };
      game.vFinish(c, [...picked], b.blocked);
      playLines(box, [{ who: 'narr', text: '船長は、署名欄に名前を書いた。' }, ...b.lines], () => {
        const btn = h('button', { class: 'btn primary', style: { marginTop: '16px' }, onclick: () => showDone() }, 'その後');
        box.parentElement!.appendChild(btn);
      });
    });
  } }) as HTMLButtonElement;
  sign.textContent = '署名する';
  tail.appendChild(h('div', { class: 'card' },
    h('h3', {}, '報告書'),
    opts.map(([id, l, d]) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'rep', onchange: () => { choice = id; sign.disabled = false; attBox.style.display = id === 'truth' ? '' : 'none'; } }),
      h('span', {}, h('b', {}, l), h('span', { class: 'small muted' }, '　' + d)))),
    attBox, sign));
  tail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDone() {
  const v = V();
  const end = v.ending;
  if (!end) return showEnding();
  const e = endCtx(v);
  const lines = end.kind === 'lost' ? LOST_LINES : end.kind === 'abort' ? ABORT_LINES : outcomeLines(end.choice, end.attach, end.blocked);
  const sc = scoreVoyage(v, end.kind === 'report' ? end.choice : null, end.attach, end.blocked);
  const sent = end.kind === 'report' && end.choice === 'truth' && !end.blocked;
  screen(
    h('p', { class: 'stage-no' }, 'その後'),
    h('div', { class: 'story' }, lines.map((l) => lineEl(l))),
    end.kind !== 'lost' ? h('div', { class: 'card' }, h('h3', {}, '乗員のその後'),
      CREW8.map((s) => h('div', { class: 'dl', style: { margin: '8px 0' } },
        h('img', { class: 'face', src: portraitURL(s.look, 2), alt: '', style: vc(v, s.id).alive ? {} : { filter: 'grayscale(1)', opacity: '0.5' } }),
        h('div', { class: 'small' }, crewEpilogue(s.id, e, end.choice, sent))))) : null,
    h('div', { class: 'card' },
      h('h3', {}, '航海の評価'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } }, h('div', { class: 'rank' }, sc.rank), h('div', { class: 'small muted' }, `${sc.score}点 ／ 140点`)),
      sc.parts.map(([l, n, m]) => h('div', { class: 'res-row' }, h('span', {}, l), h('span', {}, `${n} / ${m}`))),
      h('h3', { style: { marginTop: '10px' } }, '事件'),
      v.results.map((r, i) => h('div', { class: 'res-row small' }, h('span', {}, `第${i + 1}話　${r.title}`), h('span', {}, r.grade)))),
    h('button', { class: 'btn primary', onclick: () => nav.title() }, 'タイトルへ'),
  );
}
