import { COMMAND_MANIFEST } from "./definitions/command-manifest";

type RuntimeCommandCatalogEntry = Pick<
  Extract<(typeof COMMAND_MANIFEST)[number], { handler: "runtime" }>,
  "id" | "handler" | "shortcutCode"
>;

type ViewportCommandCatalogEntry = Pick<
  Extract<(typeof COMMAND_MANIFEST)[number], { handler: "viewport" }>,
  "id" | "handler" | "shortcutCode"
>;

type CommandCatalogEntry =
  | RuntimeCommandCatalogEntry
  | ViewportCommandCatalogEntry;

export const COMMAND_CATALOG = Object.freeze(
  COMMAND_MANIFEST.map((entry) => {
    return {
      id: entry.id,
      handler: entry.handler,
      shortcutCode: entry.shortcutCode,
    };
  }),
) as readonly CommandCatalogEntry[];
