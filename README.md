# Serial Monitor

Serieller Monitor für Windows, macOS und Linux, funktional ähnlich dem Arduino Serial Monitor.
Gebaut mit Go und [Wails](https://wails.io). Die App nutzt den Webbrowser-Baustein des Betriebssystems,
deshalb sind die Pakete nur etwa 8 bis 11 MB groß.

## Download

Fertige Pakete gibt es unter **Releases**:

| System  | Datei                                                    |
|---------|----------------------------------------------------------|
| macOS   | `SerialMonitor-<version>-mac.dmg` (Apple Silicon und Intel, ab macOS 13) |
| Windows | `SerialMonitor-<version>-windows-x64.exe` bzw. `-arm64.exe` (ohne Installation) |
| Linux   | `SerialMonitor-<version>-linux-amd64.tar.gz` bzw. `-arm64.tar.gz` |

## Release erstellen

Ein Release entsteht automatisch, wenn ein Tag `v*` gepusht wird:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Der Workflow `.github/workflows/release.yml` baut alle Pakete auf GitHub Actions
und hängt sie zusammen mit `SHA256SUMS.txt` an das Release. Tags mit Bindestrich
(z. B. `v1.3.0-beta.1`) werden als Vorabversion markiert. Unter *Actions > Release > Run workflow*
lässt sich alles als Test bauen, ohne ein Release zu erstellen.

## Lokal bauen

Voraussetzung: Go (Version siehe `go.mod`). Node.js wird nicht benötigt.

```bash
./build.sh mac       # dist/Serial Monitor.app + .dmg (Apple Silicon und Intel)
./build.sh windows   # dist/SerialMonitor-<version>-windows-x64.exe und -arm64.exe (geht auch vom Mac aus)
./build.sh linux     # nur auf Linux, siehe unten
./build.sh all       # alles, was auf dem aktuellen System geht
```

Die Version kommt aus der Umgebungsvariable `VERSION` (Standard `1.0.0`), z. B. `VERSION=1.2.0 ./build.sh mac`.

Zum Entwickeln: `go run -tags desktop,production .`
Die Oberfläche liegt in `frontend/`. `frontend/index.html` läuft auch allein in Chrome oder Edge
(dann über die Web Serial API).

### Linux

Auf einem Linux-Rechner (Debian/Ubuntu):

```bash
sudo apt install golang build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
./build.sh linux
```

## Hinweise je System

- **macOS:** Die App ist nur ad hoc signiert, also weder mit einer Apple-Developer-ID signiert noch von Apple
  notarisiert. Deshalb blockiert macOS sie beim ersten Start. Freigeben unter
  *Systemeinstellungen > Datenschutz & Sicherheit > Dennoch öffnen* (ab macOS 15 reicht Rechtsklick > Öffnen nicht mehr).
  Alternativ im Terminal: `xattr -dr com.apple.quarantine "/Applications/Serial Monitor.app"`
- **Windows:** Braucht die WebView2-Laufzeit (unter Windows 10 und 11 vorinstalliert).
  Die Treiber des Boards müssen installiert sein (z. B. CH340, CP210x).
- **Linux:** Braucht `libwebkit2gtk-4.1` und Zugriff auf die Schnittstelle:
  `sudo usermod -aG dialout $USER`, danach neu anmelden.

## Aufbau

- `main.go`: Fenster
- `app.go`: serielle Schnittstelle (Ports auflisten, öffnen, lesen, schreiben, DTR/RTS, Board-Reset, Log speichern)
- `frontend/`: Oberfläche (`index.html`, `app.js`)
- `frontend/i18n.js`: alle Texte auf Deutsch und Englisch. Weitere Sprache: Block ergänzen und in
  `index.html` (`#lang`) eintragen. Die wenigen Texte aus Go stehen in `app.go` (`messages`).
- `build.sh`: Build-Skript
- `.github/workflows/release.yml`: Release-Workflow

Bekannte Einschränkung: Hardware-Flusskontrolle (RTS/CTS) wird von der Go-Bibliothek nicht unterstützt
und ist in der App ausgeblendet.
