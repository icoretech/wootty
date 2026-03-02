package config

import (
	"errors"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	DefaultPort             = 8080
	DefaultHistoryBytes     = 5 * 1024 * 1024
	DefaultReconnectGraceMS = 0
	DefaultDetachedTTLMS    = 86_400_000
	DefaultHost             = "0.0.0.0"
)

type RuntimeConfig struct {
	Host             string
	Port             int
	ReconnectGraceMS int
	DetachedTTLMS    int
	HistoryBytes     int
	FakePTY          bool
	Command          string
	Args             []string
	Cwd              string
	Env              map[string]string
	StaticDir        string
	AuthToken        string
	AllowedOrigins   []string
}

func ParseRunConfig(argv []string, env map[string]string, cwd string) (RuntimeConfig, error) {
	args := append([]string(nil), argv...)
	if len(args) > 0 && args[0] == "run" {
		args = args[1:]
	}

	host := getOrDefault(env["WOOTTY_HOST"], DefaultHost)
	port := parsePositiveInt(env["WOOTTY_PORT"], DefaultPort)
	reconnectGraceMS := parseNonNegativeInt(env["WOOTTY_RECONNECT_GRACE_MS"], DefaultReconnectGraceMS)
	detachedTTLMS := parseNonNegativeInt(env["WOOTTY_DETACHED_TTL_MS"], DefaultDetachedTTLMS)
	historyBytes := parsePositiveInt(env["WOOTTY_HISTORY_BYTES"], DefaultHistoryBytes)

	commandParts := make([]string, 0)

	for i := 0; i < len(args); i++ {
		token := args[i]

		switch token {
		case "-n", "--naked":
			continue
		case "-p", "--port":
			i++
			if i < len(args) {
				port = parsePositiveInt(args[i], port)
			}
			continue
		case "--host":
			i++
			if i < len(args) && strings.TrimSpace(args[i]) != "" {
				host = args[i]
			}
			continue
		case "--reconnect-grace-ms":
			i++
			if i < len(args) {
				reconnectGraceMS = parseNonNegativeInt(args[i], reconnectGraceMS)
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
			commandParts = append(commandParts, splitArgs(env["WOOTTY_COMMAND_ARGS"])...)
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
		Host:             host,
		Port:             port,
		ReconnectGraceMS: reconnectGraceMS,
		DetachedTTLMS:    detachedTTLMS,
		HistoryBytes:     historyBytes,
		FakePTY:          env["WOOTTY_FAKE_PTY"] == "1",
		Command:          commandParts[0],
		Args:             append([]string(nil), commandParts[1:]...),
		Cwd:              getOrDefault(env["WOOTTY_CWD"], cwd),
		Env:              execEnv,
		StaticDir:        staticDir,
		AuthToken:        authToken,
		AllowedOrigins:   parseCSVList(env["WOOTTY_ALLOWED_ORIGINS"]),
	}, nil
}

func ReadSystemConfig(argv []string) (RuntimeConfig, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return RuntimeConfig{}, err
	}

	return ParseRunConfig(argv, envMapFromSlice(os.Environ()), cwd)
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

func splitArgs(value string) []string {
	parts := strings.Fields(value)
	if len(parts) == 0 {
		return nil
	}
	return parts
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
