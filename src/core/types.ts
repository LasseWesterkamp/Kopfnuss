export type TopicId =
  | 'geografie' | 'flaggen' | 'politik' | 'geschichte' | 'bilder'
  | 'fauna' | 'flora' | 'wissenschaft' | 'regionen';

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
  cat: string;          // Kategorie innerhalb des Themas (data/kategorien.json), genau eine pro Frage
  sub?: string;         // Unterthema: Epoche bei Geschichte (z.B. "antike"), Land bei Regionen (z.B. "de")
}

export interface McQuestion extends BaseQuestion {
  type: 'mc';
  choices: string[];    // choices[answer] ist richtig
  answer: number;
  flag?: string;        // ISO-Code für Flaggenfragen (Bild aus flag-icons)
}
export interface MapQuestion extends BaseQuestion {
  type: 'map';
  country: string;      // Weltkarte: ISO 3166-1 numerisch. Regionenkarte: ISO 3166-2 (z.B. "DE-BY")
  continent: string;    // Weltkarte: Kartenausschnitt. Regionenkarte: Ländercode (z.B. "de")
  regions?: boolean;    // true = Karte public/data/regions-<continent>.json statt Weltkarte
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

/** Markierte Region auf der Karte benennen (Antwort wie Multiple Choice) */
export interface MapNameQuestion extends BaseQuestion {
  type: 'mapname';
  country: string;      // ISO 3166-2 der markierten Region
  continent: string;    // Ländercode der Regionenkarte
  regions: true;
  choices: string[];
  answer: number;
}
/** Welche von 4 Flaggen gehört zu X? */
export interface FlagPickQuestion extends BaseQuestion {
  type: 'flagpick';
  options: ImageInfo[];
  optionLabels: string[]; // werden erst nach der Antwort gezeigt
  answer: number;
}
/** 4 Flaggen 4 Namen zuordnen. pairs[i].image gehört zu pairs[i].label */
export interface MatchQuestion extends BaseQuestion {
  type: 'match';
  pairs: { label: string; image: ImageInfo }[];
}

export type Question = McQuestion | MapQuestion | YearQuestion | OrderQuestion | MapNameQuestion | FlagPickQuestion | MatchQuestion;

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
  /** veraltet: früher globaler Zeitdruck. Wird nur noch als Vorgabe fürs Startmenü gelesen. */
  timer?: boolean;
}
