package session

import (
	"strings"
	"syscall"
	"testing"
	"testing/synctest"
	"time"
	"unicode/utf8"
)

func TestHistoryKeepsTailOfOversizedOutput(t *testing.T) {
	history := NewHistoryBuffer(5)
	history.Append("abcdefgh")
	if got := history.Dump(); got != "defgh" {
		t.Fatalf("expected newest output bytes, got %q", got)
	}
}

func TestHistoryIgnoresEmptyOutput(t *testing.T) {
	history := NewHistoryBuffer(5)
	for range 1000 {
		history.Append("")
	}
	if len(history.chunks) != 0 {
		t.Fatalf("empty output allocated %d retained chunks", len(history.chunks))
	}
}

func TestExpiredCleanupDoesNotRemoveReattachedSession(t *testing.T) {
	manager := NewManager(ManagerOptions{FakePTY: true, HistoryBytes: 1024, DetachedTTL: time.Hour, ProcessOptions: ProcessOptions{Command: "sh"}})
	defer manager.Shutdown()
	serverA, _, closeA := newWebsocketPair(t)
	defer closeA()
	attached, err := manager.Attach("", serverA, 80, 24, false)
	if err != nil {
		t.Fatal(err)
	}
	manager.Detach(attached.SessionID, serverA)
	serverB, _, closeB := newWebsocketPair(t)
	defer closeB()
	if _, err := manager.Attach(attached.SessionID, serverB, 80, 24, false); err != nil {
		t.Fatal(err)
	}
	manager.cleanup(attached.SessionID, 1)
	if sessions := manager.ListSessions(); len(sessions) != 1 || !sessions[0].HasController {
		t.Fatalf("expired cleanup removed reattached session: %#v", sessions)
	}
}

func TestPtyPreservesCompleteOutputWhenCommandExits(t *testing.T) {
	process, err := NewPtyProcess(ProcessOptions{Command: "sh", Args: []string{"-c", "printf '%s' '" + strings.Repeat("x", 32000) + "'"}, Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer process.Close()
	var output strings.Builder
	for chunk := range process.Data() {
		output.WriteString(chunk)
	}
	if output.Len() != 32000 {
		t.Fatalf("PTY exit lost output: got %d bytes", output.Len())
	}
}

func TestPtyOutputPreservesUTF8AcrossReadBoundaries(t *testing.T) {
	expected := strings.Repeat("€", 8000) + "🌍"
	process, err := NewPtyProcess(ProcessOptions{Command: "sh", Args: []string{"-c", "printf '%s' '" + expected + "'"}, Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer process.Close()
	var output strings.Builder
	for chunk := range process.Data() {
		if !utf8.ValidString(chunk) {
			t.Fatalf("output split a UTF-8 code point: chunk length %d", len(chunk))
		}
		output.WriteString(chunk)
	}
	if output.String() != expected {
		t.Fatalf("output changed: got %d bytes, want %d", output.Len(), len(expected))
	}
}

func TestFakeProcessCloseInterruptsFullOutputBuffer(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		process := NewFakeProcess(ProcessOptions{Command: "sh"})
		written := make(chan struct{})
		go func() { _ = process.Write(strings.Repeat("x", 4096)); close(written) }()
		synctest.Wait()
		closed := make(chan struct{})
		go func() { _ = process.Close(); close(closed) }()
		select {
		case <-closed:
		case <-time.After(time.Second):
			t.Fatal("close blocked behind a full output queue")
		}
		select {
		case <-written:
		case <-time.After(time.Second):
			t.Fatal("writer did not stop after close")
		}
	})
}

func TestManagerRejectsAttachAfterShutdown(t *testing.T) {
	manager := NewManager(ManagerOptions{FakePTY: true, HistoryBytes: 1024, ProcessOptions: ProcessOptions{Command: "sh"}})
	manager.Shutdown()
	server, _, closePair := newWebsocketPair(t)
	defer closePair()
	if _, err := manager.Attach("", server, 80, 24, false); err == nil {
		t.Fatal("shutdown manager created another process")
	}
}

func TestPtyCloseTerminatesCommandIgnoringHangup(t *testing.T) {
	process, err := NewPtyProcess(ProcessOptions{Command: "sh", Args: []string{"-c", "trap '' HUP TERM; printf ready; while :; do sleep 10; done"}, Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Kill(-process.cmd.Process.Pid, syscall.SIGKILL)
	if !waitForProcessOutputContains(process.Data(), "ready", time.Second) {
		t.Fatal("command did not initialize signal traps")
	}
	if err := process.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case exit := <-process.Exit():
		if exit.Signal != int(syscall.SIGKILL) {
			t.Fatalf("unexpected exit after close: %+v", exit)
		}
	case <-time.After(time.Second):
		t.Fatal("closed PTY left command running")
	}
}
