#!/usr/bin/env bash
# Erzeugt THIRD_PARTY_LICENSES.txt mit den Lizenztexten aller Bibliotheken,
# die in die App einkompiliert werden (macOS, Windows und Linux zusammen),
# plus der Go-Standardbibliothek.
#   ./scripts/licenses.sh [ausgabedatei]   (Standard: dist/THIRD_PARTY_LICENSES.txt)
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-dist/THIRD_PARTY_LICENSES.txt}"
mkdir -p "$(dirname "$out")"

modules="$(
  for os in darwin windows linux; do
    tags="desktop,production"
    [ "$os" = linux ] && tags="$tags,webkit2_41"
    GOOS=$os CGO_ENABLED=1 go list -deps -tags "$tags" \
      -f '{{with .Module}}{{if not .Main}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}{{end}}' .
  done | sort -u
)"

section() {
  printf '\n%s\n%s\n%s\n\n' "========================================================================" "$1" "========================================================================"
}

{
  echo "Serial Monitor – Third-party licenses / Lizenzen von Drittanbietern"
  echo
  echo "This software includes the following components."
  echo "Diese Software enthält die folgenden Komponenten."

  section "Go standard library ($(go env GOVERSION)) – https://go.dev"
  goroot="$(go env GOROOT)"
  # Homebrew legt die Go-Lizenz eine Ebene höher ab
  for f in "$goroot/LICENSE" "$goroot/../LICENSE"; do [ -f "$f" ] && { cat "$f"; break; }; done

  while IFS='|' read -r path version dir; do
    [ -n "$path" ] || continue
    lic="$(find "$dir" -maxdepth 1 -type f \( -iname 'LICENSE*' -o -iname 'LICENCE*' -o -iname 'COPYING*' \) | sort | head -1)"
    if [ -z "$lic" ]; then
      echo "Keine Lizenzdatei gefunden für $path $version" >&2
      exit 1
    fi
    section "$path $version"
    cat "$lic"
    notice="$(find "$dir" -maxdepth 1 -type f -iname 'NOTICE*' | sort | head -1)"
    if [ -n "$notice" ]; then
      echo
      cat "$notice"
    fi
  done <<< "$modules"
} > "$out"

echo "   -> $out ($(grep -c '^====' "$out" | awk '{print $1/2}') Komponenten)"
