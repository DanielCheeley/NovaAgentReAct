import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { requestOllama } from "../src/novaCore/providers/ollama";
import { inConversation } from "../src/novaCore/conversationQueue";
import { consumeChatStream } from "../../frontend/src/communication/chatStream";
import type { ModelTiming } from "../src/types/generationType";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const encoder = new TextEncoder();
function stream(text: string) {
  const bytes = encoder.encode(text);
  // Split every byte, including inside multi-byte Unicode and JSON records.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    }
  });
}

test("Ollama streams Unicode text, accumulates tools, and converts timing units", async () => {
  const chunks = [
    {
      message: {
        content: "Hi 🌟",
        tool_calls: [
          {
            function: { index: 0, name: "scheduleTask", arguments: '{"task":' }
          }
        ]
      },
      done: false
    },
    {
      message: {
        content: " there",
        tool_calls: [{ function: { index: 0, arguments: '"Build"}' } }]
      },
      done: false
    },
    {
      done: true,
      load_duration: 2_000_000,
      prompt_eval_duration: 3_000_000,
      eval_duration: 4_000_000,
      eval_count: 5
    }
  ];
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init!.body as string).stream, true);
    return new Response(
      stream(chunks.map((chunk) => JSON.stringify(chunk)).join("\n"))
    );
  };
  const content: string[] = [];
  let timing!: ModelTiming;
  const result = await requestOllama(
    "http://model",
    { stream: true },
    "Model failed",
    {
      onContent: (text) => content.push(text),
      onModelTiming: (sample) => {
        timing = sample;
      }
    }
  );
  assert.deepEqual(content, ["Hi 🌟", "Hi 🌟 there"]);
  assert.equal(result.content, "Hi 🌟 there");
  assert.equal(result.tool_calls![0].function.name, "scheduleTask");
  assert.deepEqual(result.tool_calls![0].function.arguments, { task: "Build" });
  assert.ok(result.tool_calls![0].id);
  assert.equal(timing.loadMs, 2);
  assert.equal(timing.promptMs, 3);
  assert.equal(timing.generationMs, 4);
  assert.equal(timing.generatedTokens, 5);
  assert.ok(timing.firstContentMs !== null);
});

test("truncated, malformed, and provider-error streams cannot return executable tools", async () => {
  for (const text of [
    JSON.stringify({
      message: {
        tool_calls: [{ function: { name: "scheduleTask", arguments: {} } }]
      },
      done: false
    }),
    "not json\n",
    JSON.stringify({ error: "Model unavailable" }),
    JSON.stringify({
      message: {
        tool_calls: [{ function: { name: "scheduleTask", arguments: "{" } }]
      },
      done: true
    })
  ]) {
    globalThis.fetch = async () => new Response(stream(text));
    await assert.rejects(
      requestOllama("http://model", { stream: true }, "Model failed")
    );
  }
});

test("Stop cancels a blocked model reader and suppresses later content", async () => {
  const abort = new AbortController();
  let cancelled = false;
  let content = 0;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('{"message":{"content":"Start"},"done":false}\n')
          );
        },
        cancel() {
          cancelled = true;
        }
      })
    );
  const pending = requestOllama(
    "http://model",
    { stream: true },
    "Model failed",
    {
      signal: abort.signal,
      onContent: () => {
        content++;
        abort.abort();
      }
    }
  );
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(content, 1);
});

test("the browser parser enforces request ownership and terminal completion", async () => {
  const abort = new AbortController();
  const events: string[] = [];
  await consumeChatStream(
    stream(
      [
        { type: "start", requestId: "one", conversationId: 1 },
        { type: "content", requestId: "one", content: "🌟" },
        {
          type: "done",
          requestId: "one",
          message: "🌟",
          title: "Greeting",
          timing: {}
        }
      ]
        .map((event) => JSON.stringify(event))
        .join("\n")
    ),
    "one",
    (event) => events.push(event.type),
    abort.signal
  );
  assert.deepEqual(events, ["start", "content", "done"]);
  await assert.rejects(
    consumeChatStream(
      stream('{"type":"content","requestId":"two","content":"bad"}\n'),
      "one",
      () => {},
      abort.signal
    ),
    /Mismatched/
  );
  await assert.rejects(
    consumeChatStream(
      stream('{"type":"content","requestId":"one","content":"partial"}\n'),
      "one",
      () => {},
      abort.signal
    ),
    /before completion/
  );
});

test("conversation serialization skips cancelled waiting work", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const order: string[] = [];
  const first = inConversation(42, async () => {
    order.push("first");
    await gate;
  });
  const abort = new AbortController();
  const second = inConversation(
    42,
    async () => {
      order.push("cancelled");
    },
    abort.signal
  );
  const third = inConversation(42, async () => {
    order.push("third");
  });
  abort.abort();
  await assert.rejects(second, { name: "AbortError" });
  release();
  await Promise.all([first, third]);
  assert.deepEqual(order, ["first", "third"]);
});
