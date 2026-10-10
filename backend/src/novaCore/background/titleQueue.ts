type TitleDependencies = {
  getSeed: (conversationId: number) => string | undefined;
  generate: (message: string) => Promise<string>;
  save: (conversationId: number, title: string) => boolean;
  notify: (conversationId: number, title: string) => void;
  onError: (error: unknown) => void;
};

// One background request at a time, deduplicated by conversation. The caller
// never waits for this queue to answer a chat request.
export function createTitleQueue(dependencies: TitleDependencies) {
  const pending = new Map<number, Promise<void>>();
  let tail = Promise.resolve();

  return {
    enqueue(conversationId: number): Promise<void> {
      const existing = pending.get(conversationId);
      if (existing) return existing;

      const job = tail.then(async () => {
        // Yield until the response has been sent and the event loop can proceed.
        await new Promise<void>((resolve) => setImmediate(resolve));
        try {
          const seed = dependencies.getSeed(conversationId);
          if (seed === undefined) return;
          const title = (await dependencies.generate(seed)).trim();
          if (title && dependencies.save(conversationId, title)) {
            dependencies.notify(conversationId, title);
          }
        } catch (error) {
          dependencies.onError(error);
        } finally {
          pending.delete(conversationId);
        }
      });
      pending.set(conversationId, job);
      // Even an unexpected notification/logger error must not poison the queue.
      tail = job.catch(() => {});
      return tail;
    }
  };
}
