import {
  Eraser,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { TERMINAL_RUNTIME_COMMAND } from "../commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../commands/viewport-commands";
import type {
  FloatingControlCommand,
  FloatingControlsAction,
} from "../view/floating-controls/actions";
import { FLOATING_CONTROL_REGISTRY } from "../view/floating-controls/registry";
import type { FloatingControlsModel } from "./models/floating-controls-model";

type FloatingControlsProps = {
  model: FloatingControlsModel;
  dispatch: (action: FloatingControlsAction) => void;
};

type FloatingControlBehavior = {
  isDisabled: (model: FloatingControlsModel) => boolean;
  renderIcon: (model: FloatingControlsModel) => ReactNode;
  resolveLabel?: (model: FloatingControlsModel, defaultLabel: string) => string;
  resolveTooltip?: (
    model: FloatingControlsModel,
    defaultTooltip: string,
  ) => string;
};

const FLOATING_CONTROL_BEHAVIORS: Record<
  FloatingControlCommand,
  FloatingControlBehavior
> = {
  [TERMINAL_RUNTIME_COMMAND.RECONNECT]: {
    isDisabled: (model) => !model.terminalReady,
    renderIcon: () => <RotateCcw size={16} />,
  },
  [TERMINAL_RUNTIME_COMMAND.CLEAR]: {
    isDisabled: (model) => !model.terminalReady,
    renderIcon: () => <Eraser size={16} />,
  },
  [VIEWPORT_UI_COMMAND.DECREASE_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize <= model.fontSizeMin,
    renderIcon: () => <Minus size={16} />,
  },
  [VIEWPORT_UI_COMMAND.INCREASE_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize >= model.fontSizeMax,
    renderIcon: () => <Plus size={16} />,
  },
  [VIEWPORT_UI_COMMAND.RESET_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize === model.defaultFontSize,
    renderIcon: () => <RefreshCcw size={16} />,
  },
  [VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN]: {
    isDisabled: (model) => !model.terminalReady,
    renderIcon: (model) =>
      model.isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />,
    resolveLabel: (model, defaultLabel) =>
      model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
    resolveTooltip: (model, defaultTooltip) =>
      model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
  },
};

export function FloatingControls({ model, dispatch }: FloatingControlsProps) {
  return (
    <aside
      className={`floating-controls ${model.controlsOpen ? "is-open" : ""}`}
      aria-label="Terminal controls"
    >
      {FLOATING_CONTROL_REGISTRY.map((descriptor) => {
        const metadata = model.metadata[descriptor.metadataKey];
        const behavior = FLOATING_CONTROL_BEHAVIORS[descriptor.action];
        const ariaLabel = behavior.resolveLabel
          ? behavior.resolveLabel(model, metadata.ariaLabel)
          : metadata.ariaLabel;
        const tooltip = behavior.resolveTooltip
          ? behavior.resolveTooltip(model, metadata.tooltip)
          : metadata.tooltip;

        return (
          <div className="floating-controls__item" key={descriptor.testId}>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: descriptor.action });
              }}
              data-testid={descriptor.testId}
              disabled={behavior.isDisabled(model)}
              aria-keyshortcuts={metadata.ariaKeyShortcuts}
              aria-label={ariaLabel}
            >
              {behavior.renderIcon(model)}
            </button>
            <span className="floating-controls__tooltip">{tooltip}</span>
          </div>
        );
      })}
    </aside>
  );
}
