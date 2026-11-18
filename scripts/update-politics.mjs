// Aktualisiert data/politics.json aus Wikidata und zeigt, was sich seit dem letzten Lauf geändert hat.
// Danach: node scripts/build-questions.mjs
// WICHTIG: Änderungen kurz prüfen (Wikidata kann kurzzeitig falsch sein). Fehler in data/politics-overrides.json abfangen.
import fs from 'node:fs';
import { sparql, today } from './lib.mjs';

const KABINETT = 'Q133849523'; // Kabinett Merz – nach einer neuen Bundesregierung hier die neue Kabinetts-ID eintragen
const ov = JSON.parse(fs.readFileSync('data/politics-overrides.json', 'utf8'));
const offices = [];
const lab = (x) => x?.value ?? '';
const year = (x) => (x?.value ? x.value.slice(0, 10) : null);
const latest = (rows) => rows.sort((a, b) => (b.start?.value ?? '').localeCompare(a.start?.value ?? ''))[0];
const groupBy = (rows, k) => rows.reduce((m, r) => ((m[r[k].value] ??= []).push(r), m), {});

// ---------- Bundesregierung ----------
const SHORT = {
  'Bundeskanzler der Bundesrepublik Deutschland': ['kanzler', 'Bundeskanzler/in', 1],
  'Vizekanzler': ['vize', 'Vizekanzler/in', 2],
  'Bundesminister des Auswärtigen': ['aa', 'Außenminister/in', 1],
  'Bundesminister des Innern': ['innen', 'Innenminister/in', 2],
  'Bundesminister der Finanzen': ['finanzen', 'Finanzminister/in', 1],
  'Bundesminister der Verteidigung': ['verteidigung', 'Verteidigungsminister/in', 1],
  'Bundesminister für Wirtschaft und Energie': ['wirtschaft', 'Wirtschaftsminister/in', 2],
  'Bundesminister für Arbeit und Soziales': ['arbeit', 'Arbeitsminister/in', 2],
  'Bundesminister der Justiz und für Verbraucherschutz': ['justiz', 'Justizminister/in', 2],
  'Bundesminister für Gesundheit': ['gesundheit', 'Gesundheitsminister/in', 2],
  'Bundesministerin für Gesundheit': ['gesundheit', 'Gesundheitsminister/in', 2],
  'Bundesministerin für Bildung, Familie, Senioren, Frauen und Jugend': ['bildung', 'Bildungs- und Familienminister/in', 3],
  'Bundesminister für Forschung, Technologie und Raumfahrt': ['forschung', 'Forschungsminister/in', 3],
  'Bundesminister für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit': ['umwelt', 'Umweltminister/in', 3],
  'Bundesminister für Verkehr': ['verkehr', 'Verkehrsminister/in', 3],
  'Bundesminister für Landwirtschaft, Ernährung und Heimat': ['landwirtschaft', 'Landwirtschaftsminister/in', 3],
  'Bundesministerin für wirtschaftliche Zusammenarbeit und Entwicklung': ['entwicklung', 'Entwicklungsminister/in', 3],
  'Bundesministerin für Wohnen, Stadtentwicklung und Bauwesen': ['bau', 'Bauminister/in', 3],
  'Bundesminister für Digitales und Staatsmodernisierung': ['digital', 'Digitalminister/in', 3],
  'Chef des Bundeskanzleramtes': ['kanzleramt', 'Chef/in des Bundeskanzleramts', 3],
  'Beauftragter der Bundesregierung für Kultur und Medien': ['kultur', 'Kulturstaatsminister/in', 3],
  'Bundespräsident': ['bpraes', 'Bundespräsident/in', 1],
  'Präsident des Deutschen Bundestages': ['btpraes', 'Bundestagspräsident/in', 2],
};
const labels = Object.keys(SHORT).map((l) => `"${l}"@de`).join(' ');
const de = await sparql(`SELECT ?l ?pos ?p ?pLabel ?start ?cab WHERE {
  { ?p p:P39 ?st. ?st ps:P39 ?pos; pq:P5054 wd:${KABINETT}. ?pos rdfs:label ?l. FILTER(LANG(?l)="de") BIND(1 AS ?cab) }
  UNION
  { VALUES ?l { ${labels} } ?pos rdfs:label ?l. ?p p:P39 ?st. ?st ps:P39 ?pos. ?st pq:P580 ?start0. FILTER(?start0 > "2017-01-01"^^xsd:dateTime) ?pos wdt:P17 wd:Q183. }
  FILTER NOT EXISTS { ?st pq:P582 ?e } OPTIONAL { ?st pq:P580 ?start }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de". } }`);
