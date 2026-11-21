import { describe, it, expect } from 'vitest';
import { dayKey, addDays, isoWeek, diffDays } from './dates';
import { computeStreak, bestStreak, DAILY_GOAL } from './streak';
import { review, INTERVALS } from './srs';
import { xpFor, yearScore, orderScore, levelFromXp } from './scoring';
import { emptyProgress, recordAnswer, mergeProgress, dayCounts, totalXp, totals } from './progress';
import { buildSession, targetDifficulty, matchesFilter, againOptions } from './selection';
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
import { startPuzzle, tap, next, isDone, summary, currentTarget, isBetter, MAX_TRIES, showHint, bestKey, bestOf } from './puzzle';

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

import { isMistake, groupMistakes, mistakeIds } from './mistakes';
import { review as rev } from './srs';

describe('Fehlerkasten', () => {
  const t = '2026-11-20';
  const card = (...answers: boolean[]) => answers.reduce<ReturnType<typeof rev> | undefined>((c, ok) => rev(c, ok, t), undefined);
  it('nie beantwortet oder immer richtig = kein Fehler', () => {
    expect(isMistake(undefined)).toBe(false);
    expect(isMistake(card(true))).toBe(false);
    expect(isMistake(card(true, true, true))).toBe(false);
  });
  it('einmal falsch = Fehler', () => {
    expect(isMistake(card(false))).toBe(true);
    expect(isMistake(card(true, true, false))).toBe(true);
  });
  it('falsch, dann einmal richtig = noch Fehler; zweimal richtig = behoben', () => {
    expect(isMistake(card(false, true))).toBe(true);
    expect(isMistake(card(false, true, true))).toBe(false);
  });
  it('behoben und wieder falsch = wieder Fehler', () => expect(isMistake(card(false, true, true, false))).toBe(true));
  it('Gruppierung nach Thema und Kategorie, größte zuerst', () => {
    const qs: Question[] = [q('g1', 'geografie', 1, 'hauptstaedte'), q('g2', 'geografie', 1, 'hauptstaedte'), q('g3', 'geografie', 1, 'gewaesser'),
      q('f1', 'flaggen', 1, 'europa'), q('ok', 'flaggen', 1, 'europa')];
    const p = emptyProgress();
    for (const id of ['g1', 'g2', 'g3', 'f1']) p.cards[id] = card(false)!;
    p.cards.ok = card(true)!;
    const g = groupMistakes(qs, p);
    expect(g.map((x) => [x.topic, x.count])).toEqual([['geografie', 3], ['flaggen', 1]]);
    expect(g[0].cats.map((c) => [c.cat, c.ids.length])).toEqual([['hauptstaedte', 2], ['gewaesser', 1]]);
    expect(mistakeIds(qs, p, { topic: 'geografie', cat: 'hauptstaedte' }).sort()).toEqual(['g1', 'g2']);
    expect(mistakeIds(qs, p)).not.toContain('ok');
  });
  it('"Fehler üben" enthält nur Fehler', () => {
    const qs: Question[] = Array.from({ length: 30 }, (_, i) => q('x' + i, 'geografie', 1, 'hauptstaedte'));
    const p = emptyProgress();
    for (let i = 0; i < 4; i++) p.cards['x' + i] = card(false)!;
    const ids = new Set(mistakeIds(qs, p));
    const s = buildSession(qs.filter((x) => ids.has(x.id)), p, t, { size: 10, maxReviews: 10 }, () => 0.3);
    expect(s.length).toBe(4);
    expect(s.every((x) => ids.has(x.id))).toBe(true);
  });
});

