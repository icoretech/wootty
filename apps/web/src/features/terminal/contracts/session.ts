export type AttachMode = "control" | "watch";

export interface SessionSnapshot {
  readonly id: string;
  readonly hasController: boolean;
  readonly canControl: boolean;
  readonly watchers: number;
  readonly createdAtMs: number;
  readonly lastActivityMs: number;
  readonly command: string | null;
}

export interface SessionCandidate {
  readonly id: string;
  readonly mode: AttachMode;
  readonly command: string | null;
  readonly watchers: number;
  readonly lastActivityMs: number;
}
