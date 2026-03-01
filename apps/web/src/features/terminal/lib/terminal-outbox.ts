const ONE_KIBIBYTE = 2 ** 10;
const OUTBOX_MAX_BYTES = 512 * ONE_KIBIBYTE;

type OutboxChunk = {
  data: string;
  bytes: number;
};

interface OutboxState {
  readonly chunks: OutboxChunk[];
  head: number;
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
    head: 0,
    bytes: 0,
    droppedBytes: 0,
  };
}

function compactOutbox(outbox: OutboxState): void {
  if (outbox.head === 0) {
    return;
  }
  if (outbox.head >= outbox.chunks.length) {
    outbox.chunks.length = 0;
    outbox.head = 0;
    return;
  }
  if (outbox.head < 128 && outbox.head * 2 < outbox.chunks.length) {
    return;
  }
  outbox.chunks.splice(0, outbox.head);
  outbox.head = 0;
}

export function enqueueOutbox(
  outbox: OutboxState,
  chunk: string,
  maxBytes = OUTBOX_MAX_BYTES,
): void {
  if (chunk.length === 0) {
    return;
  }
  const queuedChunk: OutboxChunk = {
    data: chunk,
    bytes: byteLength(chunk),
  };
  outbox.chunks.push(queuedChunk);
  outbox.bytes += queuedChunk.bytes;

  while (outbox.bytes > maxBytes && outbox.head < outbox.chunks.length) {
    const removed = outbox.chunks[outbox.head];
    outbox.head += 1;
    if (removed === undefined) {
      break;
    }
    outbox.bytes -= removed.bytes;
    outbox.droppedBytes += removed.bytes;
  }
  compactOutbox(outbox);
}

export function flushOutbox(
  outbox: OutboxState,
  send: (chunk: string) => boolean,
): number {
  let sentBytes = 0;

  while (outbox.head < outbox.chunks.length) {
    const queuedChunk = outbox.chunks[outbox.head];
    if (queuedChunk === undefined) {
      break;
    }

    const delivered = send(queuedChunk.data);
    if (!delivered) {
      break;
    }

    outbox.head += 1;
    sentBytes += queuedChunk.bytes;
    outbox.bytes -= queuedChunk.bytes;
  }

  outbox.bytes = Math.max(0, outbox.bytes);
  compactOutbox(outbox);

  return sentBytes;
}

export function resetOutbox(outbox: OutboxState): void {
  outbox.chunks.length = 0;
  outbox.head = 0;
  outbox.bytes = 0;
  outbox.droppedBytes = 0;
}