for (const [l, rows] of Object.entries(groupBy(de, 'l'))) {
  const s = SHORT[l];
  if (!s) { console.log('  (unbekanntes Amt, ignoriert:', l + ')'); continue; }
  const r = latest(rows);
  offices.push({ id: 'de-' + s[0], group: 'bund', label: s[1], holder: lab(r.pLabel), holderId: r.p.value.split('/').pop(), since: year(r.start), position: r.pos.value.split('/').pop(), difficulty: s[2] });
}

// ---------- Länder ----------
const ARTIKEL = { 'Freie Hansestadt Bremen': 'Bremen', 'Freie und Hansestadt Hamburg': 'Hamburg' };
const VON = { Saarland: 'des Saarlandes' }; // sonst "von X"
const NOMINATIV = { Saarland: 'das Saarland' };
const PM_TITLE = { Berlin: 'Regierende/r Bürgermeister/in von Berlin', Hamburg: 'Erste/r Bürgermeister/in von Hamburg', Bremen: 'Präsident/in des Senats von Bremen' };
const land = await sparql(`SELECT ?s ?sLabel ?h ?hLabel ?start WHERE {
  ?s wdt:P31 wd:Q1221156; p:P6 ?x. ?x ps:P6 ?h. FILTER NOT EXISTS { ?x pq:P582 ?e } OPTIONAL { ?x pq:P580 ?start }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de". } }`);
for (const [, rows] of Object.entries(groupBy(land, 's'))) {
  const r = latest(rows);
  const name = ARTIKEL[lab(r.sLabel)] ?? lab(r.sLabel);
  const big = ['Bayern', 'Nordrhein-Westfalen', 'Baden-Württemberg', 'Niedersachsen', 'Berlin', 'Hamburg'].includes(name);
  offices.push({
    id: 'land-' + r.s.value.split('/').pop(), group: 'land', land: name,
    label: PM_TITLE[name] ?? `Ministerpräsident/in ${VON[name] ?? 'von ' + name}`,
    question: `Wer regiert ${NOMINATIV[name] ?? name} als ${PM_TITLE[name] ? PM_TITLE[name].split(' von ')[0] : 'Ministerpräsident/in'}?`,
    holder: lab(r.hLabel), holderId: r.h.value.split('/').pop(), since: year(r.start), position: r.s.value.split('/').pop(), difficulty: big ? 2 : 3,
  });
}

// ---------- International ----------
// Mit Präposition/Artikel, damit die Frage grammatisch stimmt
const STAATEN = { Q30: 'der USA', Q142: 'Frankreich', Q145: 'Großbritannien', Q38: 'Italien', Q29: 'Spanien', Q36: 'Polen', Q40: 'Österreich', Q159: 'Russland', Q148: 'China', Q17: 'Japan', Q668: 'Indien', Q16: 'Kanada', Q212: 'der Ukraine', Q43: 'der Türkei', Q55: 'der Niederlande', Q155: 'Brasilien', Q39: 'der Schweiz', Q237: 'der Vatikanstadt' };
const vonLand = (l) => (l.startsWith('der ') ? l : 'von ' + l);
const ISO = { Q30: 'us', Q142: 'fr', Q145: 'gb', Q38: 'it', Q29: 'es', Q36: 'pl', Q40: 'at', Q159: 'ru', Q148: 'cn', Q17: 'jp', Q668: 'in', Q16: 'ca', Q212: 'ua', Q43: 'tr', Q55: 'nl', Q155: 'br', Q39: 'ch', Q237: 'va' };
const FAMOUS = new Set(['us-hos', 'fr-hos', 'gb-hog', 'ru-hos', 'cn-hos', 'it-hog', 'tr-hos', 'ua-hos', 'va-hos']);
const intl = await sparql(`SELECT ?c ?role ?h ?hLabel ?start WHERE {
  VALUES ?c { ${Object.keys(STAATEN).map((q) => 'wd:' + q).join(' ')} }
  { ?c p:P35 ?x. ?x ps:P35 ?h. BIND("hos" AS ?role) } UNION { ?c p:P6 ?x. ?x ps:P6 ?h. BIND("hog" AS ?role) }
  FILTER NOT EXISTS { ?x pq:P582 ?e } OPTIONAL { ?x pq:P580 ?start }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } }`);