describe('Puzzle-Schwierigkeit', () => {
  const isos = ['A', 'B', 'C'];
  const rng = () => 0;
  it('Schwer: ein Fehlversuch deckt auf', () => {
    const s = startPuzzle(isos, rng, 'schwer');
    const t = currentTarget(s)!;
    expect(tap(s, isos.find((i) => i !== t)!).outcome).toBe('aufgedeckt');
  });
  it('Leicht: 5 Versuche, Hinweis ab dem 2. Fehler', () => {
    let s = startPuzzle(isos, rng, 'leicht');
    const t = currentTarget(s)!, w = isos.find((i) => i !== t)!;
    s = tap(s, w).state; expect(showHint(s)).toBe(false);
    s = tap(s, w).state; expect(showHint(s)).toBe(true);
    s = tap(s, w).state; s = tap(s, w).state;
    const r = tap(s, w); expect(r.outcome).toBe('aufgedeckt'); expect(r.state.errors).toBe(5);
  });
  it('Mittel bleibt bei 3 Versuchen ohne Hinweis', () => {
    let s = startPuzzle(isos, rng, 'mittel');
    const t = currentTarget(s)!, w = isos.find((i) => i !== t)!;
    s = tap(s, w).state; s = tap(s, w).state; expect(showHint(s)).toBe(false);
    expect(tap(s, w).outcome).toBe('aufgedeckt');
  });
  it('Bestzeiten getrennt pro Stufe, alte Einträge zählen als Mittel', () => {
    const b = { de: { ms: 9000, errors: 1 }, 'de:schwer': { ms: 20000, errors: 0 } };
    expect(bestOf(b, 'de', 'mittel')?.ms).toBe(9000);
    expect(bestOf(b, 'de', 'schwer')?.ms).toBe(20000);
    expect(bestOf(b, 'de', 'leicht')).toBeNull();
    expect(bestKey('welt-europa', 'leicht')).toBe('welt-europa:leicht');
  });
});

describe('Nochmal spielen mit Schwierigkeitswahl', () => {
  const today = '2026-11-20';
  const pool: Question[] = [1, 2, 3].flatMap((d) => Array.from({ length: 15 }, (_, i) => q(`d${d}-${i}`, 'geografie', d as 1 | 2 | 3, d === 3 ? 'hauptstaedte' : 'karte')));
  const prev = { topics: ['geografie' as const], difficulty: 1 as const, cats: ['geografie/hauptstaedte'] };
  it('Schwer gewählt: nur Stufe 3, Auswahl bleibt', () => {
    const o = againOptions(prev, 3);
    expect(o).toEqual({ topics: ['geografie'], difficulty: 3, cats: ['geografie/hauptstaedte'] });
    expect(buildSession(pool, emptyProgress(), today, o, () => 0.4).every((x) => x.difficulty === 3)).toBe(true);
  });
  it('Adaptiv gewählt: keine feste Stufe mehr', () => {
    const o = againOptions({ topics: ['geografie'], difficulty: 2 }, undefined);
    expect('difficulty' in o).toBe(false);
    expect(new Set(buildSession(pool, emptyProgress(), today, o, () => 0.4).map((x) => x.difficulty)).size).toBeGreaterThan(0);
  });
  it('Fehlerliste bleibt beim Wechsel der Stufe erhalten', () => {
    const o = againOptions({ ids: ['d1-0', 'd3-1'] }, 3);
    expect(buildSession(pool, emptyProgress(), today, o, () => 0.4).map((x) => x.id)).toEqual(['d3-1']);
  });
});

import { learnEntries, searchEntries, answerOf } from './learn';

