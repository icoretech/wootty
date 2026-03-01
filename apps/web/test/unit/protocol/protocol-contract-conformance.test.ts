import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseServerMessageWithReason } from "../../../src/features/terminal/protocol/terminal-protocol";
import { TERMINAL_WIRE_CONTRACT_VERSION } from "../../../src/features/terminal/protocol/terminal-wire-schema";

type ServerSchema = {
  required: string[];
  optional: string[];
};

type WireContract = {
  server_messages: {
    types: string[];
    schemas: Record<string, ServerSchema>;
  };
};

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const OPTIONAL_FIELD_VALUES: Record<string, Record<string, unknown>> = {
  error: {
    code: "session_not_found",
    rawCode: "legacy_server_code",
  },
};

function loadWireContract(): WireContract {
  const contractPath = resolve(
    REPO_ROOT,
    "contracts/terminal-wire-contract.json",
  );
  if (!existsSync(contractPath)) {
    throw new Error("Unable to locate contracts/terminal-wire-contract.json");
  }
  return JSON.parse(readFileSync(contractPath, "utf8")) as WireContract;
}

function baseServerPayload(type: string): Record<string, unknown> {
  switch (type) {
    case "ready":
      return {
        type,
        sessionId: "session-1",
        readOnly: false,
        version: TERMINAL_WIRE_CONTRACT_VERSION,
      };
    case "output":
      return {
        type,
        data: "hello",
      };
    case "exit":
      return {
        type,
        code: 0,
        signal: 15,
      };
    case "error":
      return {
        type,
        message: "server error",
      };
    case "pong":
      return {
        type,
      };
    default:
      throw new Error(`No conformance payload template for '${type}'.`);
  }
}

function parsePayload(payload: Record<string, unknown>) {
  return parseServerMessageWithReason(JSON.stringify(payload));
}

function expectParsedMessage(payload: Record<string, unknown>, type: string) {
  const parsed = parsePayload(payload);
  expect(parsed).toHaveProperty("message");
  if ("message" in parsed) {
    expect(parsed.message.type).toBe(type);
  }
}

function expectParseFailure(payload: Record<string, unknown>) {
  const parsed = parsePayload(payload);
  expect(parsed).toHaveProperty("failure");
}

describe("protocol contract conformance", () => {
  it("accepts a valid payload for every server message type in the contract", () => {
    const contract = loadWireContract();
    for (const type of contract.server_messages.types) {
      expectParsedMessage(baseServerPayload(type), type);
    }
  });

  it("rejects payloads missing each required contract field", () => {
    const contract = loadWireContract();
    for (const type of contract.server_messages.types) {
      const schema = contract.server_messages.schemas[type];
      for (const requiredField of schema.required) {
        const payload = baseServerPayload(type);
        delete payload[requiredField];
        expectParseFailure(payload);
      }
    }
  });

  it("accepts optional field permutations declared by the contract", () => {
    const contract = loadWireContract();
    for (const type of contract.server_messages.types) {
      const schema = contract.server_messages.schemas[type];
      const optionalValues = OPTIONAL_FIELD_VALUES[type];
      if (!optionalValues || schema.optional.length === 0) {
        continue;
      }

      const payloadWithAllOptionals = {
        ...baseServerPayload(type),
        ...optionalValues,
      };
      expectParsedMessage(payloadWithAllOptionals, type);

      for (const optionalField of schema.optional) {
        if (!(optionalField in optionalValues)) {
          continue;
        }
        expectParsedMessage(
          {
            ...baseServerPayload(type),
            [optionalField]: optionalValues[optionalField],
          },
          type,
        );
      }
    }
  });
});
