import type { FloatingControlPolicyState } from "../commands/floating-controls/contracts";

export type FloatingControlsModel = {
  controlsOpen: boolean;
} & FloatingControlPolicyState;
