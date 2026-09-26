import { game } from './game';
import { h, clear, openSheet, closeSheet, sheetOpen, confirmSheet } from './dom';
import type { ViewModel, CrewView, LogView } from '../view/view';
import { drawMap, hitCrew } from '../render/map';
import { portraitURL } from '../render/sprites';
import { play, unlockAudio } from './sfx';
import { renderBoard } from './board';
import { renderHypothesis, resetDraft } from './hypo';
import { renderResult } from './result';
import { exportVoyage, importVoyage, loadVoyage } from '../save/save';
import { openVoyage, rosterSheet } from './voyage_ui';
import { STAGES } from '../voyage/story';
import type { CrewId, Policy, RoomId } from '../core/types';

type Tab = 'ship' | 'crew' | 'log' | 'board' | 'hypo';
const ui = {
  screen: 'title' as 'title' | 'briefing' | 'play' | 'result',
  tab: 'ship' as Tab,
  selected: null as string | null,
  pause: null as string | null,
  logFilter: 'all',
  v: null as ViewModel | null,
  anim: 0,
  autoRunAfterSubmit: false,
};

const root = () => document.getElementById('app')!;

export function start() {
  document.addEventListener('pointerdown', () => unlockAudio(), { once: false, passive: true });
  game.subscribe((v, ev) => onUpdate(v, ev));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { game.setRunning(false); game.persist(); }
  });
  showTitle();
}

function syncCanRun() {
  game.canRun = ui.screen === 'play' && ui.tab === 'ship' && !sheetOpen();
}

function sheet(content: HTMLElement) {
  openSheet(content, () => { syncCanRun(); if (ui.v && ui.screen === 'play') renderTab(ui.v); });
  syncCanRun();
}

// ---------------- タイトル ----------------
function showTitle() {
  ui.screen = 'title';
  cancelAnimationFrame(ui.anim);
  const r = root();
  clear(r);
  const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const faces = [
    { skin: 1, hair: 3, hairStyle: 1, suit: 0, eyes: 0 }, { skin: 0, hair: 1, hairStyle: 2, suit: 2, eyes: 1 },
    { skin: 2, hair: 0, hairStyle: 0, suit: 1, eyes: 0 }, { skin: 3, hair: 2, hairStyle: 3, suit: 3, eyes: 1 },
  ];
  r.appendChild(h('div', { class: 'screen title-screen' },
    h('h1', { class: 'logo' }, '宇宙船ミステリー', h('small', {}, `仮題 ／ 試作版（事件 ${game.cases().length} 種）`)),
    h('div', { style: { display: 'flex', gap: '8px' } }, faces.map((f) => h('img', { class: 'portrait', src: portraitURL(f, 4), width: 72, height: 72, alt: '' }))),
    h('p', { class: 'muted' }, 'あなたは調査船の船長。司令室から乗員に方針を与え、届いた報告と証拠から原因を突き止める。'),
    game.hasCampaign() ? h('button', { class: 'btn primary', onclick: () => goVoyage() }, `航海を続ける（${voyageWhere()}）`) : null,
    h('button', { class: 'btn' + (game.hasCampaign() ? '' : ' primary'), onclick: () => newVoyageSheet() }, '新しい航海を始める'),
    h('h3', { class: 'small muted', style: { margin: '10px 0 0' } }, '単発の事件（乗員は毎回変わる）'),
    game.hasSnapshot() ? h('button', { class: 'btn', onclick: () => { if (game.resume()) enterPlay(); } }, '単発の事件の続きから') : null,
    h('button', { class: 'btn', onclick: () => startNew() }, '新しい事件（ランダム）'),
    h('button', { class: 'btn', onclick: () => chooseSheet() }, '事件を選ぶ／事件番号で始める'),
    h('button', { class: 'btn', onclick: () => settingsSheet() }, '設定・事件記録'),
    !standalone && isIOS ? h('div', { class: 'hint' }, 'iPhoneでは、共有ボタンから「ホーム画面に追加」してから遊ぶと、オフラインでも起動でき、保存データも消えにくくなります。') : null,
    !standalone && !isIOS ? h('div', { class: 'hint' }, '一度読み込めばオフラインでも遊べます。保存はこの端末のこのブラウザ内だけです。') : null,
  ));
}

