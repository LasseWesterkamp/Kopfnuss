// Regionen (Bundesländer, Kantone, Bundesstaaten …) für das Thema „Regionen“.
// 1) Natural Earth admin-1 (gemeinfrei) laden, auf die Länder zuschneiden, als TopoJSON vereinfachen
//    -> public/data/regions-<land>.json
// 2) Wikidata: deutscher Name, Hauptstadt, Flaggendatei
// 3) Flaggen von Wikimedia Commons (nur freie Lizenzen) -> public/regions/<iso>.png
// Ergebnis: data/regions.json (Eingabe für build-questions.mjs)
// Aufruf: node scripts/fetch-regions.mjs [--force-flags]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { geoArea } from 'd3-geo';
import { sparql, sleep, UA, today } from './lib.mjs';

export const COUNTRIES = {
  de: { a3: 'DEU', name: 'Deutschland', art: 'Bundesland', artPl: 'Bundesländer', genitiv: 'des Bundeslandes' },
  at: { a3: 'AUT', name: 'Österreich', art: 'Bundesland', artPl: 'Bundesländer', genitiv: 'des Bundeslandes' },
  ch: { a3: 'CHE', name: 'Schweiz', art: 'Kanton', artPl: 'Kantone', genitiv: 'des Kantons' },
  us: { a3: 'USA', name: 'USA', art: 'Bundesstaat', artPl: 'Bundesstaaten', genitiv: 'des Bundesstaates' },
  ca: { a3: 'CAN', name: 'Kanada', art: 'Provinz/Territorium', artPl: 'Provinzen und Territorien', genitiv: 'der Provinz' },
  au: { a3: 'AUS', name: 'Australien', art: 'Bundesstaat/Territorium', artPl: 'Bundesstaaten und Territorien', genitiv: 'des Bundesstaates' },
};
// Nicht abfragen: Hauptstadtbezirk der USA, kleine Außenterritorien Australiens
const SKIP_ISO = new Set(['US-DC', 'AU-X02~', 'AU-X03~', 'AU-X04~']);

const force = process.argv.includes('--force-flags');
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const cache = 'data/.cache/ne_admin1.geojson';
fs.mkdirSync('data/.cache', { recursive: true });
if (!fs.existsSync(cache)) {
  console.log('Lade Natural Earth admin-1 (ca. 40 MB) …');
  execFileSync('curl', ['-sfL', '-m', '600', '-o', cache, NE_URL]);
}
const ne = JSON.parse(fs.readFileSync(cache, 'utf8'));

// ---------- 1) Karten ----------
const regions = [];
fs.mkdirSync('public/data', { recursive: true });
for (const [cc, c] of Object.entries(COUNTRIES)) {
  const feats = ne.features.filter((f) => f.properties.adm0_a3 === c.a3 && !SKIP_ISO.has(f.properties.iso_3166_2) && f.properties.wikidataid);
  // Winzige Inseln entfernen (jede Insel kostet Punkte, ist auf dem Handy aber unsichtbar)
  const all = feats.flatMap((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]));
  const total = all.reduce((s, p) => s + geoArea({ type: 'Polygon', coordinates: p }), 0);
  const minShare = { de: 2e-5, at: 0, ch: 0, us: 2e-5, ca: 2e-4, au: 3e-5 }[cc];
  for (const f of feats) {
    if (f.geometry.type === 'MultiPolygon') {
      const polys = f.geometry.coordinates;
      const areas = polys.map((p) => geoArea({ type: 'Polygon', coordinates: p }));
      const biggest = Math.max(...areas);
      f.geometry.coordinates = polys.filter((p, i) => areas[i] === biggest || areas[i] / total >= minShare);
    }
    f.id = f.properties.iso_3166_2;
    f.properties = { name: f.properties.name };
  }
  const topo = topology({ r: { type: 'FeatureCollection', features: feats } }, 2e4);
  const pre = presimplify(topo);
  // Kleinere Länder detaillierter (Schweizer Kantone sind winzig)
  // Anteil der Punkte, die erhalten bleiben. Kleine Länder detaillierter (Schweizer Kantone sind winzig).
  const keep = { ch: 0.25, at: 0.2, de: 0.1, au: 0.04, us: 0.04, ca: 0.02 }[cc];
  const simple = simplify(pre, quantile(pre, keep)); // quantile(p): Gewicht, bei dem ca. Anteil p der Punkte erhalten bleibt
  fs.writeFileSync(`public/data/regions-${cc}.json`, JSON.stringify(simple));
  for (const f of ne.features.filter((x) => x.id && feats.includes(x))) regions.push({ cc, iso: f.id });
  console.log(cc, feats.length, 'Regionen,', Math.round(fs.statSync(`public/data/regions-${cc}.json`).size / 1024), 'KB');
}
const wdOf = new Map(ne.features.filter((f) => f.id).map((f) => [f.id, null]));
for (const f of JSON.parse(fs.readFileSync(cache, 'utf8')).features) if (wdOf.has(f.properties.iso_3166_2)) wdOf.set(f.properties.iso_3166_2, f.properties.wikidataid);

// ---------- 2) Wikidata ----------
const ovEarly = JSON.parse(fs.readFileSync('data/regions-overrides.json', 'utf8')).regions;
for (const [iso, o] of Object.entries(ovEarly)) if (o.wikidata) wdOf.set(iso, o.wikidata);
const ids = regions.map((r) => wdOf.get(r.iso));
const rows = await sparql(`SELECT ?r ?rLabel ?capLabel ?flag WHERE {
  VALUES ?r { ${ids.map((i) => 'wd:' + i).join(' ')} }
  OPTIONAL { ?r p:P36 ?cs. ?cs ps:P36 ?cap. FILTER NOT EXISTS { ?cs pq:P582 ?e } }
  OPTIONAL { ?r wdt:P41 ?flag }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } }`);
