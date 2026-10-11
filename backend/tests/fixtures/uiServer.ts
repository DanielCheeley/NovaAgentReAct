// Deterministic UI smoke fixture; never calls a real model. Launch with a
// disposable NOVA_DATABASE_PATH while the normal development server is stopped.
if (!process.env.NOVA_DATABASE_PATH)
  throw new Error("Set a disposable NOVA_DATABASE_PATH");
const nativeFetch = globalThis.fetch;
const { MODEL_CONFIG } = await import("../../src/novaCore/novaConfig");
globalThis.fetch = async (url, init) => {
  if (String(url) !== MODEL_CONFIG.url) return nativeFetch(url, init);
  const body = JSON.parse(init!.body as string);
  if (!body.stream)
    return Response.json({ message: { content: "Streaming smoke test" } });
  const content =
    "This is a deterministic streaming test. Text arrives progressively, the Stop button cancels this response, and a new message can follow. ".repeat(
      4
    );
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  return new Response(
    new ReadableStream({
      start(controller) {
        let offset = 0;
        timer = setInterval(() => {
          const text = content.slice(offset, offset + 18);
          offset += 18;
          const done = offset >= content.length;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { content: text },
                done,
                ...(done
                  ? {
                      load_duration: 1_000_000,
                      prompt_eval_duration: 2_000_000,
                      eval_duration: 3_000_000
                    }
                  : {})
              }) + "\n"
            )
          );
          if (done) {
            clearInterval(timer);
            controller.close();
          }
        }, 160);
      },
      cancel() {
        clearInterval(timer);
      }
    })
  );
};
await import("../../src/server");
