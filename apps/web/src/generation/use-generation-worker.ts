import {
  type GenerationParameters,
  type GenerationWorkerEvent,
  GenerationWorkerEventSchema,
} from "@city/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CityGenerationInput {
  name: string;
  seed: string;
  parameters: GenerationParameters;
}

interface GenerationWorkerHandlers {
  enabled?: boolean;
  onEvent: (event: GenerationWorkerEvent) => void;
  onWorkerError: (message: string) => void;
}

/** Shared browser-side owner for the generation worker and its active request. */
export function useGenerationWorker({
  enabled = true,
  onEvent,
  onWorkerError,
}: GenerationWorkerHandlers) {
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const handlersRef = useRef({ onEvent, onWorkerError });
  handlersRef.current = { onEvent, onWorkerError };

  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(new URL("../workers/generation.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setReady(true);
    worker.onerror = (event) => {
      handlersRef.current.onWorkerError(event.message || "The generation worker failed to start.");
      activeRequestRef.current = null;
    };
    worker.onmessageerror = () => {
      handlersRef.current.onWorkerError("The generation worker returned an unreadable message.");
      activeRequestRef.current = null;
    };
    worker.onmessage = (message: MessageEvent<unknown>) => {
      const parsed = GenerationWorkerEventSchema.safeParse(message.data);
      if (!parsed.success || parsed.data.requestId !== activeRequestRef.current) return;
      handlersRef.current.onEvent(parsed.data);
      if (["complete", "cancelled", "error"].includes(parsed.data.type)) {
        activeRequestRef.current = null;
      }
    };
    return () => {
      const requestId = activeRequestRef.current;
      if (requestId) worker.postMessage({ type: "cancel", requestId });
      worker.terminate();
      workerRef.current = null;
      activeRequestRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const generate = useCallback((input: CityGenerationInput) => {
    const worker = workerRef.current;
    if (!worker) return null;
    const previous = activeRequestRef.current;
    if (previous) worker.postMessage({ type: "cancel", requestId: previous });
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    worker.postMessage({ type: "generate", requestId, ...input });
    return requestId;
  }, []);

  const cancel = useCallback(() => {
    const requestId = activeRequestRef.current;
    if (!requestId) return;
    workerRef.current?.postMessage({ type: "cancel", requestId });
  }, []);

  return { generate, cancel, ready };
}
