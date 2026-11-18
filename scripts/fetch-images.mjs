// Lädt für jeden Eintrag in data/images-config.json das Titelbild des Wikipedia-Artikels,
// prüft die Lizenz (nur gemeinfrei / CC0 / CC BY / CC BY-SA) und speichert es als WebP (max. 720 px) in public/img/.
// Ergebnis: data/images.json mit Urheber- und Lizenzangaben.
// Wikimedia drosselt stark, deshalb Sammelanfragen (50 Titel pro Anfrage) und Pausen.
// Aufruf: node scripts/fetch-images.mjs [--force] [id ...]
import fs from 'node:fs';
import sharp from 'sharp';
import { sleep, UA } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const cfg = JSON.parse(fs.readFileSync('data/images-config.json', 'utf8'));
const prev = fs.existsSync('data/images.json') ? JSON.parse(fs.readFileSync('data/images.json', 'utf8')) : { items: [] };
const prevById = new Map(prev.items.map((i) => [i.id, i]));
fs.mkdirSync('public/img', { recursive: true });

const FREE = /(public domain|gemeinfrei|^pd|cc0|cc[- ]by(?![- ]?n[cd])|^fal|free art)/i;
const strip = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const API = 'https://de.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&';

async function api(params) {
  for (let a = 0; a < 8; a++) {
    let res;
    try { res = await fetch(API + params, { headers: { 'User-Agent': UA } }); } catch { await sleep(5000); continue; }
    if (res.ok) return res.json();
    const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 5000 * (a + 1);
    console.log('  warte', wait / 1000, 's (HTTP', res.status + ')');
    await sleep(wait);
  }
  throw new Error('API dauerhaft nicht erreichbar');
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const todo = cfg.items.filter((it) => {
  const old = prevById.get(it.id);
  if (force || (only.length && only.includes(it.id))) return true;
  if (only.length) return false;
  return !(old?.image && fs.existsSync('public/' + old.image.src) && (old.file === it.file || !it.file));
});
console.log(todo.length, 'Bilder zu laden');

// 1) Artikel -> Dateiname (Titelbild)
const fileOf = new Map();
for (const c of chunks(todo.filter((t) => !t.file), 40)) {
  const j = await api('prop=pageimages&piprop=name&redirects=1&titles=' + encodeURIComponent(c.map((t) => t.title).join('|')));
  const norm = new Map();
  for (const n of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) norm.set(n.from, n.to);
  const byTitle = new Map(j.query.pages.map((p) => [p.title, p.pageimage]));
  for (const t of c) {
    let title = t.title;
    for (let i = 0; i < 3 && norm.has(title); i++) title = norm.get(title);
    if (byTitle.get(title)) fileOf.set(t.id, byTitle.get(title));
  }
  await sleep(1500);
}
for (const t of todo) if (t.file) fileOf.set(t.id, t.file);

// 2) Dateiname -> Lizenz, Urheber, Thumbnail-URL
const meta = new Map();
for (const c of chunks([...new Set(fileOf.values())], 40)) {
  const j = await api('prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=960&titles=' + encodeURIComponent(c.map((f) => 'Datei:' + f).join('|')));
  const norm = new Map((j.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of j.query.pages) {
    const ii = p.imageinfo?.[0];
    const from = (norm.get(p.title) ?? p.title).replace(/^Datei:/, '');
    if (ii) meta.set(from, ii);
  }
  await sleep(1500);
}

// 3) Herunterladen, verkleinern, speichern
const out = [];
const problems = [];
for (const item of cfg.items) {
  const old = prevById.get(item.id);
  if (!todo.includes(item)) { out.push({ ...item, file: old?.file, image: old?.image ?? null, source: old?.source }); continue; }
  const file = fileOf.get(item.id);
  const source = 'https://de.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_'));
  if (!file) { problems.push(`${item.id}: kein Titelbild in „${item.title}“`); out.push({ ...item, image: null }); continue; }
  const ii = [...meta.entries()].find(([k]) => k.replace(/_/g, ' ') === file.replace(/_/g, ' '))?.[1];
  const m = ii?.extmetadata ?? {};
  const lic = m.LicenseShortName?.value ?? '';
  if (!ii || !FREE.test(lic)) { problems.push(`${item.id}: Lizenz nicht frei/unklar („${lic}“) für ${file}`); out.push({ ...item, file, image: null }); continue; }
  try {
    let buf;
    // Kleine Originale: Wikimedia liefert sonst die Originaldatei (stark gedrosselt). Dann selbst ein Standard-Thumbnail anfordern.
    let dl = ii.thumburl ?? ii.url;
    if (!/\/thumb\//.test(dl) && /\/commons\/(\w)\/(\w\w)\/([^?]+)/.test(ii.url)) {
      const [, a, b, name] = ii.url.match(/\/commons\/(\w)\/(\w\w)\/([^?]+)/);
      const w = (ii.width ?? 600) > 500 ? 500 : 330;
      dl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${b}/${name}/${w}px-${name}`;
    }
    for (let a = 0; a < 6; a++) {
      try {
        const res = await fetch(dl, { headers: { 'User-Agent': UA } });
        if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
      } catch { /* Netzwerkfehler: erneut versuchen */ }
      await sleep(4000 * (a + 1));
    }
    if (!buf) throw new Error('Download fehlgeschlagen');
    const dest = `img/${item.id}.webp`;
    await sharp(buf).resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile('public/' + dest);
    const image = {
      src: dest,
      author: strip(m.Artist?.value).slice(0, 160) || 'Unbekannt',
      license: /public domain|gemeinfrei|^pd/i.test(lic) ? 'Gemeinfrei' : lic,
      licenseUrl: m.LicenseUrl?.value,
      sourceUrl: ii.descriptionurl,
    };
    out.push({ ...item, file, image, source });
    console.log('ok', item.id, '|', image.license, '|', image.author.slice(0, 40));
  } catch (e) {
    problems.push(`${item.id}: ${e.message}`);
    out.push({ ...item, file, image: null });
  }
  await sleep(700);
}
fs.writeFileSync('data/images.json', JSON.stringify({ items: out }, null, 1));
console.log(`\n${out.filter((i) => i.image).length}/${out.length} Bilder ok`);
if (problems.length) console.log('PROBLEME:\n' + problems.join('\n'));
