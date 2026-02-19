package session

import "strings"

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
	chunkBytes := len([]byte(chunk))
	h.chunks = append(h.chunks, chunk)
	h.bytes += chunkBytes

	for h.bytes > h.maxBytes && len(h.chunks) > 0 {
		removed := h.chunks[0]
		h.chunks = h.chunks[1:]
		h.bytes -= len([]byte(removed))
	}
}

func (h *HistoryBuffer) Dump() string {
	return strings.Join(h.chunks, "")
}
