package config

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestParseRunConfigRejectsInvalidNumericSettings(t *testing.T) {
	settings := []struct {
		flag string
		env  string
		bad  []string
	}{
		{"--port", "WOOTTY_PORT", []string{"nope", "0", "-1", "65536", "1.5", "999999999999999999999999"}},
		{"--history-bytes", "WOOTTY_HISTORY_BYTES", []string{"nope", "0", "-1", "1.5", "999999999999999999999999"}},
		{"--detached-ttl-ms", "WOOTTY_DETACHED_TTL_MS", []string{"nope", "-1", "1.5", "9223372036855", "999999999999999999999999"}},
	}
	for _, setting := range settings {
		for _, value := range setting.bad {
			t.Run(setting.flag+"/"+value, func(t *testing.T) {
				_, err := ParseRunConfig([]string{setting.flag, value}, nil, t.TempDir())
				if err == nil || !strings.Contains(err.Error(), setting.flag) {
					t.Fatalf("expected an error identifying %s, got %v", setting.flag, err)
				}
			})
			t.Run(setting.env+"/"+value, func(t *testing.T) {
				_, err := ParseRunConfig(nil, map[string]string{setting.env: value}, t.TempDir())
				if err == nil || !strings.Contains(err.Error(), setting.env) {
					t.Fatalf("expected an error identifying %s, got %v", setting.env, err)
				}
			})
		}
	}
}

func TestParseRunConfigRejectsMissingFlagValues(t *testing.T) {
	for _, flag := range []string{"-p", "--port", "--host", "--history-bytes", "--detached-ttl-ms"} {
		for _, suffix := range [][]string{nil, {""}, {" "}, {"--help"}} {
			t.Run(flag+"/"+strings.Join(suffix, ","), func(t *testing.T) {
				_, err := ParseRunConfig(append([]string{flag}, suffix...), nil, t.TempDir())
				if err == nil || !strings.Contains(err.Error(), flag) {
					t.Fatalf("expected missing-value error identifying %s, got %v", flag, err)
				}
			})
		}
	}
}

func TestParseRunConfigNumericFlagsOverrideEnvironment(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"--port", " 65535 ", "--history-bytes", "1", "--detached-ttl-ms", "0"},
		map[string]string{"WOOTTY_PORT": "invalid", "WOOTTY_HISTORY_BYTES": "invalid", "WOOTTY_DETACHED_TTL_MS": "invalid"},
		t.TempDir(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 65535 || cfg.HistoryBytes != 1 || cfg.DetachedTTLMS != 0 {
		t.Fatalf("numeric flag precedence lost: port=%d history=%d ttl=%d", cfg.Port, cfg.HistoryBytes, cfg.DetachedTTLMS)
	}
}

func TestParseRunConfigAcceptsMaximumRepresentableDetachedDuration(t *testing.T) {
	maximum := min(int64(^uint(0)>>1), int64((1<<63-1)/time.Millisecond))
	cfg, err := ParseRunConfig([]string{"--detached-ttl-ms", strconv.FormatInt(maximum, 10)}, nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if int64(cfg.DetachedTTLMS) != maximum || time.Duration(cfg.DetachedTTLMS)*time.Millisecond < 0 {
		t.Fatalf("duration was not preserved safely: %d", cfg.DetachedTTLMS)
	}
}
