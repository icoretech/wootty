package config

import (
	"errors"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
)

const (
	DefaultPort          = 8080
	DefaultHistoryBytes  = 5 * 1024 * 1024
	DefaultDetachedTTLMS = 86_400_000
	DefaultHost          = "0.0.0.0"
)

var ErrHelpRequested = errors.New("help requested")

type RuntimeConfig struct {
	Host           string
	Port           int
	DetachedTTLMS  int
	HistoryBytes   int
	FakePTY        bool
	Command        string
	Args           []string
	Cwd            string
	Env            map[string]string
	StaticDir      string
	AuthToken      string
	AllowedOrigins []string
}

func ParseRunConfig(argv []string, env map[string]string, cwd string) (RuntimeConfig, error) {
	args := append([]string(nil), argv...)
	if len(args) > 0 && args[0] == "run" {
		args = args[1:]
	}

	host := normalizeHost(env["WOOTTY_HOST"], DefaultHost)
	port := parsePositiveInt(env["WOOTTY_PORT"], DefaultPort)
	if strings.TrimSpace(env["WOOTTY_RECONNECT_GRACE_MS"]) != "" {
		return RuntimeConfig{}, errors.New(
			"WOOTTY_RECONNECT_GRACE_MS has been removed; use WOOTTY_DETACHED_TTL_MS",
		)
	}
	detachedTTLMS := parseNonNegativeInt(env["WOOTTY_DETACHED_TTL_MS"], DefaultDetachedTTLMS)
	historyBytes := parsePositiveInt(env["WOOTTY_HISTORY_BYTES"], DefaultHistoryBytes)

	commandParts := make([]string, 0)

	for i := 0; i < len(args); i++ {
		token := args[i]

		switch token {
		case "-n", "--naked":
			continue
		case "-h", "--help":
			return RuntimeConfig{}, ErrHelpRequested
		case "-p", "--port":
			i++
			if i < len(args) {
				port = parsePositiveInt(args[i], port)
			}
			continue
		case "--host":
			i++
			if i < len(args) && strings.TrimSpace(args[i]) != "" {
				host = strings.TrimSpace(args[i])
			}
			continue
		case "--detached-ttl-ms":
			i++
			if i < len(args) {
				detachedTTLMS = parseNonNegativeInt(args[i], detachedTTLMS)
			}
			continue
		case "--history-bytes":
			i++
			if i < len(args) {
				historyBytes = parsePositiveInt(args[i], historyBytes)
			}
			continue
		default:
			if strings.HasPrefix(token, "-") {
				return RuntimeConfig{}, errors.New("Unknown flag: " + token)
			}
			commandParts = append([]string(nil), args[i:]...)
			i = len(args)
		}
	}

	if len(commandParts) == 0 {
		if envCommand, ok := env["WOOTTY_COMMAND"]; ok && strings.TrimSpace(envCommand) != "" {
			commandParts = append(commandParts, envCommand)
			commandArgs, parseErr := splitArgs(env["WOOTTY_COMMAND_ARGS"])
			if parseErr != nil {
				return RuntimeConfig{}, errors.New("Invalid WOOTTY_COMMAND_ARGS: " + parseErr.Error())
			}
			commandParts = append(commandParts, commandArgs...)
		}
	}

	if len(commandParts) == 0 {
		shell := getOrDefault(env["SHELL"], "bash")
		commandParts = []string{shell}
	}

	execEnv := cloneEnv(env)
	if strings.TrimSpace(execEnv["TERM"]) == "" {
		execEnv["TERM"] = "xterm-256color"
	}
	if strings.TrimSpace(execEnv["HOME"]) == "" {
		if home, err := userHomeDir(); err == nil && home != "" {
			execEnv["HOME"] = home
		}
	}

	staticDir := strings.TrimSpace(env["WOOTTY_STATIC_DIR"])
	if staticDir == "" {
		staticDir = detectStaticDir(cwd)
	}

	authToken := strings.TrimSpace(env["WOOTTY_AUTH_TOKEN"])

	return RuntimeConfig{
		Host:           host,
		Port:           port,
		DetachedTTLMS:  detachedTTLMS,
		HistoryBytes:   historyBytes,
		FakePTY:        env["WOOTTY_FAKE_PTY"] == "1",
		Command:        commandParts[0],
		Args:           append([]string(nil), commandParts[1:]...),
		Cwd:            getOrDefault(env["WOOTTY_CWD"], cwd),
		Env:            execEnv,
		StaticDir:      staticDir,
		AuthToken:      authToken,
		AllowedOrigins: parseCSVList(env["WOOTTY_ALLOWED_ORIGINS"]),
	}, nil
}

