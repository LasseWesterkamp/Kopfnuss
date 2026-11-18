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
const sameCont = (c) => countries.filter((o) => o.a2 !== c.a2 && o.continent === c.continent);

for (const c of countries) {
  const d = diff(c);
  const rng = seeded(c.a2);
  // Hauptstadt
  if (c.capital) {
    const others = sameCont(c).filter((o) => o.capital).map((o) => o.capital);
    const pool = others.length >= 3 ? others : countries.filter((o) => o.capital && o.a2 !== c.a2).map((o) => o.capital);
    questions.push(mc('geo-cap-' + c.a2, {
      topic: 'geografie', difficulty: d,
      prompt: `Was ist die Hauptstadt von ${c.name}?`,
      explanation: `Die Hauptstadt von ${c.name} ist ${c.capital}.` + (c.capitalNote ? ' ' + c.capitalNote : ''),
      source: wiki(c.name), asOf: geoAsOf,
    }, c.capital, pick(pool, 3, rng, [c.capital])));
    // Umgekehrt nur für größere Länder
    if (c.population >= 2e7 || (isEU(c) && c.population >= 2e6)) {
      questions.push(mc('geo-capr-' + c.a2, {
        topic: 'geografie', difficulty: Math.min(3, d + (d === 1 ? 0 : 0)),
        prompt: `${c.capital} ist die Hauptstadt von …`,
        explanation: `${c.capital} ist die Hauptstadt von ${c.name}.` + (c.capitalNote ? ' ' + c.capitalNote : ''),
        source: wiki(c.name), asOf: geoAsOf,
      }, c.name, pick(sameCont(c).map((o) => o.name), 3, rng)));
    }
  }
  // Kontinent (nur eindeutige, und nur wo es nicht trivial ist)
  if (!c.continentAmbiguous && c.continent && !(isEU(c) && c.population > 5e6)) {
    const conts = ['Afrika', 'Asien', 'Europa', 'Nordamerika', 'Südamerika', 'Ozeanien'];
    questions.push(mc('geo-cont-' + c.a2, {
      topic: 'geografie', difficulty: c.population < 2e6 ? 3 : 2,
      prompt: `Auf welchem Kontinent liegt ${c.name}?`,
      explanation: `${c.name} liegt in ${c.continent}${c.capital ? ', Hauptstadt ist ' + c.capital : ''}.`,
      source: wiki(c.name), asOf: geoAsOf,
    }, c.continent, pick(conts, 3, rng, [c.continent])));
  }
  // Karte
  if (c.num && onMap.has(c.num) && c.continent) {
    questions.push({
      id: 'geo-map-' + c.a2, type: 'map', topic: 'geografie', difficulty: d,
      prompt: `Wo liegt ${c.name}? Tippe das Land auf der Karte an.`,
      country: c.num, continent: c.continent,
      explanation: `${c.name} liegt in ${c.continent}${c.capital ? '. Hauptstadt: ' + c.capital : ''}.`,
      source: wiki(c.name), asOf: geoAsOf,
    });
  }
  // Flagge
  const nearby = sameCont(c).map((o) => o.name);
  questions.push(mc('flag-' + c.a2, {
    topic: 'flaggen', difficulty: d,
    prompt: 'Zu welchem Land gehört diese Flagge?',
    flag: c.a2,
    explanation: `Das ist die Flagge von ${c.name}.`,
    source: 'https://de.wikipedia.org/wiki/Liste_der_Nationalflaggen', asOf: geoAsOf,
  }, c.name, pick(nearby.length >= 3 ? nearby : countries.map((o) => o.name), 3, rng, [c.name])));
  fs.copyFileSync(`node_modules/flag-icons/flags/4x3/${c.a2}.svg`, `public/flags/${c.a2}.svg`);
}
// Kartendaten in public kopieren
fs.copyFileSync('node_modules/world-atlas/countries-110m.json', 'public/data/countries-110m.json');

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
      topic: 'politik', source: o.source, asOf: pol.asOf,
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
  for (const it of imgs.items) {
    if (!it.image) continue;
    const pool = imgs.items.filter((x) => x.group === it.group && x.answer !== it.answer).map((x) => x.answer);
    questions.push(mc(it.id, {
      topic: it.topic, difficulty: it.difficulty ?? 1,
      prompt: it.prompt,
      image: it.image,
      explanation: it.explanation,
      source: it.source,
    }, it.answer, pick(pool, 3, seeded(it.id), [it.answer])));
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
  if (q.image && !(q.image.license && q.image.author && q.image.sourceUrl)) errors.push(`${q.id}: Bild ohne Lizenzangaben`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const byTopic = {};
for (const q of questions) byTopic[q.topic] = (byTopic[q.topic] ?? 0) + 1;
fs.writeFileSync('public/data/questions.json', JSON.stringify({ built: new Date().toISOString().slice(0, 10), count: questions.length, questions }));
console.log('Fragen gesamt:', questions.length, byTopic);
