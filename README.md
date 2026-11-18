# 🌰 Kopfnuss

Allgemeinwissen trainieren, jeden Tag 10 Fragen. Läuft als installierbare Web-App (PWA) auf iPhone, Android und PC, auch offline.

**Themen:** Geografie (Hauptstädte, Flüsse, Gebirge, Karte), Flaggen, Geschichte, historische Bilder, aktuelle Politik, Tiere und Pflanzen in Deutschland, Wissenschaft & Natur.

**Funktionen**
- Tages-Challenge mit 10 Fragen, Serie (Streak) mit Kalender-Heatmap, 1 Freeze pro Woche
- Spaced Repetition: Falsche Fragen kommen morgen wieder, richtige nach 1, 3, 7, 21 und 60 Tagen
- Adaptive Schwierigkeit pro Thema (Stufe 1 bis 3)
- Fragetypen: Multiple Choice, Bild erkennen, Land auf der Karte antippen, Jahreszahl schätzen, Ereignisse sortieren
- Erklärung, Quelle und „Frage melden“ nach jeder Antwort
- XP, Level, Abzeichen, Statistik pro Thema mit Schwächen
- Optional: Sync zwischen Handy und PC (Supabase, Login per E-Mail-Code)
- Dark Mode (automatisch oder manuell), optionaler Zeitdruck

---

## App starten (lokal)

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
```

```bash
npm run dev
```

Dann http://localhost:5173 öffnen. Tests laufen mit:

```bash
npm test
```

## Auf dem iPhone installieren

1. Die App-URL in **Safari** öffnen (nicht Chrome, iOS erlaubt das Installieren nur über Safari).
2. Teilen-Symbol → **„Zum Home-Bildschirm“**.
3. Ab jetzt die App über das Icon starten. Sie läuft dann im Vollbild und offline.

Wichtig: Die installierte App und Safari haben auf dem iPhone **getrennte Speicher**. Nutze immer das Icon, sonst siehst du einen anderen Fortschritt. Mit Sync ist das egal.

---

## Fragen hinzufügen

Handgeschriebene Fragen liegen in `data/fragen/<thema>.json`. Kurzform für Multiple Choice:

```json
{
  "id": "wiss-beispiel",
  "difficulty": 2,
  "prompt": "Welches Element hat das Symbol „O“?",
  "correct": "Sauerstoff",
  "wrong": ["Osmium", "Gold", "Ozon"],
  "explanation": "O steht für Oxygenium, lateinisch für Sauerstoff.",
  "source": "https://de.wikipedia.org/wiki/Sauerstoff"
}
```

Weitere Typen (siehe `data/fragen/geschichte.json`):
- **Jahreszahl:** `"type": "year", "year": 1989, "min": 1900, "max": 2025`
- **Reihenfolge:** `"type": "order", "items": [{ "label": "Mauerbau", "year": 1961 }, …]`

Regeln:
- `id` muss eindeutig sein und darf sich **nie mehr ändern** (sonst ist der Lernfortschritt für die Frage weg).
- `difficulty`: 1 = leicht, 2 = mittel, 3 = schwer.
- Immer eine `source` angeben.

Danach den Fragenkatalog neu bauen:

```bash
node scripts/build-questions.mjs
```

Das Skript prüft alles (doppelte IDs, fehlende Felder, Bilder ohne Lizenz) und bricht bei Fehlern ab.

### Bildfragen (Tiere, Pflanzen, historische Bilder)

In `data/images-config.json` einen Eintrag ergänzen. `title` ist der deutsche Wikipedia-Artikel, dessen Titelbild verwendet wird. Mit `file` kann man ein bestimmtes Commons-Bild erzwingen. Dann:

```bash
node scripts/fetch-images.mjs
```

Das Skript nimmt nur gemeinfreie oder frei lizenzierte Bilder (CC0, CC BY, CC BY-SA, FAL), verkleinert sie und speichert Urheber und Lizenz. Bilder ohne freie Lizenz werden übersprungen und gemeldet. Danach `build-questions.mjs` ausführen und **die neuen Bilder einmal ansehen**: Das Titelbild eines Artikels zeigt nicht immer das Erwartete.

Hinweis: Wikimedia drosselt stark. Bei vielen Bildern dauert das Skript eine Weile.

---

## Politiker-Daten aktualisieren

Nach Wahlen oder Kabinettsumbildungen:

```bash
node scripts/update-politics.mjs
```

Das Skript fragt Wikidata nach den aktuellen Amtsinhabern (Bundesregierung, Ministerpräsident/innen, Staats- und Regierungschefs, EU/UN/NATO) und zeigt an:
- `WECHSEL`: wer neu im Amt ist
- `Bitte prüfen`: alle Wechsel im letzten Jahr

**Prüfe die Änderungen kurz auf Wikipedia.** Wikidata ist manchmal veraltet oder kurzzeitig falsch. Korrekturen trägst du in `data/politics-overrides.json` ein:
- `skip`: Amt nicht abfragen (z.B. weil Wikidata falsch ist)
- `names`: kürzere Anzeigenamen
- `manual`: Amt von Hand setzen, wenn Wikidata eine Lücke hat

Nach einer **neuen Bundesregierung** in `scripts/update-politics.mjs` die Wikidata-ID des neuen Kabinetts bei `KABINETT` eintragen.

Danach `node scripts/build-questions.mjs`, committen, pushen. Jede Politikfrage zeigt in der App ihr Stand-Datum.

Auch Länder- und Hauptstadtdaten lassen sich neu holen (`node scripts/fetch-countries.mjs`). Korrekturen dafür stehen in `data/countries-overrides.json` (z.B. umstrittene Hauptstädte).

> **Netzwerk-Hinweis:** In manchen Umgebungen (Firmen-Proxy, Cloud-Container) nutzt Node den Proxy nicht automatisch. Dann `NODE_USE_ENV_PROXY=1` vor den Befehl setzen.

---

## Veröffentlichen (Hosting)

### Variante A: GitHub Pages (gratis, Repo muss öffentlich sein)

1. Repo auf **öffentlich** stellen (Settings → General → Danger Zone → Change visibility). Bei privaten Repos braucht Pages einen bezahlten GitHub-Tarif.
2. Settings → **Pages** → Source: **GitHub Actions**.
3. Auf `main` pushen. Der Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht.
4. Die App liegt dann unter `https://<github-name>.github.io/kopfnuss/`.

