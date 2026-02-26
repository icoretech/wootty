package config

import (
	"testing"
)

func TestParseRunConfigDefaults(t *testing.T) {
	cfg, err := ParseRunConfig([]string{"run"}, map[string]string{}, "/tmp/wootty/apps/server")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Host != "0.0.0.0" {
		t.Fatalf("expected default host, got %q", cfg.Host)
	}
	if cfg.Port != DefaultPort {
		t.Fatalf("expected default port %d, got %d", DefaultPort, cfg.Port)
	}
	if cfg.DetachedTTLMS != DefaultDetachedTTLMS {
		t.Fatalf("expected default detached ttl %d, got %d", DefaultDetachedTTLMS, cfg.DetachedTTLMS)
	}
	if cfg.Command != "bash" {
		t.Fatalf("expected default shell command bash, got %q", cfg.Command)
	}
}

func TestParseRunConfigWithFlagsAndCommand(t *testing.T) {
	env := map[string]string{
		"WOOTTY_PORT": "9999",
		"SHELL":       "/bin/zsh",
	}
	cfg, err := ParseRunConfig(
		[]string{"run", "-p", "4444", "--host", "127.0.0.1", "--detached-ttl-ms", "0", "sh", "-lc", "echo ok"},
		env,
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != 4444 {
		t.Fatalf("expected explicit port 4444, got %d", cfg.Port)
	}
	if cfg.Host != "127.0.0.1" {
		t.Fatalf("expected explicit host, got %q", cfg.Host)
	}
	if cfg.Command != "sh" {
		t.Fatalf("expected command sh, got %q", cfg.Command)
	}
	if cfg.DetachedTTLMS != 0 {
		t.Fatalf("expected detached ttl override 0, got %d", cfg.DetachedTTLMS)
	}
	if len(cfg.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(cfg.Args))
	}
}

func TestParseRunConfigUnknownFlag(t *testing.T) {
	_, err := ParseRunConfig([]string{"run", "--nope"}, map[string]string{}, "/tmp/wootty/apps/server")
	if err == nil {
		t.Fatal("expected error for unknown flag")
	}
}

func TestParseRunConfigUsesEnvCommandArgsAndFakePTY(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run"},
		map[string]string{
			"WOOTTY_COMMAND":         "/bin/bash",
			"WOOTTY_COMMAND_ARGS":    "-lc echo-ok",
			"WOOTTY_FAKE_PTY":        "1",
			"WOOTTY_DETACHED_TTL_MS": "0",
		},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Command != "/bin/bash" {
		t.Fatalf("unexpected command: %q", cfg.Command)
	}
	if len(cfg.Args) != 2 {
		t.Fatalf("expected two command args, got %d", len(cfg.Args))
	}
	if cfg.Args[0] != "-lc" || cfg.Args[1] != "echo-ok" {
		t.Fatalf("unexpected command args: %#v", cfg.Args)
	}
	if !cfg.FakePTY {
		t.Fatal("expected fake PTY to be enabled from env")
	}
	if cfg.DetachedTTLMS != 0 {
		t.Fatalf("expected detached ttl from env 0, got %d", cfg.DetachedTTLMS)
	}
}
