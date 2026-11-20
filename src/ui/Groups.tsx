import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state';
import * as g from '../groups';
import { rank, daysUntilReset, type Board, type Entry } from '../core/leaderboard';
import { syncConfigured } from '../sync';
import { normalizeCode, isValidCode } from '../core/invite';

const BOARDS: { id: Board; label: string; unit: string }[] = [
  { id: 'woche', label: 'Diese Woche', unit: 'XP' },
  { id: 'serie', label: 'Serie', unit: 'Tage' },
  { id: 'gesamt', label: 'Gesamt', unit: 'XP' },
];

export function Groups({ joinCode, onGoSettings }: { joinCode: string | null; onGoSettings: () => void }) {
  const { session, syncNow, today } = useApp();
  const [name, setName] = useState<string | null | undefined>(undefined); // undefined = lädt
  const [groups, setGroups] = useState<g.Group[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, gs] = await Promise.all([g.getDisplayName(), g.myGroups()]);
      setName(n);
      setGroups(gs);
      setActive((a) => (a && gs.some((x) => x.id === a) ? a : gs[0]?.id ?? null));
    } catch (e: any) { setMsg(e.message); setName(null); }
  }, []);

  useEffect(() => { if (session) load(); }, [session, load]);

  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); if (ok) setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  if (!syncConfigured || !session) {
    return (
      <div className="groups">
        <h2>Gruppen</h2>
        <div className="card">
          <p>Mit Gruppen lernst du zusammen mit Freunden oder der Familie und vergleichst euch in einer Rangliste.</p>
          <p className="muted small">Dafür brauchst du ein Konto, damit deine Punkte geräteübergreifend zählen.</p>
          {joinCode && <p className="small">Einladungscode <strong>{joinCode}</strong> wird nach der Anmeldung übernommen.</p>}
          <button className="btn primary wide" onClick={onGoSettings}>Anmelden oder Konto anlegen</button>
        </div>
      </div>
    );
  }
  if (name === undefined) return <div className="groups"><h2>Gruppen</h2><p className="muted">Lädt …</p></div>;

  if (!name) {
    return (
      <div className="groups">
        <h2>Gruppen</h2>
        <NameForm initial="" busy={busy} onSave={(n) => run(() => g.setDisplayName(n).then(syncNow), 'Name gespeichert.')} />
        {msg && <p className="small">{msg}</p>}
      </div>
    );
  }

  const current = groups.find((x) => x.id === active) ?? null;
  return (
    <div className="groups">
      <h2>Gruppen</h2>
      {groups.length > 1 && (
        <div className="seg group-tabs" role="tablist">
          {groups.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === active} className={x.id === active ? 'on' : ''} onClick={() => setActive(x.id)}>{x.name}</button>
          ))}
        </div>
      )}
      {current && <GroupView key={current.id} group={current} today={today} onChanged={load} setMsg={setMsg} />}

      {/* Einklappbar: zu, sobald man in einer Gruppe ist; offen ohne Gruppe oder mit Einladungscode */}
      <details key={'join' + (groups.length > 0)} className="fold" open={!groups.length || (!!joinCode && !groups.some((x) => x.invite_code === joinCode))}>
        <summary className="fold-head">{groups.length ? 'Weitere Gruppe beitreten oder anlegen' : 'Gruppe beitreten oder anlegen'}</summary>
      <div className="card join-create">
        <JoinForm key={groups.length} initial={joinCode && !groups.some((x) => x.invite_code === joinCode) ? joinCode : ''} busy={busy} onJoin={(code) => run(async () => { const gr = await g.joinGroup(code); setActive(gr.id); await syncNow(); }, 'Beigetreten!')} />
        <div className="or">oder</div>
        <CreateForm busy={busy} onCreate={(n) => run(async () => { const gr = await g.createGroup(n); setActive(gr.id); await syncNow(); }, 'Gruppe angelegt. Teile jetzt den Code!')} />
      </div>
      </details>
      {msg && <p className="small msg">{msg}</p>}

      <details className="fold">
        <summary className="fold-head">Dein Anzeigename: <strong>{name}</strong></summary>
        <div className="card"><NameForm key={name} initial={name} busy={busy} onSave={(n) => run(() => g.setDisplayName(n), 'Name geändert.')} /></div>
      </details>
    </div>
  );
}

