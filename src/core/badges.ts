import type { Progress, Question, TopicId } from './types';
import { MASTERED_BOX } from './srs';
import { totals } from './progress';

export interface Badge { id: string; icon: string; title: string; desc: string }
export interface BadgeContext { p: Progress; questions: Question[]; best: number; level: number }

interface Def extends Badge { check: (c: BadgeContext) => boolean }

const topicMastery = (c: BadgeContext, topic: TopicId) => {
  const qs = c.questions.filter((q) => q.topic === topic);
  if (!qs.length) return 0;
  return qs.filter((q) => (c.p.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length / qs.length;
};

export const TOPIC_NAMES: Record<TopicId, string> = {
  geografie: 'Geografie', flaggen: 'Flaggen', politik: 'Politik', geschichte: 'Geschichte',
  bilder: 'Historische Bilder', fauna: 'Tiere', flora: 'Pflanzen', wissenschaft: 'Wissenschaft & Natur',
};

const DEFS: Def[] = [
  { id: 'first', icon: '🌱', title: 'Erste Schritte', desc: 'Erste Frage beantwortet', check: (c) => totals(c.p).answered >= 1 },
  { id: 's7', icon: '🔥', title: 'Eine Woche', desc: '7 Tage Serie', check: (c) => c.best >= 7 },
  { id: 's30', icon: '🏅', title: 'Ein Monat', desc: '30 Tage Serie', check: (c) => c.best >= 30 },
  { id: 's100', icon: '🏆', title: 'Hundert Tage', desc: '100 Tage Serie', check: (c) => c.best >= 100 },
  { id: 'a100', icon: '💯', title: 'Hundert', desc: '100 Fragen beantwortet', check: (c) => totals(c.p).answered >= 100 },
  { id: 'a1000', icon: '📚', title: 'Tausend', desc: '1000 Fragen beantwortet', check: (c) => totals(c.p).answered >= 1000 },
  { id: 'l10', icon: '⭐', title: 'Level 10', desc: 'Level 10 erreicht', check: (c) => c.level >= 10 },
  ...(Object.keys(TOPIC_NAMES) as TopicId[]).map((t) => ({
    id: 'm_' + t, icon: '🎓', title: TOPIC_NAMES[t] + ' gemeistert', desc: '80 % der Fragen sitzen sicher',
    check: (c: BadgeContext) => topicMastery(c, t) >= 0.8,
  })),
];

export function evaluateBadges(c: BadgeContext): { badge: Badge; earned: boolean }[] {
  return DEFS.map(({ check, ...badge }) => ({ badge, earned: check(c) }));
}