// ---------------- 航海モード ----------------
const voyageNav = { title: () => { game.quit(); showTitle(); }, briefing: () => { resetDraft(); enterPlay(); } };
function goVoyage() { ui.screen = 'title'; cancelAnimationFrame(ui.anim); openVoyage(voyageNav); }
function voyageWhere(): string {
  const v = game.campaign!;
  if (v.phase === 'prologue' || v.phase === 'dinner') return 'プロローグ';
  if (v.phase === 'ending') return '到着';
  return v.phase === 'case' ? `第${v.stage + 1}話の途中` : `第${v.stage + 1}話の前`;
}
function newVoyageSheet() {
  const inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: '空欄ならランダム' }) as HTMLInputElement;
  const go = () => {
    const n = inp.value.trim() ? Number(inp.value.replace(/[^0-9]/g, '')) >>> 0 : undefined;
    closeSheet();
    game.newCampaign(n);
    goVoyage();
  };
  sheet(h('div', {},
    h('h2', {}, '新しい航海'),
    h('p', { class: 'small' }, '調査船〈ケストレル〉で、建設中の入植地がある惑星〈ハース〉へ向かう、62日の航海。途中で5つの事件が起きる。乗員8人は航海を通して同じ顔ぶれで、死んだ乗員は戻らない。'),
    h('p', { class: 'small muted' }, '航海番号を入れると、同じ事件の並びで遊べる（事件の中身は選択によって変わる）。'),
    inp,
    game.hasCampaign() ? h('p', { class: 'small', style: { color: 'var(--warn)' } }, '進行中の航海は消えます。') : null,
    h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: go }, '出港の準備をする')));
}

// 事件の生成は検証つきで少し時間がかかるので、表示を出してから行う
function startNew(templateId?: string, seed?: number) {
  const go = () => {
    const r = root();
    clear(r);
    r.appendChild(h('div', { class: 'screen title-screen' }, h('p', { class: 'muted' }, '事件を組み立てて、辻褄を確かめています…')));
    setTimeout(() => {
      try { game.newGame(seed, templateId); resetDraft(); showBriefing(); }
      catch (e) { showTitle(); confirmSheet('事件を作れなかった', String((e as Error).message), 'わかった', () => {}); }
    }, 30);
  };
  if (game.hasSnapshot()) confirmSheet('新しい事件', '事件中の続きは消えます。よろしいですか。', '始める', go, true);
  else go();
}

function chooseSheet() {
  const inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: '例：03-123456789' }) as HTMLInputElement;
  const msg = h('p', { class: 'small muted' });
  sheet(h('div', {},
    h('h2', {}, '事件を選ぶ'),
    h('p', { class: 'small muted' }, '題名だけを見て選べます。登場人物や関係者、時刻などの細部は毎回変わります。'),
    h('div', { style: { display: 'grid', gap: '6px' } }, game.cases().map((c, i) => h('button', { class: 'opt', onclick: () => { closeSheet(); startNew(c.id); } }, `${String(i + 1).padStart(2, '0')}　${c.title}`))),
    h('h2', { style: { marginTop: '16px' } }, '事件番号で始める'),
    h('p', { class: 'small muted' }, '友人と同じ事件を遊ぶときは、ブリーフィングに出る事件番号を伝えてください。'),
    inp,
    h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: () => {
      const p = game.parseCode(inp.value);
      if (!p) { msg.textContent = '「03-123456789」の形で入力してください。'; return; }
      closeSheet();
      startNew(p.templateId, p.seed);
    } }, 'この番号で始める'),
    msg));
}

