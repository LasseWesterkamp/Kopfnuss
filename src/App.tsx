import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question, TopicId } from './core/types';
import { buildSession, againOptions, type SessionOptions } from './core/selection';
import { AppProvider, useApp } from './state';
import { Home } from './ui/Home';
import { Practice } from './ui/Practice';
import { Quiz, Summary, type SessionSummary } from './ui/Quiz';
import { Stats } from './ui/Stats';
import { SettingsView, Credits } from './ui/SettingsView';
import { Groups, GroupTeaser } from './ui/Groups';
import { Puzzle } from './ui/Puzzle';
import { TopicPage, type StartOpts } from './ui/TopicPage';
import { Mistakes } from './ui/Mistakes';
import { LearnPage } from './ui/LearnPage';
import { puzzleByKey } from './core/puzzles';
import { codeFromUrl } from './core/invite';
import { useRouter, hashToRoute, type Route } from './router';
import { StartSheet } from './ui/StartSheet';
import { loadRoundPrefs, saveRoundPrefs } from './storage';
import type { RoundPrefs } from './core/round';
import { DuelPage, DuelPlay, useDuels, duelBadge } from './ui/Duels';
import { pickDuelQuestions, duelTime, duelCodeFromUrl, type Duel } from './core/duel';
import * as du from './duel';
import { TOPIC_NAMES } from './core/badges';

/** Laufende Runde bzw. Ergebnis (nur im Speicher, nicht in der Adresse) */
interface RoundData { opts: SessionOptions; daily: boolean; label?: string; questions?: Question[]; summary?: SessionSummary; key: number; duel?: Duel; duelIds?: string[] }

