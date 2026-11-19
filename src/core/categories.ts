import data from '../../data/kategorien.json';
import type { TopicId } from './types';

export interface Category { id: string; name: string }
export const CATEGORIES = data.themen as Record<TopicId, Category[]>;
export const catKey = (topic: TopicId, cat: string) => `${topic}/${cat}`;
