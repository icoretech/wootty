import { COMMAND_MANIFEST } from "./definitions/command-manifest";

type CommandCatalogEntry = Pick<
  (typeof COMMAND_MANIFEST)[number],
  "id" | "handler" | "shortcutCode"
>;

export const COMMAND_CATALOG = Object.freeze(
  COMMAND_MANIFEST.map((entry) => {
    return {
      id: entry.id,
      handler: entry.handler,
      shortcutCode: entry.shortcutCode,
    };
  }),
) as readonly CommandCatalogEntry[];
