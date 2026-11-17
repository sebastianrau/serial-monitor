package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/serial"
	"go.bug.st/serial/enumerator"
)

// App is bound to the frontend (window.go.main.App).
type App struct {
	ctx  context.Context
	mu   sync.Mutex
	port serial.Port
	lang atomic.Value // string; set by SetLanguage, read by tr() from several goroutines (e.g. readLoop)
}

var messages = map[string]map[string]string{
	"de": {
		"alreadyOpen":    "Port ist bereits geöffnet",
		"connectionLost": "Verbindung verloren",
		"notConnected":   "Nicht verbunden",
		"saveTitle":      "Ausgabe speichern",
		"textFiles":      "Textdateien (*.txt)",
	},
	"en": {
		"alreadyOpen":    "Port is already open",
		"connectionLost": "Connection lost",
		"notConnected":   "Not connected",
		"saveTitle":      "Save output",
		"textFiles":      "Text files (*.txt)",
	},
}

// tr returns the message in the language chosen in the frontend (fallback: English).
func (a *App) tr(key string) string {
	lang, _ := a.lang.Load().(string)
	if m, ok := messages[lang][key]; ok {
		return m
	}
	return messages["en"][key]
}

// SetLanguage is called by the frontend ("de" or "en").
func (a *App) SetLanguage(lang string) { a.lang.Store(lang) }

type PortInfo struct {
	Name  string `json:"name"`
	Label string `json:"label"`
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context)  { a.ctx = ctx }
func (a *App) shutdown(ctx context.Context) { _ = a.Close() }

// Version returns the app version (set at build time).
func (a *App) Version() string { return version }

// OpenURL opens a project link in the default browser (only GitHub links of this project).
func (a *App) OpenURL(url string) {
	if strings.HasPrefix(url, "https://github.com/sebastianrau/serial-monitor") {
		wruntime.BrowserOpenURL(a.ctx, url)
	}
}

// Platform returns the operating system ("darwin", "windows", "linux").
func (a *App) Platform() string { return runtime.GOOS }

// ListPorts returns all serial ports with a readable label.
func (a *App) ListPorts() ([]PortInfo, error) {
	labels := map[string]string{}
	var names []string

	if details, err := enumerator.GetDetailedPortsList(); err == nil && len(details) > 0 {
		for _, d := range details {
			names = append(names, d.Name)
			if d.IsUSB {
				desc := d.Product
				if desc == "" {
					desc = fmt.Sprintf("USB %s:%s", strings.ToUpper(d.VID), strings.ToUpper(d.PID))
				}
				labels[d.Name] = desc
			}
		}
	} else {
		list, err := serial.GetPortsList()
		if err != nil {
			return nil, err
		}
		names = list
	}

	// macOS: prefer /dev/cu.*; hide /dev/tty.* when the cu counterpart exists
	if runtime.GOOS == "darwin" {
		set := map[string]bool{}
		for _, n := range names {
			set[n] = true
		}
		filtered := names[:0]
		for _, n := range names {
			if strings.HasPrefix(n, "/dev/tty.") && set["/dev/cu."+strings.TrimPrefix(n, "/dev/tty.")] {
				continue
			}
			filtered = append(filtered, n)
		}
		names = filtered
	}

	sort.Strings(names)
	out := make([]PortInfo, 0, len(names))
	for _, n := range names {
		label := n
		if l := labels[n]; l != "" {
			label = n + " – " + l
		}
		out = append(out, PortInfo{Name: n, Label: label})
	}
	return out, nil
}

// Open opens the port and starts reading. Received data arrives as event "serial:rx" (base64).
// DTR and RTS stay off when opening, so the board is not reset.
func (a *App) Open(name string, baud, dataBits int, parity string, stopBits int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.port != nil {
		return errors.New(a.tr("alreadyOpen"))
	}

	mode := &serial.Mode{
		BaudRate:          baud,
		DataBits:          dataBits,
		Parity:            serial.NoParity,
		StopBits:          serial.OneStopBit,
		InitialStatusBits: &serial.ModemOutputBits{DTR: false, RTS: false},
	}
	switch parity {
	case "even":
		mode.Parity = serial.EvenParity
	case "odd":
		mode.Parity = serial.OddParity
	}
	if stopBits == 2 {
		mode.StopBits = serial.TwoStopBits
	}

	p, err := serial.Open(name, mode)
	if err != nil {
		return err
	}
	a.port = p
	go a.readLoop(p)
	return nil
}

