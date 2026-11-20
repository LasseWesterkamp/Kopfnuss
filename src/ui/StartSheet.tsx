import { useEffect, useRef, useState } from 'react';
import type { Difficulty } from '../core/types';
import { countByDifficulty, usableDifficulty, TIME_OPTIONS, TIME_BONUS, type RoundPrefs, type TimeLimit } from '../core/round';
import { useApp } from '../state';
import type { StartOpts } from './TopicPage';

const DIFFS: { d: Difficulty | undefined; label: string }[] = [
  { d: undefined, label: 'Adaptiv' }, { d: 1, label: 'Leicht' }, { d: 2, label: 'Mittel' }, { d: 3, label: 'Schwer' },
];

/** Menü vor dem Start: von unten (Handy) bzw. Dialog (PC). Schließen: Zurück, nach unten wischen, Escape, daneben tippen. */
export function StartSheet({ opts, prefs, onStart, onClose }: {
  opts: StartOpts; prefs: RoundPrefs; onStart: (p: RoundPrefs) => void; onClose: () => void;
}) {
  const { questions } = useApp();
  const counts = countByDifficulty(questions ?? [], opts);
  const [diff, setDiff] = useState<Difficulty | undefined>(usableDifficulty(prefs.difficulty, counts));
  const [time, setTime] = useState<TimeLimit>(prefs.time);
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
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${opts.label ?? 'Runde'} starten`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => { if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current)); }}
        onTouchEnd={() => { if (drag > 80) onClose(); setDrag(0); startY.current = null; }}>
        <div className="sheet-grip" aria-hidden />
        <h2 className="sheet-title">{opts.label ?? 'Runde'}</h2>
        <p className="muted small">{counts.all} Fragen in dieser Auswahl</p>

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
              {t ? `${t} s` : 'Aus'}<span className="seg-n">{TIME_BONUS[t] ? `+${TIME_BONUS[t] * 100} % XP` : t ? 'entspannt' : 'ohne Uhr'}</span>
            </button>
          ))}
        </div>

        <button ref={startBtn} className="btn primary big wide sheet-start" onClick={() => onStart({ difficulty: diff, time })}>
          Start <span className="btn-sub">{Math.min(10, n)} Fragen{time ? ` · ${time} s pro Frage` : ''}</span>
        </button>
      </div>
    </div>
  );
}
