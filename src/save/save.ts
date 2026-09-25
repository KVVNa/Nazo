// ブラウザ内保存。
// ・スナップショット：事件中の「続きから」専用。常に1枠を上書きし、巻き戻し地点としては選べない。
// ・航海セーブ：事件終了時に明示的に保存する。書き出し／読み込みできるのはこちらだけ。
import { SCHEMA_VERSION, type GameState } from '../core/types';

const SNAP_KEY = 'ssm.snapshot.v1';
const VOYAGE_KEY = 'ssm.voyage.v1';
const SETTINGS_KEY = 'ssm.settings.v1';

export interface Settings { sound: boolean; reduceEffects: boolean; speed: number }
export interface VoyageCase {
  title: string;
  grade: string;
  endedAt: string;
  hull: number;
  o2: number;
  crew: { id: string; name: string; alive: boolean; health: number; trust: number }[];
}
export interface VoyageSave { schema: number; kind: 'voyage'; savedAt: string; cases: VoyageCase[] }

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, v: string): boolean {
  try { localStorage.setItem(key, v); return true; } catch { return false; }
}

export function saveSnapshot(s: GameState): boolean {
  return safeSet(SNAP_KEY, JSON.stringify({ schema: SCHEMA_VERSION, savedAt: new Date().toISOString(), state: s }));
}

export function loadSnapshot(): GameState | null {
  const raw = safeGet(SNAP_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return migrateState(o.state);
  } catch { return null; }
}

export function clearSnapshot() {
  try { localStorage.removeItem(SNAP_KEY); } catch { /* 無視 */ }
}

// 古いスキーマのセーブを現行に合わせる。未知の新しい版は読まない。
export function migrateState(st: any): GameState | null {
  if (!st || typeof st.schema !== 'number') return null;
  if (st.schema > SCHEMA_VERSION) return null;
  // schema 1 が最初の版。将来の移行はここに足す。
  return st as GameState;
}

export function loadVoyage(): VoyageSave | null {
  const raw = safeGet(VOYAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && v.kind === 'voyage' && v.schema <= SCHEMA_VERSION ? v : null;
  } catch { return null; }
}

export function saveVoyageCase(c: VoyageCase): boolean {
  const v = loadVoyage() ?? { schema: SCHEMA_VERSION, kind: 'voyage' as const, savedAt: '', cases: [] };
  v.cases.push(c);
  v.savedAt = new Date().toISOString();
  return safeSet(VOYAGE_KEY, JSON.stringify(v));
}

export function exportVoyage(): string | null {
  return safeGet(VOYAGE_KEY);
}

export function importVoyage(text: string): boolean {
  try {
    const v = JSON.parse(text);
    if (!v || v.kind !== 'voyage' || typeof v.schema !== 'number' || v.schema > SCHEMA_VERSION || !Array.isArray(v.cases)) return false;
    return safeSet(VOYAGE_KEY, JSON.stringify(v));
  } catch { return false; }
}

export function loadSettings(): Settings {
  const d: Settings = { sound: true, reduceEffects: false, speed: 2 };
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return d;
  try { return { ...d, ...JSON.parse(raw) }; } catch { return d; }
}

export function saveSettings(s: Settings) {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}
