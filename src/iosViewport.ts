// iOS-Home-Bildschirm-App: Nach dem Schließen der Tastatur bleibt die Seite manchmal um die Tastaturhöhe zu kurz.
// Folge: die unten angeheftete Tab-Leiste hängt mitten im Bild. Ein Mini-Scroll zwingt iOS, die Höhe neu zu berechnen.
const isField = (el: Element | null) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

function nudge() {
  const y = window.scrollY;
  window.scrollTo(window.scrollX, y + 1);
  window.scrollTo(window.scrollX, y);
}

export function installIosViewportFix() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return;
  // Tastatur zu: Fokus verlässt ein Eingabefeld (kurz warten, bis die Tastatur-Animation durch ist)
  document.addEventListener('focusout', (e) => {
    if (!isField(e.target as Element)) return;
    setTimeout(() => { if (!isField(document.activeElement)) nudge(); }, 100);
    setTimeout(() => { if (!isField(document.activeElement)) nudge(); }, 400);
  });
  // Sicherheitsnetz: sichtbarer Bereich ändert sich, ohne dass ein Feld aktiv ist; auch beim Zurückkehren in die App
  window.visualViewport?.addEventListener('resize', () => { if (!isField(document.activeElement)) setTimeout(nudge, 50); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(nudge, 50); });
}
