import { useEffect, useState } from 'react';
import type { MapNameQuestion, MapQuestion } from '../core/types';
import type { Result } from './McView';
import { McView } from './McView';
import { MapCanvas } from './MapCanvas';

/** "Wo liegt X?" – Gebiet antippen und bestätigen */
export function MapView({ q, result, onAnswer }: { q: MapQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [q.id]);
  const classFor = (id: string) =>
    result ? (id === q.country ? 'right' : id === result.given ? 'wrong' : '') : id === sel ? 'selected' : '';
  return (
    <div className="map">
      <MapCanvas regions={!!q.regions} area={q.continent} classFor={classFor} onPick={result ? undefined : setSel} resetKey={q.id} />
      {!result && (
        <button className="btn primary wide" disabled={!sel}
          onClick={() => sel && onAnswer({ ok: sel === q.country, score: sel === q.country ? 1 : 0, given: sel })}>
          {sel ? 'Auswahl bestätigen' : 'Gebiet antippen'}
        </button>
      )}
      {result && !result.ok && <p className="muted">Grün markiert: die richtige Lösung. Rot: deine Auswahl.</p>}
    </div>
  );
}

/** "Welches Bundesland ist markiert?" – markierte Region benennen */
export function MapNameView({ q, result, onAnswer }: { q: MapNameQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const classFor = (id: string) => (id === q.country ? (result ? (result.ok ? 'right' : 'marked') : 'marked') : '');
  return (
    <div className="map mapname">
      <MapCanvas regions area={q.continent} classFor={classFor} resetKey={q.id} focus={q.country} />
      <McView q={{ ...q, type: 'mc' }} result={result} onAnswer={onAnswer} />
    </div>
  );
}