describe('Lernseiten', () => {
  const mcq = (id: string, prompt: string, answer: string, explanation: string): Question =>
    ({ id, topic: 'geografie', cat: 'hauptstaedte', difficulty: 1, type: 'mc', prompt, choices: ['X', answer, 'Y'], answer: 1, explanation, source: 's' });
  it('Hin- und Rückfrage zum selben Fakt werden eine Lernkarte (Hauptfrage vorn)', () => {
    const e = learnEntries([
      mcq('geo-capr-fr', 'Paris ist die Hauptstadt von …', 'Frankreich', 'Paris ist die Hauptstadt von Frankreich.'),
      mcq('geo-cap-fr', 'Was ist die Hauptstadt von Frankreich?', 'Paris', 'Die Hauptstadt von Frankreich ist Paris.'),
      mcq('geo-cap-it', 'Was ist die Hauptstadt von Italien?', 'Rom', 'Die Hauptstadt von Italien ist Rom.'),
    ]);
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ ids: ['geo-capr-fr', 'geo-cap-fr'], answer: 'Paris', title: 'Was ist die Hauptstadt von Frankreich?' });
    expect(e[0].more).toEqual([]); // Rückfrage bringt keinen neuen Fakt
  });
  it('Bundesland: Hauptstadt, Flagge und Lage auf einer Karte mit Namen', () => {
    const base = { topic: 'regionen' as const, cat: 'x', difficulty: 1 as const, source: 's', sub: 'de' };
    const e = learnEntries([
      { ...base, id: 'reg-cap-de-sn', type: 'mc', prompt: 'Hauptstadt von Sachsen?', choices: ['Dresden', 'Kiel'], answer: 0, explanation: 'Sachsen … Dresden' },
      { ...base, id: 'reg-map-de-sn', type: 'map', prompt: 'Wo liegt Sachsen?', country: 'DE-SN', continent: 'de', regions: true, explanation: 'Sachsen ist ein Bundesland im Osten.' },
      { ...base, id: 'reg-mapname-de-sn', type: 'mapname', prompt: 'Welches ist markiert?', country: 'DE-SN', continent: 'de', regions: true, choices: ['Bayern', 'Sachsen'], answer: 1, explanation: 'x' },
      { ...base, id: 'reg-cap-de-by', type: 'mc', prompt: 'Hauptstadt von Bayern?', choices: ['München'], answer: 0, explanation: 'Bayern … München' },
    ] as Question[]);
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ heading: 'Sachsen', answer: 'Dresden', ids: ['reg-cap-de-sn', 'reg-map-de-sn', 'reg-mapname-de-sn'] });
    expect(e[0].more).toEqual([{ title: 'Lage', answer: 'Sachsen ist ein Bundesland im Osten.' }]);
  });
  it('Antworten aller Fragetypen', () => {
    expect(answerOf({ ...q('y', 'geschichte'), type: 'year', year: -44, min: -500, max: 500 } as Question)).toBe('44 v. Chr.');
    expect(answerOf({ ...q('o', 'geschichte'), type: 'order', items: [{ label: 'B', year: 1989 }, { label: 'A', year: 1961 }] } as Question)).toBe('A (1961) → B (1989)');
  });
  it('Suche ohne Groß-/Kleinschreibung und Akzente, mehrere Wörter', () => {
    const e = learnEntries([mcq('a', 'Hauptstadt von Island?', 'Reykjavík', 'Reykjavík liegt in Island.'), mcq('b', 'Hauptstadt von Peru?', 'Lima', 'Lima liegt in Peru.')]);
    expect(searchEntries(e, 'reykjavik').map((x) => x.answer)).toEqual(['Reykjavík']);
    expect(searchEntries(e, 'lima peru')).toHaveLength(1);
    expect(searchEntries(e, '')).toHaveLength(2);
  });
});

import { pinchViewBox } from './pinch';

describe('Zwei-Finger-Zoom', () => {
  const full = { w: 800, h: 600 };
  const rect = { left: 0, top: 0, width: 400, height: 300 }; // Karte wird halb so groß angezeigt
  const vb = { x: 0, y: 0, w: 800, h: 600 };
  it('Finger auseinander (doppelter Abstand) = doppelt so nah', () => {
    const r = pinchViewBox(vb, { x: 150, y: 150 }, { x: 250, y: 150 }, { x: 100, y: 150 }, { x: 300, y: 150 }, rect, full, 50);
    expect(r.w).toBe(400);
    expect(r.h).toBe(300);
    // Kartenpunkt unter der Fingermitte (200,150 -> Karte 400,300) bleibt dort
    expect(r.x + (200 / 400) * r.w).toBe(400);
    expect(r.y + (150 / 300) * r.h).toBe(300);
  });
  it('Finger zusammen = weiter weg, aber nie über die ganze Karte hinaus', () => {
    const start = { x: 200, y: 150, w: 400, h: 300 };
    const r = pinchViewBox(start, { x: 100, y: 150 }, { x: 300, y: 150 }, { x: 190, y: 150 }, { x: 210, y: 150 }, rect, full, 50);
    expect(r).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });
  it('stärkster Zoom wird begrenzt', () => {
    const r = pinchViewBox(vb, { x: 199, y: 150 }, { x: 201, y: 150 }, { x: 0, y: 150 }, { x: 400, y: 150 }, rect, full, 50);
    expect(r.w).toBe(50);
  });
  it('beide Finger gemeinsam verschieben = Karte verschieben', () => {
    const start = { x: 200, y: 150, w: 400, h: 300 };
    const r = pinchViewBox(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 100 }, { x: 250, y: 100 }, rect, full, 50);
    expect(r.w).toBe(400);
    expect(r.x).toBe(150); // 50 px Bildschirm nach rechts = 50 Karteneinheiten nach links (Maßstab 400/400)
  });
});

