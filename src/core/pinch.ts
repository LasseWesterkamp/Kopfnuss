// Zwei-Finger-Zoom für die Karte: Der Kartenpunkt zwischen den Fingern bleibt beim Zoomen und Verschieben unter den Fingern.

export interface ViewBox { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Neuer Kartenausschnitt beim Zwei-Finger-Zoom.
 * start: Ausschnitt und Fingerpositionen bei Beginn der Geste; cur: aktuelle Fingerpositionen (Bildschirmkoordinaten).
 * full: Größe der ganzen Karte (W, H); minW: stärkster Zoom (kleinste Ausschnittsbreite).
 */
export function pinchViewBox(start: ViewBox, s1: Pt, s2: Pt, c1: Pt, c2: Pt, rect: Rect, full: { w: number; h: number }, minW: number): ViewBox {
  const d0 = Math.max(1, dist(s1, s2));
  const d1 = Math.max(1, dist(c1, c2));
  const w = clamp(start.w * (d0 / d1), minW, full.w);
  const h = (w / full.w) * full.h;
  // Kartenpunkt, der zu Beginn zwischen den Fingern lag
  const m0 = mid(s1, s2);
  const px = start.x + ((m0.x - rect.left) / rect.width) * start.w;
  const py = start.y + ((m0.y - rect.top) / rect.height) * start.h;
  // ... soll jetzt unter der aktuellen Fingermitte liegen
  const m1 = mid(c1, c2);
  const x = px - ((m1.x - rect.left) / rect.width) * w;
  const y = py - ((m1.y - rect.top) / rect.height) * h;
  return { x: clamp(x, 0, full.w - w), y: clamp(y, 0, full.h - h), w, h };
}
