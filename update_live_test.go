package main

import (
	"os"
	"testing"
)

// Live-Test gegen GitHub (fragt die echten Releases ab):
//
//	SM_LIVE_TEST=1 go test -count=1 -tags desktop,production -run TestCheckUpdateLive -v \
//	  -ldflags "-X github.com/sebastianrau/serial-monitor.version=0.4.0" .
func TestCheckUpdateLive(t *testing.T) {
	if os.Getenv("SM_LIVE_TEST") == "" {
		t.Skip("set SM_LIVE_TEST=1 to query GitHub")
	}
	info, err := (&App{}).CheckUpdate()
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("version=%s update=%q page=%q download=%q", version, info.Version, info.PageURL, info.DownloadURL)
}
