# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/sebastianrau/serial-monitor/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/sebastianrau/serial-monitor/releases/tag/v0.5.0
