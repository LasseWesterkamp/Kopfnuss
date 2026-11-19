// Fehlerkasten: Fragen, die man einmal falsch beantwortet hat und die noch nicht zweimal hintereinander richtig waren.
// Abgeleitet aus dem Lernstand (CardState): box zählt richtige Antworten in Folge (falsch -> 0).
//   Fehler  = mind. einmal falsch (correct < seen) UND box < FIXED_AFTER
//   behoben = box >= FIXED_AFTER (2x hintereinander richtig)
import type { CardState, Progress, Question, TopicId } from './types';

export const FIXED_AFTER = 2;

export const isMistake = (c: CardState | undefined): boolean => !!c && c.correct < c.seen && c.box < FIXED_AFTER;

export interface CatGroup { cat: string; ids: string[] }
export interface TopicGroup { topic: TopicId; count: number; cats: CatGroup[] }

/** Offene Fehler gruppiert nach Thema und Kategorie, größte Gruppen zuerst */
export function groupMistakes(questions: Question[], p: Progress): TopicGroup[] {
  const byTopic = new Map<TopicId, Map<string, string[]>>();
  for (const q of questions) {
    if (!isMistake(p.cards[q.id])) continue;
    const cats = byTopic.get(q.topic) ?? new Map<string, string[]>();
    cats.set(q.cat, [...(cats.get(q.cat) ?? []), q.id]);
    byTopic.set(q.topic, cats);
  }
  return [...byTopic.entries()]
    .map(([topic, cats]) => ({
      topic,
      count: [...cats.values()].reduce((s, ids) => s + ids.length, 0),
      cats: [...cats.entries()].map(([cat, ids]) => ({ cat, ids })).sort((a, b) => b.ids.length - a.ids.length || a.cat.localeCompare(b.cat)),
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export const mistakeIds = (questions: Question[], p: Progress, filter?: { topic?: TopicId; cat?: string }) =>
  questions.filter((q) => isMistake(p.cards[q.id]) && (!filter?.topic || q.topic === filter.topic) && (!filter?.cat || q.cat === filter.cat)).map((q) => q.id);
