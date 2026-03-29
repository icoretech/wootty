package protocol

import (
	"encoding/json"
	"errors"
	"strings"
)

var (
	ErrInvalidMessage         = errors.New("invalid message")
	ErrUnsupportedWireVersion = errors.New("unsupported wire contract version")
)

type ClientMessage interface {
	Type() string
}

type AttachMessage struct {
	SessionID string
	Cols      int
	Rows      int
	Watch     bool
}

func (AttachMessage) Type() string { return ClientMessageTypeAttach }

type InputMessage struct {
	Data string
}

func (InputMessage) Type() string { return ClientMessageTypeInput }

type ResizeMessage struct {
	Cols int
	Rows int
}

func (ResizeMessage) Type() string { return ClientMessageTypeResize }

type PingMessage struct{}

func (PingMessage) Type() string { return ClientMessageTypePing }

type RenameMessage struct {
	Name string
}

func (RenameMessage) Type() string { return ClientMessageTypeRename }

type envelope struct {
	Type      string  `json:"type"`
	Version   *int    `json:"version,omitempty"`
	SessionID string  `json:"sessionId,omitempty"`
	Cols      *int    `json:"cols,omitempty"`
	Rows      *int    `json:"rows,omitempty"`
	Data      *string `json:"data,omitempty"`
	Watch     *bool   `json:"watch,omitempty"`
	Name      *string `json:"name,omitempty"`
}

func ParseClientMessage(raw []byte) (ClientMessage, error) {
	var msg envelope
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, ErrInvalidMessage
	}

	switch msg.Type {
	case ClientMessageTypeAttach:
		if msg.Cols == nil || msg.Rows == nil {
			return nil, ErrInvalidMessage
		}
		if !validDimension(*msg.Cols) || !validDimension(*msg.Rows) {
			return nil, ErrInvalidMessage
		}
		if msg.Version == nil || *msg.Version != WireContractVersion {
			return nil, ErrUnsupportedWireVersion
		}
		watch := false
		if msg.Watch != nil {
			watch = *msg.Watch
		}
		return AttachMessage{
			SessionID: msg.SessionID,
			Cols:      *msg.Cols,
			Rows:      *msg.Rows,
			Watch:     watch,
		}, nil
	case ClientMessageTypeInput:
		if msg.Data == nil {
			return nil, ErrInvalidMessage
		}
		return InputMessage{Data: *msg.Data}, nil
	case ClientMessageTypeResize:
		if msg.Cols == nil || msg.Rows == nil {
			return nil, ErrInvalidMessage
		}
		if !validDimension(*msg.Cols) || !validDimension(*msg.Rows) {
			return nil, ErrInvalidMessage
		}
		return ResizeMessage{Cols: *msg.Cols, Rows: *msg.Rows}, nil
	case ClientMessageTypePing:
		return PingMessage{}, nil
	case ClientMessageTypeRename:
		if msg.Name == nil {
			return nil, ErrInvalidMessage
		}
		name := strings.TrimSpace(*msg.Name)
		if name == "" {
			return nil, ErrInvalidMessage
		}
		runes := []rune(name)
		if len(runes) > 32 {
			name = string(runes[:32])
		}
		return RenameMessage{Name: name}, nil
	default:
		return nil, ErrInvalidMessage
	}
}

func validDimension(value int) bool {
	return value >= MinDimension && value <= MaxDimension
}
