# Test-Checkliste für das iPhone

Vor dem Test: App ist auf GitHub Pages veröffentlicht (siehe [README.md](README.md)). Notiere die Version unter Einstellungen.
Haken setzen, wenn es klappt; sonst aufschreiben, was passiert ist.

## 1. Installation
- [ ] Adresse in **Safari** öffnen, Seite lädt, Einrichtungsassistent erscheint
- [ ] Teilen, **Zum Home-Bildschirm**: Symbol (Weinglas auf Bordeaux) und Name „Wine rack“ stimmen
- [ ] Von dort starten: App füllt den Bildschirm, keine Safari-Leiste, Statusleiste lesbar
- [ ] Regal einrichten (9 Fächer, 77 Plätze), Speichern führt ins Regal
- [ ] Einstellungen: „Dauerhafter Speicher“ zeigt *gewährt* oder *nicht bestätigt* (notieren, kein Fehler)

## 2. Grundfunktionen mit Kamera
- [ ] **Wein einlagern**, Foto aufnehmen: Kamera öffnet sich, Foto erscheint als Vorschau
- [ ] Foto landet **nicht** in der Fotos-App
- [ ] Ohne Foto, Name oder Typ: Speichern wird abgelehnt, Meldungen erscheinen
- [ ] Wein mit 2 Flaschen und 2 Plätzen speichern, im Regal erscheinen zwei farbige Plätze
- [ ] Denselben Wein nochmal einlagern: App fragt, ob die Flaschen dazukommen
- [ ] Gleichen Wein mit anderem Jahrgang: neuer Wein, Hinweis auf anderen Jahrgang
- [ ] Freien Platz im Regal antippen: „Einlagern“ mit diesem Platz
- [ ] **Trinken**: Flasche wählen, Platz wird frei, Anzahl sinkt; letzte Flasche: Bewertung, Archiv
- [ ] Hoch- und Querformat: nichts ist abgeschnitten, Tab-Leiste und Tasten gut erreichbar

## 3. Flugmodus-Test (Offline)
- [ ] App einmal **mit Internet** öffnen und 10 Sekunden warten
- [ ] App komplett schließen (im App-Wechsler nach oben wischen)
- [ ] **Flugmodus** an (WLAN und Mobilfunk aus)
- [ ] App starten: Sie öffnet sich, alle Weine und Fotos sind da
- [ ] Alle vier Tabs öffnen, einen Wein ansehen, bearbeiten, einlagern und trinken
- [ ] Einstellungen, **Nach Update suchen**: Meldung „Update-Suche fehlgeschlagen“ (kein Absturz)
- [ ] Flugmodus aus

## 4. Backup exportieren
- [ ] Einstellungen, **Backup exportieren**: Teilen-Dialog erscheint
- [ ] **In Dateien sichern** (iCloud Drive), Dateiname `wine-rack-backup-…json`
- [ ] Datei in Dateien öffnen/Info: Größe plausibel (Fotos enthalten, mehrere MB bei vielen Weinen)
- [ ] „Letztes Backup“ zeigt das heutige Datum
- [ ] Teilen-Dialog schließen ohne zu sichern: Datum ändert sich **nicht**

## 5. App löschen und Import
- [ ] Notiere Anzahl der Weine und Flaschen (Weine-Tab)
- [ ] App-Symbol lange drücken, **App entfernen**, vom Home-Bildschirm löschen
- [ ] Wieder in Safari öffnen, erneut **Zum Home-Bildschirm**
- [ ] Beim ersten Start: **Aus Sicherung wiederherstellen**, Datei aus Dateien wählen
- [ ] Zusammenfassung stimmt, **Wiederherstellen**: Regal, Weine, Archiv, Fotos, Lagerplätze wie vorher
- [ ] Zahlen stimmen mit der Notiz überein
- [ ] Erneut importieren: **Zusammenführen** meldet „0 hinzugefügt, alle schon vorhanden“
- [ ] Defekte Datei (z. B. ein Foto) importieren: verständliche Fehlermeldung, nichts verändert

## 6. Update ohne Datenverlust
- [ ] Vor dem Update: Backup erstellen, Weine und Flaschen zählen
- [ ] Am Computer: `python3 tools/bump_version.py 0.4.1`, committen, pushen, 1–2 Minuten warten
- [ ] iPhone **mit Internet**: App öffnen (ggf. schließen und neu öffnen)
- [ ] Unten erscheint **„Neue Version verfügbar“** (sonst: Einstellungen, Nach Update suchen)
- [ ] **Aktualisieren** antippen: App lädt neu, Version unter Einstellungen ist 0.4.1
- [ ] Alle Weine, Fotos, Plätze und das Archiv sind unverändert vorhanden
- [ ] Flugmodus an, App starten: funktioniert mit der neuen Version offline

## 7. Backup-Hinweis
- [ ] Neues Gerät oder frische Installation mit Weinen, aber ohne Backup: Hinweis „noch kein Backup“ auf Regal und Weinliste
- [ ] Nach dem Export verschwindet der Hinweis
- [ ] (Optional) Systemdatum um mehr als 30 Tage vorstellen: Hinweis „… Tage alt“ erscheint. Danach Datum zurückstellen.

Ergebnis, Version und Auffälligkeiten hier notieren:

## 8. Neu in 0.5.0: runde Etikett-Bilder, Suche und Filter
- [ ] **Update von 0.4.x ohne Datenverlust**: Banner „Neue Version verfügbar“, Aktualisieren. Alle Weine, Fotos und Plätze sind da
- [ ] Bestehende Weine mit Foto zeigen im Regal nach kurzer Zeit einen **runden Ausschnitt** (mittig zugeschnitten)
- [ ] Neuer Wein: Foto aufnehmen, es erscheint der Zuschnitt. Mit einem Finger verschieben, mit zwei Fingern (und Regler) vergrößern, **Übernehmen**
- [ ] Foto ist **nicht gedreht** (Hochformat-Foto aufnehmen und prüfen)
- [ ] „Neu aufnehmen“ im Zuschnitt öffnet die Kamera erneut; „Aus Fotos wählen“ geht ebenfalls
- [ ] Im Regal zeigt der Platz das Etikett im Kreis mit Farbring des Weintyps; Wein ohne Foto: farbiger Kreis
- [ ] Wein-Detail oder Bearbeiten: **Zuschnitt ändern** speichert den neuen Ausschnitt
- [ ] Hoch- und Querformat: Kreise passen ins Raster, kein seitliches Scrollen, Tippfläche mindestens 44 px
- [ ] Suche im Regal: Name, Weingut, Jahrgang, Region; „chateau“ findet „Château“; das ×-Zeichen löscht die Suche
- [ ] **Filter** (Weintyp, Jahrgang, Land/Region, Zone, Jetzt trinkbar, Ohne Lagerplatz); Chips einzeln entfernen, Zurücksetzen
- [ ] Treffer bleiben hell, andere Plätze sind abgedunkelt, oben steht die Trefferzahl; „Treffer ohne Lagerplatz“ erscheint als Liste
- [ ] Ohne Treffer: „Kein Wein gefunden“ mit „Filter zurücksetzen“
- [ ] Suche bleibt beim Tab-Wechsel erhalten und ist nach dem Neustart der App leer
- [ ] **Backup**: Export, App löschen, Import: Zuschnitte sind wieder da; eine alte Backup-Datei (0.4.x) lässt sich importieren
- [ ] Flugmodus: alles funktioniert weiter, auch nach dem Update

