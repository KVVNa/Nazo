// ゲームの進行役。UI はここから ViewModel を受け取り、操作を送るだけ。GameState 自体は外に出さない。
import type { Action, CrewId, EvidenceId, Hypothesis, Policy } from '../core/types';
import type { GameState } from '../core/types';
import { generateCase } from '../gen/generate';
import { TEMPLATES } from '../gen/registry';
import { applyAction, step, type StepResult } from '../sim/sim';
import { buildView, type ViewModel } from '../view/view';
import { clearSnapshot, loadSnapshot, saveSnapshot, saveVoyageCase, loadSettings, saveSettings, type Settings, saveCampaign, loadCampaign, clearCampaign } from '../save/save';
import { evaluateCase } from '../judge/judge';
import {
  newVoyage, prepareCase, applyCaseResult, answerDinner, talk as vTalk, treat as vTreat, setConfined, leaveInterlude,
  finishReport, finishAbort, mustAbort, migrateVoyage, repair as vRepair, rest as vRest, type VoyageState,
} from '../voyage/voyage';
import type { ReportChoice } from '../voyage/ending';

type Listener = (v: ViewModel, ev: { pause: string | null; sfx: string[]; ticked: boolean }) => void;

const TICKS_PER_SEC = [0, 2, 4, 8];

class Game {
  private s: GameState | null = null;
  private listeners: Listener[] = [];
  private raf = 0;
  private acc = 0;
  private last = 0;
  running = false;
  canRun = true; // 地図を見ているときだけ true（ボードやメニューでは止まる）
  settings: Settings = loadSettings();
  voyageSaved = false;
  campaign: VoyageState | null = (() => { const c = loadCampaign<VoyageState>(); return c ? migrateVoyage(c) : null; })();
  caseNote: string | null = null; // 航海モード：会話で防いだ事件などの一言

  hasSnapshot(): boolean { return !!loadSnapshot(); }
  get inVoyage() { return !!this.s?.fixed; }

  // 事件一覧（題名だけ。原因の種類は見せない）
  cases(): { id: string; title: string }[] { return TEMPLATES.map((t) => ({ id: t.id, title: t.title })); }

  // 事件番号：「テンプレート番号-シード」。友人と同じ事件を遊ぶのに使う
  caseCode(): string {
    if (!this.s) return '';
    const i = TEMPLATES.findIndex((t) => t.id === this.s!.templateId);
    return `${String(i + 1).padStart(2, '0')}-${this.s.seed}`;
  }
  parseCode(code: string): { seed: number; templateId: string } | null {
    const m = code.trim().match(/^(\d{1,2})\s*[-ー－]\s*(\d{1,10})$/);
    if (!m) return null;
    const t = TEMPLATES[Number(m[1]) - 1];
    return t ? { seed: Number(m[2]) >>> 0, templateId: t.id } : null;
  }

  newGame(seed = Math.floor(Math.random() * 1e9), templateId?: string) {
    this.s = generateCase(seed, templateId);
    this.voyageSaved = false;
    this.running = false;
    this.emit(null, []);
  }