function settingsSheet() {
  const s = game.settings;
  const voyage = loadVoyage();
  const ta = h('textarea', { placeholder: '書き出した事件記録をここに貼り付けて読み込む' }) as HTMLTextAreaElement;
  const msg = h('p', { class: 'small muted' });
  sheet(h('div', {},
    h('h2', {}, '設定'),
    h('label', { class: 'toggle' }, '効果音', h('input', { type: 'checkbox', checked: s.sound, onchange: (e: any) => { s.sound = e.target.checked; game.saveSettings(); } })),
    h('label', { class: 'toggle' }, '演出を控えめにする（振動・点滅なし）', h('input', { type: 'checkbox', checked: s.reduceEffects, onchange: (e: any) => { s.reduceEffects = e.target.checked; game.saveSettings(); } })),
    h('h2', { style: { marginTop: '16px' } }, '事件記録'),
    h('p', { class: 'small muted' }, '事件を終えたときに保存した記録です。保存先はこの端末のこのブラウザだけなので、端末やブラウザを変えると引き継がれません。移すときは書き出して、移行先で読み込んでください。'),
    voyage ? h('div', { class: 'card small' }, voyage.cases.map((c) => h('div', {}, `${c.title}：${c.grade}（生存 ${c.crew.filter((x) => x.alive).length}/${c.crew.length}、船体 ${c.hull}）`))) : h('p', { class: 'small' }, 'まだ記録はありません。'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', disabled: !voyage, onclick: async () => {
        const t = exportVoyage();
        if (!t) return;
        ta.value = t;
        try { await navigator.clipboard.writeText(t); msg.textContent = 'クリップボードにコピーしました。'; } catch { msg.textContent = '下の欄の文字列をコピーして保管してください。'; }
      } }, '書き出す'),
      h('button', { class: 'btn small', onclick: () => {
        msg.textContent = importVoyage(ta.value) ? '読み込みました。' : '読み込めませんでした。書き出した文字列をそのまま貼り付けてください。';
      } }, '読み込む')),
    msg, ta,
    h('p', { class: 'small muted' }, '事件の途中経過は自動で保存され、「続きから」で再開できます。途中の地点に戻ることはできません。'),
  ));
}

// ---------------- ブリーフィング ----------------
function showBriefing() {
  ui.screen = 'briefing';
  const v = game.view()!;
  const r = root();
  clear(r);
  const voy = game.inVoyage ? game.campaign : null;
  r.appendChild(h('div', { class: 'screen' },
    h('p', { class: 'muted small' }, voy ? `第${voy.stage + 1}話　出港${STAGES[voy.stage].day}日目` : 'ブリーフィング'),
    h('h1', { style: { margin: '0 0 4px', fontSize: '24px' } }, `事件：${v.title}`),
    voy ? h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, game.vCaseLabel())
      : h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, `事件番号 ${game.caseCode()}（友人に伝えると同じ事件を遊べる）`),
    voy && game.caseNote ? h('div', { class: 'hint' }, game.caseNote) : null,
    h('div', { class: 'card' }, v.briefing.map((b) => h('p', { style: { margin: '4px 0' } }, b))),
    h('h3', {}, '乗員'),
    h('p', { class: 'small muted' }, voy ? '死亡・拘束中の乗員は、この事件には出てこない。' : '技能や性格は最初は分からない。仕事ぶりや会話から見えてくる。'),
    v.crew.map((c) => h('div', { class: 'crew-row' },
      h('img', { src: portraitURL(c.look), alt: '' }),
      h('div', { class: 'body' }, h('div', { class: 'name' }, `${c.name}　${c.role}`), h('div', { class: 'small muted' }, `経歴：${c.history}`), h('div', { class: 'small' }, `作業着：${SUIT_WORD[c.look.suit]}　現在地：${c.roomName ?? '通信断で不明'}`)))),
    h('div', { class: 'card small' },
      h('b', {}, '操作のしかた'),
      h('p', { style: { margin: '4px 0' } }, '・乗員をタップして方針を与える。方針は変えるまで続く。'),
      h('p', { style: { margin: '4px 0' } }, '・▶で時間が進む。船内の画面以外（乗員・記録・メモ・仮説）を開いている間は止まる。'),
      h('p', { style: { margin: '4px 0' } }, '・通信断の区画にいる乗員の様子は分からない。戻ってきたときに経過を報告する。'),
      h('p', { style: { margin: '4px 0' } }, '・「メモ」は考えを整理する自由なメモ帳。証拠を並べて線を引いたり、自分のメモを貼ったりできる。採点には使わない。答え合わせは「仮説」で提出した結果でだけ分かる。')),
    h('button', { class: 'btn primary', onclick: () => { game.dispatch({ type: 'begin' }); enterPlay(); } }, '司令室へ'),
  ));
}

