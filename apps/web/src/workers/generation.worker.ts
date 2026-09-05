/// <reference lib="webworker" />

import {
  GenerationCancelledError,
  type GenerationWorkerEvent,
  type GenerationWorkerRequest,
  GenerationWorkerRequestSchema,
  generateRoadCity,
} from "@city/core";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let activeRequestId: string | null = null;
const cancelled = new Set<string>();

function post(event: GenerationWorkerEvent): void {
  workerScope.postMessage(event);
}

async function handleGenerate(request: Extract<GenerationWorkerRequest, { type: "generate" }>) {
  activeRequestId = request.requestId;
  cancelled.delete(request.requestId);
  try {
    const city = await generateRoadCity(
      {
        id: `city_${request.requestId}`,
        name: request.name,
        seed: request.seed,
        parameters: request.parameters,
        timestamp: new Date().toISOString(),
      },
      {
        shouldCancel: () =>
          cancelled.has(request.requestId) || activeRequestId !== request.requestId,
        yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
        onProgress: (progress) =>
          post({ type: "progress", requestId: request.requestId, ...progress }),
      },
    );
    if (activeRequestId === request.requestId)
      post({ type: "complete", requestId: request.requestId, city });
  } catch (error) {
    if (error instanceof GenerationCancelledError) {
      post({ type: "cancelled", requestId: request.requestId });
    } else {
      post({
        type: "error",
        requestId: request.requestId,
        code: "GENERATION_FAILED",
        message: error instanceof Error ? error.message : "Unknown generation error",
        recoverable: true,
      });
    }
  } finally {
    cancelled.delete(request.requestId);
    if (activeRequestId === request.requestId) activeRequestId = null;
  }
}

workerScope.onmessage = (message: MessageEvent<unknown>) => {
  const parsed = GenerationWorkerRequestSchema.safeParse(message.data);
  if (!parsed.success) {
    const requestId =
      typeof message.data === "object" &&
      message.data !== null &&
      "requestId" in message.data &&
      typeof message.data.requestId === "string"
        ? message.data.requestId
        : "invalid-request";
    post({
      type: "error",
      requestId,
      code: "INVALID_REQUEST",
      message: parsed.error.message,
      recoverable: true,
    });
    return;
  }
  if (parsed.data.type === "cancel") {
    cancelled.add(parsed.data.requestId);
    return;
  }
  void handleGenerate(parsed.data);
};