  // ---------------- 航海モード ----------------
  hasCampaign(): boolean { return !!this.campaign && this.campaign.phase !== 'done'; }
  newCampaign(seed?: number) {
    clearCampaign();
    this.campaign = newVoyage(seed);
    this.saveCamp();
  }
  saveCamp() { if (this.campaign) saveCampaign(this.campaign); }
  dropCampaign() { clearCampaign(); this.campaign = null; }
  vSetPhase(p: VoyageState['phase']) { if (!this.campaign) return; this.campaign.phase = p; this.saveCamp(); }
  vAnswerDinner(id: string, i: number) { if (!this.campaign) return; answerDinner(this.campaign, id, i); this.saveCamp(); }
  // 次の事件を組み立てて始める（検証つき）
  vStartCase() {
    const v = this.campaign;
    if (!v) return;
    const r = prepareCase(v);
    v.phase = 'case';
    this.saveCamp();
    this.s = r.state;
    this.caseNote = r.note ?? null;
    this.voyageSaved = false;
    this.running = false;
    this.persist();
    this.emit(null, []);
  }
  // 事件中の続き。自動保存がなければ、同じ事件を最初から作り直す
  vResumeCase(): boolean {
    const v = this.campaign;
    if (!v || v.phase !== 'case') return false;
    const st = loadSnapshot(true);
    if (st && st.fixed) {
      this.s = st;
    } else if (v.pendingCase) {
      this.s = generateCase(v.pendingCase.seed, v.pendingCase.templateId, v.pendingCase.fixed);
    } else return false;
    this.caseNote = v.pendingCase?.note ?? null;
    this.running = false;
    this.emit(null, []);
    return true;
  }
  vCaseLabel(): string {
    const v = this.campaign;
    return v ? `航海番号 ${v.seed}　第${v.results.length + (v.phase === 'case' ? 1 : 0)}話` : '';
  }
  vTalk(id: string, choice: number | null) { if (this.campaign) { vTalk(this.campaign, id, choice); this.saveCamp(); } }
  vTreat(): string[] { if (!this.campaign) return []; const r = vTreat(this.campaign); this.saveCamp(); return r; }
  vRepair(): number { if (!this.campaign) return 0; const r = vRepair(this.campaign); this.saveCamp(); return r; }
  vRest(): boolean { if (!this.campaign) return false; const r = vRest(this.campaign); this.saveCamp(); return r; }
  vConfine(id: string, on: boolean): boolean { if (!this.campaign) return false; const r = setConfined(this.campaign, id, on); this.saveCamp(); return r; }
  vLeave() { if (this.campaign) { leaveInterlude(this.campaign); this.saveCamp(); } }
  vMustAbort(): boolean { return !!this.campaign && mustAbort(this.campaign); }
  vFinish(choice: ReportChoice, attach: string[], blocked: boolean) { if (this.campaign) { finishReport(this.campaign, choice, attach, blocked); this.saveCamp(); } }
  vAbort() { if (this.campaign) { finishAbort(this.campaign); this.saveCamp(); } }
  // 事件が終わった時点で航海に結果を書き込む（再読み込みでやり直せないように）
  private settleVoyageCase() {
    const v = this.campaign;
    if (!this.s?.fixed || !v || v.phase !== 'case' || this.s.phase !== 'ended') return;
    applyCaseResult(v, this.s, this.vCaseLabel());
    this.saveCamp();
    clearSnapshot(true);
  }

  resume(): boolean {
    const st = loadSnapshot();
    if (!st) return false;
    this.s = st;
    this.running = false;
    this.voyageSaved = false;
    this.emit(null, []);
    return true;
  }

  get active() { return !!this.s; }
  view(): ViewModel | null { return this.s ? buildView(this.s) : null; }

