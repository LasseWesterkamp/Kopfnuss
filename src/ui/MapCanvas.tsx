import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoConicConformal, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { asset } from '../data';

type Countries = Feature<Geometry, { name: string }>[];
const cache = new Map<string, Promise<Countries>>();
/** Weltkarte (key "world") oder Regionenkarte eines Landes (key "de", "us", …) */
function loadMap(key: string): Promise<Countries> {
  if (!cache.has(key)) {
    const file = key === 'world' ? 'data/countries-110m.json' : `data/regions-${key}.json`;
    cache.set(key, fetch(asset(file)).then((r) => r.json()).then((t: Topology) => {
      const obj = key === 'world' ? t.objects.countries : t.objects.r;
      const fs = (feature(t, obj) as unknown as FeatureCollection<Geometry, { name: string }>).features;
      return key === 'world' ? fs.filter((f) => f.id !== '010') : fs;
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

export interface MapCanvasProps {
  regions: boolean;                         // Regionenkarte eines Landes statt Weltkarte
  area: string;                             // Ländercode (Regionen) bzw. Kontinent (Weltkarte)
  classFor: (id: string) => string;         // zusätzliche CSS-Klassen pro Gebiet
  onPick?: (id: string) => void;            // Antippen (ohne = nur anzeigen)
  resetKey?: string;                        // Zoom zurücksetzen, wenn sich das ändert
  focus?: string | null;                    // Gebiet, auf das bei kleinen Gebieten gezoomt wird
}

/** Gemeinsame Kartenanzeige mit Zoom (Buttons, Mausrad) und Verschieben (Ziehen). Tippen ohne Ziehen = Auswahl. */
export function MapCanvas({ regions, area, classFor, onPick, resetKey, focus }: MapCanvasProps) {
  const [countries, setCountries] = useState<Countries | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);

  const mapKey = regions ? area : 'world';
  useEffect(() => { setCountries(null); loadMap(mapKey).then(setCountries); }, [mapKey]);
  useEffect(() => { setVb({ x: 0, y: 0, w: W, h: H }); }, [resetKey]);

  const path = useMemo(() => {
    if (regions) {
      if (!countries) return null;
      return geoPath(regionProjection(area).fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: countries } as any));
    }
    const [w, s, e, n] = BOX[area] ?? [-180, -60, 180, 80];
    const proj = geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'MultiPoint', coordinates: [[w, s], [e, n], [w, n], [e, s]] } as any);
    return geoPath(proj);
  }, [area, regions, countries]);

  // Sehr kleine markierte Gebiete (z.B. Basel-Stadt, Bremen) automatisch heranzoomen
  useEffect(() => {
    if (!focus || !countries || !path) return;
    const f = countries.find((c) => String(c.id) === focus);
    if (!f) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const size = Math.max(x1 - x0, y1 - y0);
    if (size > 60) { setVb({ x: 0, y: 0, w: W, h: H }); return; }
    const w = Math.min(W, Math.max(W / 6, size * 8)), h = (w / W) * H;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setVb({ x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - h, cy - h / 2)), w, h });
  }, [focus, countries, path]);

  const zoom = (f: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    const w = Math.max(W / 8, Math.min(W, vb.w * f));
    const h = (w / W) * H;
    const x = Math.max(0, Math.min(W - w, cx - ((cx - vb.x) * w) / vb.w));
    const y = Math.max(0, Math.min(H - h, cy - ((cy - vb.y) * h) / vb.h));
    setVb({ x, y, w, h });
  };
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    const r = svgRef.current!.getBoundingClientRect();
    const sx = d.vb.w / r.width, sy = d.vb.h / r.height;
    setVb({ ...d.vb, x: Math.max(0, Math.min(W - d.vb.w, d.vb.x - dx * sx)), y: Math.max(0, Math.min(H - d.vb.h, d.vb.y - dy * sy)) });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !onPick) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
    const id = el?.getAttribute?.('data-id');
    if (id) onPick(id);
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.25 : 0.8, vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * vb.h);
  };

  if (!countries || !path) return <div className="map-wrap loading">Karte lädt …</div>;
  return (
    <div className={'map-wrap' + (onPick ? '' : ' readonly')}>
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="Karte"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => (drag.current = null)} onWheel={onWheel}>
        <rect x={-W} y={-H} width={W * 3} height={H * 3} className="sea" />
        {countries.map((f, idx) => {
          const sw = { strokeWidth: 0.6 * (vb.w / W) };
          if (f.id === undefined) return <path key={'x' + idx} d={path(f) ?? ''} className="land" style={sw} />;
          const id = String(f.id);
          return <path key={id} data-id={id} d={path(f) ?? ''} className={('land ' + classFor(id)).trim()} style={sw} />;
        })}
      </svg>
      <div className="map-zoom">
        <button className="icon-btn" aria-label="Vergrößern" onClick={() => zoom(0.6)}>+</button>
        <button className="icon-btn" aria-label="Verkleinern" onClick={() => zoom(1 / 0.6)}>−</button>
      </div>
    </div>
  );
}
