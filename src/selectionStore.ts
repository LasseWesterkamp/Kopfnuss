// Gemerkte Auswahl und gespeicherte Mischungen beim Üben (nur lokal auf diesem Gerät).
import type { Difficulty, TopicId } from './core/types';

export interface Selection { topics: TopicId[]; cats: string[]; subs: string[]; diff?: Difficulty }
export interface Mix extends Selection { name: string }

const K_LAST = 'kopfnuss.auswahl.v1';
const K_MIXES = 'kopfnuss.mischungen.v1';
export const MAX_MIXES = 5;

const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher nicht verfügbar */ } };

export const loadLast = (): Selection => ({ topics: [], cats: [], subs: [], ...read<Partial<Selection>>(K_LAST, {}) });
export const saveLast = (s: Selection) => write(K_LAST, s);
export const loadMixes = (): Mix[] => read<Mix[]>(K_MIXES, []);
export function saveMix(m: Mix): Mix[] {
  const list = loadMixes().filter((x) => x.name !== m.name);
  const next = [m, ...list].slice(0, MAX_MIXES);
  write(K_MIXES, next);
  return next;
}
export function deleteMix(name: string): Mix[] {
  const next = loadMixes().filter((x) => x.name !== name);
  write(K_MIXES, next);
  return next;
}
