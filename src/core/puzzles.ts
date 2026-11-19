// Alle Karten-Puzzles: Regionen eines Landes (Bundesländer, Kantone …) und Länder der Welt pro Kontinent.
import { REGION_LAENDER } from './subtopics';

export type PuzzleKind = 'regionen' | 'welt';
export interface PuzzleDef {
  key: string;          // eindeutig, auch für Bestzeiten (Regionen: Ländercode wie bisher, Welt: "welt-europa")
  kind: PuzzleKind;
  name: string;
  icon: string;
  hint: string;
  area: string;         // Regionen: Ländercode; Welt: Kontinent ("Europa") oder "Welt"
}

export const WORLD_PUZZLES: PuzzleDef[] = [
  { key: 'welt-europa', kind: 'welt', name: 'Europa', icon: '🇪🇺', hint: 'Länder Europas', area: 'Europa' },
  { key: 'welt-afrika', kind: 'welt', name: 'Afrika', icon: '🌍', hint: 'Länder Afrikas', area: 'Afrika' },
  { key: 'welt-asien', kind: 'welt', name: 'Asien', icon: '🌏', hint: 'Länder Asiens', area: 'Asien' },
  { key: 'welt-nordamerika', kind: 'welt', name: 'Nordamerika', icon: '🌎', hint: 'mit Mittelamerika & Karibik', area: 'Nordamerika' },
  { key: 'welt-suedamerika', kind: 'welt', name: 'Südamerika', icon: '🌎', hint: 'Länder Südamerikas', area: 'Südamerika' },
  { key: 'welt-ozeanien', kind: 'welt', name: 'Ozeanien', icon: '🏝️', hint: 'Australien & Pazifik', area: 'Ozeanien' },
  { key: 'welt-alle', kind: 'welt', name: 'Ganze Welt', icon: '🌐', hint: 'Profi: alle Länder', area: 'Welt' },
];

export const REGION_PUZZLES: PuzzleDef[] = REGION_LAENDER.map((l) => ({ key: l.id, kind: 'regionen', name: l.name, icon: l.icon, hint: l.hint ?? '', area: l.id }));

export const ALL_PUZZLES = [...REGION_PUZZLES, ...WORLD_PUZZLES];
export const puzzleByKey = (key: string) => ALL_PUZZLES.find((p) => p.key === key) ?? null;

export interface WorldCountry { num: string; a2: string; name: string; continent: string; mapQuestion: string | null }

/** Länder eines Welt-Puzzles */
export const worldItems = (all: WorldCountry[], area: string) => (area === 'Welt' ? all : all.filter((c) => c.continent === area));
