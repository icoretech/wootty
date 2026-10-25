import type { MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";
import type { AttachMode } from "../../../contracts/session/session";
import {
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  resetOutbox,
} from "../../../lib/terminal-outbox";
import {
  createInputMessage,
  createResizeMessage,
} from "../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";

type UseConnectionInputBackpressureArgs = {
  attachMode: AttachMode;
  sendNow: (payload: TerminalClientMessage) => boolean;
};

type ConnectionInputBackpressure = {
  runtimeFitSizeRef: MutableRefObject<{ cols: number; rows: number }>;
  queuedInputBytes: number;
  droppedInputBytes: number;
  sendResize: (cols: number, rows: number) => void;
  flushPendingResize: () => void;
  handleRuntimeInput: (data: string) => void;
  flushQueuedInput: () => void;
  resetQueuedBuffers: () => void;
};

export function useConnectionInputBackpressure({
  attachMode,
  sendNow,
}: UseConnectionInputBackpressureArgs): ConnectionInputBackpressure {
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [outbox] = useState(createOutbox);
  const runtimeFitSizeRef = useRef({ cols: 80, rows: 24 });
  const [queuedInputBytes, setQueuedInputBytes] = useState<number>(0);
  const [droppedInputBytes, setDroppedInputBytes] = useState<number>(0);

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      runtimeFitSizeRef.current = { cols, rows };
      if (attachMode === "watch") {
        pendingResizeRef.current = null;
        return;
      }

      const sent = sendNow(createResizeMessage(cols, rows));
      pendingResizeRef.current = sent ? null : { cols, rows };
    },
    [attachMode, sendNow],
  );

  const flushPendingResize = useCallback(() => {
    const pending = pendingResizeRef.current;
    if (!pending) {
      return;
    }
    const sent = sendNow(createResizeMessage(pending.cols, pending.rows));
    if (sent) {
      pendingResizeRef.current = null;
    }
  }, [sendNow]);

  const handleRuntimeInput = useCallback(
    (data: string) => {
      if (attachMode === "watch") {
        return;
      }

      flushOutbox(outbox, (chunk) => sendNow(createInputMessage(chunk)));
      if (outbox.bytes > 0 || !sendNow(createInputMessage(data))) {
        enqueueOutbox(outbox, data);
      }
      setQueuedInputBytes(outbox.bytes);
      setDroppedInputBytes(outbox.droppedBytes);
    },
    [attachMode, sendNow, outbox],
  );

  const flushQueuedInput = useCallback(() => {
    if (attachMode === "watch") {
      resetOutbox(outbox);
      setQueuedInputBytes(0);
      setDroppedInputBytes(0);
      return;
    }
    const sentBytes = flushOutbox(outbox, (chunk) => {
      return sendNow(createInputMessage(chunk));
    });
    if (sentBytes > 0) {
      setQueuedInputBytes(outbox.bytes);
      setDroppedInputBytes(outbox.droppedBytes);
    }
  }, [attachMode, sendNow, outbox]);

  const resetQueuedBuffers = useCallback(() => {
    resetOutbox(outbox);
    pendingResizeRef.current = null;
    setQueuedInputBytes(0);
    setDroppedInputBytes(0);
  }, [outbox]);

  return {
    runtimeFitSizeRef,
    queuedInputBytes,
    droppedInputBytes,
    sendResize,
    flushPendingResize,
    handleRuntimeInput,
    flushQueuedInput,
    resetQueuedBuffers,
  };
}
