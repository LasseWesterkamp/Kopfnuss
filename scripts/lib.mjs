// Gemeinsame Helfer für die Datenskripte.
export const UA = 'KopfnussQuizBuilder/1.0 (https://github.com/LasseWesterkamp/kopfnuss)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sparql(query) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    await sleep(2000 * (attempt + 1));
  }
  throw new Error('Wikidata-Abfrage fehlgeschlagen');
}

export async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(1500 * (attempt + 1));
  }
  throw new Error('Abruf fehlgeschlagen: ' + url);
}

export const today = () => new Date().toISOString().slice(0, 10);
