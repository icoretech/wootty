import type { FloatingControlPolicy as FloatingControlPolicyEntry } from "../catalog";
import type { FloatingControlCommand } from "./actions";
import {
  FLOATING_CONTROL_CATALOG,
  type FloatingControlIconToken,
} from "./catalog";

type FloatingControlPolicyMap = Record<
  FloatingControlCommand,
  FloatingControlPolicyEntry
>;

export const FLOATING_CONTROL_POLICY = Object.fromEntries(
  FLOATING_CONTROL_CATALOG.map((entry) => [entry.action, entry.policy]),
) as FloatingControlPolicyMap;

export type { FloatingControlIconToken };
