package session

import (
	"strings"
	"unicode/utf8"
)

type HistoryBuffer struct {
	maxBytes int
	chunks   []string
	bytes    int
}

func NewHistoryBuffer(maxBytes int) *HistoryBuffer {
	if maxBytes <= 0 {
		maxBytes = 1
	}
	return &HistoryBuffer{
		maxBytes: maxBytes,
		chunks:   make([]string, 0, 64),
	}
}

func (h *HistoryBuffer) Append(chunk string) {
	if chunk == "" {
		return
	}
	if len(chunk) > h.maxBytes {
		chunk = chunk[len(chunk)-h.maxBytes:]
		for len(chunk) > 0 && !utf8.RuneStart(chunk[0]) {
			chunk = chunk[1:]
		}
		chunk = strings.Clone(chunk)
	}
	chunkBytes := len(chunk)
	h.chunks = append(h.chunks, chunk)
	h.bytes += chunkBytes

	for h.bytes > h.maxBytes && len(h.chunks) > 0 {
		removed := h.chunks[0]
		h.chunks[0] = ""
		h.chunks = h.chunks[1:]
		h.bytes -= len(removed)
	}
}

func (h *HistoryBuffer) Dump() string {
	return strings.Join(h.chunks, "")
}
