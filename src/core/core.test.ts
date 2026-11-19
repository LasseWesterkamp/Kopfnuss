import { describe, it, expect } from 'vitest';
import { dayKey, addDays, isoWeek, diffDays } from './dates';
import { computeStreak, bestStreak, DAILY_GOAL } from './streak';
import { review, INTERVALS } from './srs';
import { xpFor, yearScore, orderScore, levelFromXp } from './scoring';
import { emptyProgress, recordAnswer, mergeProgress, dayCounts, totalXp, totals } from './progress';
import { buildSession, targetDifficulty, matchesFilter } from './selection';
import type { Question, Progress } from './types';

const G = DAILY_GOAL;
/** Baut ein Tageslog: Liste von Tagen, die erledigt sind */
const daysDone = (...d: string[]) => Object.fromEntries(d.map((x) => [x, G]));

describe('Tageswechsel in Europe/Berlin', () => {
  it('23:30 UTC im Winter ist schon der nächste Tag in Berlin', () => {
    expect(dayKey(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
    expect(dayKey(new Date('2026-01-14T22:59:59Z'))).toBe('2026-01-14');
  });
  it('im Sommer (MESZ, UTC+2) wechselt der Tag um 22:00 UTC', () => {
    expect(dayKey(new Date('2026-07-01T21:59:59Z'))).toBe('2026-07-01');
    expect(dayKey(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });
  it('Zeitumstellung verschluckt keinen Tag', () => {
    // 29.03.2026: Umstellung auf Sommerzeit
    expect(dayKey(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
    expect(dayKey(new Date('2026-03-29T21:30:00Z'))).toBe('2026-03-29');
    expect(dayKey(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('Kalenderrechnung über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
  });
  it('ISO-Wochen', () => {
    expect(isoWeek('2026-11-16')).toBe('2026-W47'); // Montag
    expect(isoWeek('2026-11-22')).toBe('2026-W47'); // Sonntag
    expect(isoWeek('2026-11-23')).toBe('2026-W48');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });
});

describe('Streak', () => {
  const today = '2026-11-18'; // Mittwoch, KW 47
  it('leer = 0', () => {
    expect(computeStreak({}, today).current).toBe(0);
  });
  it('weniger als das Tagesziel zählt nicht', () => {
    const r = computeStreak({ [today]: G - 1 }, today);
    expect(r.todayDone).toBe(false);
    expect(r.current).toBe(0);
  });
  it('zusammenhängende Tage inkl. heute', () => {
    expect(computeStreak(daysDone('2026-11-16', '2026-11-17', today), today).current).toBe(3);
  });
  it('heute noch offen bricht die Serie nicht', () => {
    const r = computeStreak(daysDone('2026-11-16', '2026-11-17'), today);
    expect(r.current).toBe(2);
    expect(r.todayDone).toBe(false);
  });
  it('ein verpasster Tag wird eingefroren und zählt nicht mit', () => {
    // Mo erledigt, Di verpasst, Mi (heute) erledigt
    const r = computeStreak(daysDone('2026-11-16', today), today);
    expect(r.current).toBe(2);
    expect(r.frozenDays).toEqual(['2026-11-17']);
    expect(r.freezeAvailableThisWeek).toBe(false);
  });
  it('zwei verpasste Tage in derselben Woche beenden die Serie', () => {
    // Mo erledigt, Di+Mi verpasst, Do erledigt
    const r = computeStreak(daysDone('2026-11-16', '2026-11-19'), '2026-11-19');
    expect(r.current).toBe(1);
    expect(r.frozenDays).toEqual([]);
    // Freeze wurde nicht "verbraucht", weil er die Serie nicht gerettet hat
    expect(r.freezeAvailableThisWeek).toBe(true);
  });
  it('je ein Freeze in zwei verschiedenen Wochen ist erlaubt', () => {
    // KW46: Fr 13. verpasst; KW47: Di 17. verpasst
    const done = daysDone('2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14', '2026-11-15', '2026-11-16', today);
    const r = computeStreak(done, today);
    expect(r.current).toBe(7);
    expect(r.frozenDays.sort()).toEqual(['2026-11-13', '2026-11-17']);
  });
  it('gestern verpasst und heute noch offen: Serie lebt per Freeze', () => {
    const r = computeStreak(daysDone('2026-11-15', '2026-11-16'), today);
    expect(r.current).toBe(2);
    expect(r.frozenDays).toEqual(['2026-11-17']);
  });
  it('drei Tage Pause ohne Freeze-Möglichkeit = Serie weg', () => {
    const r = computeStreak(daysDone('2026-11-10', '2026-11-11'), today);
    expect(r.current).toBe(0);
  });
  it('Serie über den Jahreswechsel', () => {
    const r = computeStreak(daysDone('2026-12-30', '2026-12-31', '2027-01-01'), '2027-01-01');
    expect(r.current).toBe(3);
  });
  it('beste Serie', () => {
    const d = daysDone('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-17', today);
    expect(bestStreak(d)).toBe(4);
    expect(computeStreak(d, today).best).toBe(4);
  });
  it('beste Serie respektiert die Freeze-Regel', () => {
    // KW40: Do 1., (Fr 2. verpasst -> Freeze), Sa 3.
    expect(bestStreak(daysDone('2026-10-01', '2026-10-03'))).toBe(2);
    // Zwei Lücken in derselben Woche -> Bruch
    // Lücken am 2. und 4. Oktober liegen beide in KW40 -> Serie bricht, beste = 2
    expect(bestStreak(daysDone('2026-10-01', '2026-10-03', '2026-10-05'))).toBe(2);
    expect(computeStreak(daysDone('2026-10-01', '2026-10-03', '2026-10-05'), '2026-10-05').current).toBe(2);
  });
});

describe('Spaced Repetition', () => {
  const t = '2026-11-18';
  it('neue Karte richtig -> Box 1, morgen fällig', () => {
    const c = review(undefined, true, t, 1);
    expect(c.box).toBe(1);
    expect(c.due).toBe(addDays(t, INTERVALS[1]));
  });
  it('Intervalle wachsen: 1, 3, 7, 21, 60', () => {
    let c = review(undefined, true, t);
    const dues = [c.due];
    for (let i = 0; i < 5; i++) { c = review(c, true, t); dues.push(c.due); }
    expect(dues.map((d) => diffDays(t, d))).toEqual([1, 3, 7, 21, 60, 60]);
  });
  it('falsch -> zurück auf Box 0, morgen wieder', () => {
    let c = review(undefined, true, t);
    c = review(c, true, t);
    c = review(c, false, t);
    expect(c.box).toBe(0);
    expect(c.due).toBe('2026-11-19');
    expect(c.seen).toBe(3);
    expect(c.correct).toBe(2);
  });
});

describe('Punkte', () => {
  it('XP skaliert mit Schwierigkeit', () => {
    expect(xpFor(1, 1)).toBe(10);
    expect(xpFor(1, 3)).toBe(30);
    expect(xpFor(0.5, 2)).toBe(10);
    expect(xpFor(0, 3)).toBe(0);
  });
  it('Jahreszahl: exakt = 1, weit daneben = 0, dazwischen linear', () => {
    expect(yearScore(1789, 1789, 1000, 2000)).toBe(1);
    expect(yearScore(1800, 1789, 1000, 2000)).toBe(1);   // 11 Jahre <= 20 (2 %)
    expect(yearScore(1580, 1789, 1000, 2000)).toBe(0);   // >= 200 (20 %)
    const mid = yearScore(1899, 1789, 1000, 2000);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('Reihenfolge: Anteil richtiger Paare', () => {
    expect(orderScore([0, 1, 2, 3], [0, 1, 2, 3])).toBe(1);
    expect(orderScore([3, 2, 1, 0], [0, 1, 2, 3])).toBe(0);
    expect(orderScore([1, 0, 2, 3], [0, 1, 2, 3])).toBeCloseTo(5 / 6);
  });
  it('Level', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
  });
});

const q = (id: string, topic: Question['topic'] = 'geografie', difficulty: 1 | 2 | 3 = 1, cat = 'x'): Question =>
  ({ id, topic, cat, difficulty, type: 'mc', prompt: id, choices: ['a', 'b'], answer: 0, explanation: '', source: '' });

describe('Fortschritt & Sync', () => {
  const morning = new Date('2026-11-18T08:00:00Z').getTime();
  it('verbucht Antworten pro Tag und Gerät', () => {
    let p = emptyProgress();
    p = recordAnswer(p, { q: q('a'), ok: true, xp: 10 }, 'handy', morning);
    p = recordAnswer(p, { q: q('b'), ok: false, xp: 0 }, 'handy', morning + 1);
    expect(dayCounts(p)['2026-11-18']).toBe(2);
    expect(totalXp(p)).toBe(10);
    expect(totals(p).topics.geografie).toEqual({ answered: 2, correct: 1 });
    expect(p.cards.a.box).toBe(1);
    expect(p.cards.b.box).toBe(0);
  });
  it('Handy + PC am selben Tag werden addiert, nicht überschrieben', () => {
    let handy = emptyProgress(), pc = emptyProgress();
    for (let i = 0; i < 6; i++) handy = recordAnswer(handy, { q: q('h' + i), ok: true, xp: 10 }, 'handy', morning + i);
    for (let i = 0; i < 6; i++) pc = recordAnswer(pc, { q: q('p' + i), ok: true, xp: 10 }, 'pc', morning + 100 + i);
    const m = mergeProgress(handy, pc);
    expect(dayCounts(m)['2026-11-18']).toBe(12);
    expect(computeStreak(dayCounts(m), '2026-11-18').todayDone).toBe(true);
    expect(totalXp(m)).toBe(120);
  });
  it('Merge ist idempotent und kommutativ', () => {
    let a = emptyProgress(), b = emptyProgress();
    a = recordAnswer(a, { q: q('x'), ok: true, xp: 10 }, 'A', morning);
    b = recordAnswer(b, { q: q('x'), ok: false, xp: 0 }, 'B', morning + 5000);
    const ab = mergeProgress(a, b), ba = mergeProgress(b, a);
    expect(ab.cards).toEqual(ba.cards);
    expect(dayCounts(ab)).toEqual(dayCounts(ba));
    expect(mergeProgress(ab, ab)).toEqual(ab);
    // die neuere Antwort (falsch, von B) gewinnt für die Karte
    expect(ab.cards.x.box).toBe(0);
  });
  it('alter Stand vom Server überschreibt keinen neueren lokalen Zähler', () => {
    let local = emptyProgress();
    local = recordAnswer(local, { q: q('a'), ok: true, xp: 10 }, 'handy', morning);
    const server = structuredClone(local);
    local = recordAnswer(local, { q: q('b'), ok: true, xp: 10 }, 'handy', morning + 10);
    const m = mergeProgress(local, server);
    expect(dayCounts(m)['2026-11-18']).toBe(2);
  });
});

describe('Rundenauswahl', () => {
  const today = '2026-11-18';
  const pool: Question[] = [
    ...Array.from({ length: 30 }, (_, i) => q('g' + i, 'geografie', ((i % 3) + 1) as 1 | 2 | 3)),
    ...Array.from({ length: 30 }, (_, i) => q('f' + i, 'flaggen', ((i % 3) + 1) as 1 | 2 | 3)),
  ];
  const rng = () => 0.42;
  it('liefert 10 verschiedene Fragen', () => {
    const s = buildSession(pool, emptyProgress(), today, {}, rng);
    expect(s).toHaveLength(10);
    expect(new Set(s.map((x) => x.id)).size).toBe(10);
  });
  it('mischt Themen', () => {
    const s = buildSession(pool, emptyProgress(), today, {}, rng);
    expect(new Set(s.map((x) => x.topic)).size).toBe(2);
  });
  it('fällige Wiederholungen kommen zuerst rein (max. 6)', () => {
    const p: Progress = emptyProgress();
    for (let i = 0; i < 8; i++) p.cards['g' + i] = { box: 1, due: '2026-11-17', seen: 1, correct: 1, last: 1 };
    const s = buildSession(pool, p, today, {}, rng);
    expect(s.filter((x) => p.cards[x.id]).length).toBe(6);
  });
  it('nicht fällige Karten werden nicht als Wiederholung gezogen, solange es neue gibt', () => {
    const p: Progress = emptyProgress();
    for (let i = 0; i < 5; i++) p.cards['g' + i] = { box: 3, due: '2026-12-01', seen: 3, correct: 3, last: 1 };
    const s = buildSession(pool, p, today, {}, rng);
    expect(s.some((x) => p.cards[x.id])).toBe(false);
  });
  it('Themenfilter und fester Schwierigkeitsgrad', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['flaggen'], difficulty: 3 }, rng);
    expect(s.every((x) => x.topic === 'flaggen' && x.difficulty === 3)).toBe(true);
    expect(s).toHaveLength(10);
  });
  it('adaptive Schwierigkeit steigt bei hoher Trefferquote', () => {
    const p = emptyProgress();
    p.recent = Array.from({ length: 10 }, (_, i) => ({ t: i, id: 'g' + i, topic: 'geografie' as const, ok: true, d: 1 as const }));
    expect(targetDifficulty(p, 'geografie')).toBe(2);
    p.recent = p.recent.map((r) => ({ ...r, ok: false, d: 2 as const }));
    expect(targetDifficulty(p, 'geografie')).toBe(1);
    expect(targetDifficulty(p, 'flaggen')).toBe(1);
  });
});

describe('Epochen- und Länderfilter', () => {
  const today = '2026-11-18';
  const h = (id: string, sub: string, d: 1 | 2 | 3 = 1): Question => ({ ...q(id, 'geschichte', d), sub });
  const pool: Question[] = [
    ...Array.from({ length: 15 }, (_, i) => h('ant' + i, 'antike')),
    ...Array.from({ length: 15 }, (_, i) => h('ns' + i, 'ns', 2)),
    ...Array.from({ length: 15 }, (_, i) => ({ ...q('reg' + i, 'regionen'), sub: i < 8 ? 'de' : 'us' })),
    ...Array.from({ length: 15 }, (_, i) => q('flag' + i, 'flaggen')),
  ];
  it('nur eine Epoche', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['geschichte'], subs: ['ns'] }, () => 0.3);
    expect(s).toHaveLength(10);
    expect(s.every((x) => x.sub === 'ns')).toBe(true);
  });
  it('mehrere Epochen', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['geschichte'], subs: ['ns', 'antike'], size: 30 }, () => 0.3);
    expect(new Set(s.map((x) => x.sub))).toEqual(new Set(['ns', 'antike']));
  });
  it('Unterthemen-Filter lässt Themen ohne Unterthema unberührt', () => {
    expect(matchesFilter(q('f', 'flaggen'), { topics: ['flaggen', 'geschichte'], subs: ['ns'] })).toBe(true);
    expect(matchesFilter(h('a', 'antike'), { topics: ['flaggen', 'geschichte'], subs: ['ns'] })).toBe(false);
  });
  it('Länderfilter bei Regionen', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['regionen'], subs: ['de'] }, () => 0.3);
    expect(s).toHaveLength(8); // es gibt nur 8 deutsche Regionen im Pool
    expect(s.every((x) => x.sub === 'de')).toBe(true);
  });
  it('Filter mit Schwierigkeit kombiniert', () => {
    expect(matchesFilter(h('n', 'ns', 2), { subs: ['ns'], difficulty: 1 })).toBe(false);
    expect(matchesFilter(h('n', 'ns', 2), { subs: ['ns'], difficulty: 2 })).toBe(true);
  });
});

