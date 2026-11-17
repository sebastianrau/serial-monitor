// Command winres erzeugt die Windows-Ressourcen der App (Icon, Manifest, Versionsinfo)
// als rsrc_windows_<arch>.syso im Projektverzeichnis; go build bindet sie automatisch ein.
//
//	go run ./scripts/winres -version 1.2.3
package main

import (
	"flag"
	"fmt"
	"image/png"
	"log"
	"os"
	"strings"

	"github.com/tc-hib/winres"
	"github.com/tc-hib/winres/version"
)

func main() {
	ver := flag.String("version", "0.0.0", "Versionsnummer, z. B. 1.2.3 oder 1.3.0-beta.1")
	iconPath := flag.String("icon", "build/appicon.png", "PNG-Icon (mindestens 256x256)")
	flag.Parse()

	f, err := os.Open(*iconPath)
	if err != nil {
		log.Fatal(err)
	}
	img, err := png.Decode(f)
	f.Close()
	if err != nil {
		log.Fatal(err)
	}
	icon, err := winres.NewIconFromResizedImage(img, []int{256, 64, 48, 32, 24, 16})
	if err != nil {
		log.Fatal(err)
	}

	rs := winres.ResourceSet{}
	// Wails lädt das Fenster-Icon über die Ressourcen-ID 3 (winc.AppIconID).
	if err := rs.SetIcon(winres.ID(3), icon); err != nil {
		log.Fatal(err)
	}

	rs.SetManifest(winres.AppManifest{
		Description:         "Serial Monitor",
		Compatibility:       winres.Win10AndAbove,
		ExecutionLevel:      winres.AsInvoker,
		DPIAwareness:        winres.DPIPerMonitorV2, // scharfe Darstellung auf hochauflösenden Bildschirmen
		UseCommonControlsV6: true,
	})

	full := strings.TrimPrefix(*ver, "v")
	numeric := strings.SplitN(full, "-", 2)[0] // 1.3.0-beta.1 -> 1.3.0
	vi := version.Info{}
	for key, value := range map[string]string{
		version.ProductName:      "Serial Monitor",
		version.FileDescription:  "Serial Monitor",
		version.CompanyName:      "Sebastian Rau",
		version.LegalCopyright:   "© 2026 Sebastian Rau – MIT License",
		version.OriginalFilename: "SerialMonitor.exe",
		version.InternalName:     "serialmonitor",
		version.Comments:         "https://github.com/sebastianrau/serial-monitor",
	} {
		if err := vi.Set(version.LangDefault, key, value); err != nil {
			log.Fatal(err)
		}
	}
	vi.SetFileVersion(numeric)
	vi.SetProductVersion(numeric)
	if err := vi.Set(version.LangDefault, version.ProductVersion, full); err != nil {
		log.Fatal(err)
	}
	vi.Flags.Prerelease = strings.Contains(full, "-")
	rs.SetVersionInfo(vi)

	for name, arch := range map[string]winres.Arch{"amd64": winres.ArchAMD64, "arm64": winres.ArchARM64} {
		out := fmt.Sprintf("rsrc_windows_%s.syso", name)
		w, err := os.Create(out)
		if err != nil {
			log.Fatal(err)
		}
		if err := rs.WriteObject(w, arch); err != nil {
			log.Fatal(err)
		}
		if err := w.Close(); err != nil {
			log.Fatal(err)
		}
		fmt.Println("   ->", out)
	}
}
