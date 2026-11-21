import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '../core/types';
import { useApp } from '../state';
import * as du from '../duel';
import { rankDuel, duelStatus, myOutcome, headToHead, fmtSec, type Duel, type DuelAnswer, type DuelStatus } from '../core/duel';
import { normalizeCode, isValidCode } from '../core/invite';
import { Quiz } from './Quiz';
import { PushHint } from './PushSettings';

export const DUEL_POLL_MS = 10_000;

/** Eigene Duelle laden (mit Neuladen-Funktion) */
export function useDuels(enabled: boolean) {
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { await du.flushPending().catch(() => {}); setDuels(await du.myDuels()); setErr(null); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { duels, err, reload: load };
}

/** Zahl am Tab: Duelle, in denen ich dran bin, plus neu entschiedene */
export function duelBadge(duels: Duel[] | null): number {
  if (!duels) return 0;
  const seen = du.loadSeen();
  return duels.filter((d) => { const s = duelStatus(d); return s === 'dran' || (s === 'fertig' && !seen.has(d.id)); }).length;
}

async function share(code: string, label: string) {
  const url = du.duelUrl(code);
  const text = `Ich fordere dich bei Kopfnuss heraus: ${label}, 10 Fragen. Code ${code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Kopfnuss-Duell', text, url }); return 'Geteilt.'; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'Link kopiert.';
  } catch { return null; }
}

const STATUS_LABEL: Record<DuelStatus, string> = { dran: 'Du bist dran', warten: 'Wartet auf andere', fertig: 'Fertig', abgelaufen: 'Abgelaufen' };

/** Bereich "Duelle" auf der Gruppen-Seite */
export function DuelSection({ duels, err, reload, initialCode, onCodeUsed, onOpen }: {
  duels: Duel[] | null; err: string | null; reload: () => void; initialCode: string | null; onCodeUsed: () => void; onOpen: (id: string) => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState(20);
  const tried = useRef(false);
  const join = useCallback(async (c: string) => {
    setBusy(true); setMsg(null);
    try { const id = await du.joinDuel(c); reload(); onOpen(id); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }, [reload, onOpen]);
  // Einladungslink: einmal automatisch annehmen, dann ist der Code verbraucht (sonst würde jeder Besuch der Gruppen-Seite erneut umleiten)
  useEffect(() => { if (initialCode && !tried.current) { tried.current = true; onCodeUsed(); join(initialCode); } }, [initialCode, join, onCodeUsed]);

  const groups: Record<DuelStatus, Duel[]> = { dran: [], warten: [], fertig: [], abgelaufen: [] };
  for (const d of duels ?? []) groups[duelStatus(d)].push(d);
  const h2h = headToHead(duels ?? []);
  // Verlauf: fertige und abgelaufene, neueste zuerst; standardmäßig eingeklappt
  const history = [...groups.fertig, ...groups.abgelaufen].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
  const seen = du.loadSeen();
  const freshCount = groups.fertig.filter((d) => !seen.has(d.id)).length;
  return (
    <section className="duels">
      <h3 className="section-title">⚔️ Duelle</h3>
      {!duels && !err && <p className="muted small">Lädt …</p>}
      {err && <p className="small msg">{err}</p>}
      {duels && duels.length === 0 && (
        <p className="muted small card">Noch keine Duelle. Wähle auf einer Themenseite ▶ oder im Tab „Üben“ eine Auswahl und tippe im Startmenü auf <strong>⚔️ Als Duell</strong>. Den Link schickst du dann z.B. per WhatsApp.</p>
      )}
      {(['dran', 'warten'] as DuelStatus[]).map((s) => groups[s].length > 0 && (
        <div key={s} className="duel-group">
          <p className="small muted sub-hint">{STATUS_LABEL[s]}</p>
          {groups[s].map((d) => <DuelRow key={d.id} d={d} status={s} onOpen={() => onOpen(d.id)} />)}
        </div>
      ))}
      {history.length > 0 && (
        <details className="fold duel-history">
          <summary className="fold-head">Verlauf <span className="muted small">({history.length}{freshCount ? `, ${freshCount} neu` : ''})</span></summary>
          <div className="duel-group">
            {history.slice(0, shown).map((d) => <DuelRow key={d.id} d={d} status={duelStatus(d)} onOpen={() => onOpen(d.id)} />)}
            {history.length > shown && <button className="btn ghost wide" onClick={() => setShown((n) => n + 20)}>Mehr anzeigen <span className="btn-sub">noch {history.length - shown}</span></button>}
          </div>
        </details>
      )}
      {h2h.length > 0 && (
        <details className="fold duel-h2h">
          <summary className="fold-head">Bilanz <span className="muted small">(Siege : Niederlagen, Unentschieden)</span></summary>
          <div className="card h2h">
            {h2h.map((x) => <div key={x.user_id} className="h2h-row"><span>gegen {x.name}</span><strong>{x.win} : {x.loss}{x.draw ? `, ${x.draw}×` : ''}</strong></div>)}
          </div>
        </details>
      )}
      <form className="inline duel-join" onSubmit={(e) => { e.preventDefault(); const c = normalizeCode(code); if (isValidCode(c)) join(c); }}>
        <input className="text code" placeholder="Duell-Code" maxLength={6} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} />
        <button className="btn primary" disabled={busy || !isValidCode(code)}>Annehmen</button>
      </form>
      {msg && <p className="small msg">{msg}</p>}
    </section>
  );
}

function DuelRow({ d, status, onOpen }: { d: Duel; status: DuelStatus; onOpen: () => void }) {
  const others = d.players.filter((p) => !p.is_me).map((p) => p.name);
  const out = status === 'fertig' ? myOutcome(d) : null;
  const fresh = status === 'fertig' && !du.loadSeen().has(d.id);
  return (
    <button className={'duel-row card' + (status === 'dran' ? ' dran' : '')} onClick={onOpen}>
      <span className="duel-icon">{out === 'sieg' ? '🏆' : out === 'niederlage' ? '😤' : out === 'unentschieden' ? '🤝' : status === 'dran' ? '⚔️' : status === 'abgelaufen' ? '⌛' : '⏳'}</span>
      <span className="grow">
        <strong>{d.label}</strong>{fresh && <span className="chip new-chip">neu</span>}<br />
        <span className="muted small">{others.length ? 'gegen ' + others.join(', ') : 'noch kein Gegner · Code ' + d.code}{out ? ` · ${out === 'sieg' ? 'gewonnen' : out === 'niederlage' ? 'verloren' : 'unentschieden'}` : ''}</span>
      </span>
      <span className="muted">›</span>
    </button>
  );
}

/** Detailseite eines Duells: Spieler, Start, Ergebnis mit Vergleich Frage für Frage */
export function DuelPage({ id, onPlay, onBack, onRematch, onSettings }: { id: string; onPlay: (d: Duel, ids: string[]) => void; onBack: () => void; onRematch: (d: Duel) => Promise<void>; onSettings: () => void }) {
  const { questions, session } = useApp();
  const { duels, err, reload } = useDuels(!!session);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const d = duels?.find((x) => x.id === id) ?? null;
  const status = d ? duelStatus(d) : null;
  useEffect(() => { if (d && status === 'fertig') du.markSeen(d.id); }, [d, status]);
  // Aktuell halten: beim Zurückkehren, alle 10 s solange sichtbar, sofort bei eingehender Push-Nachricht
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('kopfnuss-refresh', reload);
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, DUEL_POLL_MS);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('kopfnuss-refresh', reload); clearInterval(t); };
  }, [reload]);
  const [mates, setMates] = useState<du.Mate[]>([]);
  useEffect(() => { if (session) du.myGroupmates().then(setMates).catch(() => {}); }, [session]);

  if (!session) return <div className="card">Für Duelle bitte erst anmelden (Mehr → Konto).</div>;
  if (err) return <div className="card">{err}</div>;
  if (!duels) return <p className="muted">Lädt …</p>;
  if (!d) return <div className="card">Dieses Duell gibt es nicht (mehr) oder du bist nicht dabei. <button className="btn ghost" onClick={onBack}>Zurück</button></div>;

  const me = d.players.find((p) => p.is_me)!;
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const valid = d.question_ids ? d.question_ids.map((qid) => byId.has(qid)) : null;
  const nValid = valid ? valid.filter(Boolean).length : d.n;
  const ranked = rankDuel(d.players, valid);
  const out = status === 'fertig' ? myOutcome(d, valid) : null;
  const start = async () => {
    if (!confirm(`Los? ${d.n} Fragen, ${d.time_limit} s pro Frage. Die Uhr läuft ab jetzt, Pause oder Neustart gibt es nicht.`)) return;
    setBusy(true); setMsg(null);
    try { const r = await du.startDuel(d.id); onPlay(d, r.question_ids); } catch (e: any) { setMsg(e.message); reload(); } finally { setBusy(false); }
  };

  return (
    <div className="duel-page">
      <div className="card duel-head">
        <h2>⚔️ {d.label}</h2>
        <p className="muted small">{d.n} Fragen · {d.time_limit} s pro Frage{Number(d.settings?.blitz) ? ` · ⚡ Blitz ${String(d.settings.blitz).replace('.', ',')} s` : ''} · Code <strong>{d.code}</strong> · läuft bis {new Date(d.expires_at).toLocaleDateString('de-DE')}</p>
        {status === 'fertig' && (
          <p className={'duel-outcome ' + (out ?? '')}>{out === 'sieg' ? '🏆 Du hast gewonnen!' : out === 'niederlage' ? `😤 ${ranked.find((r) => r.place === 1)?.player.name} hat gewonnen.` : out === 'unentschieden' ? '🤝 Unentschieden!' : 'Keiner hat angenommen.'}</p>
        )}
        {status === 'abgelaufen' && <p className="duel-outcome">⌛ Abgelaufen.</p>}
        {me.state === 'offen' && status === 'dran' && (
          <button className="btn primary big wide" disabled={busy || !questions} onClick={start}>Jetzt spielen <span className="btn-sub">Uhr läuft ab dem Start</span></button>
        )}
        {status === 'fertig' && d.players.length > 1 && (
          <button className="btn primary big wide rematch-btn" disabled={busy || !questions}
            onClick={async () => { setBusy(true); try { await onRematch(d); } finally { setBusy(false); } }}>
            🔁 {d.rematch_id ? 'Zur Revanche' : 'Revanche'}
            <span className="btn-sub">{d.rematch_id ? 'gibt es schon' : `gleiche Einstellungen, neue Fragen, gegen ${d.players.filter((p) => !p.is_me).map((p) => p.name).join(', ')}`}</span>
          </button>
        )}
        {status !== 'fertig' && status !== 'abgelaufen' && d.players.length < 10 && (
          <button className="btn ghost wide" onClick={async () => setMsg(await share(d.code, d.label))}>Per Link einladen <span className="btn-sub">Link oder Code {d.code}</span></button>
        )}
        {msg && <p className="small msg">{msg}</p>}
      </div>

      {status !== 'fertig' && status !== 'abgelaufen' && d.players.length < 10 && (() => {
        const free = mates.filter((m) => !d.players.some((p) => p.user_id === m.user_id));
        return free.length > 0 && (
          <>
            <h3 className="section-title">Aus deinen Gruppen dazuholen</h3>
            <div className="chips mates">
              {free.map((m) => (
                <button key={m.user_id} className="chip-btn" disabled={busy}
                  onClick={async () => { setBusy(true); setMsg(null); try { await du.inviteToDuel(d.id, [m.user_id]); await reload(); setMsg(`${m.name} ist dabei.`); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } }}>
                  ⚔️ {m.name}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      <PushHint onSettings={onSettings} />

      <h3 className="section-title">Spieler</h3>
      <div className="card duel-players">
        {d.players.map((p) => {
          const r0 = ranked.find((x) => x.player.user_id === p.user_id);
          const r = status === 'fertig' ? r0 : undefined; // Plätze erst, wenn entschieden
          return (
            <div key={p.user_id} className={'duel-player' + (p.is_me ? ' me' : '')}>
              <span className="place">{r ? (r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : r.place + '.') : '·'}</span>
              <span className="grow">{p.name}{p.is_me && <em> (du)</em>}{p.is_creator && <span className="muted small"> · Herausforderer</span>}
                {r?.tie && <span className="chip">gleichauf</span>}</span>
              <span className="duel-score">
                {p.state === 'fertig' && p.ms !== null
                  ? <><strong>{r0 ? r0.correct : p.correct} / {nValid}</strong> <span className="muted small">{fmtSec(p.ms)}{p.aborted ? ' · abgebrochen' : ''}</span></>
                  : p.state === 'fertig' ? <span className="muted small">fertig (siehst du nach deiner Runde)</span>
                  : <span className="muted small">{p.state === 'spielt' ? 'spielt gerade' : 'noch nicht gespielt'}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {me.state === 'fertig' && status !== 'fertig' && <p className="small muted">Das Ergebnis steht fest, sobald alle gespielt haben oder das Duell abläuft.</p>}

      {me.state === 'fertig' && d.question_ids && (
        <>
          <h3 className="section-title">Frage für Frage</h3>
          <div className="duel-compare card">
            <table>
              <thead><tr><th>Frage</th>{d.players.filter((p) => p.answers).map((p) => <th key={p.user_id}>{p.is_me ? 'Du' : p.name}</th>)}</tr></thead>
              <tbody>
                {d.question_ids.map((qid, i) => {
                  const q = byId.get(qid);
                  return (
                    <tr key={qid} className={q ? '' : 'removed'}>
                      <td>{i + 1}. {q ? shortPrompt(q) : 'Frage entfernt (zählt nicht)'}</td>
                      {d.players.filter((p) => p.answers).map((p) => {
                        const a = p.answers!.find((x) => x.i === i);
                        return <td key={p.user_id} className={a ? (a.ok ? 'right' : 'wrong') : 'none'}>{a ? (a.ok ? '✓' : '✗') : '–'}<span className="muted small"> {a ? fmtSec(a.ms) : ''}</span></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function shortPrompt(q: Question): string {
  const ans = q.type === 'mc' || q.type === 'mapname' ? q.choices[q.answer] : q.type === 'flagpick' ? q.optionLabels[q.answer] : '';
  return ans ? `${q.prompt.replace(/\?$/, '')} → ${ans}` : q.prompt;
}

/**
 * Laufendes Duell: normale Fragerunde mit Pflicht-Zeitlimit. Jede Antwort wird sofort lokal gesichert.
 * Verlassen (✕, Zurück, App zu) = Abgabe mit dem bisherigen Stand, der Rest zählt falsch.
 */
export function DuelPlay({ duel, ids, onDone, onExit }: { duel: Duel; ids: string[]; onDone: () => void; onExit: () => void }) {
  const { questions } = useApp();
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const [list] = useState(() => ids.map((qid, i) => ({ q: byId.get(qid), i })).filter((x): x is { q: Question; i: number } => !!x.q));
  const answers = useRef<DuelAnswer[]>([]);
  const finished = useRef(false);
  const submit = useCallback(async (aborted: boolean) => {
    if (finished.current) return;
    finished.current = true;
    try { await du.finishDuel(duel.id, answers.current, aborted); du.savePending(null); } catch { /* bleibt lokal gespeichert, wird später nachgeholt */ }
  }, [duel.id]);
  useEffect(() => {
    du.savePending({ id: duel.id, answers: [] });
    const onHide = () => { if (!finished.current) du.savePending({ id: duel.id, answers: answers.current }); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); submit(true); }; // Verlassen per Zurück
  }, [duel.id, submit]);

  return (
    <Quiz questions={list.map((x) => x.q)} daily={false} timeLimit={duel.time_limit} blitz={Number(duel.settings?.blitz) || 0} title={`⚔️ Duell: ${duel.label}`}
      onAnswer={(k, r, ms) => { answers.current = [...answers.current, { i: list[k].i, ok: r.ok, ms }]; du.savePending({ id: duel.id, answers: answers.current }); }}
      onExit={() => { if (confirm('Duell abbrechen? Die restlichen Fragen zählen als falsch.')) { submit(true).then(onExit); } }}
      onDone={() => { submit(false).then(onDone); }} />
  );
}