func (a *App) readLoop(p serial.Port) {
	buf := make([]byte, 16384)
	for {
		n, err := p.Read(buf)
		if n > 0 {
			wruntime.EventsEmit(a.ctx, "serial:rx", base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if err != nil || n == 0 {
			a.mu.Lock()
			unexpected := a.port == p // not closed via Close()
			if unexpected {
				a.port = nil
				_ = p.Close()
			}
			a.mu.Unlock()
			if unexpected {
				msg := a.tr("connectionLost")
				if err != nil {
					msg += ": " + err.Error()
				}
				wruntime.EventsEmit(a.ctx, "serial:closed", msg)
			}
			return
		}
	}
}

// Write sends base64-encoded data.
func (a *App) Write(b64 string) (int, error) {
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return 0, err
	}
	a.mu.Lock()
	p := a.port
	a.mu.Unlock()
	if p == nil {
		return 0, errors.New(a.tr("notConnected"))
	}
	return p.Write(data)
}

// SetSignals sets DTR and RTS.
func (a *App) SetSignals(dtr, rts bool) error {
	a.mu.Lock()
	p := a.port
	a.mu.Unlock()
	if p == nil {
		return errors.New(a.tr("notConnected"))
	}
	return setSignalsSafe(p, dtr, rts)
}

// setSignalsSafe switches DTR/RTS without passing through the state
// DTR=off/RTS=on, which pulls EN low (= reset) on ESP32/ESP8266 auto-reset circuits.
func setSignalsSafe(p serial.Port, dtr, rts bool) error {
	if rts {
		if err := p.SetDTR(dtr); err != nil {
			return err
		}
		return p.SetRTS(true)
	}
	if err := p.SetRTS(false); err != nil {
		return err
	}
	return p.SetDTR(dtr)
}

// ResetBoard restarts the connected board, then restores the given DTR/RTS state.
//   - ESP32/ESP8266: RTS -> EN low for 100 ms (DTR off, so GPIO0 stays high -> normal boot)
//   - Arduino (Uno, Nano, ...): DTR pulse -> reset via the capacitor on the RESET line
func (a *App) ResetBoard(dtr, rts bool) error {
	a.mu.Lock()
	p := a.port
	a.mu.Unlock()
	if p == nil {
		return errors.New(a.tr("notConnected"))
	}
	steps := []func() error{
		func() error { return p.SetDTR(false) },
		func() error { return p.SetRTS(true) }, // ESP: EN low
		func() error { time.Sleep(100 * time.Millisecond); return p.SetRTS(false) },
		func() error { time.Sleep(20 * time.Millisecond); return p.SetDTR(true) }, // Arduino: reset pulse
		func() error { time.Sleep(50 * time.Millisecond); return p.SetDTR(false) },
	}
	for _, s := range steps {
		if err := s(); err != nil {
			return err
		}
	}
	return setSignalsSafe(p, dtr, rts)
}

// SaveLog shows a save dialog and writes the text. Returns the path ("" if cancelled).
func (a *App) SaveLog(defaultName, text string) (string, error) {
	path, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
		DefaultFilename: defaultName,
		Title:           a.tr("saveTitle"),
		Filters:         []wruntime.FileFilter{{DisplayName: a.tr("textFiles"), Pattern: "*.txt"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	return path, os.WriteFile(path, []byte(text), 0o644)
}

// Close closes the port.
func (a *App) Close() error {
	a.mu.Lock()
	p := a.port
	a.port = nil
	a.mu.Unlock()
	if p == nil {
		return nil
	}
	return p.Close()
}
