// Duelle: Fragenauswahl und Wertung (reine Logik, ohne Server)
import type { Question } from './types';
import { matchesFilter, shuffle, type Rng, type SessionOptions } from './selection';

export const DUEL_SIZE = 10;
export const DUEL_DEFAULT_TIME = 20;
/** Nur Fragen mit klarem richtig/falsch und gleichen Chancen auf Handy und PC */
export const DUEL_TYPES: Question['type'][] = ['mc', 'flagpick', 'mapname'];
/** Zeitunterschied, unter dem bei gleich vielen Richtigen unentschieden gilt */
export const TIE_MS = 500;

/** Zeitlimit im Duell ist Pflicht: 5 bis 60 s, ohne Angabe ("Aus") 20 s */
export const duelTime = (t: number | undefined) => (t && Number.isInteger(t) && t >= 5 && t <= 60 ? t : DUEL_DEFAULT_TIME);

export function duelPool(all: Question[], opts: Pick<SessionOptions, 'topics' | 'cats' | 'subs' | 'difficulty' | 'flagOnly'>): Question[] {
  return all.filter((q) => DUEL_TYPES.includes(q.type) && matchesFilter(q, opts));
}

/**
 * 10 zufällige Fragen aus der Auswahl (unabhängig vom eigenen Lernstand, damit es für alle fair ist).
 * avoid: z.B. Fragen des Ursprungsduells bei einer Revanche. Werden nur genommen, wenn sonst zu wenige da sind.
 */
export function pickDuelQuestions(all: Question[], opts: Pick<SessionOptions, 'topics' | 'cats' | 'subs' | 'difficulty' | 'flagOnly'>, rng: Rng = Math.random, avoid: string[] = []): string[] {
  const skip = new Set(avoid);
  const pool = shuffle(duelPool(all, opts), rng);
  const ordered = [...pool.filter((q) => !skip.has(q.id)), ...pool.filter((q) => skip.has(q.id))];
  // Zufallsmix (kein Thema gewählt): gleichmäßig über die Themen verteilen, sonst wäre es meist Geografie
  if (!opts.topics?.length) {
    const byTopic = new Map<string, Question[]>();
    for (const q of ordered) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    const lists = shuffle([...byTopic.values()], rng);
    const out: string[] = [];
    for (let i = 0; out.length < DUEL_SIZE && lists.some((l) => l.length > i); i++)
      for (const l of lists) if (l[i] && out.length < DUEL_SIZE) out.push(l[i].id);
    return shuffle(out, rng);
  }
  return ordered.slice(0, DUEL_SIZE).map((q) => q.id);
}

/** Einstellungen eines Duells (für die Revanche) zurück in eine Auswahl */
export function duelSelection(settings: Record<string, unknown>): Pick<SessionOptions, 'topics' | 'cats' | 'subs' | 'difficulty' | 'flagOnly'> {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : undefined);
  const d = settings.difficulty;
  return { topics: arr(settings.topics) as SessionOptions['topics'], cats: arr(settings.cats), subs: arr(settings.subs), difficulty: d === 1 || d === 2 || d === 3 ? d : undefined, ...(settings.flagOnly ? { flagOnly: true } : {}) };
}

export interface DuelAnswer { i: number; ok: boolean; ms: number }
export interface DuelPlayer {
  user_id: string; name: string; is_me: boolean; is_creator: boolean;
  state: 'offen' | 'spielt' | 'fertig';
  correct: number | null; ms: number | null; answers: DuelAnswer[] | null; aborted: boolean | null;
}
export interface Duel {
  id: string; code: string; label: string; settings: Record<string, unknown>; time_limit: number; n: number;
  created_at: string; expires_at: string; is_creator: boolean; question_ids: string[] | null; players: DuelPlayer[];
  rematch_of?: string | null; rematch_id?: string | null;
}

/**
 * Richtige Antworten zählen, nur für Positionen, deren Frage es noch gibt
 * (wurde eine Frage zwischendurch gelöscht, fällt sie für alle aus der Wertung).
 */
