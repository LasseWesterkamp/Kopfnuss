# 🌰 Kopfnuss

**Live: https://lassewesterkamp.github.io/Kopfnuss/**

Allgemeinwissen trainieren, jeden Tag 10 Fragen. Läuft als installierbare Web-App (PWA) auf iPhone, Android und PC, auch offline.

**Themen:** Geografie (Hauptstädte, Flüsse, Gebirge, Karte), Flaggen, Regionen (Bundesländer, Kantone, Bundesstaaten mit Flaggen), Geschichte in 8 Epochen, historische Bilder, aktuelle Politik, Tiere und Pflanzen in Deutschland, Wissenschaft & Natur.

**Funktionen**
- Tages-Challenge mit 10 Fragen, Serie (Streak) mit Kalender-Heatmap, 1 Freeze pro Woche
- Spaced Repetition: Falsche Fragen kommen morgen wieder, richtige nach 1, 3, 7, 21 und 60 Tagen
- Adaptive Schwierigkeit pro Thema (Stufe 1 bis 3)
- Fragetypen: Multiple Choice, Bild erkennen, Land auf der Karte antippen, markiertes Gebiet benennen, Flagge zu Name, Flaggen zuordnen, Jahreszahl schätzen, Ereignisse sortieren
- Karten-Puzzle für Deutschland, Österreich, Schweiz, USA, Kanada, Australien und für alle Kontinente bzw. die ganze Welt, mit Bestzeit pro Schwierigkeitsstufe
- Eigene Seite pro Thema, Fehlerkasten mit gezieltem Fehler-Üben, Schwierigkeitswahl bei „Nochmal“
- Feine Auswahl beim Üben: Thema › Kategorie (+ Land/Epoche), gespeicherte Mischungen
- Erklärung, Quelle und „Frage melden“ nach jeder Antwort
- XP, Level, Abzeichen, Statistik pro Thema mit Schwächen
- Sync zwischen Handy und PC (Supabase, Login mit E-Mail + Passwort)
- Gruppen mit Rangliste (Woche, Serie, Gesamt), Beitritt per Einladungscode oder -link
- Startmenü vor jeder Runde: Schwierigkeit und Zeitdruck (aus/10/20/30 s) wählen
- Duelle: Freunde per Link herausfordern, alle bekommen dieselben 10 Fragen, wer mehr richtig hat (bei Gleichstand: schneller) gewinnt
- Push-Benachrichtigungen: Herausforderung, Duell entschieden, Duell läuft ab, Serie in Gefahr
- Dark Mode (automatisch oder manuell)

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

**Prüfe die Änderungen kurz auf Wikipedia** und halte das Ergebnis in `data/politik-pruefung.md` fest. Wikidata ist manchmal veraltet oder kurzzeitig falsch. Korrekturen trägst du in `data/politics-overrides.json` ein:
- `skip`: Amt nicht abfragen (z.B. weil Wikidata falsch ist)
- `names`: kürzere Anzeigenamen
- `manual`: Amt von Hand setzen, wenn Wikidata eine Lücke hat

Nach einer **neuen Bundesregierung** in `scripts/update-politics.mjs` die Wikidata-ID des neuen Kabinetts bei `KABINETT` eintragen.

Danach `node scripts/build-questions.mjs`, committen, pushen. Jede Politikfrage zeigt in der App ihr Stand-Datum.

Ländernamen mit Artikel („des Iran“, „Wo liegen die USA?“) stehen in `data/laender-grammatik.json`.

Auch Länder- und Hauptstadtdaten lassen sich neu holen (`node scripts/fetch-countries.mjs`). Korrekturen dafür stehen in `data/countries-overrides.json` (z.B. umstrittene Hauptstädte).

> **Netzwerk-Hinweis:** In manchen Umgebungen (Firmen-Proxy, Cloud-Container) nutzt Node den Proxy nicht automatisch. Dann `NODE_USE_ENV_PROXY=1` vor den Befehl setzen.

