# Wine rack

Eine kleine App, mit der man den Inhalt eines Weinschranks im Blick behält (Klarstein Vinamour 77 Duo, 2 Temperaturzonen, 77 Flaschen).
Sie läuft als PWA auf dem iPhone, komplett offline. Alle Daten bleiben lokal auf dem Gerät: kein Server, kein Login, keine Cloud, keine Tracker.

Reines HTML, CSS und JavaScript (ES-Module), kein Build-Schritt, keine Abhängigkeiten. Die vollständige Beschreibung steht in [SPEC.md](SPEC.md).

## Dateien

| Pfad | Inhalt |
|---|---|
| `index.html`, `css/style.css` | Seite und Design (alle Farben als CSS-Variablen) |
| `js/app.js` | Start und Navigation |
| `js/views/` | Ansichten: Regal, Weine, Archiv, Detail, Formular, Einstellungen, Assistent |
| `js/logic.js`, `js/backup.js`, `js/migrations.js` | reine Logik (ohne Browser, in Node getestet) |
| `js/db.js` | IndexedDB-Schicht |
| `js/update.js`, `sw.js` | Service Worker und Update-Mechanismus |
| `manifest.webmanifest`, `icons/` | PWA-Grundlage |
| `tests/` | Tests (reines Node.js) |
| `tools/` | Icons erzeugen, Version erhöhen |

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Der Service Worker funktioniert auf `localhost` auch ohne HTTPS.

Tests (Node.js ab Version 20, keine Installation nötig):

```bash
node --test tests/*.test.js
```

Icons neu erzeugen (braucht `pip3 install pillow`):

```bash
python3 tools/make_icons.py
```

## Auf GitHub Pages veröffentlichen

Alle Pfade in der App sind relativ, deshalb läuft sie auch unter einem Unterpfad wie `https://NUTZERNAME.github.io/wine-rack/`.

1. Auf GitHub ein neues Repository anlegen, zum Beispiel `wine-rack` (öffentlich; bei GitHub Pages in kostenlosen Konten ist das nötig).
2. Im Projektordner:
   ```bash
   git remote add origin https://github.com/NUTZERNAME/wine-rack.git
   git branch -M main
   git push -u origin main
   ```
3. Im Repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch `main`, Ordner `/ (root)`, speichern.
4. Nach ein bis zwei Minuten ist die App unter `https://NUTZERNAME.github.io/wine-rack/` erreichbar.

Die Fotos und Weine liegen nie im Repository, sondern nur auf dem jeweiligen Gerät.

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen (nicht in Chrome oder in einer App-internen Ansicht).
2. Teilen-Symbol antippen, **Zum Home-Bildschirm**, **Hinzufügen**.
3. Die App über das neue Symbol auf dem Home-Bildschirm starten. Beim ersten Start führt der Assistent durch die Einrichtung des Regals.
4. Einmal mit Internet starten und kurz warten, bis alles geladen ist. Danach funktioniert die App auch im Flugmodus.

Hinweis: Die vom Home-Bildschirm gestartete App hat einen **eigenen Speicher**, getrennt von Safari. Daten, die man vorher im Safari-Tab angelegt hat, tauchen dort nicht auf. Am besten direkt die Home-Bildschirm-App benutzen.

## Update einspielen

1. Änderungen machen und die Version erhöhen (setzt sie in `sw.js` und `js/constants.js` gleichzeitig):
   ```bash
   python3 tools/bump_version.py 0.5.0
   node --test tests/*.test.js
   ```
   Die Tests schlagen an, wenn die Versionen auseinanderlaufen oder eine neue Datei nicht in der Cache-Liste von `sw.js` steht.
2. Committen und pushen. GitHub Pages veröffentlicht nach ein bis zwei Minuten.
3. Auf dem iPhone die App öffnen (am besten mit Internet). Sie sucht beim Start und beim Zurückkehren nach Updates und zeigt unten **„Neue Version verfügbar“**. Auf **Aktualisieren** tippen, die App lädt neu.
   Alternativ: Einstellungen, **Nach Update suchen**.

Die Daten liegen in IndexedDB und sind vom Cache getrennt; ein Update löscht sie nicht. Ändert eine neue Version das Datenmodell, hebt `js/migrations.js` die vorhandenen Daten automatisch auf das neue Modell (siehe Kommentar dort). Erstelle vor größeren Updates trotzdem ein Backup.

## Backup und Wiederherstellung

**Backup erstellen:** Einstellungen, **Backup exportieren**. Auf dem iPhone öffnet sich der Teilen-Dialog; die Datei `wine-rack-backup-JJJJ-MM-TT.json` am besten in **Dateien** oder iCloud Drive speichern (nicht nur in einer Nachricht an sich selbst). Sie enthält alle Weine, das Archiv, die Regal-Konfiguration und alle Fotos. Ohne Teilen-Dialog (z. B. am Computer) wird sie heruntergeladen.
Die App merkt sich das Datum und weist auf der Regal- und Weinliste-Seite darauf hin, wenn das letzte Backup älter als 30 Tage ist.

**Wiederherstellen:** Einstellungen, **Backup importieren**, Datei wählen. Die App prüft Format und Versionsnummer und zeigt, was in der Datei steht. Dann gibt es drei Fälle:

- *Gerät ohne Weine* (z. B. nach Neuinstallation): Die Sicherung wird komplett übernommen. Beim allerersten Start geht das auch direkt im Einrichtungsassistenten über **Aus Sicherung wiederherstellen**.
- *Gerät mit Weinen, Zusammenführen (empfohlen)*: Vorhandene Weine bleiben unverändert, fehlende werden ergänzt. Belegte Lagerplätze werden nicht überschrieben.
- *Gerät mit Weinen, Alles ersetzen*: Löscht die jetzigen Daten, nur nach einer zweiten Rückfrage.

Eine Sicherung aus einer neueren App-Version wird abgelehnt, bis die App aktualisiert ist.

**Wichtig:** Löscht man die App vom Home-Bildschirm, werden auch ihre Daten gelöscht. Safari kann außerdem Website-Daten entfernen, wenn eine Website lange nicht benutzt wurde (im Home-Bildschirm-Modus deutlich seltener). Ein aktuelles Backup ist der einzige verlässliche Schutz.

## Test-Checkliste für das iPhone

Siehe [IPHONE-TESTS.md](IPHONE-TESTS.md).
