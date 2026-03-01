package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

type wireContract struct {
	Version   int `json:"version"`
	Dimension struct {
		Min int `json:"min"`
		Max int `json:"max"`
	} `json:"dimension"`
	ClientMessages struct {
		Types   []string `json:"types"`
		Schemas map[string]struct {
			Required []string `json:"required"`
			Optional []string `json:"optional"`
		} `json:"schemas"`
	} `json:"client_messages"`
	ServerMessages struct {
		Types   []string `json:"types"`
		Schemas map[string]struct {
			Required []string `json:"required"`
			Optional []string `json:"optional"`
		} `json:"schemas"`
	} `json:"server_messages"`
	ServerErrors struct {
		KnownCodes        []string `json:"known_codes"`
		UnknownCodePolicy string   `json:"unknown_code_policy"`
	} `json:"server_errors"`
}

type httpRoutesContract struct {
	SessionsHTTP string `json:"sessions_http"`
	TerminalWS   string `json:"terminal_ws"`
}

type sessionsContract struct {
	EnvelopeField string `json:"envelope_field"`
	Snapshot      struct {
		Required []string `json:"required"`
		Optional []string `json:"optional"`
	} `json:"snapshot"`
}

func loadWireContract(t *testing.T) wireContract {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to discover test file path")
	}
	contractPath := filepath.Clean(
		filepath.Join(filepath.Dir(file), "../../../../contracts/terminal-wire-contract.json"),
	)
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("read contract: %v", err)
	}
	var contract wireContract
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatalf("decode contract: %v", err)
	}
	return contract
}

func loadHTTPRoutesContract(t *testing.T) httpRoutesContract {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to discover test file path")
	}
	contractPath := filepath.Clean(
		filepath.Join(filepath.Dir(file), "../../../../contracts/http-routes.json"),
	)
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("read routes contract: %v", err)
	}
	var contract httpRoutesContract
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatalf("decode routes contract: %v", err)
	}
	return contract
}

func loadSessionsContract(t *testing.T) sessionsContract {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to discover test file path")
	}
	contractPath := filepath.Clean(
		filepath.Join(filepath.Dir(file), "../../../../contracts/sessions-contract.json"),
	)
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("read sessions contract: %v", err)
	}
	var contract sessionsContract
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatalf("decode sessions contract: %v", err)
	}
	return contract
}

func TestWireContractClientMessageTypes(t *testing.T) {
	contract := loadWireContract(t)
	if !reflect.DeepEqual(contract.ClientMessages.Types, ClientMessageTypes) {
		t.Fatalf("client message types mismatch: contract=%v code=%v", contract.ClientMessages.Types, ClientMessageTypes)
	}
}

func TestWireContractClientMessageSchemas(t *testing.T) {
	contract := loadWireContract(t)
	expect := map[string]struct {
		required []string
		optional []string
	}{
		ClientMessageTypeAttach: {
			required: []string{"type", "version", "cols", "rows"},
			optional: []string{"sessionId", "watch"},
		},
		ClientMessageTypeInput: {
			required: []string{"type", "data"},
			optional: []string{},
		},
		ClientMessageTypeResize: {
			required: []string{"type", "cols", "rows"},
			optional: []string{},
		},
		ClientMessageTypePing: {
			required: []string{"type"},
			optional: []string{},
		},
	}
	for messageType, schema := range expect {
		actual, ok := contract.ClientMessages.Schemas[messageType]
		if !ok {
			t.Fatalf("missing client schema for %q", messageType)
		}
		if !reflect.DeepEqual(actual.Required, schema.required) {
			t.Fatalf("client schema required mismatch for %q: contract=%v code=%v", messageType, actual.Required, schema.required)
		}
		if !reflect.DeepEqual(actual.Optional, schema.optional) {
			t.Fatalf("client schema optional mismatch for %q: contract=%v code=%v", messageType, actual.Optional, schema.optional)
		}
	}
}

func TestWireContractServerMessageTypes(t *testing.T) {
	contract := loadWireContract(t)
	if !reflect.DeepEqual(contract.ServerMessages.Types, ServerMessageTypes) {
		t.Fatalf("server message types mismatch: contract=%v code=%v", contract.ServerMessages.Types, ServerMessageTypes)
	}
}