import { withTimeBonus, initialPrefs, countByDifficulty, usableDifficulty } from './round';
describe('Startmenü: Stufe und Zeitdruck', () => {
  it('Zeitdruck-Bonus: 10 s +20 %, 20 s +10 %, 30 s und aus nichts', () => {
    expect(withTimeBonus(30, 10)).toBe(36);
    expect(withTimeBonus(30, 20)).toBe(33);
    expect(withTimeBonus(30, 30)).toBe(30);
    expect(withTimeBonus(30, 0)).toBe(30);
    expect(withTimeBonus(30, undefined)).toBe(30);
    expect(withTimeBonus(0, 10)).toBe(0);
  });
  it('alter globaler Zeitdruck-Schalter wird als 30 s übernommen, gemerkte Wahl hat Vorrang', () => {
    expect(initialPrefs(null, true)).toEqual({ difficulty: undefined, time: 30 });
    expect(initialPrefs(null, false)).toEqual({ difficulty: undefined, time: 0 });
    expect(initialPrefs({ difficulty: 3, time: 10 }, true)).toEqual({ difficulty: 3, time: 10 });
    expect(initialPrefs({ difficulty: 7 as any, time: 15 as any }, false)).toEqual({ difficulty: undefined, time: 0 });
  });
  it('zählt Fragen pro Stufe in der Auswahl; leere Stufe fällt auf Adaptiv zurück', () => {
    const all = [q('a', 'flaggen', 1, 'europa'), q('b', 'flaggen', 3, 'europa'), q('c', 'flaggen', 3, 'asien'), q('d', 'geografie', 2)];
    const c = countByDifficulty(all, { topics: ['flaggen'], cats: ['flaggen/europa'] });
    expect(c).toEqual({ all: 2, 1: 1, 2: 0, 3: 1 });
    expect(usableDifficulty(2, c)).toBeUndefined();
    expect(usableDifficulty(3, c)).toBe(3);
  });
  it('Nochmal behält Zeitdruck und Auswahl, ändert nur die Stufe', () => {
    expect(againOptions({ topics: ['flaggen'], difficulty: 3, timeLimit: 10 }, 1)).toEqual({ topics: ['flaggen'], difficulty: 1, timeLimit: 10 });
  });
});

