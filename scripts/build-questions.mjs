// Baut public/data/questions.json aus:
//  - data/countries.json        (Geografie + Flaggen, generiert)
//  - data/politics.json         (Politik, generiert + geprüft)
//  - data/images.json           (Bildfragen Tiere/Pflanzen/historische Bilder)
//  - data/fragen/*.json         (handgeschriebene Fragen)
// IDs sind stabil, damit der Lernfortschritt beim Neubauen erhalten bleibt.
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---------- Zufall mit festem Seed (gleiche Distraktoren bei jedem Build) ----------
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function shuffleSeeded(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(arr, n, rng, exclude = []) {
  const pool = [...new Set(arr)].filter((x) => !exclude.includes(x));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
/** MC-Frage mit richtiger Antwort an zufälliger Position */
function mc(id, base, correct, distractors) {
  const rng = seeded(id + ':pos');
  const choices = [...distractors];
  const pos = Math.floor(rng() * (choices.length + 1));
  choices.splice(pos, 0, correct);
  return { id, type: 'mc', ...base, choices, answer: pos };
}

const questions = [];

// ---------- Geografie & Flaggen ----------
const { countries, asOf: geoAsOf } = read('data/countries.json');
const atlas = read('node_modules/world-atlas/countries-110m.json');
const onMap = new Set(atlas.objects.countries.geometries.map((g) => g.id));
const wiki = (name) => 'https://de.wikipedia.org/wiki/' + encodeURIComponent(name.replace(/ /g, '_'));
const isEU = (c) => c.continent === 'Europa';
function diff(c) {
  if ((isEU(c) && c.population >= 4e6) || c.population >= 8e7) return 1;
  if ((!isEU(c) && c.population < 2e6)) return 3;
  return 2;
}
const GRAM = read('data/laender-grammatik.json').laender;
/** "Hauptstadt des Iran" / "Hauptstadt von Frankreich" */
const vonLand = (c) => (GRAM[c.a2] ? GRAM[c.a2].gen : 'von ' + c.name);
/** "Wo liegt der Iran?" / "Wo liegt Frankreich?" */
const nomLand = (c) => GRAM[c.a2]?.nom ?? c.name;
const Gross = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const liegt = (c) => (GRAM[c.a2]?.plural ? 'liegen' : 'liegt');
const satz = (t) => t.replace(/\.\.$/, '.'); // "Washington, D.C.." -> "Washington, D.C."

const CONT_CAT = { Europa: 'europa', Afrika: 'afrika', Asien: 'asien', Nordamerika: 'nordamerika', Südamerika: 'suedamerika', Ozeanien: 'ozeanien' };
const sameCont = (c) => countries.filter((o) => o.a2 !== c.a2 && o.continent === c.continent);

for (const c of countries) {
  const d = diff(c);
  const rng = seeded(c.a2);
  // Hauptstadt
  if (c.capital) {
    const others = sameCont(c).filter((o) => o.capital).map((o) => o.capital);
    const pool = others.length >= 3 ? others : countries.filter((o) => o.capital && o.a2 !== c.a2).map((o) => o.capital);
    questions.push(mc('geo-cap-' + c.a2, {
      topic: 'geografie', cat: 'hauptstaedte', difficulty: d,
      prompt: `Was ist die Hauptstadt ${vonLand(c)}?`,
      explanation: `Die Hauptstadt ${vonLand(c)} ist ${c.capital}.` + (c.capitalNote ? ' ' + c.capitalNote : ''),
      source: wiki(c.name), asOf: geoAsOf,
    }, c.capital, pick(pool, 3, rng, [c.capital])));
    // Umgekehrt nur für größere Länder
    if (c.population >= 2e7 || (isEU(c) && c.population >= 2e6)) {
      questions.push(mc('geo-capr-' + c.a2, {
        topic: 'geografie', cat: 'hauptstaedte', difficulty: Math.min(3, d + (d === 1 ? 0 : 0)),
        prompt: `${c.capital} ist die Hauptstadt von …`,
        explanation: `${c.capital} ist die Hauptstadt ${vonLand(c)}.` + (c.capitalNote ? ' ' + c.capitalNote : ''),
        source: wiki(c.name), asOf: geoAsOf,
      }, c.name, pick(sameCont(c).map((o) => o.name), 3, rng)));
    }
  }
  // Kontinent (nur eindeutige, und nur wo es nicht trivial ist)
  if (!c.continentAmbiguous && c.continent && !(isEU(c) && c.population > 5e6)) {
    const conts = ['Afrika', 'Asien', 'Europa', 'Nordamerika', 'Südamerika', 'Ozeanien'];
    questions.push(mc('geo-cont-' + c.a2, {
      topic: 'geografie', cat: 'kontinente', difficulty: c.population < 2e6 ? 3 : 2,
      prompt: `Auf welchem Kontinent ${liegt(c)} ${nomLand(c)}?`,
      explanation: `${Gross(nomLand(c))} ${liegt(c)} in ${c.continent}${c.capital ? ', Hauptstadt ist ' + c.capital : ''}.`,
      source: wiki(c.name), asOf: geoAsOf,
    }, c.continent, pick(conts, 3, rng, [c.continent])));
  }
  // Karte
  if (c.num && onMap.has(c.num) && c.continent) {
    questions.push({
      id: 'geo-map-' + c.a2, type: 'map', topic: 'geografie', cat: 'karte', difficulty: d,
      prompt: `Wo ${liegt(c)} ${nomLand(c)}? Tippe das Land auf der Karte an.`,
      country: c.num, continent: c.continent,
      explanation: satz(`${Gross(nomLand(c))} ${liegt(c)} in ${c.continent}${c.capital ? '. Hauptstadt: ' + c.capital : ''}.`),
      source: wiki(c.name), asOf: geoAsOf,
    });
  }
  // Flagge
  const nearby = sameCont(c).map((o) => o.name);
  questions.push(mc('flag-' + c.a2, {
    topic: 'flaggen', cat: CONT_CAT[c.continent], difficulty: d,
    prompt: 'Zu welchem Land gehört diese Flagge?',
    flag: c.a2,
    explanation: `Das ist die Flagge ${vonLand(c)}.`,
    source: 'https://de.wikipedia.org/wiki/Liste_der_Nationalflaggen', asOf: geoAsOf,
  }, c.name, pick(nearby.length >= 3 ? nearby : countries.map((o) => o.name), 3, rng, [c.name])));
  fs.copyFileSync(`node_modules/flag-icons/flags/4x3/${c.a2}.svg`, `public/flags/${c.a2}.svg`);
}
// Kartendaten in public kopieren
fs.copyFileSync('node_modules/world-atlas/countries-110m.json', 'public/data/countries-110m.json');
// Welt-Puzzles: detailliertere Karte (50m, enthält auch Kleinstaaten) + Länderliste mit Kontinent
fs.copyFileSync('node_modules/world-atlas/countries-50m.json', 'public/data/countries-50m.json');
{
  const atlas50 = read('node_modules/world-atlas/countries-50m.json');
  const on50 = new Set(atlas50.objects.countries.geometries.map((g) => g.id));
  const world = countries.filter((c) => c.num && on50.has(c.num) && c.continent)
    .map((c) => ({ num: c.num, a2: c.a2, name: c.name, continent: c.continent, mapQuestion: onMap.has(c.num) ? 'geo-map-' + c.a2 : null }));
  fs.writeFileSync('public/data/world-puzzle.json', JSON.stringify({ asOf: geoAsOf, countries: world }));
  console.log('Welt-Puzzle:', world.length, 'Länder');
}

// ---------- Politik ----------
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** "Ministerpräsident/in" -> "Ministerpräsidentin" bzw. "Ministerpräsident"; "Regierende/r" -> "Regierende" bzw. "Regierender" */
const gendered = (label, f) => label.replace(/e\/r\b/g, f ? 'e' : 'er').replace(/\/in\b/g, f ? 'in' : '');
const seit = (d) => (d ? ` (seit ${MONATE[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)})` : '');
if (fs.existsSync('data/politics.json')) {
  const pol = read('data/politics.json');
  const active = pol.offices.filter((o) => o.holder && !o.skip);
  for (const o of active) {
    const rng = seeded(o.id);
    const isMinister = o.group === 'bund' && /minister\/in$/.test(o.label);
    const prompt = o.question ?? (isMinister ? `Wer ist derzeit ${o.label} in der Bundesregierung?` : `Wer ist derzeit ${o.label}?`);
    const pool = active.filter((x) => x.group === o.group && x.holder !== o.holder).map((x) => x.holder);
    const base = {
      topic: 'politik', cat: o.group === 'bund' ? 'bund' : o.group === 'land' ? 'laender' : o.id.startsWith('org-') ? 'organisationen' : 'welt',
      source: o.source, asOf: pol.asOf,
      explanation: `${o.holder} ist ${gendered(o.label, o.female)}${seit(o.since)}.` + (o.note ? ' ' + o.note : ''),
    };
    questions.push(mc('pol-' + o.id, { ...base, difficulty: o.difficulty ?? 2, prompt }, o.holder, pick(pool, 3, rng, [o.holder])));
    // Umkehrfrage: Welches Amt? / Welches Bundesland?
    if (o.group === 'bund' && o.id !== 'de-vize') {
      const own = active.filter((x) => x.holder === o.holder).map((x) => x.label);
      const others = active.filter((x) => x.group === 'bund' && !own.includes(x.label)).map((x) => x.label);
      questions.push(mc('pol-r-' + o.id, { ...base, difficulty: Math.min(3, (o.difficulty ?? 2) + 1), prompt: `Welches Amt hat ${o.holder} derzeit inne?` }, o.label, pick(others, 3, seeded(o.id + 'r'))));
    }
    if (o.group === 'land') {
      const lands = active.filter((x) => x.group === 'land' && x.land !== o.land).map((x) => x.land);
      questions.push(mc('pol-r-' + o.id, { ...base, difficulty: 3, prompt: `Welches Bundesland regiert ${o.holder}?` }, o.land, pick(lands, 3, seeded(o.id + 'r'))));
    }
  }
}
function fmtDate(d) { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; }

// ---------- Bildfragen (Tiere, Pflanzen, historische Bilder) ----------
if (fs.existsSync('data/images.json')) {
  const imgs = read('data/images.json');
  // Gruppe in images-config.json -> Kategorie
  const IMG_CAT = { saeuger: 'saeugetiere', vogel: 'voegel', reptamph: 'reptilien', insekt: 'insekten', fisch: 'fische',
    baum: 'baeume', blume: 'blumen', pilz: 'pilze', person: 'personen', ereignis: 'ereignisse' };
  for (const it of imgs.items) {
    if (!it.image) continue;
    const pool = imgs.items.filter((x) => x.group === it.group && x.answer !== it.answer).map((x) => x.answer);
    questions.push(mc(it.id, {
      topic: it.topic, cat: IMG_CAT[it.group], difficulty: it.difficulty ?? 1,
      prompt: it.prompt,
      image: it.image,
      explanation: it.explanation,
      source: it.source,
    }, it.answer, pick(pool, 3, seeded(it.id), [it.answer])));
  }
}

// ---------- Regionen (Bundesländer, Kantone, Bundesstaaten …) ----------
if (fs.existsSync('data/regions.json')) {
  const { regions, asOf: regAsOf } = read('data/regions.json');
  const LAND = { de: 'Deutschland', at: 'Österreich', ch: 'Schweiz', us: 'USA', ca: 'Kanada', au: 'Australien' };
  const TERR = new Set(['CA-YT', 'CA-NT', 'CA-NU', 'AU-NT', 'AU-ACT']);
  // Art der Region: [Nominativ mit Artikel "ein/eine", Fragewort, Genitiv-Form für "Hauptstadt des …"]
  const kind = (r) => {
    if (r.cc === 'ch') return { ein: 'ein Kanton der Schweiz', welche: 'Welcher Kanton', des: `des Kantons ${r.name}`, hs: 'Hauptort' };
    if (r.cc === 'de' || r.cc === 'at') return { ein: `ein Bundesland ${r.cc === 'de' ? 'Deutschlands' : 'Österreichs'}`, welche: 'Welches Bundesland', des: r.name, hs: 'Hauptstadt' };
    if (TERR.has(r.iso)) return { ein: `ein Territorium ${r.cc === 'ca' ? 'Kanadas' : 'Australiens'}`, welche: r.cc === 'ca' ? 'Welche Provinz bzw. welches Territorium' : 'Welcher Bundesstaat bzw. welches Territorium', des: r.name, hs: 'Hauptstadt' };
    if (r.cc === 'ca') return { ein: 'eine Provinz Kanadas', welche: 'Welche Provinz bzw. welches Territorium', des: r.name, hs: 'Hauptstadt' };
    return { ein: `ein Bundesstaat ${r.cc === 'us' ? 'der USA' : 'Australiens'}`, welche: r.cc === 'us' ? 'Welcher Bundesstaat' : 'Welcher Bundesstaat bzw. welches Territorium', des: r.name, hs: 'Hauptstadt' };
  };
  // Bekanntheit: steuert die Schwierigkeit
  const EASY = new Set(['DE-BY', 'DE-BE', 'DE-HH', 'DE-NW', 'DE-BW', 'DE-SN', 'DE-NI', 'DE-HE', 'AT-9', 'AT-7', 'AT-5', 'CH-ZH', 'CH-BE', 'CH-GE', 'CH-TI',
    'US-CA', 'US-TX', 'US-FL', 'US-NY', 'US-AK', 'US-HI', 'CA-QC', 'CA-ON', 'CA-BC', 'AU-NSW', 'AU-QLD', 'AU-VIC', 'AU-WA']);
  const lvl = (r) => (EASY.has(r.iso) ? 1 : r.cc === 'de' || r.cc === 'at' ? 1 : r.cc === 'ch' || r.cc === 'us' ? 3 : 2);
  const px = (r) => Buffer.from(r.flag.print, 'base64');
  const flagDist = (a, b) => { const x = px(a), y = px(b); let t = 0; for (let i = 0; i < x.length; i++) t += Math.abs(x[i] - y[i]); return t / x.length; };
  for (const r of regions) {
    const k = kind(r);
    const same = regions.filter((o) => o.cc === r.cc && o.iso !== r.iso);
    const base = { topic: 'regionen', sub: r.cc, source: 'https://www.wikidata.org/wiki/' + r.wikidata, asOf: regAsOf };
    const id = r.iso.toLowerCase();
    const info = `${r.name} ist ${k.ein}${r.capital ? `, ${k.hs}: ${r.capital}` : ''}.` + (r.capitalNote ? ' ' + r.capitalNote : '');
    if (r.capital) {
      const capPool = same.filter((o) => o.capital).map((o) => o.capital);
      if (r.capital === r.name || r.capital.startsWith(r.name + ' ')) { /* Frage wäre trivial */ } else
      questions.push(mc('reg-cap-' + id, { ...base, cat: 'hauptstaedte', difficulty: lvl(r), prompt: `Was ist ${k.hs === 'Hauptort' ? 'der Hauptort' : 'die Hauptstadt'} ${r.cc === 'ch' ? k.des : 'von ' + r.name + ' (' + LAND[r.cc] + ')'}?`, explanation: info },
        r.capital, pick(capPool, 3, seeded(r.iso), [r.capital])));
      // Umkehrfrage nur, wenn Hauptstadt und Region nicht gleich heißen (Bremen, Salzburg, Zürich …)
      if (!r.capital.startsWith(r.name) && !r.name.startsWith(r.capital.split(' ')[0]))
        questions.push(mc('reg-capr-' + id, { ...base, cat: 'hauptstaedte', difficulty: Math.min(3, lvl(r) + 1), prompt: `${r.capital} ist ${k.hs === 'Hauptort' ? 'der Hauptort' : 'die Hauptstadt'} von … (${LAND[r.cc]})`, explanation: info },
          r.name, pick(same.map((o) => o.name), 3, seeded(r.iso + 'r'))));
    }
    questions.push({ id: 'reg-map-' + id, type: 'map', ...base, cat: 'lage', difficulty: lvl(r), prompt: `Wo liegt ${r.name}? Tippe es auf der Karte an.`,
      country: r.iso, continent: r.cc, regions: true, explanation: info });
    if (r.flag) {
      const twins = same.filter((o) => o.flag && flagDist(r, o) < 1);
      if (twins.length) { console.log(`  Flagge ${r.name} sieht aus wie ${twins.map((t) => t.name).join(', ')}: keine Flaggenfrage`); continue; }
      const pool = same.filter((o) => !o.flag || flagDist(r, o) >= 1).map((o) => o.name);
      const { print, ...image } = r.flag;
      questions.push(mc('reg-flag-' + id, { ...base, cat: 'flaggen', difficulty: lvl(r) === 1 && r.cc !== 'de' ? 2 : lvl(r), prompt: `${k.welche} ${{ de: 'Deutschlands', at: 'Österreichs', ch: 'der Schweiz', us: 'der USA', ca: 'Kanadas', au: 'Australiens' }[r.cc]} hat diese Flagge?`,
        image, explanation: `Das ist die Flagge von ${r.name}. ` + info }, r.name, pick(pool, 3, seeded(r.iso + 'f'))));
    }
  }

  // ----- Neue Spielarten -----
  const flagImg = (r) => { const { print, ...img } = r.flag; return img; };
  const clash = (a, b) => a.flag && b.flag && flagDist(a, b) < 1; // gleich aussehende Flaggen
  for (const r of regions) {
    const k = kind(r);
    const same = regions.filter((o) => o.cc === r.cc && o.iso !== r.iso);
    const base = { topic: 'regionen', sub: r.cc, source: 'https://www.wikidata.org/wiki/' + r.wikidata, asOf: regAsOf };
    const id = r.iso.toLowerCase();
    const info = `${r.name} ist ${k.ein}${r.capital ? `, ${k.hs}: ${r.capital}` : ''}.`;
    // 1) Markierte Region benennen
    questions.push(mc('reg-mapname-' + id, { ...base, type: 'mapname', cat: 'lage', difficulty: lvl(r),
      prompt: `${k.welche.replace(/^Welche[rs]? /, (m) => m)} ist auf der Karte markiert?`, country: r.iso, continent: r.cc, regions: true, explanation: info },
      r.name, pick(same.map((o) => o.name), 3, seeded(r.iso + 'mn'))));
    // 2) Welche Flagge gehört zu X? (4 Flaggen, keine zwei gleich aussehenden)
    if (r.flag) {
      const rng = seeded(r.iso + 'fp');
      const opts = [];
      for (const o of shuffleSeeded(same.filter((o) => o.flag && !clash(o, r)), rng)) {
        if (opts.length === 3) break;
        if (!opts.some((x) => clash(x, o))) opts.push(o);
      }
      const pos = Math.floor(rng() * 4);
      const all = [...opts]; all.splice(pos, 0, r);
      questions.push({ id: 'reg-flagpick-' + id, type: 'flagpick', ...base, cat: 'flaggen', difficulty: lvl(r) === 1 && r.cc !== 'de' ? 2 : lvl(r),
        prompt: `Welche Flagge gehört zu ${r.name}?`, options: all.map(flagImg), optionLabels: all.map((o) => o.name), answer: pos,
        explanation: `Die richtige Flagge ist die von ${r.name}. ` + info });
    }
  }
  // 3) Zuordnungsspiel: je 4 Regionen eines Landes, keine gleich aussehenden Flaggen in einer Gruppe
  for (const cc of [...new Set(regions.map((r) => r.cc))]) {
    const list = shuffleSeeded(regions.filter((r) => r.cc === cc && r.flag), seeded('match' + cc));
    const groups = [];
    const rest = [...list];
    while (rest.length >= 4) {
      const g = [rest.shift()];
      for (let i = 0; i < rest.length && g.length < 4; ) { if (!g.some((x) => clash(x, rest[i]))) g.push(rest.splice(i, 1)[0]); else i++; }
      if (g.length === 4) groups.push(g); else break;
    }
    groups.forEach((g, i) => {
      const diff = Math.round(g.reduce((t, r) => t + lvl(r), 0) / 4);
      questions.push({ id: `reg-match-${cc}-${i + 1}`, type: 'match', topic: 'regionen', sub: cc, cat: 'flaggen', difficulty: diff,
        prompt: 'Ordne jeder Flagge den richtigen Namen zu.', pairs: g.map((r) => ({ label: r.name, image: flagImg(r) })),
        explanation: g.map((r) => r.name).join(', ') + '.', source: 'https://de.wikipedia.org/wiki/Liste_der_Flaggen_' + ({ de: 'der_deutschen_Länder', at: 'der_österreichischen_Bundesländer', ch: 'der_Schweizer_Kantone', us: 'der_Bundesstaaten_der_Vereinigten_Staaten', ca: 'der_Provinzen_und_Territorien_Kanadas', au: 'Australiens' }[cc]), asOf: regAsOf });
    });
  }
}

// ---------- Handgeschriebene Fragen ----------
for (const f of fs.readdirSync('data/fragen').filter((f) => f.endsWith('.json')).sort()) {
  const data = read(path.join('data/fragen', f));
  for (const q of data.questions) {
    const full = { topic: data.topic, ...q };
    if (typeof full.correct === 'string') {
      // Kurzform: { correct: "…", wrong: [...] } -> choices/answer
      const { correct, wrong, ...rest } = full;
      questions.push(mc(full.id, rest, correct, wrong));
      continue;
    } else questions.push(full);
  }
}

// ---------- Prüfen & schreiben ----------
const KAT = read('data/kategorien.json').themen;
const ids = new Set();
const errors = [];
for (const q of questions) {
  if (ids.has(q.id)) errors.push('Doppelte ID: ' + q.id);
  ids.add(q.id);
  for (const k of ['id', 'topic', 'type', 'prompt', 'explanation', 'source']) if (!q[k]) errors.push(`${q.id}: Feld ${k} fehlt`);
  if (![1, 2, 3].includes(q.difficulty)) errors.push(`${q.id}: difficulty muss 1, 2 oder 3 sein`);
  if (q.type === 'mc') {
    if (!Array.isArray(q.choices) || q.choices.length < 2) errors.push(`${q.id}: zu wenige Antworten`);
    if (new Set(q.choices).size !== q.choices.length) errors.push(`${q.id}: doppelte Antwortmöglichkeit`);
    if (!(q.answer >= 0 && q.answer < q.choices.length)) errors.push(`${q.id}: answer außerhalb`);
  }
  if (q.type === 'year' && !(q.min < q.year && q.year < q.max)) errors.push(`${q.id}: Jahr außerhalb min/max`);
  if (q.type === 'order' && (q.items?.length ?? 0) < 3) errors.push(`${q.id}: Reihenfolge braucht >= 3 Einträge`);
  if (q.type === 'order' && new Set(q.items.map((i) => i.year)).size !== q.items.length) errors.push(`${q.id}: gleiche Jahre in Reihenfolge`);
  if (q.topic === 'politik' && !q.asOf) errors.push(`${q.id}: Politikfrage ohne Stand-Datum`);
  // Jede Frage hat genau eine gültige Kategorie ihres Themas
  if (!KAT[q.topic]) errors.push(`${q.id}: Thema ${q.topic} fehlt in data/kategorien.json`);
  else if (typeof q.cat !== 'string' || !KAT[q.topic].some((k) => k.id === q.cat)) errors.push(`${q.id}: Kategorie fehlt oder unbekannt (${q.cat}) – erlaubt: ${KAT[q.topic].map((k) => k.id).join(', ')}`);
  if (q.type === 'flagpick' && !(q.options?.length === 4 && q.answer >= 0 && q.answer < 4)) errors.push(`${q.id}: flagpick braucht 4 Optionen`);
  if (q.type === 'match' && q.pairs?.length !== 4) errors.push(`${q.id}: Zuordnung braucht 4 Paare`);
  if (q.type === 'mapname' && !(q.choices?.length >= 2 && q.country)) errors.push(`${q.id}: mapname unvollständig`);
  if (q.image && !(q.image.license && q.image.author && q.image.sourceUrl)) errors.push(`${q.id}: Bild ohne Lizenzangaben`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const byTopic = {};
for (const q of questions) byTopic[q.topic] = (byTopic[q.topic] ?? 0) + 1;
fs.writeFileSync('public/data/questions.json', JSON.stringify({ built: new Date().toISOString().slice(0, 10), count: questions.length, questions }));
console.log('Fragen gesamt:', questions.length, byTopic);