import { weekTotals, myStats, rank, daysUntilReset, type Entry } from './leaderboard';
import { dayKey as dk } from './dates';

describe('Rangliste', () => {
  const at = (iso: string) => new Date(iso).getTime();
  const answerAt = (p: Progress, iso: string, xp = 10) => recordAnswer(p, { q: q('x' + iso), ok: true, xp }, 'handy', at(iso));
  it('Wochengrenze: Sonntag 23:30 Berlin zählt zur alten, Montag 00:30 zur neuen Woche', () => {
    let p = emptyProgress();
    p = answerAt(p, '2026-11-22T22:30:00Z', 10); // So 23:30 MEZ (KW 47)
    p = answerAt(p, '2026-11-22T23:30:00Z', 20); // Mo 00:30 MEZ (KW 48)
    expect(dk(at('2026-11-22T22:30:00Z'))).toBe('2026-11-22');
    expect(weekTotals(p, '2026-11-22').xp).toBe(10);
    expect(weekTotals(p, '2026-11-23').xp).toBe(20);
    expect(weekTotals(p, '2026-11-23').answers).toBe(1);
  });
  it('Wochengrenze in der Sommerzeit (UTC+2)', () => {
    let p = emptyProgress();
    p = answerAt(p, '2026-06-28T21:59:00Z', 10); // So 23:59 MESZ
    p = answerAt(p, '2026-06-28T22:01:00Z', 10); // Mo 00:01 MESZ
    expect(weekTotals(p, '2026-06-28').xp).toBe(10);
    expect(weekTotals(p, '2026-06-29').xp).toBe(10);
  });
  it('Woche über den Jahreswechsel (KW 53)', () => {
    let p = emptyProgress();
    p = answerAt(p, '2026-12-30T10:00:00Z', 10);
    p = answerAt(p, '2027-01-02T10:00:00Z', 15);
    expect(weekTotals(p, '2027-01-03').xp).toBe(25); // Mi 30.12. bis So 3.1. = 2026-W53
  });
  it('Wochenwerte von Handy und PC werden zusammengezählt', () => {
    let a = emptyProgress(), b = emptyProgress();
    a = recordAnswer(a, { q: q('a'), ok: true, xp: 10 }, 'handy', at('2026-11-18T08:00:00Z'));
    b = recordAnswer(b, { q: q('b'), ok: true, xp: 30 }, 'pc', at('2026-11-18T09:00:00Z'));
    expect(myStats(mergeProgress(a, b), '2026-11-18')).toMatchObject({ week: '2026-W47', week_xp: 40, week_answers: 2, total_xp: 40 });
  });
  const e = (name: string, week_xp: number, streak = 0, total_xp = 0): Entry => ({ user_id: name, display_name: name, week_xp, week_answers: 0, total_xp, streak, is_me: false, is_owner: false });
  it('Platzierung mit Gleichstand', () => {
    const r = rank([e('Bea', 50), e('Anna', 120), e('Cem', 120), e('Dora', 0)], 'woche');
    expect(r.map((x) => `${x.place}.${x.display_name}`)).toEqual(['1.Anna', '1.Cem', '3.Bea', '4.Dora']);
  });
  it('andere Wertungen', () => {
    const list = [e('A', 10, 3, 900), e('B', 99, 7, 100)];
    expect(rank(list, 'serie')[0].display_name).toBe('B');
    expect(rank(list, 'gesamt')[0].display_name).toBe('A');
  });
  it('Tage bis zum Wochenreset', () => {
    expect(daysUntilReset('2026-11-23')).toBe(7); // Montag
    expect(daysUntilReset('2026-11-29')).toBe(1); // Sonntag
  });
});

