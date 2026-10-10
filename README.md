# Poker & Friends

Poker-Clock und Cash-Game-Kasse für den privaten Pokerabend. Als WebApp im Browser oder als Windows-Desktop-App, beides läuft offline.

- **Turnier:** Blind-Uhr mit Levels und Pausen, Rebuy, Add-On, Late Entry, Mystery-Umschläge
- **Cash Game:** Ein- und Nachkäufe, Auszahlung mit Rundung, Übersicht pro Spieler
- **Rangliste:** Auswertung aller Abende, Text zum Teilen per WhatsApp
- **Handy-Fernbedienung:** QR-Code scannen und die Uhr vom Handy aus steuern (nur Desktop-App, gleiches WLAN)

## WebApp (ohne Installation)

**[frieo.github.io/poker-and-friends](https://frieo.github.io/poker-and-friends/)** in Chrome, Edge, Safari oder Firefox öffnen. Gedacht für Laptop, Tablet oder TV im Querformat.

- Alles läuft im eigenen Browser: kein Konto, kein Server, keine Datenübertragung
- Nach dem ersten Aufruf auch offline nutzbar, über das Symbol in der Adressleiste als App installierbar
- Daten liegen nur in diesem Browser. Werden die Browserdaten gelöscht, sind sie weg: unter **Daten sichern** nach jedem Abend eine Sicherung herunterladen
- Bitte nur in einem Tab gleichzeitig öffnen
- Keine Handy-Fernbedienung (dafür die Desktop-App nehmen)

Die WebApp liegt im Ordner `docs` und wird mit `npm run build:web` aus demselben Code wie die Desktop-App gebaut.

## Desktop-App (Download)

Unter [Releases](https://github.com/Frieo/poker-and-friends/releases) gibt es zwei Dateien:

- `PokerAndFriends-<Version>-Setup.exe`: Installation mit Startmenü-Eintrag (empfohlen)
- `PokerAndFriends-<Version>-portable.exe`: ohne Installation, z.B. vom USB-Stick

Bitte nur von dieser Seite herunterladen, nicht über weitergeleitete Dateien.

### Echtheit prüfen

Zu jeder Datei steht im Release die SHA-256-Prüfsumme. Prüfen in der Eingabeaufforderung:

```
certutil -hashfile PokerAndFriends-1.7.0-Setup.exe SHA256
```

Stimmt die Ausgabe nicht mit der Prüfsumme im Release überein: Datei löschen und nicht starten.

### Windows-Warnung

Die App ist (noch) nicht digital signiert. Windows zeigt deshalb beim ersten Start "Der Computer wurde durch Windows geschützt". Nach erfolgreicher Prüfsummen-Kontrolle: **Weitere Informationen > Trotzdem ausführen**.

## Datenschutz

- Keine Internetverbindung, keine Werbung, keine Telemetrie
- Alle Daten (Spieler, Abende, Einstellungen) liegen nur auf dem eigenen Rechner unter `%APPDATA%\Poker & Friends\daten`

## Handy-Fernbedienung

- Der Laptop startet einen kleinen Webserver (Port 4747), sobald die Handy-Steuerung einmal geöffnet wurde, danach bei jedem App-Start
- Zugriff nur mit dem geheimen Schlüssel aus dem QR-Code, das Handy darf nur Uhr, Spieleraktionen und Rückgängig
- Die Verbindung ist nicht verschlüsselt. Nur im eigenen, vertrauenswürdigen WLAN nutzen, nicht in öffentlichen Netzen
- Fragt die Windows-Firewall nach, nur **Private Netzwerke** erlauben

## Hinweis

Reines Hilfsmittel für private Runden unter Freunden. Keine Glücksspiel-Plattform, kein Echtgeld-Spiel über die App. Nutzung auf eigene Verantwortung, ohne Gewähr (siehe Lizenz).

## Selbst bauen

Voraussetzung: [Node.js](https://nodejs.org)

```
npm install
npm start
npm test
npm run dist
npm run build:web
npm run serve:web
```

`npm run dist` erzeugt Setup- und portable-exe im Ordner `dist`, `npm run build:web` die WebApp in `dist-web` (zum Veröffentlichen nach `docs` kopieren), `npm run serve:web` zeigt sie unter http://localhost:8080. Die Build-Caches landen im Ordner `.cache` neben dem Projektordner.

## Lizenz

[MIT](LICENSE). Sounds: CC0, Quellen in `src/renderer/sounds/QUELLEN.txt`.