  subscribe(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((x) => x !== fn); }; }

  private emit(pause: string | null, sfx: string[], ticked = false) {
    if (!this.s) return;
    const v = buildView(this.s);
    for (const l of this.listeners) l(v, { pause, sfx, ticked });
  }

  dispatch(a: Action) {
    if (!this.s) return;
    const r = applyAction(this.s, a);
    this.persist();
    this.emit(r.pause, r.sfx);
  }

  setPolicy(crew: CrewId, policy: Policy) { this.dispatch({ type: 'setPolicy', crew, policy }); }
  talk(crew: CrewId) { this.dispatch({ type: 'talk', crew }); }
  confront(crew: CrewId, evidence: EvidenceId) { this.dispatch({ type: 'confront', crew, evidence }); }
  answer(logId: number, allow: boolean) { this.dispatch({ type: 'answerConfirm', logId, allow }); }
  submit(h: Hypothesis) { this.dispatch({ type: 'submit', hyp: h }); }

  markRead() { if (this.s) this.s.player.unread = 0; }

  // ボード操作はシミュレーションに影響しないので操作列には入れない（セーブには残る）
  moveCard(id: string, x: number, y: number) {
    const c = this.s?.player.board.cards.find((k) => k.id === id);
    if (c) { c.x = Math.round(x); c.y = Math.round(y); this.persist(); }
  }
  toggleLink(a: string, b: string) {
    if (!this.s || a === b) return;
    const L = this.s.player.board.links;
    const i = L.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (i >= 0) L.splice(i, 1); else L.push({ a, b, label: '' });
    this.persist();
    this.emit(null, []);
  }
  addNote(text: string, x: number, y: number) {
    if (!this.s || !text.trim()) return;
    const b = this.s.player.board;
    const id = 'note:' + (b.notes.reduce((m, n) => Math.max(m, Number(n.id.slice(5)) || 0), 0) + 1);
    b.notes.push({ id, text: text.slice(0, 120) });
    b.cards.push({ id, x: Math.round(x), y: Math.round(y) });
    this.persist();
    this.emit(null, []);
  }
  editNote(id: string, text: string | null) {
    if (!this.s) return;
    const b = this.s.player.board;
    if (text === null || !text.trim()) {
      b.notes = b.notes.filter((n) => n.id !== id);
      b.cards = b.cards.filter((c) => c.id !== id);
      b.links = b.links.filter((l) => l.a !== id && l.b !== id);
    } else {
      const n = b.notes.find((x) => x.id === id);
      if (n) n.text = text.slice(0, 120);
    }
    this.persist();
    this.emit(null, []);
  }
  setLinkLabel(a: string, b: string, label: string | null) {
    if (!this.s) return;
    const L = this.s.player.board.links;
    const i = L.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (i < 0) return;
    if (label === null) L.splice(i, 1); else L[i].label = label.slice(0, 30);
    this.persist();
    this.emit(null, []);
  }

  setRunning(on: boolean) {
    if (!this.s || this.s.phase !== 'play') on = false;
    if (this.running === on) return;
    this.running = on;
    if (on) this.loop();
    this.emit(null, []);
  }

  setSpeed(n: number) { this.settings.speed = n; saveSettings(this.settings); this.emit(null, []); }
  saveSettings() { saveSettings(this.settings); }

  private loop() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.acc = 0;
    const frame = (t: number) => {
      if (!this.running || !this.s) return;
      const dt = Math.min(0.25, (t - this.last) / 1000);
      this.last = t;
      if (this.canRun) this.acc += dt * TICKS_PER_SEC[this.settings.speed];
      let pause: string | null = null;
      const sfx: string[] = [];
      let n = 0;
      while (this.acc >= 1 && this.s.phase === 'play' && !pause) {
        this.acc -= 1;
        const r: StepResult = step(this.s);
        sfx.push(...r.sfx);
        pause = r.pause;
        n++;
      }
      if (pause || this.s.phase !== 'play') { this.running = false; this.acc = 0; }
      if (n) {
        if (this.s.world.tick % 30 === 0 || pause || this.s.phase !== 'play') this.persist();
        this.emit(pause, sfx, true);
      }
      if (this.running) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  abandon() { this.dispatch({ type: 'abandon' }); }

  persist() {
    if (!this.s) return;
    if (this.s.phase === 'ended') {
      if (this.s.fixed) this.settleVoyageCase();
      else clearSnapshot();
      return;
    }
    saveSnapshot(this.s);
  }

  saveVoyage(): boolean {
    if (!this.s || this.s.phase !== 'ended' || this.voyageSaved) return false;
    const r = evaluateCase(this.s);
    const ok = saveVoyageCase({
      title: this.s.truth.title,
      grade: r.grade,
      endedAt: new Date().toISOString(),
      hull: r.hull,
      o2: r.o2,
      crew: r.survivors,
    });
    this.voyageSaved = ok;
    return ok;
  }

  quit() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.persist();
    this.s = null;
  }

  // テスト・デバッグ用：シード＋操作列の再現確認
  debugHash(): string { return this.s ? JSON.stringify(this.s.world) : ''; }
}

export const game = new Game();
if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__game = game;
