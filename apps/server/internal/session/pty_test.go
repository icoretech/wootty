package session

import (
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestNewPtyProcessRequiresCommand(t *testing.T) {
	_, err := NewPtyProcess(ProcessOptions{})
	if err == nil {
		t.Fatal("expected error for missing command")
	}
}

func TestPtyProcessLifecycle(t *testing.T) {
	process, err := NewPtyProcess(ProcessOptions{
		Command: "sh",
		Args:    []string{},
		Cwd:     t.TempDir(),
		Env: map[string]string{
			"TERM": "xterm-256color",
			"HOME": t.TempDir(),
		},
		Cols: 80,
		Rows: 24,
	})
	if err != nil {
		t.Fatalf("failed to create pty process: %v", err)
	}
	defer process.Close()

	if err := process.Resize(100, 40); err != nil {
		t.Fatalf("failed to resize pty: %v", err)
	}

	if err := process.Write("echo pty-ok\r"); err != nil {
		t.Fatalf("failed to write to pty: %v", err)
	}
	if !waitForProcessOutputContains(process.Data(), "pty-ok", 3*time.Second) {
		t.Fatal("expected process output to contain echoed marker")
	}

	if err := process.Write("exit\r"); err != nil {
		t.Fatalf("failed to write exit command: %v", err)
	}

	select {
	case exitInfo, ok := <-process.Exit():
		if !ok {
			t.Fatal("expected exit info channel to emit one value")
		}
		if exitInfo.Code != 0 {
			t.Fatalf("expected zero exit code, got %+v", exitInfo)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for pty process to exit")
	}
}

func TestPtyProcessKill(t *testing.T) {
	process, err := NewPtyProcess(ProcessOptions{
		Command: "sh",
		Args:    []string{"-c", "sleep 30"},
		Cwd:     t.TempDir(),
		Env: map[string]string{
			"TERM": "xterm-256color",
			"HOME": t.TempDir(),
		},
		Cols: 80,
		Rows: 24,
	})
	if err != nil {
		t.Fatalf("failed to create kill-test pty process: %v", err)
	}
	defer process.Close()

	if err := process.Kill(syscall.SIGTERM); err != nil {
		t.Fatalf("failed to kill pty process: %v", err)
	}

	select {
	case _, ok := <-process.Exit():
		if !ok {
			t.Fatal("expected exit event after kill")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for killed pty process to exit")
	}
}

func waitForProcessOutputContains(dataCh <-chan string, needle string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	var outputBuilder strings.Builder

	for time.Now().Before(deadline) {
		select {
		case chunk, ok := <-dataCh:
			if !ok {
				return strings.Contains(outputBuilder.String(), needle)
			}
			outputBuilder.WriteString(chunk)
			if strings.Contains(outputBuilder.String(), needle) {
				return true
			}
		case <-time.After(20 * time.Millisecond):
		}
	}

	return strings.Contains(outputBuilder.String(), needle)
}
