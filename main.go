package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

// version is set at build time: go build -ldflags "-X main.version=1.2.3"
var version = "dev"

//go:embed all:frontend
var embedded embed.FS

//go:embed frontend/appicon.png
var appIcon []byte

func main() {
	assets, err := fs.Sub(embedded, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	app := NewApp()
	err = wails.Run(&options.App{
		Title:       "Serial Monitor",
		Width:       1100,
		Height:      720,
		MinWidth:    640,
		MinHeight:   400,
		AssetServer: &assetserver.Options{Assets: assets},
		OnStartup:   app.startup,
		OnShutdown:  app.shutdown,
		Bind:        []interface{}{app},
		Linux:       &linux.Options{Icon: appIcon},
	})
	if err != nil {
		log.Fatal(err)
	}
}
