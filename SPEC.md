# Ziel
Wine rack ist eine App, mit der man den Inhalt eines Weinschranks im Blick behält (Klarstein Vinamour 77 Duo, 2 Temperaturzonen, 77 Flaschen). Sie läuft als PWA auf dem iPhone (Safari, "Zum Home-Bildschirm"), komplett offline, alle Daten bleiben lokal auf dem Gerät. Es gibt keinen Server, kein Login, keine Cloud, keine Tracker.

# Technik
- Reines HTML, CSS und JavaScript (ES-Module), kein Framework, kein Build-Schritt, keine externen Abhängigkeiten, keine CDNs, keine Webfonts von außen.
- Alle Pfade relativ, weil die App später unter einem Unterpfad liegt (z. B. nutzername.github.io/wine-rack/). Das gilt auch für start_url und scope im Manifest und für den Service Worker.
- Speicherung in IndexedDB (Fotos als Blob). Datenmodell mit Versionsnummer und Migrationsfunktion.
- Service Worker, der alle Dateien vorab cacht (Cache-Name mit Versionsnummer), manifest.webmanifest, Icons in 180, 192 und 512 px (per Skript erzeugen, z. B. mit Python/Pillow).
- navigator.storage.persist() beim Start anfragen.
- Mobile first (iPhone), Safe-Area-Insets beachten, Tippflächen mindestens 44 px, Hoch- und Querformat.
- Sprache der Oberfläche: Deutsch.
- Lokal testbar mit: python3 -m http.server 8000

# Design
- Dunkles Design mit Anthrazit als Grundfarbe, modern, ruhig, hochwertig, mit weichen Animationen (Übergänge zwischen Ansichten, Tippfeedback).
- Akzentfarbe zunächst Bordeaux. Alle Farben als CSS-Variablen, damit sie leicht änderbar sind.
- Weintypen haben eigene Farben, die in Regalansicht und Karten wiederkehren (Rotwein dunkelrot, Weißwein goldgelb, Rosé rosa, Champagner und Schaumwein helles Gold, Sonstige grau).
- Ziel: Man behält leicht den Überblick und benutzt die App gern.

# Datenmodell
Ein Eintrag ist ein Wein (Weinname + Weingut + Jahrgang + Flaschengröße) mit einer Anzahl Flaschen.
Pflichtfelder zum Speichern: Foto, Weinname, Weintyp.
Wichtige Felder: Weingut, Land, Region, Flaschengröße, Anzahl der Flaschen, Lagerplatz, Kaufpreis, Trinkfenster von/bis (Jahre), Jahrgang (Produktionsjahr), Herkunft (gekauft oder Geschenk), Kauf- oder Erhaltsdatum, gekauft bei (Händler oder Ort; nur bei Kauf), Geschenk von (Person; nur bei Geschenk), Eingelagert am.
Optionale Felder: Rebsorten, Alkoholgehalt, persönliche Bewertung, Verkostungsnotiz, Marktwert, Speiseempfehlung.
Weintypen: Rotwein, Weißwein, Rosé, Champagner, Schaumwein, Sonstige.
Status: aktiv oder archiviert (mit Datum, wann die letzte Flasche getrunken wurde).
Lagerplätze: Jede Flasche kann einen Platz haben (Fach + Platznummer). Die Flaschen eines Weins dürfen auf verschiedene Fächer verteilt liegen. Weine ohne Lagerplatz sind erlaubt (z. B. frisch gekauft). Ein Platz hält nur eine Flasche.

# Regal-Konfiguration
Beim ersten Start führt ein Einrichtungsassistent durch die Konfiguration: Anzahl der Fächer (der Schrank hat 9 Fächer und einen Boden; ob der Boden zu den 9 Fächern zählt, ist noch zu klären), pro Fach Name, Zahl der Plätze und Temperaturzone (obere oder untere Zone). Die Gesamtzahl der Plätze wird angezeigt. Die Konfiguration ist später in den Einstellungen änderbar. Fallen dabei belegte Plätze weg, warnt die App und lässt es nicht zu, bevor die betroffenen Flaschen verschoben sind.

# Funktionen
1. Wein einlagern (großer Knopf): Foto direkt in der App aufnehmen (input type=file, accept="image/*", capture="environment"), Bild verkleinern (längste Seite ca. 1600 px, JPEG ca. 80 %) und im Eintrag speichern, nicht in der Fotos-App. Pflichtfelder prüfen, optionale Felder einklappbar. Anzahl der Flaschen festlegen, Lagerplatz in einer Regalansicht antippen oder leer lassen. Passen Weinname, Weingut, Jahrgang und Flaschengröße zu einem vorhandenen Wein, fragt die App, ob die Flaschen dazukommen sollen. Ist der Jahrgang (oder die Flaschengröße) anders, wird immer ein neuer Wein angelegt, und die App weist darauf hin, dass es ein anderer Jahrgang ist.
2. Wein trinken (großer Knopf, in Detailansicht und Regalansicht): Sind mehrere Flaschen mit Platz vorhanden, wird gefragt, welche entnommen wird. Die Anzahl sinkt um eins, der Platz wird frei. Bei Anzahl 0 wandert der Wein ins Archiv "getrunken" mit Datum; vorher wird optional nach Bewertung und Verkostungsnotiz gefragt.
3. Regalansicht: Raster des eingerichteten Schranks, getrennt nach Zonen, Plätze farbig nach Weintyp, leere Plätze erkennbar. Antippen eines belegten Platzes öffnet den Wein, Antippen eines leeren Platzes startet "Wein einlagern" mit diesem Platz.
4. Weinliste: Karten mit Foto, Name, Typ, Jahrgang und Anzahl; Suche, Filter (Typ, Land, Trinkfenster) und Sortierung.
5. Archiv: Liste der getrunkenen Weine mit Datum, Bewertung und Notiz.
6. Wein-Detail: großes Foto, alle Angaben, Anzeige des Trinkfensters (noch zu früh, trinkreif, überschritten), Bearbeiten, Löschen (mit Sicherheitsabfrage), Platz ändern.
7. Einstellungen: Regal-Konfiguration, Export und Import, Datum des letzten Backups.
8. Backup: Export aller Daten inklusive Fotos als eine JSON-Datei (Teilen-Dialog oder Download), Import mit Prüfung von Format und Versionsnummer, Hinweis in der App, wenn das letzte Backup älter als 30 Tage ist.

# Arbeitsweise
- Arbeite in Phasen, halte den Code einfach und gut kommentiert, und erkläre nach jeder Phase kurz, was fertig ist und wie ich es teste.
- Initialisiere ein Git-Repository und committe nach jeder Phase.
- Nenne mir Annahmen, die du triffst.

# Phase 1 (jetzt bauen)
Projektgerüst und Dateistruktur, PWA-Grundlage (Manifest, Service Worker, Icons), IndexedDB-Schicht mit Versionsnummer, Design-Grundlage (Farben, Typografie, Navigation mit Tab-Leiste: Regal, Weine, Archiv, Einstellungen) und der Einrichtungsassistent für das Regal. Teste lokal und beschreibe mir, wie ich es im Browser ausprobiere.
