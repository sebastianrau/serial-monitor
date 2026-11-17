package main

import "testing"

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int // sign only
	}{
		{"v0.6.0", "0.5.0", 1},
		{"0.5.0", "v0.5.0", 0},
		{"0.5.1", "0.5.0", 1},
		{"1.0.0", "0.9.9", 1},
		{"0.10.0", "0.9.0", 1},
		{"1.0.0", "1.0.0-beta.1", 1},
		{"1.0.0-beta.2", "1.0.0-beta.1", 1},
		{"1.0.0-beta.10", "1.0.0-beta.2", 1},
		{"1.0.0-rc.1", "1.0.0-beta.9", 1},
		{"1.0.0-alpha", "1.0.0-alpha.1", -1},
		{"0.4.9", "0.5.0", -1},
	}
	for _, c := range cases {
		got := compareVersions(c.a, c.b)
		if (got > 0) != (c.want > 0) || (got < 0) != (c.want < 0) {
			t.Errorf("compareVersions(%q, %q) = %d, want sign %d", c.a, c.b, got, c.want)
		}
	}
}
