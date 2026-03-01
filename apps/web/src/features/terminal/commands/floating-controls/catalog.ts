import { COMMAND_CATALOG } from "../catalog";
import type { FloatingControlCommand } from "./actions";
import type {
  FloatingControlCatalogEntry,
  FloatingControlMetadataKey,
  FloatingControlPolicy,
  FloatingControlRegistryEntry,
} from "./contracts";
import type { FloatingControlMetadata } from "./floating-control-metadata";

function buildFloatingControlCatalog(): readonly FloatingControlCatalogEntry[] {
  return COMMAND_CATALOG.flatMap((entry) => {
    if (!("floatingControl" in entry)) {
      return [];
    }

    return [
      {
        action: entry.id,
        ...entry.floatingControl,
      },
    ];
  });
}

export const FLOATING_CONTROL_CATALOG = buildFloatingControlCatalog();

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  FLOATING_CONTROL_CATALOG.map((entry) => ({
    testId: entry.testId,
    metadataKey: entry.metadataKey,
    action: entry.action,
  }));

type FloatingControlLookup = {
  metadataByAction: ReadonlyMap<
    FloatingControlCommand,
    FloatingControlMetadata
  >;
  policyByAction: ReadonlyMap<FloatingControlCommand, FloatingControlPolicy>;
  metadataByKey: ReadonlyMap<
    FloatingControlMetadataKey,
    FloatingControlMetadata
  >;
};

function buildFloatingControlLookup(
  entries: readonly FloatingControlCatalogEntry[],
): FloatingControlLookup {
  const metadataByAction = new Map<
    FloatingControlCommand,
    FloatingControlMetadata
  >();
  const policyByAction = new Map<
    FloatingControlCommand,
    FloatingControlPolicy
  >();
  const metadataByKey = new Map<
    FloatingControlMetadataKey,
    FloatingControlMetadata
  >();

  for (const entry of entries) {
    insertUnique(
      metadataByAction,
      entry.action,
      entry.metadata,
      "floating-control action metadata",
    );
    insertUnique(
      policyByAction,
      entry.action,
      entry.policy,
      "floating-control action policy",
    );
    insertUnique(
      metadataByKey,
      entry.metadataKey,
      entry.metadata,
      "floating-control metadata key",
    );
  }

  return { metadataByAction, policyByAction, metadataByKey };
}

function insertUnique<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  label: string,
): void {
  if (map.has(key)) {
    throw new Error(`Duplicate ${label} '${String(key)}'.`);
  }
  map.set(key, value);
}

function requireLookupValue<K, V>(
  map: ReadonlyMap<K, V>,
  key: K,
  label: string,
): V {
  const value = map.get(key);
  if (value !== undefined) {
    return value;
  }

  throw new Error(`Unknown ${label} '${String(key)}'.`);
}

const FLOATING_CONTROL_LOOKUP = buildFloatingControlLookup(
  FLOATING_CONTROL_CATALOG,
);

export function floatingControlMetadata(
  command: FloatingControlCommand,
): FloatingControlMetadata {
  return requireLookupValue(
    FLOATING_CONTROL_LOOKUP.metadataByAction,
    command,
    "floating control action metadata",
  );
}

export function floatingControlPolicy(
  command: FloatingControlCommand,
): FloatingControlPolicy {
  return requireLookupValue(
    FLOATING_CONTROL_LOOKUP.policyByAction,
    command,
    "floating control action policy",
  );
}

export function floatingControlDescriptor(
  metadataKey: FloatingControlMetadataKey,
): FloatingControlMetadata {
  return requireLookupValue(
    FLOATING_CONTROL_LOOKUP.metadataByKey,
    metadataKey,
    "floating control metadata",
  );
}
