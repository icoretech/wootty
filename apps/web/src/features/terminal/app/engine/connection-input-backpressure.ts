import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachMode } from "../../contracts/session";
import {
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  resetOutbox,
} from "../../lib/terminal-outbox";
import {
  createInputMessage,
  createResizeMessage,
} from "../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../protocol/terminal-wire-schema";

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
  const outboxRef = useRef(createOutbox());
  const runtimeFitSizeRef = useRef({ cols: 80, rows: 24 });
  const [queuedInputBytes, setQueuedInputBytes] = useState<number>(0);
  const [droppedInputBytes, setDroppedInputBytes] = useState<number>(0);

  useEffect(() => {
    if (attachMode !== "watch") {
      return;
    }
    resetOutbox(outboxRef.current);
    pendingResizeRef.current = null;
    setQueuedInputBytes(0);
    setDroppedInputBytes(0);
  }, [attachMode]);

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      runtimeFitSizeRef.current = { cols, rows };
      if (attachMode === "watch") {
        pendingResizeRef.current = null;
        return;
      }

      const sent = sendNow(createResizeMessage(cols, rows));
      if (!sent) {
        pendingResizeRef.current = { cols, rows };
      }
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

      const sent = sendNow(createInputMessage(data));
      if (sent) {
        return;
      }
      enqueueOutbox(outboxRef.current, data);
      setQueuedInputBytes(outboxRef.current.bytes);
      setDroppedInputBytes(outboxRef.current.droppedBytes);
    },
    [attachMode, sendNow],
  );

  const flushQueuedInput = useCallback(() => {
    if (attachMode === "watch") {
      resetOutbox(outboxRef.current);
      setQueuedInputBytes(0);
      setDroppedInputBytes(0);
      return;
    }
    const sentBytes = flushOutbox(outboxRef.current, (chunk) => {
      return sendNow(createInputMessage(chunk));
    });
    if (sentBytes > 0) {
      setQueuedInputBytes(outboxRef.current.bytes);
      setDroppedInputBytes(outboxRef.current.droppedBytes);
    }
  }, [attachMode, sendNow]);

  const resetQueuedBuffers = useCallback(() => {
    resetOutbox(outboxRef.current);
    pendingResizeRef.current = null;
    setQueuedInputBytes(0);
    setDroppedInputBytes(0);
  }, []);

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
