import { useEffect, useRef, useState } from 'react';
import type { Difficulty, TopicId } from '../core/types';
import { countByDifficulty, usableDifficulty, isFlagQuestion, timeBonus, TIME_OPTIONS, TIME_MIN, TIME_MAX, BLITZ_OPTIONS, type RoundPrefs, type TimeLimit } from '../core/round';
import { matchesFilter } from '../core/selection';
import { useApp } from '../state';
import type { StartOpts } from './TopicPage';
import { duelPool, duelTime } from '../core/duel';
import { syncConfigured } from '../sync';
import { TOPIC_NAMES } from '../core/badges';
import { TOPIC_ICONS, TOPIC_ORDER } from './Home';

const DIFFS: { d: Difficulty | undefined; label: string }[] = [
  { d: undefined, label: 'Adaptiv' }, { d: 1, label: 'Leicht' }, { d: 2, label: 'Mittel' }, { d: 3, label: 'Schwer' },
];
const pct = (b: number) => `+${Math.round(b * 100)} % XP`;
const sec = (s: number) => String(s).replace('.', ',') + ' s';

/**
 * Menü vor dem Start: von unten (Handy) bzw. Dialog (PC).
 * Schließen: Zurück, Wischen nach unten am Griff oben, Escape, daneben tippen.
 * Wischen nur am Griff, damit das Scrollen im Menü nie aus Versehen schließt.
 */
