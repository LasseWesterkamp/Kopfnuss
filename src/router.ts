// Seitennavigation über die Adresse (#/thema/geografie …), damit Wischen/Zurück-Taste eine Seite zurückgehen.
// Seiten mit großem Zustand (laufende Runde, Ergebnis) werden im Speicher gehalten; die Adresse merkt sich nur die Position.
import { useCallback, useEffect, useRef, useState } from 'react';

export type Route =
  | { name: 'home' } | { name: 'practice' } | { name: 'groups' } | { name: 'stats' } | { name: 'settings' } | { name: 'credits' }
  | { name: 'topic'; id: string } | { name: 'mistakes' } | { name: 'puzzle'; key: string }
  | { name: 'learn'; topic: string; kind: 'cat' | 'sub'; id: string }
  | { name: 'quiz' } | { name: 'summary' }
  | { name: 'duel'; id: string } | { name: 'duelplay' };

const PATHS: Record<string, string> = { home: '', practice: 'ueben', groups: 'gruppen', stats: 'statistik', settings: 'mehr', credits: 'mehr/bildnachweise', mistakes: 'fehler', quiz: 'runde', summary: 'ergebnis', duelplay: 'duell-runde' };

export function routeToHash(r: Route): string {
  if (r.name === 'topic') return '#/thema/' + r.id;
  if (r.name === 'puzzle') return '#/puzzle/' + r.key;
  if (r.name === 'duel') return '#/duell/' + r.id;
  if (r.name === 'learn') return `#/lernen/${r.topic}/${r.kind === 'cat' ? 'kategorie' : 'gruppe'}/${encodeURIComponent(r.id)}`;
  return '#/' + PATHS[r.name];
}

export function hashToRoute(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'thema' && p[1]) return { name: 'topic', id: decodeURIComponent(p[1]) };
  if (p[0] === 'duell' && p[1]) return { name: 'duel', id: decodeURIComponent(p[1]) };
  if (p[0] === 'puzzle' && p[1]) return { name: 'puzzle', key: decodeURIComponent(p[1]) };
  if (p[0] === 'lernen' && p[1] && p[3]) return { name: 'learn', topic: p[1], kind: p[2] === 'gruppe' ? 'sub' : 'cat', id: decodeURIComponent(p[3]) };
  const joined = p.join('/');
  const found = Object.entries(PATHS).find(([, v]) => v === joined && v !== '');
  // Runde/Ergebnis lassen sich nach Neuladen nicht wiederherstellen -> Startseite
  if (!found || found[0] === 'quiz' || found[0] === 'summary' || found[0] === 'duelplay') return { name: 'home' };
  return { name: found[0] } as Route;
}

/**
 * Seitenstapel mit Browser-History. Jede Seite trägt ihre Position im Stapel (history.state.i).
 * Zusatzdaten (z.B. laufende Runde) hängen an der Position und gehen bei Neuladen verloren.
 */
export function useRouter<T>(initial: Route) {
  const stack = useRef<{ route: Route; data?: T }[]>([]);
  const [pos, setPos] = useState(0);
  const [, force] = useState(0);

  useEffect(() => {
    stack.current = [{ route: initial }];
    history.replaceState({ i: 0 }, '', location.pathname + location.search + routeToHash(initial));
    const onPop = (e: PopStateEvent) => {
      const i = typeof e.state?.i === 'number' ? e.state.i : null;
      if (i !== null && stack.current[i]) setPos(i);
      else { stack.current = [{ route: hashToRoute(location.hash) }]; history.replaceState({ i: 0 }, ''); setPos(0); }
      force((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((route: Route, data?: T, opts?: { replace?: boolean }) => {
    setPos((cur) => {
      const i = opts?.replace ? cur : cur + 1;
      stack.current = [...stack.current.slice(0, i), { route, data }];
      if (opts?.replace) history.replaceState({ i }, '', routeToHash(route));
      else history.pushState({ i }, '', routeToHash(route));
      window.scrollTo(0, 0);
      return i;
    });
    force((n) => n + 1);
  }, []);

  /** Zurück (wie Wischen); gibt es keine vorige Seite der App, zur Startseite */
  const back = useCallback(() => {
    if (pos > 0) history.back();
    else go({ name: 'home' }, undefined, { replace: true });
  }, [pos, go]);

  const entry = stack.current[pos] ?? { route: initial };
  return { route: entry.route, data: entry.data, go, back };
}
