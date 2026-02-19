package protocol

import "testing"

func TestParseAttach(t *testing.T) {
	msg, err := ParseClientMessage([]byte(`{"type":"attach","sessionId":"abc","cols":120,"rows":40}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	attach, ok := msg.(AttachMessage)
	if !ok {
		t.Fatalf("expected AttachMessage, got %T", msg)
	}
	if attach.SessionID != "abc" || attach.Cols != 120 || attach.Rows != 40 {
		t.Fatalf("unexpected attach payload: %+v", attach)
	}
}

func TestParseInvalidDimension(t *testing.T) {
	_, err := ParseClientMessage([]byte(`{"type":"resize","cols":0,"rows":40}`))
	if err == nil {
		t.Fatal("expected invalid dimension error")
	}
}

func TestParsePing(t *testing.T) {
	msg, err := ParseClientMessage([]byte(`{"type":"ping"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := msg.(PingMessage); !ok {
		t.Fatalf("expected ping message, got %T", msg)
	}
}

func TestParseInputAndResize(t *testing.T) {
	inputMessage, err := ParseClientMessage([]byte(`{"type":"input","data":"ls -la"}`))
	if err != nil {
		t.Fatalf("unexpected input parse error: %v", err)
	}
	if _, ok := inputMessage.(InputMessage); !ok {
		t.Fatalf("expected input message type, got %T", inputMessage)
	}

	resizeMessage, err := ParseClientMessage([]byte(`{"type":"resize","cols":140,"rows":40}`))
	if err != nil {
		t.Fatalf("unexpected resize parse error: %v", err)
	}
	if _, ok := resizeMessage.(ResizeMessage); !ok {
		t.Fatalf("expected resize message type, got %T", resizeMessage)
	}
}

func TestParseInvalidPayloads(t *testing.T) {
	payloads := []string{
		`{"type":"unknown"}`,
		`{"type":"attach","cols":80}`,
		`{"type":"input"}`,
		`{"type":"resize","cols":80}`,
	}

	for _, payload := range payloads {
		if _, err := ParseClientMessage([]byte(payload)); err == nil {
			t.Fatalf("expected parse error for payload %s", payload)
		}
	}
}
