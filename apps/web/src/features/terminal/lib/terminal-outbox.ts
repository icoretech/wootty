const ONE_KIBIBYTE = 2 ** 10;
const OUTBOX_MAX_BYTES = 512 * ONE_KIBIBYTE;

interface OutboxState {
  readonly chunks: string[];
  bytes: number;
  droppedBytes: number;
}

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export function createOutbox(): OutboxState {
  return {
    chunks: [],
    bytes: 0,
    droppedBytes: 0,
  };
}

export function enqueueOutbox(
  outbox: OutboxState,
  chunk: string,
  maxBytes = OUTBOX_MAX_BYTES,
): void {
  const bytes = byteLength(chunk);
  outbox.chunks.push(chunk);
  outbox.bytes += bytes;

  while (outbox.bytes > maxBytes && outbox.chunks.length > 0) {
    const removed = outbox.chunks.shift();
    if (!removed) {
      break;
    }
    const removedBytes = byteLength(removed);
    outbox.bytes -= removedBytes;
    outbox.droppedBytes += removedBytes;
  }
}

export function flushOutbox(
  outbox: OutboxState,
  send: (chunk: string) => boolean,
): number {
  let sentBytes = 0;

  while (outbox.chunks.length > 0) {
    const chunk = outbox.chunks[0];
    if (!chunk) {
      break;
    }

    const delivered = send(chunk);
    if (!delivered) {
      break;
    }

    outbox.chunks.shift();
    const bytes = byteLength(chunk);
    sentBytes += bytes;
    outbox.bytes -= bytes;
  }

  outbox.bytes = Math.max(0, outbox.bytes);

  return sentBytes;
}
