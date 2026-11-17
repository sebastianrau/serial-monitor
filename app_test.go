package main

import (
	"sync"
	"testing"
)

func TestTranslations(t *testing.T) {
	a := &App{}
	if got := a.tr("notConnected"); got != "Not connected" {
		t.Errorf("default language: got %q, want English", got)
	}
	a.SetLanguage("de")
	if got := a.tr("notConnected"); got != "Nicht verbunden" {
		t.Errorf("de: got %q", got)
	}
	a.SetLanguage("fr") // unknown language falls back to English
	if got := a.tr("notConnected"); got != "Not connected" {
		t.Errorf("fallback: got %q", got)
	}
	for key := range messages["en"] {
		if _, ok := messages["de"][key]; !ok {
			t.Errorf("missing German message %q", key)
		}
	}
}

// Run with -race: language changes from the UI while the read loop translates messages.
func TestLanguageConcurrentAccess(t *testing.T) {
	a := &App{}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				a.SetLanguage([]string{"de", "en"}[(i+j)%2])
			}
		}(i)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				_ = a.tr("connectionLost")
			}
		}()
	}
	wg.Wait()
}
