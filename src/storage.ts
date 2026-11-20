// Lokale Speicherung (localStorage). Wird beim Start gelesen und nach jeder Änderung geschrieben.
import type { Progress, Settings } from './core/types';
import { emptyProgress } from './core/progress';
import { initialPrefs, type RoundPrefs } from './core/round';

const K_PROGRESS = 'kopfnuss.progress.v1';
const K_SETTINGS = 'kopfnuss.settings.v1';
const K_DEVICE = 'kopfnuss.device';

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* Speicher voll oder privat – App läuft weiter */ }
}

export const loadProgress = (): Progress => {
  const p = read<Progress>(K_PROGRESS);
  return p && p.version === 1 ? p : emptyProgress();
};
export const saveProgress = (p: Progress) => write(K_PROGRESS, p);

export const defaultSettings: Settings = { theme: 'system' };
export const loadSettings = (): Settings => ({ ...defaultSettings, ...(read<Settings>(K_SETTINGS) ?? {}) });
export const saveSettings = (s: Settings) => write(K_SETTINGS, s);

/** Zuletzt im Startmenü gewählte Stufe und Zeit (global, nur auf diesem Gerät) */
const K_ROUND = 'kopfnuss.round.v1';
export const loadRoundPrefs = (): RoundPrefs => initialPrefs(read<Partial<RoundPrefs>>(K_ROUND), !!read<Settings>(K_SETTINGS)?.timer);
export const saveRoundPrefs = (p: RoundPrefs) => write(K_ROUND, p);

/** Zufällige Geräte-ID (für korrektes Zusammenzählen beim Sync) */
export function deviceId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(K_DEVICE); } catch { /* ignorieren */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(K_DEVICE, id); } catch { /* ignorieren */ }
  }
  return id;
}

/** Persistenten Speicher anfordern, damit iOS/Browser den Fortschritt nicht wegräumen */
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* ignorieren */ }
}