import { normalizeCode, isValidCode, codeFromUrl, inviteUrl, CODE_ALPHABET } from './invite';

describe('Gruppenbeitritt: Einladungscode und -link', () => {
  it('Eingabe wird normalisiert (klein, Leerzeichen, Bindestrich)', () => {
    expect(normalizeCode(' qtk-sa5 ')).toBe('QTKSA5');
    expect(normalizeCode('abc 234')).toBe('ABC234');
  });
  it('verwechselbare Zeichen gibt es im Code nicht', () => {
    for (const c of 'IOL01') expect(CODE_ALPHABET.includes(c)).toBe(false);
    expect(isValidCode('QTKSA5')).toBe(true);
    expect(isValidCode('QTKSO5')).toBe(false); // O wird zu 0 normalisiert und ist ungültig
    expect(isValidCode(normalizeCode('qtkso5'))).toBe(false);
    expect(isValidCode('ABC12')).toBe(false); // zu kurz
  });
  it('Code aus dem Einladungslink', () => {
    expect(codeFromUrl('?beitreten=4q47rg')).toBe('4Q47RG');
    expect(codeFromUrl('?beitreten=xyz')).toBeNull();
    expect(codeFromUrl('?foo=bar')).toBeNull();
    expect(codeFromUrl('')).toBeNull();
  });
  it('Link und Code passen zusammen (Hin- und Rückweg)', () => {
    const url = inviteUrl('https://lassewesterkamp.github.io', '/Kopfnuss/', '9HEN2D');
    expect(url).toBe('https://lassewesterkamp.github.io/Kopfnuss/?beitreten=9HEN2D');
    expect(codeFromUrl(new URL(url).search)).toBe('9HEN2D');
  });
});