function Shell() {
  const { questions, progress, today, loadError, streak, session } = useApp();
  // Einladungslink ?beitreten=CODE öffnet direkt die Gruppen mit vorausgefülltem Code
  const [joinCode] = useState<string | null>(() => {
    const c = codeFromUrl(location.search);
    if (location.search.includes('beitreten')) history.replaceState(null, '', location.pathname + location.hash);
    return c;
  });
  // Duell-Link ?duell=CODE öffnet die Gruppen-Seite und nimmt das Duell an
  const [duelCode] = useState<string | null>(() => {
    const c = duelCodeFromUrl(location.search);
    if (location.search.includes('duell')) history.replaceState(null, '', location.pathname + location.hash);
    return c;
  });
  const { route, data, go, back } = useRouter<RoundData>(joinCode || duelCode ? { name: 'groups' } : hashToRoute(location.hash));
  const duels = useDuels(!!session);
  const { reload: reloadDuels } = duels;
  useEffect(() => { if (session && (route.name === 'groups' || route.name === 'home')) reloadDuels(); }, [route.name, session, reloadDuels]);
  const badge = duelBadge(duels.duels);

  const startRound = (opts: SessionOptions, daily: boolean, label?: string, replace = false) => {
    if (!questions) return;
    const qs = buildSession(questions, progress, today, daily ? {} : { maxReviews: 5, ...opts });
    go({ name: 'quiz' }, { opts, daily, label, questions: qs, key: Date.now() }, { replace });
  };
  // Startmenü (Stufe + Zeitdruck). Liegt als eigener History-Eintrag oben drauf, damit Zurück/Wischen es schließt.
  const [sheet, setSheet] = useState<StartOpts | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const onPop = () => { setSheet(null); const f = afterClose.current; afterClose.current = null; f?.(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sheet]);
  const closeSheet = useCallback((then?: () => void) => { afterClose.current = then ?? null; history.back(); }, []);
  const start = (o: StartOpts) => {
    const { label, ...opts } = o;
    // Fehler üben: direkt los, alle offenen Fehler dürfen in die Runde (nicht auf 5 Wiederholungen begrenzt)
    if (o.ids) return startRound({ ...opts, maxReviews: 10 }, false, label);
    history.pushState({ ...history.state, sheet: true }, '');
    setSheet(o);
  };
  const duelWith = (o: StartOpts, p: RoundPrefs) => {
    saveRoundPrefs(p);
    const { label, topics, cats, subs } = o;
    closeSheet(async () => {
      try {
        const ids = pickDuelQuestions(questions ?? [], { topics, cats, subs, difficulty: p.difficulty });
        const name = label && label !== 'Üben' ? label : topics?.length ? topics.map((t) => TOPIC_NAMES[t]).join(', ') : 'Alle Themen';
        const r = await du.createDuel(name, { topics, cats, subs, difficulty: p.difficulty ?? null }, ids, duelTime(p.time));
        reloadDuels();
        go({ name: 'duel', id: r.id });
      } catch (e: any) { alert('Duell konnte nicht angelegt werden: ' + e.message); }
    });
  };
  const startWith = (o: StartOpts, p: RoundPrefs) => {
    saveRoundPrefs(p);
    const { label, ...opts } = o;
    closeSheet(() => startRound({ ...opts, difficulty: p.difficulty, timeLimit: p.time }, false, label));
  };
  const nav = (r: Route) => go(r);
  const tab = (name: 'home' | 'practice' | 'groups' | 'stats' | 'settings') => nav({ name } as Route);
  const inQuiz = route.name === 'quiz' || route.name === 'puzzle' || route.name === 'duelplay';
  const activeTab = route.name === 'credits' ? 'settings' : route.name === 'duel' ? 'groups' : route.name === 'topic' || route.name === 'summary' || route.name === 'mistakes' || route.name === 'learn' ? 'home' : route.name;

  let page: JSX.Element | null = null;
  switch (route.name) {
    case 'home':
      page = (<>
        <GroupTeaser onOpen={() => tab('groups')} />
        <Home onDaily={() => startRound({}, true, 'Tages-Challenge')} onTopic={(t) => nav({ name: 'topic', id: t })}
          onMix={() => startRound({}, false, 'Zufallsmix')} onMistakes={() => nav({ name: 'mistakes' })} />
      </>);
      break;
    case 'topic':
      page = <TopicPage topic={route.id as TopicId} onStart={start} onPuzzle={(key) => nav({ name: 'puzzle', key })} onMistakes={() => nav({ name: 'mistakes' })}
        onLearn={(kind, id) => nav({ name: 'learn', topic: route.id, kind, id })} />;
      break;
    case 'learn':
      page = <LearnPage key={route.topic + route.kind + route.id} topic={route.topic as TopicId} kind={route.kind} id={route.id} onStart={start} />;
      break;
    case 'mistakes':
      page = <Mistakes onStart={start} />;
      break;
    case 'practice':
      page = <Practice initial={null} onStart={(s) => start({ topics: s.topics, subs: s.subs, cats: s.cats, label: 'Üben' })}
        onPuzzle={(key) => nav({ name: 'puzzle', key })} />;
      break;
    case 'puzzle': {
      const def = puzzleByKey(route.key);
      page = def ? <Puzzle key={def.key} def={def} onExit={back} /> : <div className="card">Dieses Puzzle gibt es nicht.</div>;
      break;
    }
    case 'groups': page = <Groups joinCode={joinCode} onGoSettings={() => tab('settings')} duels={duels} duelCode={duelCode} onOpenDuel={(id) => nav({ name: 'duel', id })} />; break;
    case 'duel':
      page = <DuelPage key={route.id} id={route.id} onBack={back}
        onPlay={(d, ids) => go({ name: 'duelplay' }, { opts: {}, daily: false, key: Date.now(), duel: d, duelIds: ids })} />;
      break;
    case 'duelplay':
      page = data?.duel && data.duelIds ? (
        <DuelPlay key={data.key} duel={data.duel} ids={data.duelIds}
          onDone={() => { reloadDuels(); go({ name: 'duel', id: data.duel!.id }, undefined, { replace: true }); }}
          onExit={() => { reloadDuels(); go({ name: 'duel', id: data.duel!.id }, undefined, { replace: true }); }} />
      ) : <p className="muted">Dieses Duell ist beendet. Das Ergebnis findest du unter Gruppen → Duelle.</p>;
      break;
    case 'stats': page = <Stats onMistakes={() => nav({ name: 'mistakes' })} />; break;
    case 'settings': page = <SettingsView onCredits={() => nav({ name: 'credits' })} />; break;
    case 'credits': page = <Credits onBack={back} />; break;
    case 'quiz':
      page = data?.questions ? (
        <Quiz key={data.key} questions={data.questions} daily={data.daily} timeLimit={data.opts.timeLimit} onExit={back}
          onDone={(s) => go({ name: 'summary' }, { ...data, summary: s }, { replace: true })} />
      ) : <p className="muted">Diese Runde ist beendet.</p>;
      break;
    case 'summary':
      page = data?.summary ? (
        <Summary s={data.summary} label={data.label} currentDifficulty={data.opts.difficulty} timeLimit={data.opts.timeLimit} onHome={() => tab('home')}
          onAgain={(d) => startRound(againOptions(data.opts, d), data.daily && d === undefined, data.label, true)} />
      ) : <p className="muted">Kein Ergebnis vorhanden.</p>;
      break;
  }

  return (
    <div className={'app' + (inQuiz ? ' in-quiz' : '')}>
      {!inQuiz && (
        <header className="topbar">
          {route.name !== 'home' && ['topic', 'mistakes', 'credits', 'summary', 'learn', 'duel'].includes(route.name)
            ? <button className="icon-btn back-btn" aria-label="Zurück" onClick={back}>←</button> : null}
          <h1 onClick={() => tab('home')}><span className="logo">🌰</span> Kopfnuss</h1>
          <span className="topbar-streak" title="Serie">{streak.current > 0 ? '🔥' : '🌑'} {streak.current}</span>
        </header>
      )}
      <main>
        {loadError && <div className="card error">Fragen konnten nicht geladen werden: {loadError}</div>}
        {page}
      </main>
      {sheet && <StartSheet opts={sheet} prefs={loadRoundPrefs()} onStart={(p) => startWith(sheet, p)} onDuel={(p) => duelWith(sheet, p)} onClose={() => closeSheet()} />}
      {!inQuiz && (
        <nav className="tabbar">
          {([['home', '🏠', 'Start'], ['practice', '🎯', 'Üben'], ['groups', '🏆', 'Gruppen'], ['stats', '📊', 'Statistik'], ['settings', '⚙️', 'Mehr']] as const).map(([n, icon, label]) => (
            <button key={n} className={activeTab === n ? 'on' : ''} onClick={() => tab(n)}>
              <span aria-hidden>{icon}</span><span>{label}</span>
              {n === 'groups' && badge > 0 && <span className="tab-badge" aria-label={`${badge} Duelle`}>{badge}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
