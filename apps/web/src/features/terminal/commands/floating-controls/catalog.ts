import { TERMINAL_RUNTIME_COMMAND } from "../runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../viewport-commands";
import type { FloatingControlCommand } from "./actions";
import type {
  FloatingControlCatalogEntry,
  FloatingControlMetadataKey,
  FloatingControlPolicy,
  FloatingControlRegistryEntry,
} from "./contracts";
import type { FloatingControlMetadata } from "./floating-control-metadata";

const FLOATING_CONTROL_METADATA: Record<
  FloatingControlMetadataKey,
  FloatingControlMetadata
> = {
  reconnect: {
    tooltip: "Reconnect",
    ariaLabel: "Reconnect terminal session",
    ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
  },
  clear: {
    tooltip: "Clear",
    ariaLabel: "Clear terminal viewport",
    ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
  },
  decreaseFont: {
    tooltip: "Font down",
    ariaLabel: "Decrease terminal font size",
    ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
  },
  increaseFont: {
    tooltip: "Font up",
    ariaLabel: "Increase terminal font size",
    ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
  },
  resetFont: {
    tooltip: "Reset font",
    ariaLabel: "Reset terminal font size",
    ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
  },
  fullscreen: {
    tooltip: "Fullscreen",
    ariaLabel: "Toggle fullscreen terminal",
  },
};

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

const FLOATING_CONTROL_BINDINGS = [
  {
    action: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    testId: "reconnect-button",
    metadataKey: "reconnect",
  },
  {
    action: TERMINAL_RUNTIME_COMMAND.CLEAR,
    testId: "clear-button",
    metadataKey: "clear",
  },
  {
    action: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    testId: "font-decrease-button",
    metadataKey: "decreaseFont",
  },
  {
    action: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    testId: "font-increase-button",
    metadataKey: "increaseFont",
  },
  {
    action: VIEWPORT_UI_COMMAND.RESET_FONT,
    testId: "font-reset-button",
    metadataKey: "resetFont",
  },
  {
    action: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    testId: "fullscreen-button",
    metadataKey: "fullscreen",
  },
] as const satisfies readonly FloatingControlRegistryEntry[];

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
        metadata: FLOATING_CONTROL_METADATA[entry.metadataKey],
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

export const FLOATING_CONTROL_CATALOG = buildFloatingControlCatalog(
  FLOATING_CONTROL_BINDINGS,
);

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  Object.freeze([
    ...FLOATING_CONTROL_BINDINGS,
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
