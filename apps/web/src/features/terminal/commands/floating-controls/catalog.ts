import {
  COMMAND_CATALOG,
  type FloatingControlIconToken,
  type FloatingControlMetadataKey,
  type FloatingControlPolicy,
} from "../catalog";
import type { FloatingControlCommand } from "./actions";
import type { FloatingControlMetadata } from "./floating-control-metadata";

type FloatingControlCatalogEntry = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  action: FloatingControlCommand;
  metadata: FloatingControlMetadata;
  policy: FloatingControlPolicy;
};

function hasFloatingControl(
  entry: (typeof COMMAND_CATALOG)[number],
): entry is (typeof COMMAND_CATALOG)[number] & {
  floatingControl: {
    testId: string;
    metadataKey: FloatingControlMetadataKey;
    metadata: FloatingControlMetadata;
    policy: FloatingControlPolicy;
  };
} {
  return typeof entry.floatingControl !== "undefined";
}

export const FLOATING_CONTROL_CATALOG: readonly FloatingControlCatalogEntry[] =
  COMMAND_CATALOG.filter(hasFloatingControl).map((entry) => ({
    testId: entry.floatingControl.testId,
    metadataKey: entry.floatingControl.metadataKey,
    action: entry.id as FloatingControlCommand,
    metadata: entry.floatingControl.metadata,
    policy: entry.floatingControl.policy,
  })) as readonly FloatingControlCatalogEntry[];

export type { FloatingControlIconToken, FloatingControlMetadataKey };