for (const rows of Object.values(groupBy(intl.map((r) => ({ ...r, k: { value: r.c.value + r.role.value } })), 'k'))) {
  const r = latest(rows);
  const q = r.c.value.split('/').pop();
  const role = r.role.value;
  const id = `int-${ISO[q]}-${role}`;
  const land = STAATEN[q];
  const label = q === 'Q237' ? 'Papst' : q === 'Q30' ? 'Präsident/in der USA' : role === 'hos' ? `Staatsoberhaupt ${vonLand(land)}` : `Regierungschef/in ${vonLand(land)}`;
  const question = q === 'Q237' ? 'Wer ist das aktuelle Oberhaupt der katholischen Kirche?'
    : q === 'Q30' ? 'Wer ist Präsident/in der USA?'
    : role === 'hos' ? `Wer ist Staatsoberhaupt ${vonLand(land)}?` : `Wer ist Regierungschef/in ${vonLand(land)}?`;
  offices.push({ id, group: 'international', label, question, holder: lab(r.hLabel), holderId: r.h.value.split('/').pop(), since: year(r.start), position: q, difficulty: FAMOUS.has(`${ISO[q]}-${role}`) ? 1 : role === 'hos' && ['ca', 'nl', 'es', 'jp'].includes(ISO[q]) ? 3 : 2 });
}

// ---------- Organisationen ----------
const ORG = {
  'Präsident der Europäischen Kommission': ['eu-kom', 'Präsident/in der EU-Kommission', 1],
  'Präsident des Europäischen Rates': ['eu-rat', 'Präsident/in des Europäischen Rates', 3],
  'Generalsekretär der Vereinten Nationen': ['un', 'UN-Generalsekretär/in', 2],
  'NATO-Generalsekretär': ['nato', 'NATO-Generalsekretär/in', 2],
};
const org = await sparql(`SELECT ?l ?pos ?p ?pLabel ?start WHERE {
  VALUES ?l { ${Object.keys(ORG).map((l) => `"${l}"@de`).join(' ')} }
  ?pos rdfs:label ?l. ?p p:P39 ?st. ?st ps:P39 ?pos; pq:P580 ?start. FILTER NOT EXISTS { ?st pq:P582 ?e } FILTER(?start > "2015-01-01"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de". } }`);
for (const [l, rows] of Object.entries(groupBy(org, 'l'))) {
  const r = latest(rows), o = ORG[l];
  offices.push({ id: 'org-' + o[0], group: 'international', label: o[1], holder: lab(r.pLabel), holderId: r.p.value.split('/').pop(), since: year(r.start), position: r.pos.value.split('/').pop(), difficulty: o[2] });
}

// ---------- Geschlecht (für korrekte Formulierung "Ministerpräsidentin" usw.) ----------
const ids = [...new Set(offices.map((o) => o.holderId).filter(Boolean))];
const sex = await sparql(`SELECT ?p ?g WHERE { VALUES ?p { ${ids.map((i) => 'wd:' + i).join(' ')} } ?p wdt:P21 ?g }`);
const female = new Set(sex.filter((x) => x.g.value.endsWith('/Q6581072')).map((x) => x.p.value.split('/').pop()));
for (const o of offices) o.female = female.has(o.holderId);

// ---------- Overrides, Vergleich, Speichern ----------
for (const o of offices) {
  const key = o.id.replace(/^de-/, '');
  if (ov.names?.[o.holder]) o.holder = ov.names[o.holder];
  if (ov.manual?.[o.id]) Object.assign(o, ov.manual[o.id]);
  if (ov.skip[o.id] || ov.skip[key]) { o.skip = true; o.skipReason = ov.skip[o.id] ?? ov.skip[key]; }
  o.source = 'https://www.wikidata.org/wiki/' + o.position;
}
// Manuell ergänzte Ämter, die in Wikidata fehlen
for (const [id, m] of Object.entries(ov.manual ?? {})) if (!offices.find((o) => o.id === id)) offices.push({ id, ...m });
offices.sort((a, b) => a.id.localeCompare(b.id));
const prev = fs.existsSync('data/politics.json') ? JSON.parse(fs.readFileSync('data/politics.json', 'utf8')) : null;
const asOf = today();
console.log(`\n${offices.filter((o) => !o.skip).length} Ämter (Stand ${asOf})`);
if (prev) {
  const old = new Map(prev.offices.map((o) => [o.id, o]));
  for (const o of offices) {
    const p = old.get(o.id);
    if (!p) console.log('NEU     ', o.id, '→', o.holder);
    else if (p.holder !== o.holder) console.log('WECHSEL ', o.id, ':', p.holder, '→', o.holder);
  }
  for (const p of prev.offices) if (!offices.find((o) => o.id === p.id)) console.log('WEG     ', p.id, '(war', p.holder + ')');
}
const recent = offices.filter((o) => !o.skip && o.since && o.since > new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
if (recent.length) console.log('\nBitte prüfen (im letzten Jahr gewechselt):\n' + recent.map((o) => `  ${o.label}: ${o.holder} (seit ${o.since})`).join('\n'));
fs.writeFileSync('data/politics.json', JSON.stringify({ asOf, source: 'Wikidata', offices }, null, 1));
