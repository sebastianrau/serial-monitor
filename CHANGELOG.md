# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Data race when switching the UI language while messages are translated in the background

### Changed

- CI runs the Go tests with the race detector

## [0.5.1] - 2026-11-17

Second test release with updated dependencies. Windows and Linux are still untested on real hardware.

### Security

- Wails 2.10.1 → 2.17.1, including the fix for
  [GHSA-r5j2-ghh9-2jqw](https://github.com/wailsapp/wails/security/advisories/GHSA-r5j2-ghh9-2jqw)
  (Linux: IPC bridge reachable from child frames)
- echo 4.13.3 → 4.16.3 (only used by Wails' development mode, not compiled into the app)

### Changed

- Serial library go.bug.st/serial 1.6.2 → 1.8.0
- Release workflow uses current GitHub Actions (checkout v7, setup-go v6, upload-artifact v7, download-artifact v8)

## [0.5.0] - 2026-11-17

First public test release. Windows and Linux builds have not yet been tested on real hardware –
feedback is welcome via [issues](https://github.com/sebastianrau/serial-monitor/issues).

### Added

- Serial monitor for macOS (Universal), Windows (x64, arm64) and Linux (amd64, arm64)
- Port list with device names, baud rate from a list or custom value
- Auto-connect to the last used port; pauses after a failed open (e.g. while flashing)
- No board reset on connect; reset button for ESP32/ESP8266 (RTS) and Arduino (DTR)
- Timestamps, hex view, autoscroll, line wrap, save output as text file
- Line ending on send (none/LF/CR/CR+LF), send as hex, send history
- Update check against GitHub Releases with direct download of the matching package
- English and German UI, light and dark theme
- App icon; Windows executables with high-DPI manifest and version information
- Release packages include `THIRD_PARTY_LICENSES.txt` and a CycloneDX SBOM per OS

[Unreleased]: https://github.com/sebastianrau/serial-monitor/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/sebastianrau/serial-monitor/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/sebastianrau/serial-monitor/releases/tag/v0.5.0