func ReadSystemConfig(argv []string) (RuntimeConfig, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return RuntimeConfig{}, err
	}

	return ParseRunConfig(argv, envMapFromSlice(os.Environ()), cwd)
}

func HelpText(programName string) string {
	name := strings.TrimSpace(programName)
	if name == "" {
		name = "wootty"
	}

	return fmt.Sprintf(
		`Usage:
  %[1]s run [flags] [command [args...]]
  %[1]s [flags] [command [args...]]

Examples:
  %[1]s run bash
  %[1]s run /usr/bin/ssh user@example.com
  %[1]s run --port 9090 --host 127.0.0.1 bash

Flags:
  -h, --help                  Show this help and exit
  -p, --port <port>           HTTP/WebSocket listen port (default 8080)
      --host <host>           Bind address (default 0.0.0.0)
      --detached-ttl-ms <ms>  Detached session hard TTL in milliseconds (default 86400000; 0 disables)
      --history-bytes <bytes> Replay buffer size in bytes (default 5242880)
      --naked                 Compatibility no-op flag accepted for legacy callers

Environment overrides:
  WOOTTY_HOST
  WOOTTY_PORT
  WOOTTY_DETACHED_TTL_MS
  WOOTTY_HISTORY_BYTES
  WOOTTY_COMMAND
  WOOTTY_COMMAND_ARGS
  WOOTTY_CWD
  WOOTTY_STATIC_DIR
  WOOTTY_AUTH_TOKEN
  WOOTTY_ALLOWED_ORIGINS
  WOOTTY_FAKE_PTY
`,
		name,
	)
}

func parsePositiveInt(value string, fallback int) int {
	if strings.TrimSpace(value) == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func parseNonNegativeInt(value string, fallback int) int {
	if strings.TrimSpace(value) == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return fallback
	}

	return parsed
}

func splitArgs(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	parts := make([]string, 0)
	var current strings.Builder
	tokenStarted := false
	inSingleQuote := false
	inDoubleQuote := false
	escaped := false

	flush := func() {
		parts = append(parts, current.String())
		current.Reset()
		tokenStarted = false
	}

	for _, r := range value {
		if escaped {
			current.WriteRune(r)
			tokenStarted = true
			escaped = false
			continue
		}

		if inSingleQuote {
			if r == '\'' {
				inSingleQuote = false
				tokenStarted = true
				continue
			}
			current.WriteRune(r)
			tokenStarted = true
			continue
		}

		if inDoubleQuote {
			switch r {
			case '"':
				inDoubleQuote = false
				tokenStarted = true
			case '\\':
				escaped = true
				tokenStarted = true
			default:
				current.WriteRune(r)
				tokenStarted = true
			}
			continue
		}

		if unicode.IsSpace(r) {
			if tokenStarted {
				flush()
			}
			continue
		}

		switch r {
		case '\'':
			inSingleQuote = true
			tokenStarted = true
		case '"':
			inDoubleQuote = true
			tokenStarted = true
		case '\\':
			escaped = true
			tokenStarted = true
		default:
			current.WriteRune(r)
			tokenStarted = true
		}
	}

	if escaped {
		return nil, errors.New("unterminated escape")
	}
	if inSingleQuote || inDoubleQuote {
		return nil, errors.New("unterminated quote")
	}
	if tokenStarted {
		flush()
	}

	return parts, nil
}

func cloneEnv(input map[string]string) map[string]string {
	out := make(map[string]string, len(input))
	for k, v := range input {
		out[k] = v
	}
	return out
}

func envMapFromSlice(items []string) map[string]string {
	result := make(map[string]string, len(items))
	for _, item := range items {
		parts := strings.SplitN(item, "=", 2)
		key := parts[0]
		value := ""
		if len(parts) == 2 {
			value = parts[1]
		}
		result[key] = value
	}
	return result
}

func userHomeDir() (string, error) {
	usr, err := user.Current()
	if err != nil {
		return "", err
	}
	return usr.HomeDir, nil
}

func getOrDefault(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func normalizeHost(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func parseCSVList(value string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parts := strings.Split(trimmed, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		items = append(items, item)
	}
	if len(items) == 0 {
		return nil
	}
	return items
}

func detectStaticDir(cwd string) string {
	candidates := []string{
		filepath.Join(cwd, "..", "web", "dist"),
		filepath.Join(cwd, "apps", "web", "dist"),
		filepath.Join(cwd, "web", "dist"),
	}

	for _, candidate := range candidates {
		cleaned := filepath.Clean(candidate)
		if info, err := os.Stat(cleaned); err == nil && info.IsDir() {
			return cleaned
		}
	}

	return filepath.Clean(candidates[0])
}
