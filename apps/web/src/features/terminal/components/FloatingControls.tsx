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
import type { FloatingControlsAction } from "../commands/floating-controls/actions";
import {
  FLOATING_CONTROL_REGISTRY,
  floatingControlDescriptor,
  floatingControlPolicy,
} from "../commands/floating-controls/catalog";
import type { FloatingControlIconToken } from "../commands/floating-controls/contracts";
import type { FloatingControlsModel } from "../view-models/floating-controls-model";

type FloatingControlsProps = {
  model: FloatingControlsModel;
  dispatch: (action: FloatingControlsAction) => void;
};

const FLOATING_CONTROL_ICONS: Record<FloatingControlIconToken, ReactNode> = {
  reconnect: <RotateCcw size={16} />,
  clear: <Eraser size={16} />,
  fontDecrease: <Minus size={16} />,
  fontIncrease: <Plus size={16} />,
  fontReset: <RefreshCcw size={16} />,
  fullscreenEnter: <Maximize2 size={16} />,
  fullscreenExit: <Minimize2 size={16} />,
};

export function FloatingControls({ model, dispatch }: FloatingControlsProps) {
  return (
    <aside
      className={`floating-controls ${model.controlsOpen ? "is-open" : ""}`}
      aria-label="Terminal controls"
    >
      {FLOATING_CONTROL_REGISTRY.map((descriptor) => {
        const metadata = floatingControlDescriptor(descriptor.metadataKey);
        const policy = floatingControlPolicy(descriptor.action);
        const ariaLabel = policy.resolveLabel
          ? policy.resolveLabel(model, metadata.ariaLabel)
          : metadata.ariaLabel;
        const tooltip = policy.resolveTooltip
          ? policy.resolveTooltip(model, metadata.tooltip)
          : metadata.tooltip;
        const icon = FLOATING_CONTROL_ICONS[policy.resolveIcon(model)];

        return (
          <div className="floating-controls__item" key={descriptor.testId}>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: descriptor.action });
              }}
              data-testid={descriptor.testId}
              disabled={policy.isDisabled(model)}
              aria-keyshortcuts={metadata.ariaKeyShortcuts}
              aria-label={ariaLabel}
            >
              {icon}
            </button>
            <span className="floating-controls__tooltip">{tooltip}</span>
          </div>
        );
      })}
    </aside>
  );
}
