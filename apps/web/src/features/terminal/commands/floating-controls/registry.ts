import type { FloatingControlCommand } from "./actions";
import {
  FLOATING_CONTROL_CATALOG,
  type FloatingControlMetadataKey,
} from "./catalog";

type FloatingControlRegistryEntry = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  action: FloatingControlCommand;
};

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  FLOATING_CONTROL_CATALOG.map((entry) => ({
    testId: entry.testId,
    metadataKey: entry.metadataKey,
    action: entry.action,
  })) as readonly FloatingControlRegistryEntry[];