export function validCorrect(p: DuelPlayer, valid: boolean[] | null): number {
  if (!p.answers) return p.correct ?? 0;
  return p.answers.filter((a) => a.ok && (!valid || valid[a.i])).length;
}

export interface Placed { player: DuelPlayer; place: number; correct: number; tie: boolean }

/**
 * Wertung: erst Anzahl richtig, bei Gleichstand die kürzere Gesamtzeit (Serverzeit).
 * Weniger als 0,5 s Unterschied bei gleich vielen Richtigen = gleicher Platz (unentschieden).
 * Nur fertige Spieler werden platziert.
 */
export function rankDuel(players: DuelPlayer[], valid: boolean[] | null = null): Placed[] {
  const done = players.filter((p) => p.state === 'fertig' && p.ms !== null)
    .map((p) => ({ player: p, correct: validCorrect(p, valid) }))
    .sort((a, b) => b.correct - a.correct || (a.player.ms! - b.player.ms!));
  const out: Placed[] = [];
  done.forEach((d, idx) => {
    const prev = out[idx - 1];
    const same = prev && prev.correct === d.correct && Math.abs(prev.player.ms! - d.player.ms!) < TIE_MS;
    out.push({ ...d, place: same ? prev.place : idx + 1, tie: false });
    if (same) { prev.tie = true; out[idx].tie = true; }
  });
  return out;
}

export type DuelStatus = 'dran' | 'warten' | 'fertig' | 'abgelaufen';

/** Aus meiner Sicht: Bin ich dran, warte ich auf andere, oder ist es entschieden? */
export function duelStatus(d: Duel, now: number = Date.now()): DuelStatus {
  const me = d.players.find((p) => p.is_me);
  const expired = now > Date.parse(d.expires_at);
  if (me && me.state !== 'fertig') return expired && me.state === 'offen' ? 'abgelaufen' : 'dran';
  const othersOpen = d.players.some((p) => !p.is_me && p.state !== 'fertig');
  if (d.players.length < 2) return expired ? 'abgelaufen' : 'warten';
  return othersOpen && !expired ? 'warten' : 'fertig';
}

/** Ergebnis eines entschiedenen Duells aus meiner Sicht */
export function myOutcome(d: Duel, valid: boolean[] | null = null): 'sieg' | 'niederlage' | 'unentschieden' | null {
  const r = rankDuel(d.players, valid);
  const me = r.find((x) => x.player.is_me);
  if (!me || r.length < 2) return null;
  if (me.place === 1) return r.filter((x) => x.place === 1).length > 1 ? 'unentschieden' : 'sieg';
  return 'niederlage';
}

/** Bilanz gegen jeden Gegner (nur entschiedene Duelle, paarweise verglichen) */
export function headToHead(duels: Duel[]): { name: string; user_id: string; win: number; loss: number; draw: number }[] {
  const m = new Map<string, { name: string; user_id: string; win: number; loss: number; draw: number }>();
  for (const d of duels) {
    if (duelStatus(d) !== 'fertig') continue;
    const r = rankDuel(d.players);
    const me = r.find((x) => x.player.is_me);
    if (!me) continue;
    for (const o of r) {
      if (o.player.is_me) continue;
      const e = m.get(o.player.user_id) ?? { name: o.player.name, user_id: o.player.user_id, win: 0, loss: 0, draw: 0 };
      e.name = o.player.name;
      if (me.place < o.place) e.win++; else if (me.place > o.place) e.loss++; else e.draw++;
      m.set(o.player.user_id, e);
    }
  }
  return [...m.values()].sort((a, b) => b.win + b.loss + b.draw - (a.win + a.loss + a.draw));
}

export const fmtSec = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

/** Duell-Code aus einem Link (?duell=CODE) */
export function duelCodeFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('duell');
  if (!raw) return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(c) ? c : null;
}
