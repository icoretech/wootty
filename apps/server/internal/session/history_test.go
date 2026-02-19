package session

import "testing"

func TestHistoryBufferTrimsOldChunks(t *testing.T) {
	history := NewHistoryBuffer(5)
	history.Append("abc")
	history.Append("def")

	if got := history.Dump(); got != "def" {
		t.Fatalf("expected trimmed history to keep latest chunk, got %q", got)
	}
}

func TestHistoryBufferRetainsWithinLimit(t *testing.T) {
	history := NewHistoryBuffer(12)
	history.Append("abc")
	history.Append("def")

	if got := history.Dump(); got != "abcdef" {
		t.Fatalf("expected full history, got %q", got)
	}
}
