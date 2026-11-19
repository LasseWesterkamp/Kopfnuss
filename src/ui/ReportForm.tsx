import { useState } from 'react';
import type { Question } from '../core/types';
import { sendReport, validateReport, MAX_LEN } from '../report';

/** Aufklappbares Formular „Frage melden“ unter der Antwort */
export function ReportForm({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);

  if (state === 'sent') return <span className="report-done">✓ Danke, Meldung ist angekommen.</span>;
  if (!open) return <button type="button" className="linklike" onClick={() => setOpen(true)}>Frage melden</button>;
  return (
    <form className="report-form" onSubmit={async (e) => {
      e.preventDefault();
      const v = validateReport(text);
      if (v) { setErr(v); return; }
      setState('sending'); setErr(null);
      try { await sendReport(q, text); setState('sent'); } catch (ex: any) { setErr(ex.message); setState('idle'); }
    }}>
      <label className="small" htmlFor={'rep-' + q.id}>Was ist an dieser Frage falsch?</label>
      <textarea id={'rep-' + q.id} rows={3} maxLength={MAX_LEN} autoFocus value={text} onChange={(e) => setText(e.target.value)}
        placeholder="z.B. „Die Hauptstadt ist seit 2024 …“ oder „Antwort B ist auch richtig“" />
      {err && <p className="small report-err">{err}</p>}
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setErr(null); }}>Abbrechen</button>
        <button className="btn primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sendet …' : 'Melden'}</button>
      </div>
    </form>
  );
}
