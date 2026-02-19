export interface TerminalExit {
  code: number;
  signal: number;
}

export interface TerminalCreateOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
}

export interface TerminalProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(handler: (data: string) => void): () => void;
  onExit(handler: (exit: TerminalExit) => void): () => void;
}

export interface TerminalFactory {
  create(options: TerminalCreateOptions): TerminalProcess;
}
