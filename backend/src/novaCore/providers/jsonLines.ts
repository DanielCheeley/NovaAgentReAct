// Decode UTF-8 incrementally: a network chunk need not end at a newline or
// even at a complete character. Both consumers require a terminal event.
export async function* readJsonLines(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 1_048_576)
        throw new Error("Stream record exceeds size limit");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        signal?.throwIfAborted();
        if (line) yield JSON.parse(line);
      }
      if (done) break;
    }
    signal?.throwIfAborted();
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