func TestWireContractServerMessageSchemas(t *testing.T) {
	contract := loadWireContract(t)
	expect := map[string]struct {
		required []string
		optional []string
	}{
		ServerMessageTypeReady: {
			required: []string{"type", "sessionId", "readOnly", "version"},
			optional: []string{},
		},
		ServerMessageTypeOutput: {
			required: []string{"type", "data"},
			optional: []string{},
		},
		ServerMessageTypeExit: {
			required: []string{"type", "code", "signal"},
			optional: []string{},
		},
		ServerMessageTypeError: {
			required: []string{"type", "message"},
			optional: []string{"code", "rawCode"},
		},
		ServerMessageTypePong: {
			required: []string{"type"},
			optional: []string{},
		},
	}
	for messageType, schema := range expect {
		actual, ok := contract.ServerMessages.Schemas[messageType]
		if !ok {
			t.Fatalf("missing server schema for %q", messageType)
		}
		if !reflect.DeepEqual(actual.Required, schema.required) {
			t.Fatalf("server schema required mismatch for %q: contract=%v code=%v", messageType, actual.Required, schema.required)
		}
		if !reflect.DeepEqual(actual.Optional, schema.optional) {
			t.Fatalf("server schema optional mismatch for %q: contract=%v code=%v", messageType, actual.Optional, schema.optional)
		}
	}
}

func TestWireContractKnownServerErrorCodes(t *testing.T) {
	contract := loadWireContract(t)
	if !reflect.DeepEqual(contract.ServerErrors.KnownCodes, KnownServerErrorCodes) {
		t.Fatalf(
			"server error codes mismatch: contract=%v code=%v",
			contract.ServerErrors.KnownCodes,
			KnownServerErrorCodes,
		)
	}
	if contract.ServerErrors.UnknownCodePolicy != UnknownServerErrorCodePolicy {
		t.Fatalf("unknown server error code policy mismatch: %s", contract.ServerErrors.UnknownCodePolicy)
	}
}

func TestWireContractDimensionLimits(t *testing.T) {
	contract := loadWireContract(t)
	if contract.Version != WireContractVersion {
		t.Fatalf("wire contract version mismatch: contract=%d code=%d", contract.Version, WireContractVersion)
	}
	if contract.Dimension.Min != MinDimension || contract.Dimension.Max != MaxDimension {
		t.Fatalf(
			"dimension limits mismatch: contract=[%d,%d] code=[%d,%d]",
			contract.Dimension.Min,
			contract.Dimension.Max,
			MinDimension,
			MaxDimension,
		)
	}
}

func TestWireContractRoutes(t *testing.T) {
	contract := loadHTTPRoutesContract(t)
	if contract.SessionsHTTP != SessionsHTTPRoute || contract.TerminalWS != TerminalWSRoute {
		t.Fatalf(
			"route mismatch: contract=(%s,%s) code=(%s,%s)",
			contract.SessionsHTTP,
			contract.TerminalWS,
			SessionsHTTPRoute,
			TerminalWSRoute,
		)
	}
}

func TestSessionsContractParity(t *testing.T) {
	contract := loadSessionsContract(t)
	if contract.EnvelopeField != SessionsEnvelopeField {
		t.Fatalf("sessions envelope mismatch: contract=%q code=%q", contract.EnvelopeField, SessionsEnvelopeField)
	}
	if !reflect.DeepEqual(contract.Snapshot.Required, SessionSnapshotRequiredFields) {
		t.Fatalf(
			"sessions required fields mismatch: contract=%v code=%v",
			contract.Snapshot.Required,
			SessionSnapshotRequiredFields,
		)
	}
	if !reflect.DeepEqual(contract.Snapshot.Optional, SessionSnapshotOptionalFields) {
		t.Fatalf(
			"sessions optional fields mismatch: contract=%v code=%v",
			contract.Snapshot.Optional,
			SessionSnapshotOptionalFields,
		)
	}
}
