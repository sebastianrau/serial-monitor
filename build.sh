#!/usr/bin/env bash
# Baut den Serial Monitor.
#   ./build.sh mac      -> dist/Serial Monitor.app + SerialMonitor-<version>-mac.dmg (Universal: Apple Silicon + Intel)
#   ./build.sh windows  -> dist/SerialMonitor-<version>-windows-x64.exe / -arm64.exe   (auch vom Mac aus)
#   ./build.sh linux    -> dist/SerialMonitor-<version>-linux-<arch>.tar.gz   (nur auf Linux, siehe README)
# Version: Umgebungsvariable VERSION (Standard 1.0.0), z. B. VERSION=1.2.0 ./build.sh mac
#   ./build.sh all      -> mac + windows (auf macOS) bzw. linux + windows (auf Linux)
set -euo pipefail
cd "$(dirname "$0")"

NAME="Serial Monitor"
VERSION="${VERSION:-1.0.0}"   # im CI aus dem Git-Tag
VERSION="${VERSION#v}"        # v1.2.3 -> 1.2.3
TAGS="desktop,production"
LDFLAGS="-s -w"
mkdir -p dist

# Lizenzen: eigene (LICENSE) und die der einkompilierten Bibliotheken
notices() {
  [ -f dist/THIRD_PARTY_LICENSES.txt ] || ./scripts/licenses.sh
  cp LICENSE dist/LICENSE.txt
}

build_mac() {
  local min="13.0"   # Mindestversion von Go 1.27
  export CGO_ENABLED=1
  export CGO_CFLAGS="-mmacosx-version-min=$min"
  export CGO_LDFLAGS="-framework UniformTypeIdentifiers -mmacosx-version-min=$min"
  echo ">> macOS arm64";  GOOS=darwin GOARCH=arm64 go build -tags "$TAGS" -ldflags "$LDFLAGS" -o dist/.mac-arm64 .
  echo ">> macOS amd64";  GOOS=darwin GOARCH=amd64 go build -tags "$TAGS" -ldflags "$LDFLAGS" -o dist/.mac-amd64 .
  unset CGO_CFLAGS CGO_LDFLAGS

  local app="dist/$NAME.app"
  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/de.lproj" "$app/Contents/Resources/en.lproj"
  lipo -create -output "$app/Contents/MacOS/serialmonitor" dist/.mac-arm64 dist/.mac-amd64
  rm -f dist/.mac-arm64 dist/.mac-amd64
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleExecutable</key><string>serialmonitor</string>
  <key>CFBundleIdentifier</key><string>io.github.sebastianrau.serialmonitor</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>$min</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleLocalizations</key><array><string>de</string><string>en</string></array>
</dict></plist>
PLIST
  codesign --force --deep -s - "$app"   # Ad-hoc-Signatur (nötig auf Apple Silicon)

  local dmg="dist/SerialMonitor-$VERSION-mac.dmg"
  rm -f "$dmg"
  local stage; stage="$(mktemp -d)"
  cp -R "$app" "$stage/"
  notices
  cp dist/LICENSE.txt dist/THIRD_PARTY_LICENSES.txt "$stage/"
  ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname "$NAME" -srcfolder "$stage" -ov -format UDZO "$dmg"
  rm -rf "$stage"
  echo "   -> $app"
  echo "   -> $dmg"
}

build_windows() {
  notices   # Windows-Programme sind Einzeldateien: Lizenzen liegen als eigene Dateien daneben
  for arch in amd64 arm64; do
    local label=arm64
    [ "$arch" = amd64 ] && label=x64
    echo ">> Windows $label"
    CGO_ENABLED=0 GOOS=windows GOARCH=$arch go build -tags "$TAGS" -ldflags "$LDFLAGS -H windowsgui" \
      -o "dist/SerialMonitor-$VERSION-windows-$label.exe" .
    echo "   -> dist/SerialMonitor-$VERSION-windows-$label.exe"
  done
}

build_linux() {
  [ "$(uname -s)" = Linux ] || { echo "Linux-Build bitte auf Linux ausführen (braucht GTK/WebKitGTK)."; exit 1; }
  local tags="$TAGS"
  pkg-config --exists webkit2gtk-4.1 2>/dev/null && tags="$tags,webkit2_41"
  local arch; arch="$(go env GOARCH)"
  echo ">> Linux $arch"
  CGO_ENABLED=1 go build -tags "$tags" -ldflags "$LDFLAGS" -o "dist/serialmonitor" .
  local tgz="dist/SerialMonitor-$VERSION-linux-$arch.tar.gz"
  notices
  tar -czf "$tgz" -C dist serialmonitor LICENSE.txt THIRD_PARTY_LICENSES.txt   # tar erhält das Ausführungsrecht
  rm -f dist/serialmonitor
  echo "   -> $tgz"
}

case "${1:-}" in
  mac)     build_mac ;;
  windows) build_windows ;;
  linux)   build_linux ;;
  all)     if [ "$(uname -s)" = Darwin ]; then build_mac; else build_linux; fi; build_windows ;;
  *)       echo "Verwendung: $0 mac|windows|linux|all"; exit 1 ;;
esac
echo; du -sh dist/*
