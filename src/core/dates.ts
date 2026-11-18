// Alle Tagesgrenzen gelten in Europe/Berlin (Tageswechsel um Mitternacht deutscher Zeit, inkl. Sommerzeit).
export const TZ = 'Europe/Berlin';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Kalendertag (YYYY-MM-DD) in Berlin für einen Zeitpunkt */
export function dayKey(date: Date | number = Date.now()): string {
  return fmt.format(typeof date === 'number' ? new Date(date) : date);
}

/** Tag +/- n Tage (reine Kalenderrechnung, unabhängig von Zeitzone) */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Differenz in Tagen b - a */
export function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** ISO-Woche als "YYYY-Www" */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
