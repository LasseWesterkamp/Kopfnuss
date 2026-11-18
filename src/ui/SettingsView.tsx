import { useState } from 'react';
import type { Progress } from '../core/types';
import { emptyProgress, mergeProgress } from '../core/progress';
import { useApp } from '../state';
import * as sync from '../sync';
import { REPO_URL } from '../data';

export function SettingsView({ onCredits }: { onCredits: () => void }) {
  const { settings, setSettings, progress, replaceProgress, session, syncState, syncNow, questions } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [msg, setMsg] = useState<string | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(progress)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kopfnuss-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importData = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as Progress;
      if (p.version !== 1 || !p.cards || !p.log) throw new Error();
      replaceProgress(mergeProgress(progress, p));
      setMsg('Sicherung eingespielt und mit dem aktuellen Stand zusammengeführt.');
    } catch { setMsg('Diese Datei ist keine gültige Kopfnuss-Sicherung.'); }
  };

  return (
    <div className="settings">
      <h2>Einstellungen</h2>

      <h3 className="section-title">Darstellung</h3>
      <div className="card">
        <div className="seg" role="radiogroup" aria-label="Farbschema">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={settings.theme === t} className={settings.theme === t ? 'on' : ''}
              onClick={() => setSettings({ ...settings, theme: t })}>{t === 'system' ? 'Automatisch' : t === 'light' ? 'Hell' : 'Dunkel'}</button>
          ))}
        </div>
        <label className="switch-row">
          <span>Zeitdruck (25 Sekunden pro Frage)</span>
          <input type="checkbox" checked={settings.timer} onChange={(e) => setSettings({ ...settings, timer: e.target.checked })} />
        </label>
      </div>

      <h3 className="section-title">Konto & Sync</h3>
      <div className="card">
        {!sync.syncConfigured && (
          <p className="muted">Sync ist noch nicht eingerichtet. Dein Fortschritt wird nur auf diesem Gerät gespeichert. Die Einrichtung steht in der README.</p>
        )}
        {sync.syncConfigured && session && (
          <>
            <p>Angemeldet als <strong>{session.user.email}</strong></p>
            <p className="muted small">Status: {syncState}</p>
            <div className="row">
              <button className="btn ghost" onClick={syncNow}>Jetzt synchronisieren</button>
              <button className="btn ghost" onClick={() => sync.signOut()}>Abmelden</button>
            </div>
          </>
        )}
        {sync.syncConfigured && !session && step === 'email' && (
          <form onSubmit={async (e) => {
            e.preventDefault(); setMsg(null);
            try { await sync.sendCode(email.trim()); setStep('code'); setMsg('Code wurde gesendet. Schau in dein Postfach.'); }
            catch (err: any) { setMsg('Fehler: ' + (err.message ?? err)); }
          }}>
            <p className="muted small">Melde dich auf Handy und PC mit derselben E-Mail an, dann wird dein Fortschritt zusammengeführt.</p>
            <input type="email" required placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <button className="btn primary wide" type="submit">Anmeldecode senden</button>
          </form>
        )}
        {sync.syncConfigured && !session && step === 'code' && (
          <form onSubmit={async (e) => {
            e.preventDefault(); setMsg(null);
            try { await sync.verifyCode(email.trim(), code.trim()); setMsg('Angemeldet!'); }
            catch (err: any) { setMsg('Code ungültig oder abgelaufen.'); }
          }}>
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="Code aus der E-Mail" value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="row">
              <button className="btn ghost" type="button" onClick={() => setStep('email')}>Zurück</button>
              <button className="btn primary" type="submit">Anmelden</button>
            </div>
          </form>
        )}
        {msg && <p className="small">{msg}</p>}
      </div>

      <h3 className="section-title">Daten</h3>
      <div className="card">
        <p className="muted small">Sicherung als Datei, z.B. zum Umziehen auf ein neues Gerät ohne Sync.</p>
        <div className="row">
          <button className="btn ghost" onClick={exportData}>Sicherung speichern</button>
          <label className="btn ghost">Sicherung laden<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} /></label>
        </div>
        <button className="btn danger wide" onClick={() => {
          if (confirm('Wirklich den gesamten Fortschritt auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.')) replaceProgress({ ...emptyProgress(), updatedAt: Date.now() });
        }}>Fortschritt zurücksetzen</button>
        {session && <p className="small muted">Hinweis: Mit Sync kommen Daten vom Server beim nächsten Abgleich zurück.</p>}
      </div>

      <h3 className="section-title">Über</h3>
      <div className="card">
        <p className="small">Kopfnuss · {questions?.length ?? '…'} Fragen · <a href={REPO_URL} target="_blank" rel="noreferrer">Quellcode</a></p>
        <p className="small muted">Fehler in einer Frage? Nach jeder Antwort gibt es den Link „Frage melden“.</p>
        <button className="btn ghost wide" onClick={onCredits}>Bildnachweise & Lizenzen</button>
      </div>
    </div>
  );
}

export function Credits({ onBack }: { onBack: () => void }) {
  const { questions } = useApp();
  const imgs = (questions ?? []).filter((q) => q.image);
  return (
    <div className="credits">
      <button className="btn ghost" onClick={onBack}>← Zurück</button>
      <h2>Bildnachweise & Lizenzen</h2>
      <p className="small">Flaggen: <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noreferrer">flag-icons</a> (MIT-Lizenz). Karte: <a href="https://www.naturalearthdata.com" target="_blank" rel="noreferrer">Natural Earth</a> (gemeinfrei) über world-atlas. Länder- und Politikdaten: <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">Wikidata</a> (CC0).</p>
      <p className="small">Fotos und Gemälde stammen von Wikimedia Commons. Die Bilder wurden verkleinert.</p>
      <ul className="credit-list small">
        {imgs.map((q) => (
          <li key={q.id}>
            <strong>{q.type === 'mc' ? q.choices[q.answer] : q.id}</strong>: {q.image!.author},{' '}
            <a href={q.image!.licenseUrl ?? q.image!.sourceUrl} target="_blank" rel="noreferrer">{q.image!.license}</a>,{' '}
            <a href={q.image!.sourceUrl} target="_blank" rel="noreferrer">Quelle</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
