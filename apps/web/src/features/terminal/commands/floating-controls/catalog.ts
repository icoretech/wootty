import { COMMAND_CATALOG } from "../catalog";
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

export const FLOATING_CONTROL_CATALOG = [
  {
    action: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    testId: "reconnect-button",
    metadataKey: "reconnect",
    metadata: {
      tooltip: "Reconnect",
      ariaLabel: "Reconnect terminal session",
      ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
    },
    policy: {
      isDisabled: (model) => !model.terminalReady,
      resolveIcon: () => "reconnect",
    },
  },
  {
    action: TERMINAL_RUNTIME_COMMAND.CLEAR,
    testId: "clear-button",
    metadataKey: "clear",
    metadata: {
      tooltip: "Clear",
      ariaLabel: "Clear terminal viewport",
      ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
    },
    policy: {
      isDisabled: (model) => !model.terminalReady,
      resolveIcon: () => "clear",
    },
  },
  {
    action: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    testId: "font-decrease-button",
    metadataKey: "decreaseFont",
    metadata: {
      tooltip: "Font down",
      ariaLabel: "Decrease terminal font size",
      ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
    },
    policy: {
      isDisabled: (model) =>
        !model.terminalReady || model.fontSize <= model.fontSizeMin,
      resolveIcon: () => "fontDecrease",
    },
  },
  {
    action: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    testId: "font-increase-button",
    metadataKey: "increaseFont",
    metadata: {
      tooltip: "Font up",
      ariaLabel: "Increase terminal font size",
      ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
    },
    policy: {
      isDisabled: (model) =>
        !model.terminalReady || model.fontSize >= model.fontSizeMax,
      resolveIcon: () => "fontIncrease",
    },
  },
  {
    action: VIEWPORT_UI_COMMAND.RESET_FONT,
    testId: "font-reset-button",
    metadataKey: "resetFont",
    metadata: {
      tooltip: "Reset font",
      ariaLabel: "Reset terminal font size",
      ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
    },
    policy: {
      isDisabled: (model) =>
        !model.terminalReady || model.fontSize === model.defaultFontSize,
      resolveIcon: () => "fontReset",
    },
  },
  {
    action: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    testId: "fullscreen-button",
    metadataKey: "fullscreen",
    metadata: {
      tooltip: "Fullscreen",
      ariaLabel: "Toggle fullscreen terminal",
    },
    policy: {
      isDisabled: (model) => !model.terminalReady,
      resolveIcon: (model) =>
        model.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
      resolveLabel: (model, defaultLabel) =>
        model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
      resolveTooltip: (model, defaultTooltip) =>
        model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
    },
  },
] as const satisfies readonly FloatingControlCatalogEntry[];

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  FLOATING_CONTROL_CATALOG.map((entry) => ({
    testId: entry.testId,
    metadataKey: entry.metadataKey,
    action: entry.action,
  }));

const COMMAND_ACTIONS = new Set(COMMAND_CATALOG.map((entry) => entry.id));
for (const entry of FLOATING_CONTROL_CATALOG) {
  if (!COMMAND_ACTIONS.has(entry.action)) {
    throw new Error(
      `Floating control action '${entry.action}' is not defined in the command catalog.`,
    );
  }
}

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