import { matchScore, matchCorrect } from './scoring';
import { startPuzzle, tap, next, isDone, summary, currentTarget, isBetter, MAX_TRIES } from './puzzle';

describe('Zuordnungsspiel', () => {
  it('alles richtig', () => { expect(matchScore([0, 1, 2, 3])).toBe(1); expect(matchCorrect(1)).toBe(true); });
  it('zwei vertauscht = halbe Punkte, nicht richtig', () => { expect(matchScore([1, 0, 2, 3])).toBe(0.5); expect(matchCorrect(0.5)).toBe(false); });
  it('alles falsch', () => expect(matchScore([1, 2, 3, 0])).toBe(0));
  it('nicht zugeordnete Paare zählen als falsch', () => expect(matchScore([0, -1, 2, -1])).toBe(0.5));
});

describe('Karten-Puzzle', () => {
  const rng = () => 0; // feste Reihenfolge
  const isos = ['DE-BY', 'DE-BE', 'DE-HH'];
  it('erster Versuch richtig = richtig gewertet', () => {
    let s = startPuzzle(isos, rng);
    const t = currentTarget(s)!;
    const r = tap(s, t);
    expect(r.outcome).toBe('richtig');
    expect(r.finished).toEqual({ iso: t, ok: true });
  });
  it('Treffer nach Fehlversuch zählt als falsch, Fehler werden gezählt', () => {
    let s = startPuzzle(isos, rng);
    const t = currentTarget(s)!;
    const wrong = isos.find((i) => i !== t)!;
    let r = tap(s, wrong); expect(r.outcome).toBe('falsch'); s = r.state;
    r = tap(s, t); expect(r.outcome).toBe('richtig'); expect(r.finished?.ok).toBe(false);
    expect(r.state.errors).toBe(1);
  });
  it(`nach ${MAX_TRIES} Fehlversuchen wird aufgedeckt und als falsch gewertet`, () => {
    let s = startPuzzle(isos, rng);
    const t = currentTarget(s)!;
    const wrong = isos.find((i) => i !== t)!;
    let r: ReturnType<typeof tap> = { state: s, outcome: 'ignoriert' };
    for (let i = 0; i < MAX_TRIES; i++) { r = tap(s, wrong); s = r.state; }
    expect(r.outcome).toBe('aufgedeckt');
    expect(s.revealed).toBe(t);
    expect(tap(s, t).outcome).toBe('ignoriert'); // während aufgedeckt keine Eingabe
    s = next(s);
    expect(currentTarget(s)).not.toBe(t);
  });
  it('schon gelöste Regionen werden ignoriert', () => {
    let s = startPuzzle(isos, rng);
    const first = currentTarget(s)!;
    s = tap(s, first).state;
    expect(tap(s, first).outcome).toBe('ignoriert');
    expect(s.errors).toBe(0);
  });
  it('kompletter Durchlauf und Zusammenfassung', () => {
    let s = startPuzzle(isos, rng);
    while (!isDone(s)) s = tap(s, currentTarget(s)!).state;
    expect(summary(s)).toEqual({ total: 3, firstTry: 3, errors: 0, accuracy: 1 });
  });
  it('Bestzeit', () => {
    expect(isBetter(null, { ms: 5000, errors: 2 })).toBe(true);
    expect(isBetter({ ms: 5000, errors: 2 }, { ms: 4000, errors: 9 })).toBe(true);
    expect(isBetter({ ms: 5000, errors: 2 }, { ms: 5000, errors: 1 })).toBe(true);
    expect(isBetter({ ms: 5000, errors: 2 }, { ms: 6000, errors: 0 })).toBe(false);
  });
});

