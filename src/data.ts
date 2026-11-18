import type { Question } from './core/types';

export interface QuestionBank { built: string; count: number; questions: Question[] }

export const asset = (p: string) => import.meta.env.BASE_URL + p;

let cache: Promise<QuestionBank> | null = null;
export function loadQuestions(): Promise<QuestionBank> {
  cache ??= fetch(asset('data/questions.json')).then((r) => {
    if (!r.ok) throw new Error('Fragen konnten nicht geladen werden');
    return r.json();
  });
  return cache;
}

export const REPO_URL = 'https://github.com/LasseWesterkamp/kopfnuss';

/** Link zum Melden einer fehlerhaften Frage (vorausgefülltes GitHub-Issue) */
export function reportUrl(q: Question): string {
  const title = `Frage melden: ${q.id}`;
  const body = `**Frage:** ${q.prompt}\n**ID:** \`${q.id}\`\n**Quelle:** ${q.source}\n\n**Was ist falsch?**\n\n`;
  return `${REPO_URL}/issues/new?labels=frage-melden&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function formatDate(d: string) {
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}

export function formatYear(y: number) {
  return y < 0 ? `${-y} v. Chr.` : y < 1000 ? `${y} n. Chr.` : String(y);
}
