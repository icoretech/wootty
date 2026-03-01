import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TERMINAL_BACKEND_ROUTE } from "../../../src/features/terminal/protocol/generated-wire-contract";
import {
  TERMINAL_SERVER_ERROR_CODES,
  UNKNOWN_SERVER_ERROR_CODE_POLICY,
} from "../../../src/features/terminal/protocol/server-error-codes";
import {
  createAttachMessage,
  createResizeMessage,
} from "../../../src/features/terminal/protocol/terminal-client-messages";
import {
  TERMINAL_CLIENT_MESSAGE_TYPE,
  TERMINAL_DIMENSION_LIMIT,
  TERMINAL_SERVER_MESSAGE_TYPE,
  TERMINAL_WIRE_CONTRACT_VERSION,
} from "../../../src/features/terminal/protocol/terminal-wire-schema";

type WireContract = {
  version: number;
  dimension: {
    min: number;
    max: number;
  };
  client_messages: {
    types: string[];
    schemas: Record<
      string,
      {
        required: string[];
        optional: string[];
      }
    >;
  };
  server_messages: {
    types: string[];
    schemas: Record<
      string,
      {
        required: string[];
        optional: string[];
      }
    >;
  };
  server_errors: {
    known_codes: string[];
    unknown_code_policy: string;
  };
};

type HttpRoutesContract = {
  sessions_http: string;
  terminal_ws: string;
};

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

function loadWireContract(): WireContract {
  const contractPath = resolve(
    REPO_ROOT,
    "contracts/terminal-wire-contract.json",
  );
  if (!existsSync(contractPath)) {
    throw new Error("Unable to locate contracts/terminal-wire-contract.json");
  }
  const raw = readFileSync(contractPath, "utf8");
  return JSON.parse(raw) as WireContract;
}

function loadHttpRoutesContract(): HttpRoutesContract {
  const contractPath = resolve(REPO_ROOT, "contracts/http-routes.json");
  if (!existsSync(contractPath)) {
    throw new Error("Unable to locate contracts/http-routes.json");
  }
  const raw = readFileSync(contractPath, "utf8");
  return JSON.parse(raw) as HttpRoutesContract;
}

describe("terminal wire contract parity", () => {
  it("keeps client/server message kinds aligned with the contract file", () => {
    const contract = loadWireContract();
    expect(contract.client_messages.types).toEqual(
      Object.values(TERMINAL_CLIENT_MESSAGE_TYPE),
    );
    expect(contract.server_messages.types).toEqual(
      Object.values(TERMINAL_SERVER_MESSAGE_TYPE),
    );
  });

  it("keeps payload required/optional fields aligned with the contract file", () => {
    const contract = loadWireContract();
    expect(contract.client_messages.schemas).toEqual({
      attach: {
        required: ["type", "version", "cols", "rows"],
        optional: ["sessionId", "watch"],
      },
      input: {
        required: ["type", "data"],
        optional: [],
      },
      resize: {
        required: ["type", "cols", "rows"],
        optional: [],
      },
      ping: {
        required: ["type"],
        optional: [],
      },
    });

    expect(contract.server_messages.schemas).toEqual({
      ready: {
        required: ["type", "sessionId", "readOnly", "version"],
        optional: [],
      },
      output: {
        required: ["type", "data"],
        optional: [],
      },
      exit: {
        required: ["type", "code", "signal"],
        optional: [],
      },
      error: {
        required: ["type", "message"],
        optional: ["code", "rawCode"],
      },
      pong: {
        required: ["type"],
        optional: [],
      },
    });
  });

  it("keeps known error-code mapping and unknown fallback policy explicit", () => {
    const contract = loadWireContract();
    expect(contract.server_errors.known_codes).toEqual(
      TERMINAL_SERVER_ERROR_CODES,
    );
    expect(contract.server_errors.unknown_code_policy).toBe(
      UNKNOWN_SERVER_ERROR_CODE_POLICY,
    );
  });

  it("keeps terminal dimension limits aligned", () => {
    const contract = loadWireContract();
    expect(contract.version).toBe(TERMINAL_WIRE_CONTRACT_VERSION);
    expect(contract.dimension).toEqual({
      min: TERMINAL_DIMENSION_LIMIT.MIN,
      max: TERMINAL_DIMENSION_LIMIT.MAX,
    });
  });

  it("normalizes attach/resize dimensions to contract bounds", () => {
    expect(
      createAttachMessage({
        cols: 0,
        rows: 9_999,
        sessionId: null,
      }),
    ).toEqual(
      expect.objectContaining({
        type: TERMINAL_CLIENT_MESSAGE_TYPE.ATTACH,
        cols: TERMINAL_DIMENSION_LIMIT.MIN,
        rows: TERMINAL_DIMENSION_LIMIT.MAX,
      }),
    );
    expect(createResizeMessage(-10, 5000)).toEqual({
      type: TERMINAL_CLIENT_MESSAGE_TYPE.RESIZE,
      cols: TERMINAL_DIMENSION_LIMIT.MIN,
      rows: TERMINAL_DIMENSION_LIMIT.MAX,
    });
  });

  it("keeps API route ownership aligned", () => {
    const contract = loadHttpRoutesContract();
    expect(contract).toEqual({
      sessions_http: TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP,
      terminal_ws: TERMINAL_BACKEND_ROUTE.TERMINAL_WS,
    });
  });
});
