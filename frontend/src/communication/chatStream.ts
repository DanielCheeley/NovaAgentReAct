import type { ChatStreamEvent } from "../../../backend/src/types/chatStreamType";

export type { ChatStreamEvent };

export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  requestId: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
) {
  const reader = body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    signal.throwIfAborted();
    const event = JSON.parse(line) as ChatStreamEvent;
    if (event.requestId !== requestId)
      throw new Error("Mismatched chat stream");
    if (event.type === "error") throw new Error(event.message);
    if (
      event.type !== "start" &&
      event.type !== "content" &&
      event.type !== "loop.complete" &&
      event.type !== "done"
    ) {
      throw new Error("Unknown chat stream event");
    }
    onEvent(event);
    if (event.type === "done") complete = true;
  };
  try {
    while (!complete) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576)
        throw new Error("Chat stream record exceeds size limit");
      let newline: number;
      while (!complete && (newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consume(line);
      }
      if (done) {
        if (!complete && buffer.trim()) consume(buffer);
        break;
      }
    }
    signal.throwIfAborted();
    if (!complete) throw new Error("Chat stream ended before completion");
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
