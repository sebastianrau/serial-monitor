package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const releasesAPI = "https://api.github.com/repos/sebastianrau/serial-monitor/releases?per_page=20"

// UpdateInfo describes an available update (empty Version = no update).
type UpdateInfo struct {
	Version     string `json:"version"`     // e.g. "0.6.0"
	PageURL     string `json:"pageUrl"`     // release page on GitHub
	DownloadURL string `json:"downloadUrl"` // file for this OS/architecture ("" if not found)
}

type ghRelease struct {
	TagName    string `json:"tag_name"`
	HTMLURL    string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// CheckUpdate asks GitHub for the newest release. Pre-releases are only offered
// while the running version itself is a pre-release or 0.x.
func (a *App) CheckUpdate() (UpdateInfo, error) {
	current := strings.TrimPrefix(version, "v")
	if current == "dev" || current == "" || strings.HasPrefix(current, "0.0.0") {
		return UpdateInfo{}, nil // development build: no check
	}
	includePre := strings.HasPrefix(current, "0.") || strings.Contains(current, "-")

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, releasesAPI, nil)
	if err != nil {
		return UpdateInfo{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "serial-monitor/"+current)
	resp, err := client.Do(req)
	if err != nil {
		return UpdateInfo{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return UpdateInfo{}, fmt.Errorf("GitHub: %s", resp.Status)
	}
	var releases []ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return UpdateInfo{}, err
	}

	var best *ghRelease
	for i := range releases {
		r := &releases[i]
		if r.Draft || (r.Prerelease && !includePre) {
			continue
		}
		if best == nil || compareVersions(r.TagName, best.TagName) > 0 {
			best = r
		}
	}
	if best == nil || compareVersions(best.TagName, current) <= 0 {
		return UpdateInfo{}, nil
	}

	info := UpdateInfo{Version: strings.TrimPrefix(best.TagName, "v"), PageURL: best.HTMLURL}
	suffix := assetSuffix()
	for _, as := range best.Assets {
		if strings.HasSuffix(as.Name, suffix) {
			info.DownloadURL = as.URL
			break
		}
	}
	return info, nil
}

// assetSuffix is the end of the release file name for this system (see build.sh).
func assetSuffix() string {
	switch runtime.GOOS {
	case "darwin":
		return "-mac.dmg"
	case "windows":
		if runtime.GOARCH == "arm64" {
			return "-windows-arm64.exe"
		}
		return "-windows-x64.exe"
	default:
		return "-linux-" + runtime.GOARCH + ".tar.gz"
	}
}

// compareVersions compares semantic versions ("v1.2.3", "1.3.0-beta.1").
// Returns >0 if a is newer than b, <0 if older, 0 if equal.
func compareVersions(a, b string) int {
	ac, ap := splitVersion(a)
	bc, bp := splitVersion(b)
	for i := 0; i < 3; i++ {
		if ac[i] != bc[i] {
			return ac[i] - bc[i]
		}
	}
	switch {
	case ap == bp:
		return 0
	case ap == "": // release is newer than any pre-release of the same version
		return 1
	case bp == "":
		return -1
	}
	return comparePre(ap, bp)
}

func splitVersion(v string) ([3]int, string) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	v, _, _ = strings.Cut(v, "+") // ignore build metadata
	core, pre, _ := strings.Cut(v, "-")
	var nums [3]int
	for i, part := range strings.SplitN(core, ".", 3) {
		n, _ := strconv.Atoi(part)
		nums[i] = n
	}
	return nums, pre
}

func comparePre(a, b string) int {
	ap, bp := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(ap) && i < len(bp); i++ {
		an, aErr := strconv.Atoi(ap[i])
		bn, bErr := strconv.Atoi(bp[i])
		switch {
		case aErr == nil && bErr == nil:
			if an != bn {
				return an - bn
			}
		case aErr == nil: // numeric identifiers sort before alphanumeric ones
			return -1
		case bErr == nil:
			return 1
		default:
			if c := strings.Compare(ap[i], bp[i]); c != 0 {
				return c
			}
		}
	}
	return len(ap) - len(bp)
}