describe('Kategorienfilter', () => {
  const today = '2026-11-19';
  const pool: Question[] = [
    ...Array.from({ length: 12 }, (_, i) => q('hs' + i, 'geografie', 1, 'hauptstaedte')),
    ...Array.from({ length: 12 }, (_, i) => q('fl' + i, 'geografie', 1, 'gewaesser')),
    ...Array.from({ length: 12 }, (_, i) => q('eu' + i, 'flaggen', 1, 'europa')),
    ...Array.from({ length: 12 }, (_, i) => q('af' + i, 'flaggen', 1, 'afrika')),
    ...Array.from({ length: 6 }, (_, i) => ({ ...q('rch' + i, 'regionen', 1, 'flaggen'), sub: 'ch' })),
    ...Array.from({ length: 6 }, (_, i) => ({ ...q('rcl' + i, 'regionen', 1, 'lage'), sub: 'ch' })),
    ...Array.from({ length: 6 }, (_, i) => ({ ...q('rdf' + i, 'regionen', 1, 'flaggen'), sub: 'de' })),
  ];
  it('nur eine Kategorie eines Themas', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['geografie'], cats: ['geografie/hauptstaedte'] }, () => 0.2);
    expect(s).toHaveLength(10);
    expect(s.every((x) => x.cat === 'hauptstaedte')).toBe(true);
  });
  it('mehrere Kategorien', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['flaggen'], cats: ['flaggen/europa', 'flaggen/afrika'], size: 24 }, () => 0.2);
    expect(new Set(s.map((x) => x.cat))).toEqual(new Set(['europa', 'afrika']));
  });
  it('Kategorie eines Themas schränkt andere Themen nicht ein', () => {
    expect(matchesFilter(q('a', 'flaggen', 1, 'asien'), { topics: ['geografie', 'flaggen'], cats: ['geografie/hauptstaedte'] })).toBe(true);
    expect(matchesFilter(q('b', 'geografie', 1, 'gewaesser'), { topics: ['geografie', 'flaggen'], cats: ['geografie/hauptstaedte'] })).toBe(false);
  });
  it('gleiche Kategorie-ID in verschiedenen Themen wird nicht verwechselt', () => {
    // "hauptstaedte" gibt es in Geografie und Regionen
    expect(matchesFilter(q('c', 'regionen', 1, 'hauptstaedte'), { cats: ['geografie/hauptstaedte'] })).toBe(true);
    expect(matchesFilter(q('d', 'regionen', 1, 'lage'), { cats: ['regionen/hauptstaedte'] })).toBe(false);
  });
  it('Land + Kategorie kombiniert: Regionen, nur Schweiz, nur Flaggen', () => {
    const s = buildSession(pool, emptyProgress(), today, { topics: ['regionen'], subs: ['ch'], cats: ['regionen/flaggen'], size: 20 }, () => 0.2);
    expect(s).toHaveLength(6);
    expect(s.every((x) => x.sub === 'ch' && x.cat === 'flaggen')).toBe(true);
  });
  it('Tages-Challenge ignoriert die Auswahl (keine Filter)', () => {
    const s = buildSession(pool, emptyProgress(), today, {}, () => 0.2);
    expect(new Set(s.map((x) => x.topic)).size).toBeGreaterThan(1);
  });
});

import { validateReport, reportPayload } from '../report';

describe('Frage melden', () => {
  it('zu kurze Meldungen werden abgelehnt', () => {
    expect(validateReport('  ')).not.toBeNull();
    expect(validateReport('ab')).not.toBeNull();
    expect(validateReport('Antwort falsch')).toBeNull();
  });
  it('zu lange Meldungen werden abgelehnt', () => expect(validateReport('x'.repeat(1001))).not.toBeNull());
  it('Daten an die Datenbank: gekürzt und bereinigt, ohne Nutzer-ID aus dem Client', () => {
    const p = reportPayload({ id: 'geo-cap-de', prompt: 'Was ist die Hauptstadt von Deutschland?' }, '  Bonn war früher Hauptstadt  ');
    expect(p).toEqual({ question_id: 'geo-cap-de', frage: 'Was ist die Hauptstadt von Deutschland?', nachricht: 'Bonn war früher Hauptstadt' });
  });
});
