import type { IPty } from "@lydell/node-pty";
import { spawn } from "@lydell/node-pty";

import type {
  TerminalCreateOptions,
  TerminalExit,
  TerminalFactory,
  TerminalProcess,
} from "./terminal-process";

class NodePtyProcess implements TerminalProcess {
  constructor(private readonly proc: IPty) {}

  write(data: string): void {
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    this.proc.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.proc.kill(signal);
  }

  onData(handler: (data: string) => void): () => void {
    const disposable = this.proc.onData(handler);
    return () => {
      disposable.dispose();
    };
  }

  onExit(handler: (exit: TerminalExit) => void): () => void {
    const disposable = this.proc.onExit(({ exitCode, signal }) => {
      handler({ code: exitCode, signal: signal ?? 0 });
    });
    return () => {
      disposable.dispose();
    };
  }
}

export class NodePtyFactory implements TerminalFactory {
  create(options: TerminalCreateOptions): TerminalProcess {
    const proc = spawn(options.command, options.args, {
      name: "xterm-256color",
      cwd: options.cwd,
      env: options.env,
      cols: options.cols,
      rows: options.rows,
    });

    return new NodePtyProcess(proc);
  }
}
