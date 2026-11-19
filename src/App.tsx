import { useState } from 'react';
import type { Difficulty, Question, TopicId } from './core/types';
import { buildSession } from './core/selection';
import { AppProvider, useApp } from './state';
import { Home } from './ui/Home';
import { Practice } from './ui/Practice';
import { Quiz, Summary, type SessionSummary } from './ui/Quiz';
import { Stats } from './ui/Stats';
import { SettingsView, Credits } from './ui/SettingsView';
import { Groups, GroupTeaser } from './ui/Groups';
import { codeFromUrl } from './core/invite';

type View =
  | { name: 'home' } | { name: 'practice'; topic: TopicId | null } | { name: 'stats' } | { name: 'settings' } | { name: 'credits' } | { name: 'groups' }
  | { name: 'quiz'; questions: Question[]; daily: boolean; again: () => void; key: number }
  | { name: 'summary'; s: SessionSummary; again: () => void };

function Shell() {
  const { questions, progress, today, loadError, streak } = useApp();
  // Einladungslink ?beitreten=CODE öffnet direkt den Gruppen-Tab mit vorausgefülltem Code
  const [joinCode] = useState<string | null>(() => {
    const c = codeFromUrl(location.search);
    if (location.search.includes('beitreten')) history.replaceState(null, '', location.pathname);
    return c;
  });
  const [view, setView] = useState<View>(joinCode ? { name: 'groups' } : { name: 'home' });

  const start = (opts: { topics?: TopicId[]; difficulty?: Difficulty; subs?: string[] }, daily: boolean) => {
    if (!questions) return;
    const qs = buildSession(questions, progress, today, daily ? {} : { ...opts, maxReviews: 5 });
    const again = () => start(opts, daily);
    setView({ name: 'quiz', questions: qs, daily, again, key: Date.now() });
  };
  const nav = (name: 'home' | 'practice' | 'stats' | 'settings' | 'groups') => setView(name === 'practice' ? { name, topic: null } : { name } as View);
  const inQuiz = view.name === 'quiz';

  return (
    <div className={'app' + (inQuiz ? ' in-quiz' : '')}>
      {!inQuiz && (
        <header className="topbar">
          <h1 onClick={() => nav('home')}><span className="logo">🌰</span> Kopfnuss</h1>
          <span className="topbar-streak" title="Serie">{streak.current > 0 ? '🔥' : '🌑'} {streak.current}</span>
        </header>
      )}
      <main>
        {loadError && <div className="card error">Fragen konnten nicht geladen werden: {loadError}</div>}
        {view.name === 'home' && <GroupTeaser onOpen={() => nav('groups')} />}
        {view.name === 'groups' && <Groups joinCode={joinCode} onGoSettings={() => nav('settings')} />}
        {view.name === 'home' && <Home onDaily={() => start({}, true)} onTopic={(t) => setView({ name: 'practice', topic: t })} onMix={() => start({}, false)} />}
        {view.name === 'practice' && <Practice initial={view.topic} onStart={(topics, difficulty, subs) => start({ topics, difficulty, subs }, false)} />}
        {view.name === 'stats' && <Stats />}
        {view.name === 'settings' && <SettingsView onCredits={() => setView({ name: 'credits' })} />}
        {view.name === 'credits' && <Credits onBack={() => setView({ name: 'settings' })} />}
        {view.name === 'quiz' && (
          <Quiz key={view.key} questions={view.questions} daily={view.daily}
            onExit={() => setView({ name: 'home' })}
            onDone={(s) => setView({ name: 'summary', s, again: view.again })} />
        )}
        {view.name === 'summary' && <Summary s={view.s} onHome={() => setView({ name: 'home' })} onAgain={view.again} />}
      </main>
      {!inQuiz && (
        <nav className="tabbar">
          {([['home', '🏠', 'Start'], ['practice', '🎯', 'Üben'], ['groups', '🏆', 'Gruppen'], ['stats', '📊', 'Statistik'], ['settings', '⚙️', 'Mehr']] as const).map(([n, icon, label]) => (
            <button key={n} className={view.name === n || (n === 'settings' && view.name === 'credits') || (n === 'home' && view.name === 'summary') ? 'on' : ''} onClick={() => nav(n)}>
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