// ---------------- プレイ画面 ----------------
let hud: { clock: HTMLElement; play: HTMLButtonElement; speed: HTMLButtonElement; meters: HTMLElement } | null = null;
let mainEl: HTMLElement | null = null;
let tabsEl: HTMLElement | null = null;

function enterPlay() {
  const v = game.view();
  if (!v) return;
  if (v.phase === 'briefing') { showBriefing(); return; }
  if (v.phase === 'ended') { showResult(); return; }
  ui.screen = 'play';
  const r = root();
  clear(r);
  const clock = h('div', { class: 'clock' });
  const playBtn = h('button', { class: 'playbtn', onclick: () => { play('tap'); game.setRunning(!game.running); } }) as HTMLButtonElement;
  const speed = h('button', { class: 'speed', 'aria-label': '速度', onclick: () => game.setSpeed(game.settings.speed % 3 + 1) }) as HTMLButtonElement;
  const menu = h('button', { class: 'speed', 'aria-label': 'メニュー', onclick: () => menuSheet() }, '≡');
  const meters = h('div', { class: 'meters' });
  const hudEl = h('div', { class: 'hud' }, h('div', { class: 'hud-top' }, clock, h('div', { class: 'spacer' }), playBtn, speed, menu), meters);
  mainEl = h('div', { class: 'main' });
  tabsEl = h('nav', { class: 'tabs' });
  r.append(hudEl, mainEl, tabsEl);
  hud = { clock, play: playBtn, speed, meters };
  renderTabs(v);
  updateHud(v);
  renderTab(v);
  syncCanRun();
  animate();
}

function menuSheet() {
  const st = game.view()!.stores;
  sheet(h('div', {},
    h('h2', {}, 'メニュー'),
    h('div', { class: 'card small' },
      h('b', {}, '船の備蓄'),
      h('div', {}, `食料 ${st.food}%　士気 ${st.morale}%`),
      h('div', {}, `医療品 ${st.medkits}　予備部品 ${st.spareParts}　消火器 ${st.extinguishers}`),
      h('div', { class: 'muted' }, '試作版では事件中に増減しない。事件の合間の配分で使う予定。')),
    h('div', { style: { display: 'grid', gap: '8px' } },
      game.inVoyage ? h('button', { class: 'btn', onclick: () => { closeSheet(); rosterSheet(); } }, '乗員名簿と分かったこと') : null,
      h('button', { class: 'btn', onclick: () => { closeSheet(); settingsSheet(); } }, '設定・事件記録'),
      h('button', { class: 'btn', onclick: () => { closeSheet(); game.quit(); showTitle(); } }, 'タイトルへ（続きは保存されます）'))));
}

function meter(label: string, value: number, main: string, cls: string, sub?: string) {
  return h('div', { class: 'meter ' + cls }, label, h('b', {}, main), h('div', { class: 'bar' }, h('i', { style: { width: Math.max(0, Math.min(100, value)) + '%' } })), sub ? h('span', { class: 'sub' }, sub) : null);
}

function updateHud(v: ViewModel) {
  if (!hud) return;
  hud.clock.textContent = v.clock;
  hud.play.textContent = game.running ? '⏸ 停止' : '▶ 進行';
  hud.play.classList.toggle('on', game.running);
  hud.speed.textContent = '×' + game.settings.speed;
  clear(hud.meters);
  hud.meters.append(
    ...v.meters.map((m) => meter(m.label, m.value, m.text, m.level, m.sub)),
  );
}

