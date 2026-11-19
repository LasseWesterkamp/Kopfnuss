// Einladungscodes: 6 Zeichen aus A–Z ohne I, L, O und 2–9 (keine verwechselbaren Zeichen). Gleiches Alphabet wie in supabase/002_gruppen.sql.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Nutzereingabe normalisieren: Großbuchstaben, Leerzeichen/Bindestriche weg, häufige Verwechslungen korrigieren */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** Ist das ein gültig aussehender Code? (0 und 1 kommen im Alphabet nicht vor) */
export function isValidCode(code: string): boolean {
  return code.length === 6 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Code aus einem Einladungslink lesen (?beitreten=CODE), sonst null */
export function codeFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('beitreten');
  if (!raw) return null;
  const c = normalizeCode(raw);
  return isValidCode(c) ? c : null;
}

export function inviteUrl(origin: string, base: string, code: string): string {
  return `${origin}${base}?beitreten=${encodeURIComponent(code)}`;
}
