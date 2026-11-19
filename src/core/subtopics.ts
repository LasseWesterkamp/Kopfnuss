import epochenData from '../../data/epochen.json';
import type { TopicId } from './types';

export interface SubTopic { id: string; name: string; hint?: string; icon: string }

export const EPOCHEN: SubTopic[] = epochenData.epochen.map((e) => ({ id: e.id, name: e.name, hint: e.zeit, icon: e.icon }));

export const REGION_LAENDER: SubTopic[] = [
  { id: 'de', name: 'Deutschland', hint: '16 Bundesländer', icon: '🇩🇪' },
  { id: 'at', name: 'Österreich', hint: '9 Bundesländer', icon: '🇦🇹' },
  { id: 'ch', name: 'Schweiz', hint: '26 Kantone', icon: '🇨🇭' },
  { id: 'us', name: 'USA', hint: '50 Bundesstaaten', icon: '🇺🇸' },
  { id: 'ca', name: 'Kanada', hint: '10 Provinzen, 3 Territorien', icon: '🇨🇦' },
  { id: 'au', name: 'Australien', hint: '6 Bundesstaaten, 2 Territorien', icon: '🇦🇺' },
];

/** Themen mit Unterthemen und deren Liste */
export const SUBTOPICS: Partial<Record<TopicId, { label: string; items: SubTopic[] }>> = {
  geschichte: { label: 'Epochen', items: EPOCHEN },
  regionen: { label: 'Länder', items: REGION_LAENDER },
};
