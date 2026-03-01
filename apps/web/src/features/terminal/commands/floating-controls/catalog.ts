import { TerminalBootstrapInvariantError } from "../../shared/errors/terminal-bootstrap-invariant";
import {
  COMMAND_FLOATING_CONTROL_METADATA,
  FLOATING_CONTROL_REGISTRY as COMMAND_FLOATING_CONTROL_REGISTRY,
} from "../definitions/command-manifest";
import type { FloatingControlCommand } from "./actions";
import type {
  FloatingControlCatalogEntry,
  FloatingControlMetadataKey,
  FloatingControlPolicy,
  FloatingControlRegistryEntry,
} from "./contracts";
import type { FloatingControlMetadata } from "./floating-control-metadata";

const FLOATING_CONTROL_POLICY: Record<
  FloatingControlMetadataKey,
  FloatingControlPolicy
> = {
  reconnect: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: () => "reconnect",
  },
  clear: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: () => "clear",
  },
  decreaseFont: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize <= model.fontSizeMin,
    resolveIcon: () => "fontDecrease",
  },
  increaseFont: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize >= model.fontSizeMax,
    resolveIcon: () => "fontIncrease",
  },
  resetFont: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize === model.defaultFontSize,
    resolveIcon: () => "fontReset",
  },
  fullscreen: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: (model) =>
      model.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
    resolveLabel: (model, defaultLabel) =>
      model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
    resolveTooltip: (model, defaultTooltip) =>
      model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
  },
};

type FloatingControlLookup = {
  policyByAction: ReadonlyMap<FloatingControlCommand, FloatingControlPolicy>;
  metadataByKey: ReadonlyMap<
    FloatingControlMetadataKey,
    FloatingControlMetadata
  >;
};

function buildFloatingControlCatalog(
  entries: readonly FloatingControlRegistryEntry[],
): readonly FloatingControlCatalogEntry[] {
  return Object.freeze(
    entries.map((entry) => {
      return {
        action: entry.action,
        testId: entry.testId,
        metadataKey: entry.metadataKey,
        metadata: COMMAND_FLOATING_CONTROL_METADATA[entry.metadataKey],
        policy: FLOATING_CONTROL_POLICY[entry.metadataKey],
      };
    }),
  );
}

function buildFloatingControlLookup(
  entries: readonly FloatingControlCatalogEntry[],
): FloatingControlLookup {
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

  return { policyByAction, metadataByKey };
}

function insertUnique<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  label: string,
): void {
  if (map.has(key)) {
    throw new TerminalBootstrapInvariantError(
      `Duplicate ${label} '${String(key)}'.`,
    );
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

  throw new TerminalBootstrapInvariantError(
    `Unknown ${label} '${String(key)}'.`,
  );
}

export const FLOATING_CONTROL_CATALOG = buildFloatingControlCatalog(
  COMMAND_FLOATING_CONTROL_REGISTRY,
);

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  Object.freeze([
    ...COMMAND_FLOATING_CONTROL_REGISTRY,
  ] satisfies readonly FloatingControlRegistryEntry[]);

const FLOATING_CONTROL_LOOKUP = buildFloatingControlLookup(
  FLOATING_CONTROL_CATALOG,
);

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
