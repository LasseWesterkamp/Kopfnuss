import { useState } from 'react';
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

/** Laufende Runde bzw. Ergebnis (nur im Speicher, nicht in der Adresse) */
interface RoundData { opts: SessionOptions; daily: boolean; label?: string; questions?: Question[]; summary?: SessionSummary; key: number }

function Shell() {
  const { questions, progress, today, loadError, streak } = useApp();
  // Einladungslink ?beitreten=CODE öffnet direkt die Gruppen mit vorausgefülltem Code
  const [joinCode] = useState<string | null>(() => {
    const c = codeFromUrl(location.search);
    if (location.search.includes('beitreten')) history.replaceState(null, '', location.pathname + location.hash);
    return c;
  });
  const { route, data, go, back } = useRouter<RoundData>(joinCode ? { name: 'groups' } : hashToRoute(location.hash));

  const startRound = (opts: SessionOptions, daily: boolean, label?: string, replace = false) => {
    if (!questions) return;
    const qs = buildSession(questions, progress, today, daily ? {} : { maxReviews: 5, ...opts });
    go({ name: 'quiz' }, { opts, daily, label, questions: qs, key: Date.now() }, { replace });
  };
  const start = (o: StartOpts) => {
    const { label, ...opts } = o;
    // Fehler üben: alle offenen Fehler dürfen in die Runde (nicht auf 5 Wiederholungen begrenzt)
    startRound(o.ids ? { ...opts, maxReviews: 10 } : opts, false, label);
  };
  const nav = (r: Route) => go(r);
  const tab = (name: 'home' | 'practice' | 'groups' | 'stats' | 'settings') => nav({ name } as Route);
  const inQuiz = route.name === 'quiz' || route.name === 'puzzle';
  const activeTab = route.name === 'credits' ? 'settings' : route.name === 'topic' || route.name === 'summary' || route.name === 'mistakes' || route.name === 'learn' ? 'home' : route.name;

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
      page = <Practice initial={null} onStart={(s) => startRound({ topics: s.topics, difficulty: s.diff, subs: s.subs, cats: s.cats }, false, 'Üben')}
        onPuzzle={(key) => nav({ name: 'puzzle', key })} />;
      break;
    case 'puzzle': {
      const def = puzzleByKey(route.key);
      page = def ? <Puzzle key={def.key} def={def} onExit={back} /> : <div className="card">Dieses Puzzle gibt es nicht.</div>;
      break;
    }
    case 'groups': page = <Groups joinCode={joinCode} onGoSettings={() => tab('settings')} />; break;
    case 'stats': page = <Stats onMistakes={() => nav({ name: 'mistakes' })} />; break;
    case 'settings': page = <SettingsView onCredits={() => nav({ name: 'credits' })} />; break;
    case 'credits': page = <Credits onBack={back} />; break;
    case 'quiz':
      page = data?.questions ? (
        <Quiz key={data.key} questions={data.questions} daily={data.daily} onExit={back}
          onDone={(s) => go({ name: 'summary' }, { ...data, summary: s }, { replace: true })} />
      ) : <p className="muted">Diese Runde ist beendet.</p>;
      break;
    case 'summary':
      page = data?.summary ? (
        <Summary s={data.summary} label={data.label} currentDifficulty={data.opts.difficulty} onHome={() => tab('home')}
          onAgain={(d) => startRound(againOptions(data.opts, d), data.daily && d === undefined, data.label, true)} />
      ) : <p className="muted">Kein Ergebnis vorhanden.</p>;
      break;
  }

  return (
    <div className={'app' + (inQuiz ? ' in-quiz' : '')}>
      {!inQuiz && (
        <header className="topbar">
          {route.name !== 'home' && ['topic', 'mistakes', 'credits', 'summary', 'learn'].includes(route.name)
            ? <button className="icon-btn back-btn" aria-label="Zurück" onClick={back}>←</button> : null}
          <h1 onClick={() => tab('home')}><span className="logo">🌰</span> Kopfnuss</h1>
          <span className="topbar-streak" title="Serie">{streak.current > 0 ? '🔥' : '🌑'} {streak.current}</span>
        </header>
      )}
      <main>
        {loadError && <div className="card error">Fragen konnten nicht geladen werden: {loadError}</div>}
        {page}
      </main>
      {!inQuiz && (
        <nav className="tabbar">
          {([['home', '🏠', 'Start'], ['practice', '🎯', 'Üben'], ['groups', '🏆', 'Gruppen'], ['stats', '📊', 'Statistik'], ['settings', '⚙️', 'Mehr']] as const).map(([n, icon, label]) => (
            <button key={n} className={activeTab === n ? 'on' : ''} onClick={() => tab(n)}>
              <span aria-hidden>{icon}</span><span>{label}</span>
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