### Variante B: Vercel oder Netlify (gratis, auch für private Repos)

1. Bei [vercel.com](https://vercel.com) mit GitHub anmelden → „Add New Project“ → Repo `kopfnuss` wählen.
2. Build Command: `node scripts/build-questions.mjs && npm run build`, Output Directory: `dist`.
3. Für Sync die beiden Variablen aus dem nächsten Abschnitt als Environment Variables eintragen.

---

## Sync zwischen Handy und PC einrichten (Supabase, gratis)

Ohne Sync speichert die App alles nur auf dem jeweiligen Gerät. Mit Sync meldest du dich auf beiden Geräten mit derselben E-Mail an. Die Fortschritte werden zusammengeführt (pro Gerät gezählt, damit nichts doppelt zählt oder verloren geht).

1. Auf [supabase.com](https://supabase.com) ein kostenloses Projekt anlegen.
2. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → Run.
3. **Authentication → Email Templates → Magic Link**: Den Text so ändern, dass der Code drinsteht, z.B.:
   ```
   Dein Kopfnuss-Code: {{ .Token }}
   ```
   (Die App nutzt einen 6-stelligen Code statt eines Links, weil Links auf dem iPhone in Safari statt in der installierten App landen.)
4. **Project Settings → API**: `Project URL` und `anon public` Key kopieren.
5. Eintragen:
   - **GitHub Pages:** Repo → Settings → Secrets and variables → Actions → Tab **Variables** → `SUPABASE_URL` und `SUPABASE_ANON_KEY` anlegen, dann neu deployen.
   - **Vercel/Netlify:** als `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
   - **Lokal:** Datei `.env.local` mit diesen beiden `VITE_…`-Zeilen.

Der anon-Key ist für den öffentlichen Einsatz gedacht. Die Datenbank-Regeln (Row Level Security) sorgen dafür, dass jeder nur seinen eigenen Fortschritt lesen und schreiben kann.

---

## Wie die Regeln funktionieren

- **Tagesziel:** 10 beantwortete Fragen pro Tag (Europe/Berlin, Tageswechsel um Mitternacht).
- **Serie:** Zählt erledigte Tage hintereinander. Heute noch nicht erledigt bricht die Serie nicht.
- **Freeze:** Pro Kalenderwoche wird ein verpasster Tag automatisch eingefroren. Er rettet die Serie, zählt aber nicht als Tag. Zwei verpasste Tage in derselben Woche beenden die Serie.
- **Punkte:** 10 XP × Schwierigkeit pro richtiger Antwort, Teilpunkte bei Jahreszahl und Reihenfolge, 25 Bonus-XP für die Tages-Challenge.

## Projektstruktur

```
src/core/      Logik (Streak, Spaced Repetition, Punkte, Rundenauswahl, Sync-Merge) + Tests
src/ui/        Bildschirme und Fragetypen
data/          Quelldaten (Länder, Politik, Bilder-Konfiguration, handgeschriebene Fragen)
scripts/       Datenskripte (Wikidata, Wikimedia, Fragen bauen)
public/        Generierte Fragen, Bilder, Flaggen, Karte, Icons
```

## Lizenzen der Inhalte

- Fotos und Gemälde: Wikimedia Commons, Urheber und Lizenz stehen unter jedem Bild und in der App unter Einstellungen → Bildnachweise.
- Flaggen: [flag-icons](https://github.com/lipis/flag-icons) (MIT)
- Karte: [Natural Earth](https://www.naturalearthdata.com) (gemeinfrei) über world-atlas
- Länder- und Politikdaten: [Wikidata](https://www.wikidata.org) (CC0)
