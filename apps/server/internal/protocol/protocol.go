package protocol

import (
	"encoding/json"
	"errors"
)

const (
	minDimension = 1
	maxDimension = 2000
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

func (AttachMessage) Type() string { return "attach" }

type InputMessage struct {
	Data string
}

func (InputMessage) Type() string { return "input" }

type ResizeMessage struct {
	Cols int
	Rows int
}

func (ResizeMessage) Type() string { return "resize" }

type PingMessage struct{}

func (PingMessage) Type() string { return "ping" }

type envelope struct {
	Type      string  `json:"type"`
	SessionID string  `json:"sessionId,omitempty"`
	Cols      *int    `json:"cols,omitempty"`
	Rows      *int    `json:"rows,omitempty"`
	Data      *string `json:"data,omitempty"`
	Watch     *bool   `json:"watch,omitempty"`
}

func ParseClientMessage(raw []byte) (ClientMessage, error) {
	var msg envelope
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, errors.New("Invalid message")
	}

	switch msg.Type {
	case "attach":
		if msg.Cols == nil || msg.Rows == nil {
			return nil, errors.New("Invalid message")
		}
		if !validDimension(*msg.Cols) || !validDimension(*msg.Rows) {
			return nil, errors.New("Invalid message")
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
	case "input":
		if msg.Data == nil {
			return nil, errors.New("Invalid message")
		}
		return InputMessage{Data: *msg.Data}, nil
	case "resize":
		if msg.Cols == nil || msg.Rows == nil {
			return nil, errors.New("Invalid message")
		}
		if !validDimension(*msg.Cols) || !validDimension(*msg.Rows) {
			return nil, errors.New("Invalid message")
		}
		return ResizeMessage{Cols: *msg.Cols, Rows: *msg.Rows}, nil
	case "ping":
		return PingMessage{}, nil
	default:
		return nil, errors.New("Invalid message")
	}
}

func validDimension(value int) bool {
	return value >= minDimension && value <= maxDimension
}
