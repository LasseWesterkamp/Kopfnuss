import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoConicConformal, geoEqualEarth, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { asset } from '../data';
import { pinchViewBox } from '../core/pinch';

type Countries = Feature<Geometry, { name: string }>[];
const cache = new Map<string, Promise<Countries>>();
/** Weltkarte ("world" = grob, "world50" = detailliert mit Kleinstaaten) oder Regionenkarte eines Landes ("de", "us", …) */
function loadMap(key: string): Promise<Countries> {
  if (!cache.has(key)) {
    const isWorld = key === 'world' || key === 'world50';
    const file = key === 'world' ? 'data/countries-110m.json' : key === 'world50' ? 'data/countries-50m.json' : `data/regions-${key}.json`;
    cache.set(key, fetch(asset(file)).then((r) => r.json()).then((t: Topology) => {
      const obj = isWorld ? t.objects.countries : t.objects.r;
      const fs = (feature(t, obj) as unknown as FeatureCollection<Geometry, { name: string }>).features;
      return isWorld ? fs.filter((f) => f.id !== '010') : fs; // Antarktis weglassen
    }));
  }
  return cache.get(key)!;
}

/** Projektion pro Regionenkarte: USA mit Alaska/Hawaii-Einschub, Kanada kegeltreu, sonst Mercator */
function regionProjection(cc: string): GeoProjection {
  if (cc === 'us') return geoAlbersUsa() as unknown as GeoProjection;
  if (cc === 'ca') return geoConicConformal().rotate([96, 0]).parallels([49, 77]);
  return geoMercator();
}

// Kartenausschnitte pro Kontinent [Westen, Süden, Osten, Norden]
const BOX: Record<string, [number, number, number, number]> = {
  Europa: [-24, 34, 45, 71],
  Afrika: [-20, -36, 53, 38],
  Asien: [25, -11, 150, 56],
  Nordamerika: [-170, 7, -50, 75],
  Südamerika: [-82, -56, -34, 13],
  Ozeanien: [110, -48, 180, 0],
};
const W = 800, H = 600;

/** Projektion für ein Welt-Puzzle: passend auf die Länder des Kontinents zugeschnitten */
function worldProjection(area: string, targets: Countries): GeoProjection {
  const fc = { type: 'FeatureCollection', features: targets } as any;
  const ext: [[number, number], [number, number]] = [[10, 10], [W - 10, H - 10]];
  if (area === 'Welt') return geoEqualEarth().fitExtent(ext, { type: 'Sphere' } as any);
  if (area === 'Europa') { const [w, s, e, n] = BOX.Europa; return geoMercator().fitExtent(ext, { type: 'MultiPoint', coordinates: [[w, s], [e, n], [w, n], [e, s]] } as any); }
  // Nordamerika (Aleuten) und Ozeanien (Pazifik) liegen über der Datumsgrenze: Karte drehen
  const rotate: [number, number] = area === 'Nordamerika' ? [100, 0] : area === 'Ozeanien' ? [-165, 0] : [0, 0];
  return geoMercator().rotate(rotate).fitExtent(ext, fc);
}

export interface MapCanvasProps {
  regions: boolean;                         // Regionenkarte eines Landes statt Weltkarte
  world50?: boolean;                        // detaillierte Weltkarte für Welt-Puzzles (area = Kontinent oder "Welt")
  targets?: Set<string>;                    // antippbare Gebiete; zu kleine bekommen einen Kreis
  area: string;                             // Ländercode (Regionen) bzw. Kontinent (Weltkarte)
  classFor: (id: string) => string;         // zusätzliche CSS-Klassen pro Gebiet
  onPick?: (id: string) => void;            // Antippen (ohne = nur anzeigen)
  resetKey?: string;                        // Zoom zurücksetzen, wenn sich das ändert
  focus?: string | null;                    // Gebiet, auf das bei kleinen Gebieten gezoomt wird
}