---

## Veröffentlichen (Hosting)

### Variante A: GitHub Pages (gratis, Repo muss öffentlich sein)

1. Repo auf **öffentlich** stellen (Settings → General → Danger Zone → Change visibility). Bei privaten Repos braucht Pages einen bezahlten GitHub-Tarif.
2. Settings → **Pages** → Source: **GitHub Actions**.
3. Auf `main` pushen. Der Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht.
4. Die App liegt dann unter `https://<github-name>.github.io/<Repo-Name>/` (Groß-/Kleinschreibung beachten, hier: `/Kopfnuss/`).

### Variante B: Vercel oder Netlify (gratis, auch für private Repos)

1. Bei [vercel.com](https://vercel.com) mit GitHub anmelden → „Add New Project“ → Repo `kopfnuss` wählen.
2. Build Command: `node scripts/build-questions.mjs && npm run build`, Output Directory: `dist`.
3. Für Sync die beiden Variablen aus dem nächsten Abschnitt als Environment Variables eintragen.

---

## Sync zwischen Handy und PC (Supabase)

**Ist eingerichtet.** In der App unter Einstellungen → Konto & Sync einmal „Konto anlegen“ (E-Mail + Passwort, mind. 8 Zeichen), auf dem zweiten Gerät mit denselben Daten „Anmelden“. Die Fortschritte werden zusammengeführt: pro Gerät gezählt, nichts doppelt, nichts geht verloren. Abgeglichen wird beim Öffnen der App, ein paar Sekunden nach dem Antworten und wenn das Gerät wieder online ist.

Warum Passwort statt Login-Code per Mail: Supabase erlaubt im Gratistarif keine eigenen E-Mail-Vorlagen, die Standard-Mail enthält nur einen Link. Ein Link öffnet sich auf dem iPhone in Safari statt in der installierten App. Die E-Mail-Bestätigung ist deshalb abgeschaltet (`mailer_autoconfirm`).

Konfiguration:
- Project URL und **anon** Key stehen in `.env.production` (öffentlich unbedenklich, Schutz über Row Level Security). **Niemals** den `service_role`/secret Key eintragen.
- Datenbank: `supabase/schema.sql` (Tabelle, Rechte nur für angemeldete Nutzer, Policies „nur eigene Zeile“). Bei einem neuen Projekt im SQL Editor ausführen.
- Lokal ohne Sync entwickeln: `npm run dev` nutzt `.env.production` nicht. Wer lokal mit Sync testen will, kopiert die zwei Zeilen in `.env.local`.

---

## Meldungen per E-Mail („Frage melden“)

Nach jeder Antwort gibt es „Frage melden“. Die Meldung wird in der Supabase-Tabelle `meldungen` gespeichert (auch ohne Anmeldung möglich) und ein Datenbank-Trigger schickt sie per [Resend](https://resend.com) als E-Mail weiter.

- **Alle Meldungen ansehen:** Supabase → Table Editor → `meldungen`. Spalte `erledigt` zum Abhaken.
- **Spamschutz:** max. 30 Mails pro Tag, pro Frage max. eine Mail pro Stunde. Darüber hinaus wird nur gespeichert, nicht gemailt. Die App kann Meldungen nur anlegen, nie lesen.
- **Einrichtung** (Datenbank-Teil: `supabase/003_meldungen.sql`): API-Key und Empfänger liegen verschlüsselt im Supabase Vault, nie im Code. Im **SQL Editor**:
  ```sql
  select vault.create_secret('re_DEIN_RESEND_KEY', 'resend_api_key');
  select vault.create_secret('du@beispiel.de', 'meldung_empfaenger');
  ```
  Ohne eigene Domain verschickt Resend nur an die Adresse, mit der das Resend-Konto angelegt wurde.
- **Key oder Adresse ändern:** `select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_NEUER_KEY');`

## Gruppen & Rangliste

In der App unter **Gruppen**: Anzeigename festlegen, dann Gruppe anlegen oder mit einem 6-stelligen Code beitreten. „Einladen“ teilt einen Link (`…/Kopfnuss/?beitreten=CODE`), der die App öffnet und den Code vorausfüllt.

- **Wertungen:** XP diese Woche (Reset Montag 0:00 Uhr deutscher Zeit), Serie, XP gesamt. Gleichstand = gleicher Platz.
- **Admin** (wer die Gruppe anlegt): Mitglieder entfernen, Code erneuern (alter Code wird ungültig), umbenennen, löschen. Verlässt der Admin die Gruppe, wird das am längsten dabei seiende Mitglied Admin.
- **Grenzen:** max. 50 Mitglieder pro Gruppe, max. 20 selbst angelegte Gruppen pro Person.
- **Datenschutz:** Gruppenmitglieder sehen nur Anzeigename, Wochen-/Gesamt-XP, Serie und Fragen der Woche. Nie E-Mail-Adresse oder Lernstand. Wer in keiner gemeinsamen Gruppe ist, sieht gar nichts.
- **Schummeln:** Punkte entstehen auf dem Gerät. Der Server lehnt nur Unmögliches ab (mehr als 5.000 XP pro Tag, Serie länger als das Konto alt ist). Für Freundesgruppen reicht das, für Wettbewerbe mit Fremden nicht.

Die App lädt die eigenen Ranglistenwerte nach jedem Sync hoch (Tabelle `stats`).

**Anzeigename ändern:** unter **Mehr → Einstellungen → Anzeigename** oder auf der Gruppen-Seite unter „Dein Anzeigename“. Beide Felder schreiben in dieselbe Tabelle `profiles`, die Rangliste zeigt den neuen Namen sofort. Ohne Konto steht dort nur der Hinweis, sich erst anzumelden.

**Gruppenmenü:** „Weitere Gruppe beitreten oder anlegen“ und „Dein Anzeigename“ sind einklappbar. Bist du in mindestens einer Gruppe, sind beide zu, damit die Rangliste oben steht. Ohne Gruppe (oder beim Öffnen eines Einladungslinks) ist Beitreten/Anlegen offen. Der Zustand wird nicht gespeichert.

### Gruppen testen

- `npm test` prüft Rangliste (Wochengrenze in deutscher Zeit, Platzierung) und Einladungscodes/-links.
- `npm run test:gruppen` prüft die Zugriffsregeln gegen das **echte** Supabase-Projekt mit drei Testkonten (25 Prüfungen: Außenstehende sehen nichts, Mitglieder nie den Lernstand, nur der Admin hat Admin-Rechte, unplausible Punkte werden abgelehnt). Danach im Supabase **SQL Editor** aufräumen:

  ```sql
  delete from auth.users where email like 'kopfnuss-test-%@example.com';
  ```

### Datenbank-Migration

Die Datenbank-Struktur liegt in `supabase/`. Bei einem neuen Supabase-Projekt im **SQL Editor** nacheinander ausführen:

1. `supabase/schema.sql` (Lernstand-Sync)
2. `supabase/002_gruppen.sql` (Profile, Ranglistenwerte, Gruppen, Funktionen, Zugriffsregeln)
3. `supabase/003_meldungen.sql` (Meldungen mit E-Mail-Benachrichtigung, Einrichtung siehe „Meldungen per E-Mail“)

Beide Dateien können gefahrlos mehrfach ausgeführt werden. Neue Änderungen kommen als weitere nummerierte Datei dazu (`003_….sql`).

---

## Regionen hinzufügen oder ändern

Die Regionen (Karten, Namen, Hauptstädte, Flaggen) baut ein Skript:

```bash
node scripts/fetch-regions.mjs
```

Es lädt die Natural-Earth-Regionen (einmalig ~40 MB, wird in `data/.cache/` zwischengespeichert), schneidet und vereinfacht die Karten (`public/data/regions-<land>.json`), holt Namen, Hauptstädte und Flaggendatei aus Wikidata und die Flaggen von Wikimedia Commons (nur freie Lizenzen).

- **Neues Land:** in `scripts/fetch-regions.mjs` bei `COUNTRIES` eintragen (ISO-Code + Natural-Earth-Kürzel `adm0_a3`), in `src/core/subtopics.ts` bei `REGION_LAENDER` ergänzen und in `scripts/build-questions.mjs` die Formulierungen für das Land (`kind`, `LAND`) ergänzen.
- **Korrekturen** (Name, Hauptstadt, Flagge, falsche Wikidata-ID): `data/regions-overrides.json`. `capital: false` = keine Hauptstadtfrage (z.B. Stadtstaaten).
- **Gleich aussehende Flaggen** (z.B. Wien, Salzburg, Vorarlberg) erkennt der Fragengenerator automatisch: Sie bekommen keine Flaggenfrage und werden nicht als falsche Antwort nebeneinander gezeigt.

Danach `node scripts/build-questions.mjs` und **die Ausgabe „PRÜFEN“ abarbeiten**.

## Spielarten

| Spielart | Wo | Wertung |
|---|---|---|
| Multiple Choice, Bild erkennen, Jahreszahl, Reihenfolge, „Wo liegt X?“ (Karte antippen) | normale Runden | richtig/falsch, Teilpunkte bei Jahreszahl und Reihenfolge |
| **Markiertes Gebiet benennen** (`mapname`): Ein Bundesland/Kanton/Staat ist auf der Karte markiert, vier Namen zur Wahl. Sehr kleine Gebiete werden automatisch herangezoomt. | normale Runden, Regionen › Lage | richtig/falsch |
| **Welche Flagge gehört zu X?** (`flagpick`): vier Flaggen, Namen erscheinen erst nach der Antwort | normale Runden, Regionen › Flaggen | richtig/falsch |
| **Flaggen zuordnen** (`match`): 4 Flaggen und 4 Namen, Flagge antippen, dann Namen (erneutes Antippen löst die Verbindung) | normale Runden, Regionen › Flaggen | Teilpunkte pro richtigem Paar, „richtig“ nur bei 4/4 |
| **Karten-Puzzle**: alle Gebiete eines Landes nacheinander antippen, mit Zeit, Fehlern und Bestzeit | Üben › Spiele | Treffer im ersten Versuch = richtige Antwort auf die Kartenfrage dieses Gebiets (zählt für Tagesziel, XP, Wiederholung). Nach 3 Fehlversuchen wird das Gebiet gelb gezeigt und gilt als falsch. |

Gleich aussehende Flaggen (Wien, Salzburg, Vorarlberg) kommen nie gemeinsam in einer Frage vor.

## Navigation, Themenseiten & Fehlerkasten

- **Themenseiten:** Tippen auf ein Thema der Startseite öffnet dessen eigene Seite (`#/thema/geografie` usw.): Fortschritt, „Ganzes Thema üben“, jede Kategorie mit Balken und eigenem Start-Knopf, bei Regionen/Geschichte zusätzlich Länder bzw. Epochen, passende Puzzles und die offenen Fehler des Themas.
- **Zurück:** Alle Seiten haben eine eigene Adresse (`router.ts`). Wischen bzw. Zurück-Taste gehen eine Seite zurück; aus dem Ergebnis einer Runde geht es zurück auf die Seite davor, nicht in die beendete Runde.
- **Fehlerkasten** (`#/fehler`, Karte auf der Startseite und in der Statistik): Eine Frage ist ein Fehler, sobald sie einmal falsch beantwortet wurde, und gilt nach **2 richtigen Antworten hintereinander** als behoben (`src/core/mistakes.ts`, berechnet aus dem vorhandenen Lernstand). Gruppiert nach Thema › Kategorie mit Anzahl; „Fehler üben“ für alle, pro Thema und pro Kategorie; jede Gruppe aufklappbar mit Frage und richtiger Antwort.
- **Nochmal spielen:** Nach jeder Runde Schwierigkeit wählen (Adaptiv, Leicht, Mittel, Schwer). Auswahl (Thema, Kategorie, Fehlerliste) bleibt erhalten. Nach jedem Puzzle: Leicht (5 Versuche, Hinweis nach 2 Fehlern), Mittel (3 Versuche), Schwer (1 Versuch); Bestzeiten getrennt pro Stufe (alte Bestzeiten zählen als Mittel).

## Lernseiten (Lösungen nachlesen)

Auf jeder Themenseite hat jede Kategorie (und jedes Land bzw. jede Epoche) neben ▶ einen **📖-Knopf**. Er öffnet eine Lernseite (`#/lernen/<thema>/kategorie/<id>`) mit allen Fakten samt richtiger Antwort, Erklärung, Bild/Flagge und Quelle, mit Suche, Filter „Nur meine Fehler“ und „Jetzt abfragen“.
Fragen zum selben Fakt werden zu einer Lernkarte zusammengefasst (über die Frage-ID, `factKey` in `src/core/learn.ts`): z.B. Hauptstadt hin und zurück, oder bei Bundesländern Hauptstadt, Flagge und Lage auf einer Karte pro Bundesland.

## Welt-Puzzles

Europa, Afrika, Asien, Nordamerika (mit Mittelamerika & Karibik), Südamerika, Ozeanien und „Ganze Welt“ (Profi). Karte: Natural Earth 50m (`public/data/countries-50m.json`), Länderliste `public/data/world-puzzle.json` (vom Build-Skript aus `data/countries.json` erzeugt, Kontinent wie dort). **Zoomen:** mit zwei Fingern (auseinander/zusammen, dabei auch verschieben), Mausrad oder + / −; verschieben durch Ziehen. Die Rechnung steckt in `src/core/pinch.ts`. **Performance:** Die Kartenpfade werden einmal berechnet (`useMemo`). Beim Ziehen und Zoomen setzt `MapCanvas` nur das `viewBox`-Attribut direkt am SVG (einmal pro Bildschirmbild über `requestAnimationFrame`), React rendert erst am Ende der Geste neu. Linienbreiten bleiben dank `vector-effect: non-scaling-stroke` konstant, ohne neu zu rechnen. Ergebnis mit 4x gedrosselter CPU: vorher ca. 4 fps mit Hängern bis 780 ms, jetzt 60 fps ohne Bild über 50 ms. Länder, die auf der Karte kleiner als 6 Pixel sind (Vatikan, Monaco, Karibikinseln …), bekommen einen antippbaren Kreis. Nicht dabei: Tuvalu (fehlt in der Karte). Dänemark fehlt in der Wikidata-Abfrage (dort als „Königreich Dänemark“ ohne ISO-Code) und wird über `extra` in `data/countries-overrides.json` ergänzt. Treffer im ersten Versuch zählen als richtige Antwort auf die Kartenfrage „Wo liegt …?“ des Landes, sofern es eine gibt.

## Startmenü: Schwierigkeit & Zeitdruck

Wer im Tab **Üben** auf „Los geht’s“, auf einer Themenseite auf ▶ bzw. „Ganzes Thema üben“ oder auf einer Lernseite auf „Abfragen“ tippt, bekommt erst ein kleines Menü (Handy: fährt von unten hoch, PC: Dialog in der Mitte, Code: `src/ui/StartSheet.tsx`, Logik: `src/core/round.ts`).

- **Schwierigkeit:** Adaptiv (passt sich deinem Stand an), Leicht, Mittel, Schwer, jeweils mit Anzahl der Fragen in dieser Auswahl. Stufen ohne Fragen sind ausgegraut, unter 10 Fragen gibt es einen Hinweis (die Runde wird kürzer).
- **Zeitdruck pro Frage:** Aus, 10 s (+20 % XP), 20 s (+10 % XP), 30 s. Zeit abgelaufen = falsch, Lösung wird gezeigt, Frage landet im Fehlerkasten. Gilt nur für Fragerunden, nicht für Puzzles.
- **Gemerkt:** Die letzte Wahl gilt global und ist beim nächsten Mal vorausgefüllt (`localStorage` `kopfnuss.round.v1`, nur auf diesem Gerät). Wer früher in den Einstellungen „Zeitdruck“ an hatte, startet mit 30 s. Der Schalter in den Einstellungen ist weg.
- **Ohne Menü:** Tages-Challenge (für alle gleich, ohne Uhr), Zufallsmix und „Fehler üben“ starten direkt.
- **Schließen:** Zurück bzw. Wischgeste, nach unten wischen, Escape oder daneben tippen. Das Menü ist ein eigener Verlaufseintrag, Zurück schließt also nur das Menü.
- **Nochmal** auf der Ergebnisseite behält Auswahl und Zeitdruck, die Stufe lässt sich dort ändern.

## Duelle

Zeitversetzt: Du spielst jetzt, die anderen irgendwann in den nächsten 7 Tagen, alle mit exakt denselben 10 Fragen in derselben Reihenfolge. 2 bis 10 Spieler, Konto mit Anzeigename nötig.

- **Herausfordern:** Auswahl wie gewohnt (Themenseite ▶, Tab „Üben“ oder Lernseite), dann im Startmenü **⚔️ Als Duell**. Stufe aus dem Menü, Zeitlimit 10/20/30 s ist Pflicht (bei „Aus“ gelten 20 s). Dann „Einladen“: Link `…/Kopfnuss/?duell=CODE` (öffnet die App und nimmt an) oder 6-stelliger Code unter Gruppen → Duelle.
- **Direkt herausfordern:** In der Gruppen-Rangliste hat jedes andere Mitglied einen ⚔️-Knopf. Darüber wählst du Themen, Stufe und Zeit, und das Duell steht sofort bei der Person unter „Du bist dran“, mit roter Zahl am Tab. Einen Push gibt es nicht, sie sieht es beim nächsten Öffnen der App. Auf jeder Duell-Seite kannst du außerdem weitere Gruppenmitglieder mit einem Tipp dazuholen. Leute außerhalb deiner Gruppen gehen nur per Link oder Code.
- **Revanche:** Ist ein Duell entschieden, legt „🔁 Revanche“ ein neues an: gleiche Einstellungen, alle bisherigen Mitspieler (auch die ohne gemeinsame Gruppe), möglichst nur neue Fragen. Pro Duell gibt es genau eine Revanche. Hat jemand anders sie schon gestartet, führt der Knopf dorthin.
- **Fragen:** nur Multiple Choice (auch Flaggen und Bilder), „Welche Flagge?“ und „Welches Land ist markiert?“. Kein Kartentippen, keine Jahreszahl/Reihenfolge/Zuordnen, damit Handy und PC gleiche Chancen haben. Zufällig aus der Auswahl, unabhängig vom eigenen Lernstand (`src/core/duel.ts`).
- **Wertung:** erst Anzahl richtig, bei Gleichstand die kürzere Gesamtzeit. Unter 0,5 s Unterschied = unentschieden. Die Gesamtzeit misst der Server (von „Jetzt spielen“ bis zur Abgabe, höchstens Fragen × Zeitlimit + 30 s). Die Zeiten pro Frage misst das Gerät, sie sind nur zur Anzeige. Wird eine Frage zwischen den Runden gelöscht, zählt sie für niemanden.
- **Abbruch:** Starten geht nur einmal, ohne Pause. ✕ oder Zurück gibt ab, der Rest zählt falsch. Wird die App mitten im Duell geschlossen, wird beim nächsten Öffnen mit dem bisherigen Stand abgegeben (lokal in `kopfnuss.duel.pending`). Kommt nie eine Abgabe an, wertet der Server nach Ablauf der Maximalzeit 0 richtig.
- **Sichtbarkeit:** Fremde sehen nichts. Die Fragenliste gibt es erst beim eigenen Start, die Ergebnisse der anderen erst nach der eigenen Runde.
- **Anzeige:** Gruppen → Duelle (Du bist dran / Wartet auf andere / Fertig / Abgelaufen), Bilanz pro Gegner, Ergebnisseite mit Vergleich Frage für Frage. Die rote Zahl am Tab „Gruppen“ zählt Duelle, in denen du dran bist, plus neu entschiedene.
- **Punkte:** Duell-Antworten zählen normal für Lernstand, Fehlerkasten, Tagesziel und XP. Für einen Sieg gibt es keine Extra-XP, damit man die Gruppen-Rangliste nicht mit einem Zweitkonto aufpumpen kann.
- **Ehrlich:** Die Fragen samt Lösungen liegen öffentlich in `questions.json`, und richtig/falsch meldet das Gerät. Wer den Code manipuliert, kann schummeln. Für Freunde reicht das.

### Datenbank (Duelle)
`supabase/004_duelle.sql` und danach `supabase/005_duelle_gruppen.sql` im SQL Editor ausführen (nach `002_gruppen.sql`). 005 ergänzt `create_duel` um Eingeladene und Revanche (`rematch_of`) und fügt `invite_to_duel` und `my_groupmates` hinzu. Tabellen `duels` und `duel_players` haben RLS ohne Policies, alles läuft über die Funktionen `create_duel`, `join_duel`, `invite_to_duel`, `start_duel`, `finish_duel`, `my_duels` und `my_groupmates`, die selbst prüfen, wer was sehen darf.

## Push-Benachrichtigungen

Einschalten unter **Mehr → Benachrichtigungen** oder über den einmaligen Hinweis auf der Duell-Seite. Nie ungefragt beim Start.

- **Anlässe** (einzeln abschaltbar, alle standardmäßig an):
  - ⚔️ Herausforderung: auch Revanche und Dazuholen, nicht wenn man selbst per Link annimmt
  - 🏁 Duell entschieden: ohne Ergebnis im Text, damit die Spannung bleibt
  - ⏳ Duell läuft in 24 h ab und du hast noch nicht gespielt
  - 🔥 Serie in Gefahr: ab 19:30, Serie mindestens 2 Tage, heute noch keine Ranglistenwerte hochgeladen
- **Ruhezeit** (Standard 21 bis 8 Uhr deutscher Zeit, einstellbar): Herausforderungen und Ergebnisse kommen danach, die Serie-Erinnerung entfällt. Höchstens 5 Nachrichten pro Tag und Person, der Rest wird verworfen.
- **Antippen** öffnet das Duell bzw. die Startseite. Ist Kopfnuss schon offen, wird dieses Fenster genutzt.
- **iPhone:** nur als Home-Bildschirm-App ab iOS 16.4 (Apple-Regel). In Safari zeigt die App statt des Schalters eine Anleitung.
- **Mehrere Geräte:** Nachrichten gehen an alle eingeschalteten Geräte. Geräte, die der Push-Dienst nicht mehr kennt (404/410), werden automatisch entfernt. Abmelden vom Konto meldet das Gerät ab.

**Technik:** Trigger auf `duel_players` und der Minuten-Takt `push_tick()` (pg_cron) legen Nachrichten in `push_queue`. `push_tick()` ruft per `pg_net` die Edge Function `supabase/functions/push-send` auf, die mit VAPID signiert, nach Web-Push-Standard (aes128gcm) verschlüsselt und verschickt. Die App selbst kann niemandem Nachrichten schicken. Der Push-Teil des Service Workers liegt in `public/push-sw.js` und wird per `importScripts` in den von vite-plugin-pwa erzeugten `sw.js` geladen, Offline-Cache und Updates bleiben unverändert.

**Einrichtung (einmalig):**
1. VAPID-Schlüsselpaar erzeugen (`npx web-push generate-vapid-keys`). Den öffentlichen Schlüssel als `VITE_VAPID_PUBLIC` in `.env.production` eintragen.
2. Supabase → Edge Functions → Secrets: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (z.B. die App-URL) und `PUSH_SECRET` (zufälliger Wert).
3. Edge Function deployen: `supabase functions deploy push-send --no-verify-jwt`.
4. `supabase/006_push.sql` ausführen, dann im SQL Editor die zwei Vault-Einträge aus dem Kopf der Datei anlegen (Function-URL und derselbe `PUSH_SECRET`). Nicht ins Repo.

Unter Mehr → Über steht die Version (Build-Zeit), so sieht man, ob ein Update angekommen ist.

## Kategorien & Auswahl beim Üben

Jede Frage hat **genau eine Kategorie** im Feld `cat`. Die erlaubten Kategorien pro Thema stehen in `data/kategorien.json`. `node scripts/build-questions.mjs` bricht mit Fehlermeldung ab, wenn eine Frage keine oder eine unbekannte Kategorie hat.

Beim Üben: Thema ankreuzen, darunter erscheinen die Kategorien als Schalter (keine Auswahl = alle), bei Regionen zusätzlich das Land, bei Geschichte die Epoche. Kategorien wirken nur auf ihr eigenes Thema (z.B. „Geografie › Hauptstädte“ schränkt angekreuzte Flaggen nicht ein). Die letzte Auswahl wird gemerkt; bis zu 5 Auswahlen lassen sich als „Meine Mischung“ speichern (lokal auf dem Gerät). Die Tages-Challenge bleibt immer gemischt.

**Neue Frage einer Kategorie zuordnen:**
- Handgeschriebene Fragen (`data/fragen/*.json`): Feld `"cat"` mit einer ID aus `data/kategorien.json` des Themas eintragen, z.B. `"cat": "gewaesser"`.
- Bildfragen (`data/images-config.json`): Die Kategorie ergibt sich aus `group` (z.B. `vogel` → `voegel`, Zuordnung `IMG_CAT` in `scripts/build-questions.mjs`).
- Generierte Fragen (Länder, Flaggen, Regionen, Politik): Die Kategorie setzt das Build-Skript dort, wo die Frage erzeugt wird.
- **Neue Kategorie:** in `data/kategorien.json` beim Thema ergänzen. IDs nie umbenennen, gespeicherte Mischungen verweisen darauf.

## Geschichtsepochen

Die Epochen stehen in `data/epochen.json`. Jede Geschichtsfrage hat ein Feld `"sub"` mit der Epochen-ID (`antike`, `mittelalter`, `fnz`, `19jh`, `weimar`, `ns`, `geteilt`, `seit1990`). Neue Fragen liegen in `data/fragen/epoche-*.json`, Beispiel:

```json
{ "id": "hist-ns-beispiel", "sub": "ns", "difficulty": 2, "prompt": "…", "correct": "…", "wrong": ["…", "…", "…"], "explanation": "…", "source": "https://de.wikipedia.org/wiki/…" }
```

Beim Üben kann man nach Epochen filtern und sieht pro Epoche, wie viele Fragen sicher sitzen. Eine neue Epoche: Eintrag in `data/epochen.json` (die `id` danach nie mehr ändern).

---

## Wie die Regeln funktionieren

- **Tagesziel:** 10 beantwortete Fragen pro Tag (Europe/Berlin, Tageswechsel um Mitternacht).
- **Serie:** Zählt erledigte Tage hintereinander. Heute noch nicht erledigt bricht die Serie nicht.
- **Freeze:** Pro Kalenderwoche wird ein verpasster Tag automatisch eingefroren. Er rettet die Serie, zählt aber nicht als Tag. Zwei verpasste Tage in derselben Woche beenden die Serie.
- **Punkte:** 10 XP × Schwierigkeit pro richtiger Antwort, Teilpunkte bei Jahreszahl und Reihenfolge, 25 Bonus-XP für die Tages-Challenge, +20 % bzw. +10 % bei Zeitdruck 10 s bzw. 20 s.

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