function renderTabs(v: ViewModel) {
  if (!tabsEl) return;
  clear(tabsEl);
  const items: [Tab, string, string, number][] = [
    ['ship', '▦', '船内', v.openConfirms.length + v.pendingNotices.length],
    ['crew', '☺', '乗員', 0],
    ['log', '✉', '記録', v.unread],
    ['board', '◈', 'メモ', 0],
    ['hypo', '✎', '仮説', 0],
  ];
  for (const [id, ic, label, badge] of items) {
    tabsEl.appendChild(h('button', { class: ui.tab === id ? 'on' : '', onclick: () => switchTab(id), 'aria-label': label },
      h('span', { class: 'ic' }, ic), label, badge ? h('span', { class: 'badge' }, badge > 99 ? '99+' : badge) : null));
  }
}

function switchTab(t: Tab) {
  ui.tab = t;
  syncCanRun();
  const v = game.view()!;
  if (t === 'log') game.markRead();
  if (t === 'ship' && ui.autoRunAfterSubmit) { ui.autoRunAfterSubmit = false; game.setRunning(true); }
  renderTabs(game.view()!);
  renderTab(v);
  mainEl?.scrollTo(0, 0);
}

let canvas: HTMLCanvasElement | null = null;

function renderTab(v: ViewModel) {
  if (!mainEl) return;
  clear(mainEl);
  canvas = null;
  switch (ui.tab) {
    case 'ship': renderShip(v); break;
    case 'crew': renderCrew(v); break;
    case 'log': renderLog(v); break;
    case 'board': mainEl.appendChild(renderBoard(v, (id) => evidenceSheet(v, id))); break;
    case 'hypo': mainEl.appendChild(renderHypothesis(v, {
      submit: (hyp) => { game.submit(hyp); ui.autoRunAfterSubmit = true; switchTab('ship'); },
      close: () => confirmSheet(v.resolved ? '事件を締めくくる' : '調査を打ち切る',
        v.resolved ? '最後に提出した仮説で事件を確定します。' : '危機はまだ続いています。最後に提出した仮説で事件を確定し、調査を打ち切ります。',
        '確定する', () => game.abandon(), !v.resolved),
    })); break;
  }
}

let shipDyn: HTMLElement | null = null;

function renderShip(v: ViewModel) {
  const wrap = h('div', {});
  shipDyn = h('div', {});
  canvas = h('canvas', { id: 'map', 'aria-label': '船内見取り図。乗員をタップすると方針を与えられる' }) as HTMLCanvasElement;
  canvas.addEventListener('click', (e) => {
    const id = hitCrew(canvas!, ui.v!, e.clientX, e.clientY);
    if (id) { ui.selected = id; crewSheet(id as CrewId); }
  });
  wrap.append(shipDyn, h('div', { class: 'mapwrap' }, canvas));
  const below = h('div', { id: 'below' });
  wrap.append(below);
  mainEl!.appendChild(wrap);
  updateShipDyn(v);
  drawMap(canvas, v, performance.now(), ui.selected, game.settings.reduceEffects);
}

function updateShipDyn(v: ViewModel) {
  if (!shipDyn) return;
  clear(shipDyn);
  if (ui.pause && !game.running) {
    shipDyn.appendChild(h('div', { class: 'pausebar' }, h('span', {}, '⏸'), h('span', { class: 'grow' }, ui.pause),
      h('button', { class: 'btn small', onclick: () => switchTab('log') }, '記録を見る')));
  }
  for (const c of v.openConfirms) shipDyn.appendChild(confirmCard(c));
  for (const n of v.pendingNotices) {
    shipDyn.appendChild(h('div', { class: 'card' },
      h('h3', {}, `${n.name}と通信が戻った`),
      h('p', { class: 'small', style: { margin: '0 0 8px' } }, `通信断の間に保留した指示「${n.policy}」があります。いまの状況で適用しますか。`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => game.dispatch({ type: 'resolvePending', crew: n.crew, apply: false }) }, '破棄する'),
        h('button', { class: 'btn small primary', onclick: () => game.dispatch({ type: 'resolvePending', crew: n.crew, apply: true }) }, '適用する'))));
  }
  const below = document.getElementById('below');
  if (below) {
    clear(below);
    if (v.plans.length) {
      below.appendChild(h('div', { class: 'card small' }, h('b', {}, '作戦'), v.plans.slice(-2).map((p) => h('div', {}, `${p.label}：${p.status}${p.who ? `（${p.who}）` : ''}`))));
    }
    const recent = [...v.log].reverse().slice(0, 4);
    below.appendChild(h('div', { class: 'card ticker' },
      h('div', { class: 'small muted' }, '最新の記録'),
      recent.map((l) => h('div', { class: 'item' }, h('span', { class: 'muted small' }, l.deliveredClock + ' '), l.delayed ? h('span', { class: 'tag delayed' }, '通信断中') : null, ' ', l.crewName ? `${l.crewName}：` : '', l.text))));
    if (v.elapsedMin < 1 && !v.log.some((l) => l.kind === 'order' && l.crew)) {
      below.appendChild(h('div', { class: 'hint' }, '見取り図の乗員か「乗員」タブから方針を与え、上の ▶進行 で時間を進めてください。'));
    }
  }
}

