import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Progress, Question, Settings } from './core/types';
import { loadProgress, saveProgress, loadSettings, saveSettings, deviceId, requestPersistence } from './storage';
import { loadQuestions } from './data';
import { recordAnswer, addBonusXp, dayCounts, totalXp } from './core/progress';
import { computeStreak } from './core/streak';
import { dayKey } from './core/dates';
import { levelFromXp } from './core/scoring';
import * as sync from './sync';
import { publishStats } from './groups';
import { myStats } from './core/leaderboard';
import type { Session } from '@supabase/supabase-js';

export type SyncState = 'aus' | 'abgemeldet' | 'synchronisiert' | 'läuft' | 'fehler';

interface AppState {
  questions: Question[] | null;
  loadError: string | null;
  progress: Progress;
  settings: Settings;
  setSettings: (s: Settings) => void;
  answer: (q: Question, ok: boolean, xp: number) => void;
  bonus: (xp: number) => void;
  replaceProgress: (p: Progress) => void;
  today: string;
  streak: ReturnType<typeof computeStreak>;
  xp: number;
  level: ReturnType<typeof levelFromXp>;
  session: Session | null;
  syncState: SyncState;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => useContext(Ctx)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [today, setToday] = useState(dayKey());
  const [session, setSession] = useState<Session | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(sync.syncConfigured ? 'abgemeldet' : 'aus');
  const device = useMemo(deviceId, []);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    requestPersistence();
    loadQuestions().then((b) => setQuestions(b.questions)).catch((e) => setLoadError(String(e.message ?? e)));
    // Tageswechsel erkennen, auch wenn die App offen bleibt
    const t = setInterval(() => setToday(dayKey()), 30_000);
    const onVis = () => document.visibilityState === 'visible' && setToday(dayKey());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  useEffect(() => saveProgress(progress), [progress]);

  // Theme
  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings]);

  // ---- Sync ----
  const syncNow = useCallback(async () => {
    if (!sync.syncConfigured) return;
    const s = await sync.getSession();
    if (!s) { setSyncState('abgemeldet'); return; }
    setSyncState('läuft');
    try {
      const merged = await sync.syncProgress(progressRef.current);
      setProgress((cur) => (cur === progressRef.current ? merged : cur));
      await publishStats(myStats(merged, dayKey()));
      setSyncState('synchronisiert');
    } catch (e) {
      console.warn('Sync fehlgeschlagen', e);
      setSyncState('fehler');
    }
  }, []);

  useEffect(() => {
    if (!sync.syncConfigured) return;
    sync.getSession().then((s) => { setSession(s); if (s) syncNow(); });
    const off = sync.onAuthChange((s) => { setSession(s); if (s) syncNow(); else setSyncState('abgemeldet'); });
    const onVis = () => document.visibilityState === 'visible' && syncNow();
    const onOnline = () => syncNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => { off(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); };
  }, [syncNow]);

  // Nach Antworten verzögert synchronisieren
  const syncTimer = useRef<number>();
  const scheduleSync = useCallback(() => {
    if (!sync.syncConfigured) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(syncNow, 4000);
  }, [syncNow]);

  const answer = useCallback((q: Question, ok: boolean, xp: number) => {
    setProgress((p) => recordAnswer(p, { q, ok, xp }, device));
    scheduleSync();
  }, [device, scheduleSync]);
  const bonus = useCallback((xp: number) => { setProgress((p) => addBonusXp(p, xp, device)); scheduleSync(); }, [device, scheduleSync]);

  const counts = useMemo(() => dayCounts(progress), [progress]);
  const streak = useMemo(() => computeStreak(counts, today), [counts, today]);
  const xp = useMemo(() => totalXp(progress), [progress]);

  const value: AppState = {
    questions, loadError, progress, settings,
    setSettings: setSettingsState,
    answer, bonus,
    replaceProgress: (p) => { setProgress(p); scheduleSync(); },
    today, streak, xp, level: levelFromXp(xp),
    session, syncState, syncNow,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
