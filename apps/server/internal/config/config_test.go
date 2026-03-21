package config

import (
	"errors"
	"strings"
	"testing"
)

func TestParseRunConfigDefaults(t *testing.T) {
	cfg, err := ParseRunConfig([]string{"run"}, map[string]string{}, "/tmp/wootty/apps/server")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Host != DefaultHost {
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
		"WOOTTY_PORT":       "9999",
		"SHELL":             "/bin/zsh",
		"WOOTTY_AUTH_TOKEN": "test-token",
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

func TestParseRunConfigAllowsLoopbackHostWithoutAuthToken(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run", "--host", "127.0.0.1"},
		map[string]string{},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AuthToken != "" {
		t.Fatalf("expected empty auth token by default, got %q", cfg.AuthToken)
	}
}

func TestParseRunConfigRejectsNonLoopbackHostWithoutAuthToken(t *testing.T) {
	_, err := ParseRunConfig(
		[]string{"run", "--host", "0.0.0.0"},
		map[string]string{},
		"/tmp/wootty/apps/server",
	)
	if err == nil {
		t.Fatal("expected non-loopback host without auth token to be rejected")
	}
	if !strings.Contains(err.Error(), "WOOTTY_AUTH_TOKEN") {
		t.Fatalf("expected auth token guidance in error, got %v", err)
	}
}

func TestParseRunConfigAllowsNonLoopbackHostWithAuthToken(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run", "--host", "0.0.0.0"},
		map[string]string{
			"WOOTTY_AUTH_TOKEN": "token",
		},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AuthToken != "token" {
		t.Fatalf("expected auth token to be preserved, got %q", cfg.AuthToken)
	}
}

func TestParseRunConfigAllowsExplicitInsecureNonLoopbackWithoutAuthToken(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run", "--host", "0.0.0.0"},
		map[string]string{
			"WOOTTY_ALLOW_INSECURE_NO_AUTH": "1",
		},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AuthToken != "" {
		t.Fatalf("expected empty auth token for explicit insecure mode, got %q", cfg.AuthToken)
	}
}

func TestParseRunConfigParsesAllowedOrigins(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run", "--host", "0.0.0.0"},
		map[string]string{
			"WOOTTY_AUTH_TOKEN":      "token",
			"WOOTTY_ALLOWED_ORIGINS": "https://one.example, https://two.example ,",
		},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Fatalf("expected two allowed origins, got %#v", cfg.AllowedOrigins)
	}
	if cfg.AllowedOrigins[0] != "https://one.example" || cfg.AllowedOrigins[1] != "https://two.example" {
		t.Fatalf("unexpected allowed origins: %#v", cfg.AllowedOrigins)
	}
}

func TestParseRunConfigTrimsHostFromEnvironment(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run"},
		map[string]string{"WOOTTY_HOST": " 127.0.0.1 "},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Host != "127.0.0.1" {
		t.Fatalf("expected trimmed host from env, got %q", cfg.Host)
	}
}

func TestParseRunConfigTrimsHostFromFlag(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run", "--host", " 127.0.0.1 "},
		map[string]string{},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Host != "127.0.0.1" {
		t.Fatalf("expected trimmed host from flag, got %q", cfg.Host)
	}
}

func TestParseRunConfigUnknownFlag(t *testing.T) {
	_, err := ParseRunConfig([]string{"run", "--nope"}, map[string]string{}, "/tmp/wootty/apps/server")
	if err == nil {
		t.Fatal("expected error for unknown flag")
	}
}

func TestParseRunConfigHelpAtRoot(t *testing.T) {
	_, err := ParseRunConfig([]string{"--help"}, map[string]string{}, "/tmp/wootty/apps/server")
	if !errors.Is(err, ErrHelpRequested) {
		t.Fatalf("expected ErrHelpRequested, got %v", err)
	}
}

func TestParseRunConfigHelpWithRunCommand(t *testing.T) {
	_, err := ParseRunConfig([]string{"run", "--help"}, map[string]string{}, "/tmp/wootty/apps/server")
	if !errors.Is(err, ErrHelpRequested) {
		t.Fatalf("expected ErrHelpRequested, got %v", err)
	}
}

func TestParseRunConfigHelpWithRunShortFlag(t *testing.T) {
	_, err := ParseRunConfig([]string{"run", "-h"}, map[string]string{}, "/tmp/wootty/apps/server")
	if !errors.Is(err, ErrHelpRequested) {
		t.Fatalf("expected ErrHelpRequested, got %v", err)
	}
}

func TestParseRunConfigForwardsHelpToCommandAfterCommandToken(t *testing.T) {
	cfg, err := ParseRunConfig([]string{"run", "bash", "--help"}, map[string]string{}, "/tmp/wootty/apps/server")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Command != "bash" {
		t.Fatalf("expected command bash, got %q", cfg.Command)
	}
	if len(cfg.Args) != 1 || cfg.Args[0] != "--help" {
		t.Fatalf("expected forwarded --help arg, got %#v", cfg.Args)
	}
}

func TestParseRunConfigRejectsRemovedReconnectGraceFlag(t *testing.T) {
	_, err := ParseRunConfig(
		[]string{"run", "--reconnect-grace-ms", "100"},
		map[string]string{},
		"/tmp/wootty/apps/server",
	)
	if err == nil {
		t.Fatal("expected error for removed reconnect grace flag")
	}
	if !strings.Contains(err.Error(), "Unknown flag: --reconnect-grace-ms") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseRunConfigRejectsRemovedReconnectGraceEnv(t *testing.T) {
	_, err := ParseRunConfig(
		[]string{"run"},
		map[string]string{
			"WOOTTY_RECONNECT_GRACE_MS": "100",
		},
		"/tmp/wootty/apps/server",
	)
	if err == nil {
		t.Fatal("expected error for removed reconnect grace env")
	}
	if !strings.Contains(err.Error(), "WOOTTY_RECONNECT_GRACE_MS has been removed") {
		t.Fatalf("unexpected error: %v", err)
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

func TestParseRunConfigParsesQuotedEnvCommandArgs(t *testing.T) {
	cfg, err := ParseRunConfig(
		[]string{"run"},
		map[string]string{
			"WOOTTY_COMMAND":      "/bin/bash",
			"WOOTTY_COMMAND_ARGS": `-lc "echo hello world" --flag='value with spaces' ""`,
		},
		"/tmp/wootty/apps/server",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Command != "/bin/bash" {
		t.Fatalf("unexpected command: %q", cfg.Command)
	}
	if len(cfg.Args) != 4 {
		t.Fatalf("expected four command args, got %d", len(cfg.Args))
	}
	if cfg.Args[0] != "-lc" || cfg.Args[1] != "echo hello world" || cfg.Args[2] != "--flag=value with spaces" || cfg.Args[3] != "" {
		t.Fatalf("unexpected parsed command args: %#v", cfg.Args)
	}
}

func TestParseRunConfigErrorsOnInvalidEnvCommandArgs(t *testing.T) {
	_, err := ParseRunConfig(
		[]string{"run"},
		map[string]string{
			"WOOTTY_COMMAND":      "/bin/bash",
			"WOOTTY_COMMAND_ARGS": `"unterminated`,
		},
		"/tmp/wootty/apps/server",
	)
	if err == nil {
		t.Fatal("expected parse error for invalid WOOTTY_COMMAND_ARGS")
	}
	if !strings.Contains(err.Error(), "Invalid WOOTTY_COMMAND_ARGS") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHelpTextContainsCoreUsageAndFlags(t *testing.T) {
	help := HelpText("wootty")
	required := []string{
		"Usage:",
		"wootty run [flags] [command [args...]]",
		"-h, --help",
		"--detached-ttl-ms",
		"--history-bytes",
		"WOOTTY_COMMAND_ARGS",
	}

	for _, snippet := range required {
		if !strings.Contains(help, snippet) {
			t.Fatalf("expected help text to contain %q", snippet)
		}
	}
}
