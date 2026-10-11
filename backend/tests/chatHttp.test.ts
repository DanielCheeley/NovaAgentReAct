import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { createServer } from "node:http";

const tempDirectory = mkdtempSync(path.join(tmpdir(), "nova-stream-test-"));
const databaseFile = path.join(tempDirectory, "test.db");
process.env.NOVA_DATABASE_PATH = databaseFile;
const { chatRouter } = await import("../src/routes/chat");
const { db } = await import("../src/database/database");
const { conversationTitles } =
  await import("../src/novaCore/background/conversationTitles");
const nativeFetch = globalThis.fetch;
const app = express();
app.use(express.json());
app.use("/chat", chatRouter);
const server = createServer(app);
let baseUrl = "";
const encoder = new TextEncoder();
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(databaseFile + suffix, { force: true });
  rmdirSync(tempDirectory);
});

test("HTTP streams before completion and retains the legacy completed-response API", async () => {
  let finish!: () => void;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    if (!body.stream)
      return Response.json({
        message: { content: body.tools ? "Legacy reply" : "Greeting" }
      });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('{"message":{"content":"Hello"},"done":false}\n')
          );
          finish = () => {
            controller.enqueue(
              encoder.encode(
                '{"message":{"content":" there"},"done":true,"load_duration":1000000}\n'
              )
            );
            controller.close();
          };
        }
      })
    );
  };
  const response = await nativeFetch(baseUrl + "/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: 101,
      message: "Hello",
      requestId: "first"
    })
  });
  assert.match(response.headers.get("content-type")!, /x-ndjson/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes('"content":"Hello"'))
    text += decoder.decode((await reader.read()).value);
  assert.ok(!text.includes('"type":"done"'));
  finish();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    text += decoder.decode(next.value);
  }
  reader.releaseLock();
  const events = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const final = events.at(-1);
  assert.equal(final.type, "done");
  assert.equal(final.message, "Hello there");
  assert.ok(events.every((event) => event.requestId === "first"));
  assert.equal(final.timing.models[0].loadMs, 1);
  assert.ok(final.timing.firstContentMs !== null);
  await conversationTitles.enqueue(101);
  const legacy = await nativeFetch(baseUrl + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: 102, message: "Hello" })
  });
  assert.equal((await legacy.json()).message, "Legacy reply");
  await conversationTitles.enqueue(102);
});

test("disconnect aborts model generation, persists the stop marker, and permits a new turn", async () => {
  let cancelled = false;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    if (!body.stream) return Response.json({ message: { content: "Title" } });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('{"message":{"content":"Partial"},"done":false}\n')
          );
        },
        cancel() {
          cancelled = true;
        }
      })
    );
  };
  const abort = new AbortController();
  const response = await nativeFetch(baseUrl + "/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: abort.signal,
    body: JSON.stringify({
      conversationId: 103,
      message: "Hello",
      requestId: "stop-me"
    })
  });
  const reader = response.body!.getReader();
  let text = "";
  while (!text.includes("Partial"))
    text += new TextDecoder().decode((await reader.read()).value);
  abort.abort();
  await reader.cancel().catch(() => {});
  reader.releaseLock();
  const deadline = Date.now() + 2000;
  let rows: Array<{ content: string }> = [];
  while (Date.now() < deadline) {
    rows = db
      .prepare(
        "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant'"
      )
      .all(103) as typeof rows;
    if (rows.some((row) => row.content.includes("Response stopped"))) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(cancelled, true);
  assert.equal(rows.length, 1);
  assert.match(rows[0].content, /Partial.*Response stopped/s);
  globalThis.fetch = async () =>
    Response.json({ message: { content: "Next reply" } });
  const next = await nativeFetch(baseUrl + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: 103, message: "Continue" })
  });
  assert.equal((await next.json()).message, "Next reply");
  await conversationTitles.enqueue(103);
  const metrics = await (await nativeFetch(baseUrl + "/chat/metrics")).json();
  assert.equal(metrics.cancelled, 1);
});