/** Gemeinsame Kartenanzeige mit Zoom (Buttons, Mausrad) und Verschieben (Ziehen). Tippen ohne Ziehen = Auswahl. */
export function MapCanvas({ regions, world50, targets, area, classFor, onPick, resetKey, focus }: MapCanvasProps) {
  const [countries, setCountries] = useState<Countries | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);
  // Aktueller Ausschnitt. Während einer Geste wird nur das viewBox-Attribut direkt gesetzt (kein Neuaufbau der Karte),
  // erst am Ende der Geste wird der Zustand einmal übernommen.
  const liveVb = useRef(vb);
  const frame = useRef<number | null>(null);
  /** Ausschnitt von außen setzen (Zurücksetzen, Fokus): Live-Wert und Zustand gemeinsam */
  const setView = (v: typeof vb) => { liveVb.current = v; setVb(v); };
  const applyVb = (v: typeof vb) => {
    liveVb.current = v;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const c = liveVb.current;
      svgRef.current?.setAttribute('viewBox', `${c.x} ${c.y} ${c.w} ${c.h}`);
    });
  };
  const commitVb = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    setVb({ ...liveVb.current });
  };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const mapKey = world50 ? 'world50' : regions ? area : 'world';
  useEffect(() => { setCountries(null); loadMap(mapKey).then(setCountries); }, [mapKey]);
  useEffect(() => { setView({ x: 0, y: 0, w: W, h: H }); }, [resetKey]);

  const path = useMemo(() => {
    if (world50) {
      if (!countries) return null;
      const t = countries.filter((f) => targets?.has(String(f.id)));
      return geoPath(worldProjection(area, t.length ? t : countries));
    }
    if (regions) {
      if (!countries) return null;
      return geoPath(regionProjection(area).fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: countries } as any));
    }
    const [w, s, e, n] = BOX[area] ?? [-180, -60, 180, 80];
    const proj = geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'MultiPoint', coordinates: [[w, s], [e, n], [w, n], [e, s]] } as any);
    return geoPath(proj);
  }, [area, regions, world50, countries, targets]);

  // Umrisse nur einmal pro Karte/Projektion berechnen (vorher bei jeder Bewegung für alle Länder neu)
  const shapes = useMemo(() => (countries && path
    ? countries.map((f, idx) => ({ key: f.id === undefined ? 'x' + idx : String(f.id), id: f.id === undefined ? null : String(f.id), d: path(f) ?? '' }))
    : []), [countries, path]);

  // Kleine Zielgebiete (auf der ganzen Karte < 6 px) bekommen einen antippbaren Kreis
  const markers = useMemo(() => {
    if (!countries || !path || !targets) return [];
    return countries.filter((f) => targets.has(String(f.id))).flatMap((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      if (!isFinite(x0) || Math.max(x1 - x0, y1 - y0) >= 6) return [];
      const [cx, cy] = path.centroid(f);
      return isFinite(cx) ? [{ id: String(f.id), cx, cy }] : [];
    });
  }, [countries, path, targets]);

  // Sehr kleine markierte Gebiete (z.B. Basel-Stadt, Bremen) automatisch heranzoomen
  useEffect(() => {
    if (!focus || !countries || !path) return;
    const f = countries.find((c) => String(c.id) === focus);
    if (!f) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const size = Math.max(x1 - x0, y1 - y0);
    if (size > 60) { setView({ x: 0, y: 0, w: W, h: H }); return; }
    const w = Math.min(W, Math.max(W / 6, size * 8)), h = (w / W) * H;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setView({ x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h });
  }, [focus, countries, path]);

  const MIN_W = W / 16; // stärkster Zoom (für Kleinstaaten und Schweizer Kantone)
  const zoomTo = (f: number, cx?: number, cy?: number) => {
    const v = liveVb.current;
    cx ??= v.x + v.w / 2; cy ??= v.y + v.h / 2;
    const w = Math.max(MIN_W, Math.min(W, v.w * f));
    const h = (w / W) * H;
    const x = Math.max(0, Math.min(W - w, cx - ((cx - v.x) * w) / v.w));
    const y = Math.max(0, Math.min(H - h, cy - ((cy - v.y) * h) / v.h));
    return { x, y, w, h };
  };
  const zoom = (f: number, cx?: number, cy?: number) => { liveVb.current = zoomTo(f, cx, cy); commitVb(); };
  // Mausrad: flüssig per viewBox, Zustand erst nach kurzer Pause übernehmen
  const wheelCommit = useRef<number>();

  // Finger/Maus: ein Finger = antippen oder ziehen, zwei Finger = zoomen und verschieben
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const wrapRef = useRef<HTMLDivElement>(null);
  // iOS Safari: eigene Zoom-Geste der Seite auf der Karte unterdrücken (sonst wird die ganze Seite vergrößert)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const stop = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    return () => { el.removeEventListener('gesturestart', stop); el.removeEventListener('gesturechange', stop); };
  }, [countries]);
  const pinch = useRef<{ vb: typeof vb; a: number; b: number; s1: { x: number; y: number }; s2: { x: number; y: number } } | null>(null);
  const gestureHadPinch = useRef(false);

  const startPinch = () => {
    const [[a, p1], [b, p2]] = [...pointers.current.entries()];
    pinch.current = { vb: liveVb.current, a, b, s1: { ...p1 }, s2: { ...p2 } };
    gestureHadPinch.current = true;
    drag.current = null;
  };
  const onDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gestureHadPinch.current = false;
      drag.current = { x: e.clientX, y: e.clientY, vb: liveVb.current, moved: false };
    } else if (pointers.current.size === 2) startPinch();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pc = pinch.current;
    if (pc) {
      const c1 = pointers.current.get(pc.a), c2 = pointers.current.get(pc.b);
      if (!c1 || !c2) return;
      applyVb(pinchViewBox(pc.vb, pc.s1, pc.s2, c1, c2, svgRef.current!.getBoundingClientRect(), { w: W, h: H }, MIN_W));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    const r = svgRef.current!.getBoundingClientRect();
    const sx = d.vb.w / r.width, sy = d.vb.h / r.height;
    applyVb({ ...d.vb, x: Math.max(0, Math.min(W - d.vb.w, d.vb.x - dx * sx)), y: Math.max(0, Math.min(H - d.vb.h, d.vb.y - dy * sy)) });
  };
  const endPointer = (e: React.PointerEvent, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      pinch.current = null;
      // Ein Finger bleibt liegen: nahtlos weiter verschieben, aber kein Antippen auslösen
      const rest = [...pointers.current.values()][0];
      if (rest) drag.current = { x: rest.x, y: rest.y, vb: liveVb.current, moved: true };
      else commitVb();
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d?.moved && pointers.current.size === 0) commitVb();
    if (cancelled || !d || d.moved || gestureHadPinch.current || !onPick) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
    const id = el?.getAttribute?.('data-id');
    if (id) onPick(id);
  };
  const onUp = (e: React.PointerEvent) => endPointer(e, false);
  const onCancel = (e: React.PointerEvent) => endPointer(e, true);
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = liveVb.current;
    applyVb(zoomTo(e.deltaY > 0 ? 1.25 : 0.8, v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h));
    clearTimeout(wheelCommit.current);
    wheelCommit.current = window.setTimeout(commitVb, 200);
  };

  if (!countries || !path) return <div className="map-wrap loading">Karte lädt …</div>;
  return (
    <div ref={wrapRef} className={'map-wrap' + (onPick ? '' : ' readonly')}>
      <svg ref={svgRef} viewBox={`${liveVb.current.x} ${liveVb.current.y} ${liveVb.current.w} ${liveVb.current.h}`} role="img" aria-label="Karte"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onWheel={onWheel}>
        <rect x={-W} y={-H} width={W * 3} height={H * 3} className="sea" />
        {shapes.map(({ key, id, d }) => {
          if (id === null) return <path key={key} d={d} className="land" />;
          const pickable = !targets || targets.has(id);
          return <path key={key} data-id={pickable ? id : undefined} d={d} className={('land ' + (pickable ? classFor(id) : 'inactive')).trim()} />;
        })}
        {markers.map((m) => (
          <circle key={'m' + m.id} data-id={m.id} cx={m.cx} cy={m.cy} r={7 * (vb.w / W)} className={('marker ' + classFor(m.id)).trim()} />
        ))}
      </svg>
      <div className="map-zoom">
        <button className="icon-btn" aria-label="Vergrößern" onClick={() => zoom(0.6)}>+</button>
        <button className="icon-btn" aria-label="Verkleinern" onClick={() => zoom(1 / 0.6)}>−</button>
      </div>
    </div>
  );
}
