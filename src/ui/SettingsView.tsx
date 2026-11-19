import { useState } from 'react';
import type { Progress } from '../core/types';
import { emptyProgress, mergeProgress } from '../core/progress';
import { useApp } from '../state';
import * as sync from '../sync';
import { REPO_URL } from '../data';

export function SettingsView({ onCredits }: { onCredits: () => void }) {
  const { settings, setSettings, progress, replaceProgress, session, syncState, syncNow, questions } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
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
        {sync.syncConfigured && !session && (
          <form onSubmit={async (e) => {
            e.preventDefault(); setMsg(null); setBusy(true);
            try {
              if (mode === 'login') await sync.signIn(email.trim(), password);
              else await sync.signUp(email.trim(), password);
              setPassword('');
              setMsg(mode === 'login' ? 'Angemeldet! Dein Fortschritt wird abgeglichen.' : 'Konto angelegt und angemeldet!');
            } catch (err: any) { setMsg(err.message ?? String(err)); }
            finally { setBusy(false); }
          }}>
            <p className="muted small">Melde dich auf Handy und PC mit demselben Konto an. Der Fortschritt beider Geräte wird zusammengeführt, nichts geht verloren.</p>
            <div className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Anmelden</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Konto anlegen</button>
            </div>
            <input type="email" required placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input type="password" required minLength={8} placeholder={mode === 'register' ? 'Passwort (mind. 8 Zeichen)' : 'Passwort'} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            <button className="btn primary wide" type="submit" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}</button>
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
        <p className="small muted">Fehler in einer Frage? Nach jeder Antwort gibt es „Frage melden“. Die Meldung geht direkt an den Betreiber der App.</p>
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
