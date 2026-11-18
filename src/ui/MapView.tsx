import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { MapQuestion } from '../core/types';
import { asset } from '../data';
import type { Result } from './McView';

type Countries = Feature<Geometry, { name: string }>[];
let topoCache: Promise<Countries> | null = null;
function loadMap(): Promise<Countries> {
  topoCache ??= fetch(asset('data/countries-110m.json')).then((r) => r.json()).then((t: Topology) =>
    (feature(t, t.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features.filter((f) => f.id !== '010'));
  return topoCache;
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

export function MapView({ q, result, onAnswer }: { q: MapQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const [countries, setCountries] = useState<Countries | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);

  useEffect(() => { loadMap().then(setCountries); }, []);
  useEffect(() => { setSel(null); setVb({ x: 0, y: 0, w: W, h: H }); }, [q.id]);

  const path = useMemo(() => {
    const [w, s, e, n] = BOX[q.continent] ?? [-180, -60, 180, 80];
    const proj = geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'MultiPoint', coordinates: [[w, s], [e, n], [w, n], [e, s]] } as any);
    return geoPath(proj);
  }, [q.continent]);

  const zoom = (f: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    const w = Math.max(W / 8, Math.min(W, vb.w * f));
    const h = (w / W) * H;
    const x = Math.max(0, Math.min(W - w, cx - ((cx - vb.x) * w) / vb.w));
    const y = Math.max(0, Math.min(H - h, cy - ((cy - vb.y) * h) / vb.h));
    setVb({ x, y, w, h });
  };
  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + ((clientX - r.left) / r.width) * vb.w, y: vb.y + ((clientY - r.top) / r.height) * vb.h, r };
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
    if (!d || d.moved || result) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
    const id = el?.getAttribute?.('data-id');
    if (id) setSel(id);
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.25 : 0.8, p.x, p.y);
  };

  if (!countries) return <div className="map-wrap loading">Karte lädt …</div>;
  return (
    <div className="map">
      <div className="map-wrap">
        <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="Karte"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => (drag.current = null)} onWheel={onWheel}>
          <rect x={-W} y={-H} width={W * 3} height={H * 3} className="sea" />
          {countries.map((f, idx) => {
            if (f.id === undefined) return <path key={'x' + idx} d={path(f) ?? ''} className="land" style={{ strokeWidth: 0.6 * (vb.w / W) }} />;
            const id = String(f.id);
            let cls = 'land';
            if (result && id === q.country) cls += ' right';
            else if (result && id === result.given) cls += ' wrong';
            else if (!result && id === sel) cls += ' selected';
            return <path key={id} data-id={id} d={path(f) ?? ''} className={cls} style={{ strokeWidth: 0.6 * (vb.w / W) }} />;
          })}
        </svg>
        <div className="map-zoom">
          <button className="icon-btn" aria-label="Vergrößern" onClick={() => zoom(0.6)}>+</button>
          <button className="icon-btn" aria-label="Verkleinern" onClick={() => zoom(1 / 0.6)}>−</button>
        </div>
      </div>
      {!result && (
        <button className="btn primary wide" disabled={!sel}
          onClick={() => sel && onAnswer({ ok: sel === q.country, score: sel === q.country ? 1 : 0, given: sel })}>
          {sel ? 'Auswahl bestätigen' : 'Land antippen'}
        </button>
      )}
      {result && !result.ok && <p className="muted">Grün markiert: die richtige Lösung. Rot: deine Auswahl.</p>}
    </div>
  );
}
