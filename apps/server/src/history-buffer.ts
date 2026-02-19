export class HistoryBuffer {
  private readonly chunks: string[] = [];

  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: string): void {
    const byteLength = Buffer.byteLength(chunk, "utf8");
    this.chunks.push(chunk);
    this.bytes += byteLength;

    while (this.bytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      if (!removed) {
        break;
      }
      this.bytes -= Buffer.byteLength(removed, "utf8");
    }
  }

  dump(): string {
    return this.chunks.join("");
  }
}
