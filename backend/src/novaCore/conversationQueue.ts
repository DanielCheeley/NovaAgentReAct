// Serialize history updates for HTTP requests and scheduled events alike.
// Waiting requests can be stopped before they add a user message or run tools.
const pending = new Map<number, Promise<void>>();

export async function inConversation<T>(
  id: number,
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  const previous = pending.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  pending.set(id, tail);
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      previous,
      new Promise<never>((_resolve, reject) => {
        if (!signal) return;
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      })
    ]);
    signal?.throwIfAborted();
    return await work();
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    release();
    void tail.then(() => {
      if (pending.get(id) === tail) pending.delete(id);
    });
  }
}
