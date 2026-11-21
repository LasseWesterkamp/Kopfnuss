import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import * as push from '../push';
import { DEFAULT_PUSH_PREFS, DAILY_MAX_OPTIONS, STREAK_TIMES, type PushPrefs } from '../core/pushinfo';

const KINDS: { k: keyof PushPrefs; label: string; hint: string }[] = [
  { k: 'challenge', label: 'Herausforderungen', hint: 'jemand fordert dich heraus oder will Revanche' },
  { k: 'decided', label: 'Duell entschieden', hint: 'alle haben gespielt, ohne Ergebnis im Text' },
  { k: 'expiring', label: 'Duell läuft ab', hint: '24 Stunden vorher, wenn du noch nicht gespielt hast' },
  { k: 'streak', label: 'Serie in Gefahr', hint: 'zur gewählten Uhrzeit, wenn du heute noch nichts gemacht hast' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Anleitung fürs iPhone: Push geht nur als Home-Bildschirm-App */
export function IosInstallSteps() {
  return (
    <ol className="ios-steps small">
      <li>Kopfnuss in <strong>Safari</strong> öffnen und unten auf <strong>Teilen</strong> (□↑) tippen.</li>
      <li><strong>„Zum Home-Bildschirm“</strong> wählen und „Hinzufügen“.</li>
      <li>Kopfnuss <strong>über das neue Symbol</strong> öffnen und hier Benachrichtigungen einschalten.</li>
    </ol>
  );
}

/** Bereich "Benachrichtigungen" in den Einstellungen */
export function PushSettings() {
  const { session } = useApp();
  const [on, setOn] = useState<boolean | null>(null);
  const [prefs, setPrefsState] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  // Immer den neuesten Gesamtstand speichern, gebündelt: schnelle Änderungen hintereinander dürfen sich nicht gegenseitig überschreiben
  const latest = useRef<PushPrefs>(DEFAULT_PUSH_PREFS);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPrefs = (p: PushPrefs) => { latest.current = p; setPrefsState(p); };
  useEffect(() => () => { if (saveTimer.current) { clearTimeout(saveTimer.current); push.savePrefs(latest.current).catch(() => {}); } }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const adv = push.advice();
  useEffect(() => {
    if (!session) return;
    push.isOn().then(setOn).catch(() => setOn(false));
    push.loadPrefs().then(setPrefs).catch(() => {});
  }, [session]);

  if (!push.pushConfigured) return null;
  if (!session) return <p className="muted small">Für Benachrichtigungen erst oben anmelden.</p>;
  if (adv === 'ios-install') return (<><p className="small">Auf dem iPhone gehen Benachrichtigungen nur, wenn Kopfnuss auf dem Home-Bildschirm liegt (Apple-Regel):</p><IosInstallSteps /></>);
  if (adv === 'ios-old') return <p className="small">Dein iPhone braucht mindestens iOS 16.4 für Benachrichtigungen aus Web-Apps. Ein Update unter Einstellungen → Allgemein → Softwareupdate hilft.</p>;
  if (adv === 'unsupported') return <p className="small muted">Dieser Browser kann keine Benachrichtigungen von Web-Apps empfangen.</p>;
  if (adv === 'denied') return <p className="small">Benachrichtigungen sind für Kopfnuss blockiert. Du kannst sie in den Einstellungen deines Browsers bzw. unter iPhone-Einstellungen → Mitteilungen → Kopfnuss wieder erlauben.</p>;
  if (on === null) return <p className="muted small">Lädt …</p>;

  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await f(); setMsg(ok); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const change = (patch: Partial<PushPrefs>) => {
    setPrefs({ ...latest.current, ...patch });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; push.savePrefs(latest.current).catch((e) => setMsg(e.message)); }, 300);
  };

  if (!on) return (
    <div className="push-off">
      <p className="small">Ich sage dir Bescheid, wenn dich jemand herausfordert, ein Duell entschieden ist oder deine Serie in Gefahr ist. Höchstens 5 Nachrichten am Tag, nachts Ruhe.</p>
      <button className="btn primary wide" disabled={busy} onClick={() => run(async () => { await push.enable(); setOn(true); setPrefs(await push.loadPrefs()); }, 'Eingeschaltet.')}>🔔 Benachrichtigungen einschalten</button>
      {msg && <p className="small msg">{msg}</p>}
    </div>
  );
  return (
    <div className="push-on">
      <p className="small">🔔 Auf diesem Gerät eingeschaltet. Gilt für alle deine Geräte, auf denen du es eingeschaltet hast:</p>
      {KINDS.map(({ k, label, hint }) => (
        <label key={k} className="switch-row">
          <span>{label}<br /><span className="muted small">{hint}</span></span>
          <input type="checkbox" checked={!!prefs[k]} onChange={(e) => change({ [k]: e.target.checked })} />
        </label>
      ))}
      {prefs.streak && (
        <div className="quiet-row">
          <span>Serie-Erinnerung um</span>
          <select aria-label="Uhrzeit Serie-Erinnerung" value={prefs.streak_time} onChange={(e) => change({ streak_time: e.target.value })}>
            {STREAK_TIMES.map((t) => <option key={t} value={t}>{t} Uhr</option>)}
          </select>
        </div>
      )}

      <h4 className="push-h">Höchstens pro Tag</h4>
      <div className="seg" role="radiogroup" aria-label="Höchstens pro Tag">
        {DAILY_MAX_OPTIONS.map((n) => (
          <button key={n} role="radio" aria-checked={prefs.daily_max === n} className={prefs.daily_max === n ? 'on' : ''} onClick={() => change({ daily_max: n })}>{n || '∞'}</button>
        ))}
      </div>
      <p className="muted small">{prefs.daily_max ? `Danach kommt an dem Tag nichts mehr.` : 'Keine Obergrenze.'}</p>

      <label className="switch-row">
        <span>Ruhezeit<br /><span className="muted small">{prefs.quiet_enabled ? 'nachts nichts, Herausforderungen und Ergebnisse kommen danach' : 'aus: Nachrichten kommen auch nachts'}</span></span>
        <input type="checkbox" aria-label="Ruhezeit an" checked={prefs.quiet_enabled} onChange={(e) => change({ quiet_enabled: e.target.checked })} />
      </label>
      {prefs.quiet_enabled && (
        <div className="quiet-row">
          <span>von</span>
          <select aria-label="Ruhezeit von" value={prefs.quiet_start} onChange={(e) => change({ quiet_start: +e.target.value })}>
            {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
          <span>bis</span>
          <select aria-label="Ruhezeit bis" value={prefs.quiet_end} onChange={(e) => change({ quiet_end: +e.target.value })}>
            {HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </div>
      )}

      <button className="btn ghost wide push-test" disabled={busy} onClick={() => run(() => push.sendTest(), 'Testnachricht ist unterwegs. Sie sollte in wenigen Sekunden auf allen eingeschalteten Geräten erscheinen.')}>🔔 Testnachricht senden</button>
      <button className="btn ghost wide" disabled={busy} onClick={() => run(async () => { await push.disable(); setOn(false); }, 'Auf diesem Gerät ausgeschaltet.')}>Auf diesem Gerät ausschalten</button>
      {msg && <p className="small msg">{msg}</p>}
    </div>
  );
}

/** Einmaliger Hinweis nach dem ersten Duell */
export function PushHint({ onSettings }: { onSettings: () => void }) {
  const { session } = useApp();
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const adv = push.advice();
  useEffect(() => {
    if (!session || !push.pushConfigured || push.hintDone() || (adv !== 'ok' && adv !== 'ios-install')) return;
    push.isOn().then((on) => setShow(!on)).catch(() => {});
  }, [session, adv]);
  if (!show) return null;
  const close = () => { push.setHintDone(); setShow(false); };
  return (
    <div className="card push-hint">
      <p><strong>🔔 Soll ich dir Bescheid sagen?</strong><br /><span className="small">Wenn dein Gegner fertig ist oder dich jemand herausfordert.</span></p>
      {adv === 'ios-install' ? <IosInstallSteps /> : null}
      <div className="row">
        <button className="btn ghost" onClick={close}>Nein danke</button>
        {adv === 'ok'
          ? <button className="btn primary" onClick={async () => { try { await push.enable(); setMsg('Eingeschaltet. Einstellen kannst du es unter Mehr.'); push.setHintDone(); setTimeout(() => setShow(false), 2500); } catch (e: any) { setMsg(e.message); } }}>Einschalten</button>
          : <button className="btn primary" onClick={() => { close(); onSettings(); }}>Mehr dazu</button>}
      </div>
      {msg && <p className="small msg">{msg}</p>}
    </div>
  );
}