const wd = {};
for (const x of rows) {
  const q = x.r.value.split('/').pop();
  const e = (wd[q] ??= { name: x.rLabel.value, caps: new Set(), flags: new Set() });
  if (x.capLabel) e.caps.add(x.capLabel.value);
  if (x.flag) e.flags.add(decodeURIComponent(x.flag.value.split('/').pop()).replace(/_/g, ' '));
}
const ov = JSON.parse(fs.readFileSync('data/regions-overrides.json', 'utf8'));
const prev = fs.existsSync('data/regions.json') ? new Map(JSON.parse(fs.readFileSync('data/regions.json', 'utf8')).regions.map((r) => [r.iso, r])) : new Map();
const out = [];
const problems = [];
for (const r of regions) {
  const q = wdOf.get(r.iso), w = wd[q] ?? { name: r.iso, caps: new Set(), flags: new Set() };
  const o = ov.regions[r.iso] ?? {};
  const name = o.name ?? w.name.replace(/^(Kanton|Bundesland|Provinz) /, '');
  const caps = [...w.caps];
  const capital = o.capital !== undefined ? o.capital : caps.length === 1 ? caps[0] : null;
  if (o.capital === undefined && caps.length !== 1) problems.push(`${r.iso} ${name}: Hauptstadt unklar (${caps.join(', ') || 'keine'})`);
  const flags = [...w.flags];
  const flagFile = o.flagFile ?? flags[0] ?? null;
  if (!o.flagFile && flags.length !== 1) problems.push(`${r.iso} ${name}: ${flags.length} Flaggen in Wikidata (${flags.join(' | ')})`);
  out.push({ ...r, wikidata: q, name, capital, capitalNote: o.capitalNote ?? null, flagFile, flag: prev.get(r.iso)?.flagFile === flagFile ? prev.get(r.iso).flag : null });
}

// ---------- 3) Flaggen ----------
const FREE = /(public domain|gemeinfrei|^pd|cc0|cc[- ]by(?![- ]?n[cd])|^fal|free art|copyrighted free use)/i;
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
fs.mkdirSync('public/regions', { recursive: true });
const todo = out.filter((r) => r.flagFile && (force || !r.flag || !fs.existsSync('public/' + r.flag.src)));
console.log(todo.length, 'Flaggen zu laden');
async function api(params) {
  for (let a = 0; a < 8; a++) {
    try { return JSON.parse(execFileSync('curl', ['-sf', '-m', '60', '-A', UA, 'https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&action=query&' + params], { maxBuffer: 50e6 }).toString()); }
    catch { await sleep(8000 * (a + 1)); }
  }
  throw new Error('Commons-API nicht erreichbar');
}
for (let i = 0; i < todo.length; i += 40) {
  const chunk = todo.slice(i, i + 40);
  const j = await api('prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=' + encodeURIComponent(chunk.map((r) => 'File:' + r.flagFile).join('|')));
  const byTitle = new Map(j.query.pages.map((p) => [p.title.replace(/^File:/, ''), p.imageinfo?.[0]]));
  const norm = new Map((j.query.normalized ?? []).map((n) => [n.from.replace(/^File:/, ''), n.to.replace(/^File:/, '')]));
  for (const r of chunk) {
    const ii = byTitle.get(norm.get(r.flagFile) ?? r.flagFile);
    const lic = ii?.extmetadata?.LicenseShortName?.value ?? '';
    if (!ii || !FREE.test(lic)) { problems.push(`${r.iso}: Flagge ohne freie Lizenz (${lic || 'unbekannt'}) ${r.flagFile}`); continue; }
    let buf;
    for (let a = 0; a < 6 && !buf; a++) {
      try { buf = execFileSync('curl', ['-sfL', '-m', '60', '-A', UA, ii.thumburl], { maxBuffer: 50e6 }); } catch { await sleep(5000 * (a + 1)); }
    }
    if (!buf) { problems.push(`${r.iso}: Download fehlgeschlagen`); continue; }
    const dest = `regions/${r.iso.toLowerCase()}.png`;
    await sharp(buf).resize({ width: 320, height: 240, fit: 'inside' }).png({ compressionLevel: 9, palette: true }).toFile('public/' + dest);
    r.flag = {
      src: dest,
      author: strip(ii.extmetadata.Artist?.value).slice(0, 160) || 'Unbekannt',
      license: /public domain|gemeinfrei|^pd/i.test(lic) ? 'Gemeinfrei' : lic,
      licenseUrl: ii.extmetadata.LicenseUrl?.value,
      sourceUrl: ii.descriptionurl,
    };
    await sleep(400);
  }
}
// Bild-Fingerabdruck (16x12 Pixel) jeder Flagge, um gleich aussehende Flaggen zu erkennen (z.B. Wien/Salzburg/Vorarlberg)
for (const r of out.filter((x) => x.flag)) {
  const px = await sharp('public/' + r.flag.src).resize(16, 12, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  r.flag.print = Buffer.from(px).toString('base64');
}
fs.writeFileSync('data/regions.json', JSON.stringify({ asOf: today(), source: 'Natural Earth (gemeinfrei), Wikidata (CC0), Wikimedia Commons', regions: out }, null, 1));
console.log(`\n${out.length} Regionen, ${out.filter((r) => r.flag).length} mit Flagge, ${out.filter((r) => r.capital).length} mit Hauptstadt`);
if (problems.length) console.log('PRÜFEN:\n' + problems.join('\n'));
