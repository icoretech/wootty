export class TerminalBootstrapInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalBootstrapInvariantError";
  }
}