function confirmCard(c: LogView) {
  return h('div', { class: 'card' },
    h('h3', {}, `${c.crewName}から確認要請`),
    h('p', { class: 'small', style: { margin: '0 0 8px' } }, c.text),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => game.answer(c.id, false) }, '許可しない'),
      h('button', { class: 'btn small primary', onclick: () => game.answer(c.id, true) }, '許可する')));
}

function animate() {
  cancelAnimationFrame(ui.anim);
  let last = 0;
  const f = (t: number) => {
    if (ui.screen !== 'play') return;
    if (canvas && ui.v && t - last > 66) { last = t; drawMap(canvas, ui.v, t, ui.selected, game.settings.reduceEffects); }
    ui.anim = requestAnimationFrame(f);
  };
  ui.anim = requestAnimationFrame(f);
}

// ---------------- 更新 ----------------
function onUpdate(v: ViewModel, ev: { pause: string | null; sfx: string[]; ticked: boolean }) {
  ui.v = v;
  if (ui.screen !== 'play') return;
  if (v.phase === 'ended') { ui.screen = 'result'; game.running = false; showResult(); return; }
  if (ev.pause) ui.pause = ev.pause;
  if (game.running) ui.pause = null;
  if (game.settings.sound) for (const k of new Set(ev.sfx)) play(k);
  if (ev.sfx.includes('alarm') && !game.settings.reduceEffects) {
    document.body.classList.remove('shake', 'flash');
    void document.body.offsetWidth;
    document.body.classList.add('shake', 'flash');
    if (navigator.vibrate) navigator.vibrate(200);
  }
  updateHud(v);
  renderTabs(v);
  if (ui.tab === 'ship') updateShipDyn(v);
  else if (!ev.ticked && !sheetOpen()) renderTab(v);
  if (ui.tab === 'log') game.markRead();
}

// ---------------- 乗員 ----------------
function statusLine(c: CrewView) {
  if (c.dead) return h('div', { class: 'status-line dead' }, '生体反応なし');
  if (!c.visible) return h('div', { class: 'status-line nocomm' }, `通信断・情報なし（最後の確認：${c.lastSeen}）`);
  return h('div', { class: 'status-line' }, `${c.roomName}：${c.activity}`);
}

function renderCrew(v: ViewModel) {
  mainEl!.appendChild(h('p', { class: 'small muted', style: { margin: '0 0 8px' } }, '乗員を選んで方針を与える。通信断の乗員には指示が届かない。'));
  for (const c of v.crew) {
    mainEl!.appendChild(h('button', { class: 'crew-row', onclick: () => crewSheet(c.id) },
      h('img', { src: portraitURL(c.look), alt: '' }),
      h('div', { class: 'body' },
        h('div', { class: 'name' }, `${c.name}　`, h('span', { class: 'small muted' }, c.role)),
        statusLine(c),
        h('div', { class: 'small muted' }, `方針：${c.policy}${c.pending ? `（保留：${c.pending}）` : ''}`),
        h('div', { class: 'hbar' + (c.health < 50 ? ' low' : '') }, h('i', { style: { width: c.health + '%' } })))));
  }
}

