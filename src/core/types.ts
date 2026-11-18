export type TopicId =
  | 'geografie' | 'flaggen' | 'politik' | 'geschichte' | 'bilder'
  | 'fauna' | 'flora' | 'wissenschaft';

export type Difficulty = 1 | 2 | 3;

export interface ImageInfo {
  src: string;          // relativer Pfad in public/
  author: string;
  license: string;      // z.B. "CC BY-SA 4.0" oder "Gemeinfrei"
  licenseUrl?: string;
  sourceUrl: string;    // Commons-Dateiseite
}

interface BaseQuestion {
  id: string;
  topic: TopicId;
  difficulty: Difficulty;
  prompt: string;
  image?: ImageInfo;
  explanation: string;
  source: string;       // URL
  asOf?: string;        // Stand-Datum (YYYY-MM-DD), Pflicht bei Politik
}

export interface McQuestion extends BaseQuestion {
  type: 'mc';
  choices: string[];    // choices[answer] ist richtig
  answer: number;
  flag?: string;        // ISO-Code für Flaggenfragen (Bild aus flag-icons)
}
export interface MapQuestion extends BaseQuestion {
  type: 'map';
  country: string;      // ISO 3166-1 numerisch (wie im Kartendatensatz)
  continent: string;    // Kartenausschnitt
}
export interface YearQuestion extends BaseQuestion {
  type: 'year';
  year: number;
  min: number;          // Schieberegler-Bereich
  max: number;
}
export interface OrderQuestion extends BaseQuestion {
  type: 'order';
  items: { label: string; year: number }[]; // richtige Reihenfolge = nach Jahr aufsteigend
}

export type Question = McQuestion | MapQuestion | YearQuestion | OrderQuestion;

/** Spaced-Repetition-Zustand pro Frage */
export interface CardState {
  box: number;          // 0 = falsch/neu gelernt, 1..5
  due: string;          // YYYY-MM-DD (Tag in Europe/Berlin)
  seen: number;
  correct: number;
  last: number;         // Zeitstempel ms (für Sync-Merge)
}

export interface AnswerLogEntry { t: number; id: string; topic: TopicId; ok: boolean; d: Difficulty }

/** Statistik eines Geräts an einem Tag. Wird pro Gerät gespeichert, damit Sync nichts doppelt oder zu wenig zählt. */
export interface DayEntry {
  n: number;   // beantwortete Fragen
  c: number;   // davon richtig
  xp: number;
  topics: Partial<Record<TopicId, [number, number]>>; // [beantwortet, richtig]
}

export interface Progress {
  version: 1;
  cards: Record<string, CardState>;
  log: Record<string, Record<string, DayEntry>>; // Tag -> Geräte-ID -> Eintrag
  recent: AnswerLogEntry[];                       // letzte Antworten (adaptive Schwierigkeit)
  updatedAt: number;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  timer: boolean;
}