function GroupView({ group, today, onChanged, setMsg }: { group: g.Group; today: string; onChanged: () => void; setMsg: (m: string | null) => void }) {
  const { session } = useApp();
  const [board, setBoard] = useState<Board>('woche');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const isOwner = group.owner_id === session?.user.id;

  const refresh = useCallback(() => g.leaderboard(group.id).then(setEntries).catch((e) => setMsg(e.message)), [group.id, setMsg]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 60_000); return () => clearInterval(t); }, [refresh]);

  const share = async () => {
    const link = g.inviteLink(group.invite_code);
    const text = `Lern mit mir bei Kopfnuss in der Gruppe „${group.name}“! Code: ${group.invite_code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Kopfnuss', text, url: link });
      else { await navigator.clipboard.writeText(`${text}\n${link}`); setMsg('Einladung kopiert.'); }
    } catch { /* Teilen abgebrochen */ }
  };
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg(ok); onChanged(); refresh(); } catch (e: any) { setMsg(e.message); } };

  const ranked = entries ? rank(entries, board) : [];
  const unit = BOARDS.find((b) => b.id === board)!.unit;
  return (
    <section className="card group">
      <div className="group-head">
        <div>
          <h3>{group.name}</h3>
          <span className="muted small">{entries?.length ?? '…'} Mitglieder{isOwner ? ' · du bist Admin' : ''}</span>
        </div>
        <button className="btn ghost share-btn" onClick={share}>Einladen<span className="btn-sub">Code {group.invite_code}</span></button>
      </div>
      <div className="seg" role="tablist" aria-label="Wertung">
        {BOARDS.map((b) => <button key={b.id} role="tab" aria-selected={board === b.id} className={board === b.id ? 'on' : ''} onClick={() => setBoard(b.id)}>{b.label}</button>)}
      </div>
      {board === 'woche' && <p className="muted small center">Neue Woche in {daysUntilReset(today)} {daysUntilReset(today) === 1 ? 'Tag' : 'Tagen'} (Montag 0:00 Uhr)</p>}
      {!entries && <p className="muted">Rangliste lädt …</p>}
      <ol className="board">
        {ranked.map((e) => (
          <li key={e.user_id} className={e.is_me ? 'me' : ''}>
            <span className={'place p' + e.place}>{e.place <= 3 ? ['🥇', '🥈', '🥉'][e.place - 1] : e.place + '.'}</span>
            <span className="who">{e.display_name}{e.is_me && <em> (du)</em>}{e.is_owner && <span className="owner" title="Admin"> ★</span>}
              {board === 'woche' && <span className="muted small"> · {e.week_answers} Fragen</span>}</span>
            <span className="val">{e.value} <span className="muted small">{unit === 'Tage' && e.value === 1 ? 'Tag' : unit}</span></span>
            {isOwner && !e.is_me && (
              <button className="icon-btn kick" aria-label={`${e.display_name} entfernen`}
                onClick={() => confirm(`${e.display_name} aus der Gruppe entfernen?`) && act(() => g.removeMember(group.id, e.user_id), 'Mitglied entfernt.')}>✕</button>
            )}
          </li>
        ))}
      </ol>
      <details className="group-admin">
        <summary className="small muted">Gruppe verwalten</summary>
        <div className="row">
          {isOwner && <button className="btn ghost" onClick={() => act(() => g.renewCode(group.id), 'Neuer Code erstellt. Der alte gilt nicht mehr.')}>Code erneuern</button>}
          {isOwner && <button className="btn ghost" onClick={() => { const n = prompt('Neuer Gruppenname', group.name); if (n) act(() => g.renameGroup(group.id, n), 'Umbenannt.'); }}>Umbenennen</button>}
          <button className="btn ghost" onClick={() => confirm('Gruppe wirklich verlassen?') && act(() => g.leaveGroup(group.id), 'Gruppe verlassen.')}>Verlassen</button>
          {isOwner && <button className="btn danger" onClick={() => confirm(`„${group.name}“ für alle löschen?`) && act(() => g.deleteGroup(group.id), 'Gruppe gelöscht.')}>Löschen</button>}
        </div>
      </details>
    </section>
  );
}

function NameForm({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (n: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      {!initial && <p>Wie sollen andere dich in der Rangliste sehen?</p>}
      <input className="text" required maxLength={30} placeholder="Anzeigename, z.B. Lasse" value={v} onChange={(e) => setV(e.target.value)} />
      <p className="muted small">Andere Gruppenmitglieder sehen nur diesen Namen und deine Punkte, nie deine E-Mail oder deinen Lernstand.</p>
      <button className="btn primary wide" disabled={busy || !v.trim() || v.trim() === initial}>{initial ? 'Ändern' : 'Speichern'}</button>
    </form>
  );
}

function JoinForm({ initial, busy, onJoin }: { initial: string; busy: boolean; onJoin: (c: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onJoin(v); }}>
      <label className="small muted">Mit Einladungscode beitreten</label>
      <div className="inline">
        <input className="text code" required minLength={6} maxLength={6} placeholder="ABC123" autoCapitalize="characters" autoComplete="off"
          value={v} onChange={(e) => setV(normalizeCode(e.target.value))} />
        <button className="btn primary" disabled={busy || !isValidCode(v)}>Beitreten</button>
      </div>
    </form>
  );
}

function CreateForm({ busy, onCreate }: { busy: boolean; onCreate: (n: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCreate(v); setV(''); }}>
      <label className="small muted">Neue Gruppe anlegen</label>
      <div className="inline">
        <input className="text" required maxLength={40} placeholder="z.B. Familie, WG, Klasse 10b" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn primary" disabled={busy || !v.trim()}>Anlegen</button>
      </div>
    </form>
  );
}

/** Kurze Zeile für die Startseite: "Platz 2 von 5 in Familie" */
export function GroupTeaser({ onOpen }: { onOpen: () => void }) {
  const { session } = useApp();
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!session || !syncConfigured) return;
    (async () => {
      try {
        const gs = await g.myGroups();
        if (!gs.length) return;
        const r = rank(await g.leaderboard(gs[0].id), 'woche');
        const me = r.find((e) => e.is_me);
        if (me) setLine(`Platz ${me.place} von ${r.length} in „${gs[0].name}“ diese Woche`);
      } catch { /* offline: keine Anzeige */ }
    })();
  }, [session]);
  if (!line) return null;
  return <button className="teaser card" onClick={onOpen}>🏆 {line} <span className="muted">›</span></button>;
}

/** Anzeigename in den Einstellungen (dieselbe Tabelle profiles wie die Gruppen-Seite) */
export function DisplayNameSetting() {
  const { session } = useApp();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!session || !syncConfigured) return;
    g.getDisplayName().then(setName).catch((e) => { setMsg(e.message); setName(null); });
  }, [session]);
  if (!syncConfigured) return null;
  if (!session) return <p className="muted small">Zum Festlegen eines Anzeigenamens erst oben anmelden. Der Name erscheint in den Ranglisten deiner Gruppen.</p>;
  if (name === undefined) return <p className="muted small">Anzeigename lädt …</p>;
  return (
    <div className="display-name">
      <NameForm key={name ?? ''} initial={name ?? ''} busy={busy} onSave={async (n) => {
        setBusy(true); setMsg(null);
        try { await g.setDisplayName(n); setName(n.trim()); setMsg('Gespeichert. Der neue Name steht sofort in allen Ranglisten.'); }
        catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
      }} />
      {msg && <p className="small msg">{msg}</p>}
    </div>
  );
}