function crewSheet(id: CrewId) {
  const v = game.view()!;
  const c = v.crew.find((x) => x.id === id)!;
  const reachable = c.visible && !c.dead;
  const body = h('div', {});
  const setP = (p: Policy) => { game.setPolicy(id, p); closeSheet(); };
  const roomPicker = (kind: 'investigate' | 'guard') => {
    clear(body);
    body.append(h('h2', {}, kind === 'investigate' ? 'どこを調べるか' : 'どこを警備するか'),
      h('div', { class: 'opt-grid' }, v.rooms.map((r) => h('button', { class: 'opt', onclick: () => setP({ kind, room: r.id as RoomId }) }, r.name))));
  };
  const opts: [string, string, () => void][] = [
    ['待機', '今いる場所で待つ', () => setP({ kind: 'standby' })],
    [v.respond.label, v.respond.desc, () => setP({ kind: 'respond' })],
    ['区画を調査', '指定した区画で記録や痕跡を探す', () => roomPicker('investigate')],
    ['通信中継器を復旧', '機関区の中継器をつなぎ直す', () => setP({ kind: 'repairRelay' })],
    ['負傷者を救護', '負傷者のもとへ行き手当てする', () => setP({ kind: 'medical' })],
    ['区画を警備', '指定した区画にとどまる', () => roomPicker('guard')],
  ];
  const skills = `整備：${c.skills.mech}　医療：${c.skills.med}　調査：${c.skills.inv}`;
  body.appendChild(h('div', {},
    h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
      h('img', { class: 'portrait', src: portraitURL(c.look), width: 96, height: 96, alt: '' }),
      h('div', {}, h('h2', { style: { margin: 0 } }, c.name), h('div', { class: 'muted' }, c.role), h('div', { class: 'small muted' }, `経歴：${c.history}`))),
    h('dl', { class: 'kv', style: { marginTop: '10px' } },
      h('dt', {}, '状況'), h('dd', {}, statusLine(c)),
      h('dt', {}, '健康'), h('dd', {}, c.dead ? '—' : `${c.health}%${c.healthLive ? '' : '（最後の確認時）'}`),
      h('dt', {}, '作業着'), h('dd', {}, SUIT_WORD[c.look.suit] ?? '—'),
      h('dt', {}, '信頼'), h('dd', {}, trustWord(c.trust)),
      h('dt', {}, '技能'), h('dd', {}, skills),
      h('dt', {}, '方針'), h('dd', {}, c.policy + (c.pending ? `（保留中：${c.pending}）` : ''))),
    c.detained ? h('p', { class: 'small muted' }, '拘束中のため指示できない。') : null,
    !c.dead && !c.detained ? [
      h('h3', { style: { margin: '14px 0 6px' } }, reachable ? '方針を与える' : '方針を与える（通信断：通信が戻るまで保留）'),
      h('div', { class: 'opt-grid' }, opts.map(([t, d, fn]) => h('button', { class: 'opt', onclick: fn }, h('b', {}, t), h('div', { class: 'small muted' }, d)))),
      h('h3', { style: { margin: '14px 0 6px' } }, '話す'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', disabled: !reachable, onclick: () => { game.talk(id); closeSheet(); switchTab('log'); } }, '話を聞く'),
        h('button', { class: 'btn small', disabled: !reachable || v.evidence.length < 2, onclick: () => confrontPicker(v, id) }, '証拠を突きつける')),
      !reachable ? h('p', { class: 'small muted' }, '通信断のため話せない。') : null,
    ] : null,
  ));
  sheet(body);
}

const SUIT_WORD = ['橙色', '青', '白', '緑'];

function trustWord(t: number) {
  return t >= 75 ? '厚い' : t >= 55 ? 'ふつう' : t >= 35 ? '揺らいでいる' : '低い';
}

