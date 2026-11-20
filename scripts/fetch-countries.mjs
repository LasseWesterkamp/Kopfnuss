// Holt alle souveränen Staaten mit deutschen Namen, Hauptstadt, Kontinent und ISO-Codes aus Wikidata.
// Ergebnis: data/countries.json (wird danach von build-questions.mjs verwendet).
// Manuelle Korrekturen stehen in data/countries-overrides.json und gewinnen immer.
import fs from 'node:fs';
import { sparql, today } from './lib.mjs';

const q = `
SELECT ?c ?name ?a2 ?num ?capName ?contName ?pop WHERE {
  ?c wdt:P31 wd:Q3624078; wdt:P297 ?a2.
  FILTER NOT EXISTS { ?c wdt:P576 ?end }
  OPTIONAL { ?c wdt:P299 ?num }
  OPTIONAL { ?c p:P36 ?cs. ?cs ps:P36 ?cap. FILTER NOT EXISTS { ?cs pq:P582 ?e }
             ?cap rdfs:label ?capName. FILTER(LANG(?capName)="de") }
  OPTIONAL { ?c wdt:P30 ?cont. ?cont rdfs:label ?contName. FILTER(LANG(?contName)="de") }
  OPTIONAL { ?c wdt:P1082 ?pop }
  ?c rdfs:label ?name. FILTER(LANG(?name)="de")
}`;

const rows = await sparql(q);
const map = new Map();
for (const r of rows) {
  const a2 = r.a2.value.toLowerCase();
  const e = map.get(a2) ?? { a2, name: r.name.value, wikidata: r.c.value.split('/').pop(), num: r.num?.value ?? null, capitals: new Set(), continents: new Set(), pop: 0 };
  if (r.capName) e.capitals.add(r.capName.value);
  if (r.contName) e.continents.add(r.contName.value);
  if (r.pop) e.pop = Math.max(e.pop, Number(r.pop.value));
  map.set(a2, e);
}
const overrides = JSON.parse(fs.readFileSync('data/countries-overrides.json', 'utf8'));
const out = [];
for (const e of map.values()) {
  const o = overrides.countries[e.a2] ?? {};
  if (o.skip) continue;
  out.push({
    a2: e.a2,
    num: o.num ?? e.num,
    name: o.name ?? e.name,
    capital: o.capital === false ? null : (o.capital ?? [...e.capitals][0] ?? null),
    capitalNote: o.capitalNote ?? null,
    continentAmbiguous: !!o.continentAmbiguous,
    capitalsAll: [...e.capitals],
    continent: o.continent ?? [...e.continents][0] ?? null,
    continentsAll: [...e.continents],
    population: e.pop,
    wikidata: e.wikidata,
  });
}
// Staaten, die die Abfrage nicht findet (siehe "extra" in den Overrides)
for (const [a2, e] of Object.entries(overrides.extra ?? {})) {
  if (out.some((c) => c.a2 === a2)) continue;
  out.push({ a2, num: e.num, name: e.name, capital: e.capital, capitalNote: null, continentAmbiguous: false,
    capitalsAll: [e.capital], continent: e.continent, continentsAll: [e.continent], population: e.population, wikidata: e.wikidata });
}
out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
fs.writeFileSync('data/countries.json', JSON.stringify({ asOf: today(), source: 'https://www.wikidata.org', countries: out }, null, 1));
console.log(out.length, 'Staaten gespeichert');
const problems = out.filter((c) => !overrides.countries[c.a2] && (c.capitalsAll.length !== 1 || c.continentsAll.length !== 1 || !c.num));
for (const p of problems) console.log('PRÜFEN:', p.a2, p.name, '| Hauptst.:', p.capitalsAll.join(', '), '->', p.capital, '| Kont.:', p.continentsAll.join(', '), '->', p.continent, '| num', p.num);