import { pickDuelQuestions, duelPool, rankDuel, duelStatus, myOutcome, headToHead, duelTime, duelCodeFromUrl, DUEL_SIZE, type DuelPlayer, type Duel } from './duel';
describe('Duell', () => {
  const pl = (name: string, correct: number | null, ms: number | null, extra: Partial<DuelPlayer> = {}): DuelPlayer => ({
    user_id: name, name, is_me: false, is_creator: false, state: ms === null ? 'offen' : 'fertig', correct, ms, answers: null, aborted: false, ...extra,
  });
  const duel = (players: DuelPlayer[], expires = '2999-01-01T00:00:00Z'): Duel => ({
    id: 'd', code: 'ABCDEF', label: 'Test', settings: {}, time_limit: 20, n: 10, created_at: '', expires_at: expires, is_creator: true, question_ids: null, players,
  });
  it('Fragenauswahl: nur faire Typen, passende Auswahl, 10 verschiedene, mit gleichem Zufall gleich', () => {
    const all: Question[] = [
      ...Array.from({ length: 15 }, (_, i) => q('mc' + i, 'flaggen', 3, 'europa')),
      { ...q('map1', 'flaggen', 3, 'europa'), type: 'map' } as any,
      ...Array.from({ length: 5 }, (_, i) => q('x' + i, 'geografie', 3)),
    ];
    expect(duelPool(all, { topics: ['flaggen'] }).length).toBe(15);
    let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const ids = pickDuelQuestions(all, { topics: ['flaggen'], difficulty: 3 }, rng);
    expect(ids.length).toBe(DUEL_SIZE);
    expect(new Set(ids).size).toBe(10);
    expect(ids.every((id) => id.startsWith('mc'))).toBe(true);
    s = 1; const again = pickDuelQuestions(all, { topics: ['flaggen'], difficulty: 3 }, rng);
    expect(again).toEqual(ids);
    expect(pickDuelQuestions(all, { topics: ['flaggen'], difficulty: 1 })).toEqual([]);
  });
  it('Wertung: erst Anzahl richtig, dann Zeit', () => {
    const r = rankDuel([pl('A', 9, 120000), pl('B', 8, 40000)]);
    expect(r.map((x) => [x.player.name, x.place])).toEqual([['A', 1], ['B', 2]]);
    const r2 = rankDuel([pl('A', 8, 74200), pl('B', 8, 61000)]);
    expect(r2[0].player.name).toBe('B');
  });
  it('Gleichstand: gleiche Richtige und unter 0,5 s Unterschied = gleicher Platz', () => {
    const r = rankDuel([pl('A', 7, 50300), pl('B', 7, 50600), pl('C', 7, 52000)]);
    expect(r.map((x) => x.place)).toEqual([1, 1, 3]);
    expect(r[0].tie && r[1].tie && !r[2].tie).toBe(true);
    const d = duel([pl('A', 7, 50300, { is_me: true }), pl('B', 7, 50600)]);
    expect(myOutcome(d)).toBe('unentschieden');
  });
  it('Nicht fertige Spieler werden nicht platziert, Status aus meiner Sicht', () => {
    const me = pl('Ich', 5, 30000, { is_me: true });
    expect(rankDuel([me, pl('B', null, null)]).length).toBe(1);
    expect(duelStatus(duel([me, pl('B', null, null)]))).toBe('warten');
    expect(duelStatus(duel([pl('Ich', null, null, { is_me: true }), pl('B', 5, 1000)]))).toBe('dran');
    expect(duelStatus(duel([me, pl('B', 6, 1000)]))).toBe('fertig');
    expect(myOutcome(duel([me, pl('B', 6, 1000)]))).toBe('niederlage');
    expect(duelStatus(duel([me, pl('B', null, null)], '2000-01-01T00:00:00Z'))).toBe('fertig');
    expect(duelStatus(duel([me], '2000-01-01T00:00:00Z'))).toBe('abgelaufen');
    expect(duelStatus(duel([pl('Ich', null, null, { is_me: true })], '2000-01-01T00:00:00Z'))).toBe('abgelaufen');
  });
  it('gelöschte Frage zählt für niemanden', () => {
    const a = pl('A', 2, 1000, { answers: [{ i: 0, ok: true, ms: 1 }, { i: 1, ok: true, ms: 1 }] });
    const b = pl('B', 1, 2000, { answers: [{ i: 0, ok: true, ms: 1 }, { i: 1, ok: false, ms: 1 }] });
    const r = rankDuel([a, b], [true, false]);
    expect(r.map((x) => x.correct)).toEqual([1, 1]);
    expect(r[0].player.name).toBe('A'); // gleich viele, A schneller
  });
  it('Bilanz pro Gegner, Zeitlimit-Vorgabe, Code aus Link', () => {
    const me = (c: number) => pl('Ich', c, 10000, { is_me: true });
    const h = headToHead([duel([me(8), pl('Max', 5, 9000)]), duel([me(3), pl('Max', 5, 9000)]), duel([me(5), pl('Max', 5, 10100)])]);
    expect(h).toEqual([{ name: 'Max', user_id: 'Max', win: 1, loss: 1, draw: 1 }]);
    expect([duelTime(0), duelTime(10), duelTime(30), duelTime(25)]).toEqual([20, 10, 30, 20]);
    expect(duelCodeFromUrl('?duell=abc')).toBe(null);
    expect(duelCodeFromUrl('?duell=abc-dez')).toBe('ABCDEZ');
  });
});
