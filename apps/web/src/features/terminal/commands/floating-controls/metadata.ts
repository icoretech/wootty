import type { FloatingControlCommand } from "./actions";
import { FLOATING_CONTROL_CATALOG } from "./catalog";
import type { FloatingControlMetadata } from "./floating-control-metadata";

const FLOATING_CONTROL_METADATA_BY_COMMAND = Object.fromEntries(
  FLOATING_CONTROL_CATALOG.map((entry) => [entry.action, entry.metadata]),
) as Record<FloatingControlCommand, FloatingControlMetadata>;

export function floatingControlMetadata(
  command: FloatingControlCommand,
): FloatingControlMetadata {
  return FLOATING_CONTROL_METADATA_BY_COMMAND[command];
}
