import type { FloatingControlMetadataKey } from "./catalog";
import type { FloatingControlMetadata } from "./floating-control-metadata";
import { floatingControlMetadata } from "./metadata";
import { FLOATING_CONTROL_REGISTRY } from "./registry";

export type FloatingControlDescriptors = Record<
  FloatingControlMetadataKey,
  FloatingControlMetadata
>;

export function buildFloatingControlDescriptors(): FloatingControlDescriptors {
  const descriptors = {} as FloatingControlDescriptors;
  for (const entry of FLOATING_CONTROL_REGISTRY) {
    descriptors[entry.metadataKey] = floatingControlMetadata(entry.action);
  }
  return descriptors;
}
