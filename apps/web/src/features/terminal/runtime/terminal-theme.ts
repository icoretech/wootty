type TerminalTheme = {
  readonly background: string;
  readonly foreground: string;
  readonly cursor: string;
  readonly selectionBackground: string;
  readonly black: string;
};

function readCssColorVariable(
  doc: Document | null,
  variableName: string,
  fallback: string,
): string {
  if (!doc) {
    return fallback;
  }

  const value = getComputedStyle(doc.documentElement)
    .getPropertyValue(variableName)
    .trim();
  return value.length > 0 ? value : fallback;
}

export function readTerminalTheme(doc: Document | null): TerminalTheme {
  return {
    background: readCssColorVariable(doc, "--terminal-bg", "transparent"),
    foreground: readCssColorVariable(doc, "--terminal-fg", "aliceblue"),
    cursor: readCssColorVariable(doc, "--terminal-cursor", "gold"),
    selectionBackground: readCssColorVariable(
      doc,
      "--terminal-selection",
      "cadetblue",
    ),
    black: readCssColorVariable(doc, "--terminal-black", "black"),
  };
}