export function StartSheet({ opts: base, prefs, target, duelOnly, onStart, onDuel, onClose }: {
  opts: StartOpts; prefs: RoundPrefs; onStart: (p: RoundPrefs) => void; onDuel: (p: RoundPrefs, o: StartOpts) => void; onClose: () => void;
  /** Gruppenmitglied direkt herausfordern: Themen wählbar, nur Duell-Knopf */
  target?: { user_id: string; name: string } | null;
  /** Nur als Duell (z.B. "Zufallsmix als Duell" von der Startseite): Themen wählbar, nur Duell-Knopf */
  duelOnly?: boolean;
}) {
  const { questions, session } = useApp();
  const choose = !!target || !!duelOnly;
  const [picked, setPicked] = useState<TopicId[]>(base.topics ?? []);
  const opts: StartOpts = choose
    ? { ...base, topics: picked, label: picked.length ? picked.map((t) => TOPIC_NAMES[t]).join(', ') : 'Zufallsmix' }
    : base;
  const counts = countByDifficulty(questions ?? [], opts);
  const [diff, setDiff] = useState<Difficulty | undefined>(usableDifficulty(prefs.difficulty, counts));
  const [time, setTime] = useState<TimeLimit>(prefs.time);
  const [blitz, setBlitz] = useState<number>(base.blitz ?? prefs.blitz ?? 0);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const startBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    startBtn.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const n = diff ? counts[diff] : counts.all;
  const flags = (questions ?? []).filter((q) => isFlagQuestion(q) && matchesFilter(q, { ...opts, difficulty: diff })).length;
  const blitzOn = flags > 0 ? blitz : 0;
  const p: RoundPrefs = { difficulty: diff, time, blitz: blitzOn };
  const dTime = duelTime(time);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${opts.label ?? 'Runde'} starten`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
          onTouchEnd={() => { if (drag > 80) onClose(); setDrag(0); startY.current = null; }}>
          <div className="sheet-grip" aria-hidden />
          <h2 className="sheet-title">{target ? `⚔️ ${target.name} herausfordern` : duelOnly ? `⚔️ ${opts.label} als Duell` : opts.label ?? 'Runde'}</h2>
        </div>
        {choose && (
          <div className="chips sheet-topics" role="group" aria-label="Themen">
            <button className={'chip-btn' + (picked.length === 0 ? ' on' : '')} aria-pressed={picked.length === 0} onClick={() => setPicked([])}>🎲 Zufallsmix</button>
            {TOPIC_ORDER.map((t) => (
              <button key={t} className={'chip-btn' + (picked.includes(t) ? ' on' : '')} aria-pressed={picked.includes(t)}
                onClick={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>{TOPIC_ICONS[t]} {TOPIC_NAMES[t]}</button>
            ))}
          </div>
        )}
        <p className="muted small">{choose ? (picked.length ? opts.label : 'Zufallsmix: Fragen aus allen Themen, gleichmäßig verteilt') + ' · ' : ''}{counts.all} Fragen in dieser Auswahl</p>

        <h3 className="sheet-h">Schwierigkeit</h3>
        <div className="seg seg-counts" role="radiogroup" aria-label="Schwierigkeit">
          {DIFFS.map((x) => {
            const c = x.d ? counts[x.d] : counts.all;
            return (
              <button key={x.label} role="radio" aria-checked={diff === x.d} className={diff === x.d ? 'on' : ''} disabled={!c} onClick={() => setDiff(x.d)}>
                {x.label}<span className="seg-n">{x.d ? c : 'passend'}</span>
              </button>
            );
          })}
        </div>
        <p className="small muted sheet-note">
          {diff === undefined ? 'Adaptiv: Schwierigkeit passt sich deinem Stand an.' : n < 10 ? `Nur ${n} ${n === 1 ? 'Frage' : 'Fragen'} auf dieser Stufe, die Runde wird kürzer.` : `${n} Fragen auf dieser Stufe.`}
        </p>

        <h3 className="sheet-h">Zeitdruck <span className="muted small">(pro Frage)</span></h3>
        <div className="seg seg-counts" role="radiogroup" aria-label="Zeitdruck">
          {TIME_OPTIONS.map((t) => (
            <button key={t} role="radio" aria-checked={time === t} className={time === t ? 'on' : ''} onClick={() => setTime(t)}>
              {t ? `${t} s` : 'Aus'}<span className="seg-n">{timeBonus(t) ? pct(timeBonus(t)) : t ? 'entspannt' : 'ohne Uhr'}</span>
            </button>
          ))}
        </div>
        {time > 0 && (
          <div className="time-slider">
            <input type="range" min={TIME_MIN} max={TIME_MAX} step={1} value={time} aria-label="Zeitlimit in Sekunden"
              onChange={(e) => setTime(+e.target.value)} />
            <span className="time-value"><strong>{time} s</strong> <span className="muted small">{timeBonus(time) ? pct(timeBonus(time)) : 'kein Bonus'}</span></span>
          </div>
        )}

        {flags > 0 && (
          <>
            <h3 className="sheet-h">⚡ Flaggen-Blitz <span className="muted small">(Flagge nur kurz sichtbar)</span></h3>
            <div className="seg seg-counts" role="radiogroup" aria-label="Flaggen-Blitz">
              {BLITZ_OPTIONS.map((b) => (
                <button key={b} role="radio" aria-checked={blitz === b} className={blitz === b ? 'on' : ''} onClick={() => setBlitz(b)}>
                  {b ? sec(b) : 'Aus'}<span className="seg-n">{b ? 'sichtbar' : 'normal'}</span>
                </button>
              ))}
            </div>
            {flags < n && blitzOn > 0 && <p className="small muted sheet-note">Gilt für die {flags} Flaggen-Fragen dieser Auswahl.</p>}
          </>
        )}

        {!choose && (
          <button ref={startBtn} className="btn primary big wide sheet-start" onClick={() => onStart(p)}>
            Start <span className="btn-sub">{Math.min(10, n)} Fragen{time ? ` · ${time} s pro Frage` : ''}{blitzOn ? ` · ⚡ ${sec(blitzOn)}` : ''}</span>
          </button>
        )}
        {syncConfigured && (() => {
          const dn = Math.min(10, duelPool(questions ?? [], { ...opts, difficulty: diff }).length);
          return session
            ? <button className={'btn wide sheet-duel ' + (choose ? 'primary big sheet-start' : 'ghost')} disabled={!dn} onClick={() => onDuel(p, opts)}>
                {target ? `⚔️ ${target.name} herausfordern` : duelOnly ? '⚔️ Duell anlegen' : '⚔️ Als Duell'} <span className="btn-sub">{dn ? `${dn} gleiche Fragen für alle · ${dTime} s pro Frage${blitzOn ? ` · ⚡ ${sec(blitzOn)}` : ''}` : 'keine passenden Fragen (nur Auswahl-Fragen zählen)'}</span>
              </button>
            : <p className="small muted sheet-note">⚔️ Duelle gegen Freunde: erst unter Mehr anmelden.</p>;
        })()}
      </div>
    </div>
  );
}