function confrontPicker(v: ViewModel, id: CrewId) {
  const c = v.crew.find((x) => x.id === id)!;
  sheet(h('div', {},
    h('h2', {}, `${c.name}に突きつける証拠`),
    h('p', { class: 'small muted' }, '見当違いの追及は信頼を損なう。'),
    v.evidence.filter((e) => e.id !== 'alarm').map((e) => h('button', { class: 'opt', style: { width: '100%', marginBottom: '6px' }, onclick: () => { game.confront(id, e.id); closeSheet(); switchTab('log'); } },
      h('b', {}, e.title), h('div', { class: 'small muted' }, e.text)))));
}

// ---------------- 記録 ----------------
function renderLog(v: ViewModel) {
  const filters: [string, string][] = [['all', 'すべて'], ['report', '報告'], ['delayed', '通信断中'], ['testimony', '証言'], ['danger', '警報'], ['order', '指示']];
  mainEl!.appendChild(h('div', { class: 'filters' }, filters.map(([k, l]) => h('button', { class: ui.logFilter === k ? 'on' : '', onclick: () => { ui.logFilter = k; renderTab(game.view()!); } }, l))));
  for (const c of v.openConfirms) mainEl!.appendChild(confirmCard(c));
  const list = [...v.log].reverse().filter((l) => {
    switch (ui.logFilter) {
      case 'report': return l.kind === 'report' || l.kind === 'autonomy' || l.kind === 'confirm';
      case 'delayed': return l.delayed;
      case 'testimony': return l.kind === 'testimony';
      case 'danger': return l.kind === 'danger';
      case 'order': return l.kind === 'order';
    }
    return true;
  });
  if (!list.length) mainEl!.appendChild(h('p', { class: 'muted' }, '該当する記録はない。'));
  for (const l of list) mainEl!.appendChild(logItem(v, l));
}

function logItem(v: ViewModel, l: LogView) {
  const c = l.crew ? v.crew.find((x) => x.id === l.crew) : null;
  const face = c ? h('img', { class: 'face', src: portraitURL(c.look, 2), alt: '' }) : h('div', { class: 'face' }, l.kind === 'danger' ? '⚠' : l.kind === 'order' ? '➤' : '▣');
  const tags = [
    l.delayed ? h('span', { class: 'tag delayed' }, `通信断中（${l.clock}の出来事）`) : null,
    l.kind === 'danger' ? h('span', { class: 'tag danger' }, '警報') : null,
    l.kind === 'confirm' ? h('span', { class: 'tag confirm' }, l.answered ? '確認（回答済み）' : '確認要請') : null,
    l.kind === 'autonomy' ? h('span', { class: 'tag auto' }, '独自判断') : null,
    l.kind === 'testimony' ? h('span', { class: 'tag' }, '会話') : null,
  ];
  return h('div', { class: 'log-item' }, face,
    h('div', { class: 'body' },
      h('div', { class: 'log-meta' }, h('span', {}, `${l.deliveredClock}${l.crewName ? '　' + l.crewName : ''}`), tags),
      h('div', {}, l.text),
      l.reason ? h('div', { class: 'reason' }, `判断の理由：${l.reason}`) : null,
      l.evidence?.length ? h('div', {}, l.evidence.map((id) => h('span', { class: 'chip', onclick: () => evidenceSheet(v, id) }, '◈ ' + (v.evidence.find((e) => e.id === id)?.title ?? id)))) : null,
    ));
}

function evidenceSheet(v: ViewModel, id: string) {
  const e = v.evidence.find((x) => x.id === id);
  if (!e) return;
  sheet(h('div', {}, h('p', { class: 'small muted', style: { margin: 0 } }, e.sourceLabel), h('h2', {}, e.title), h('p', {}, e.text)));
}

// ---------------- 結果 ----------------
function showResult() {
  ui.screen = 'result';
  cancelAnimationFrame(ui.anim);
  closeSheet();
  const v = game.view()!;
  const r = root();
  clear(r);
  r.appendChild(renderResult(v, {
    save: () => game.saveVoyage(),
    saved: () => game.voyageSaved,
    title: () => { game.quit(); showTitle(); },
    voyage: game.inVoyage ? () => { game.quit(); goVoyage(); } : undefined,
  }));
}
