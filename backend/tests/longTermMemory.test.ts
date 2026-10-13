import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const directory = mkdtempSync(path.join(tmpdir(), "nova-memory-test-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../src/database/database");
const {
  rememberMemory,
  getMemories,
  forgetMemory,
  memoryContext,
  MAX_MEMORIES
} = await import("../src/novaCore/memory/longTermMemoryStore");
const { tools } = await import("../src/novaCore/tools/toolRegistry");
const { runAgent } = await import("../src/novaCore/agentLoop");
const { generateResponse } = await import("../src/novaCore/model");
const { addMessage, deleteConversation } =
  await import("../src/novaCore/memory/conversationStore");
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  db.exec(
    "DELETE FROM memories; DELETE FROM messages; DELETE FROM conversations;"
  );
  globalThis.fetch = nativeFetch;
});
after(() => {
  globalThis.fetch = nativeFetch;
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("facts persist on disk independently of conversations and duplicate saves", () => {
  const first = rememberMemory("  I prefer short answers.  ");
  const duplicate = rememberMemory("i prefer  short answers.");
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.memory.id, first.memory.id);
  addMessage(1, { role: "user", content: "remember this" });
  deleteConversation(1);
  const reopened = new Database(process.env.NOVA_DATABASE_PATH!);
  try {
    assert.deepEqual(reopened.prepare("SELECT content FROM memories").all(), [
      { content: "I prefer short answers." }
    ]);
  } finally {
    reopened.close();
  }
  assert.equal(getMemories().length, 1);
});

test("forget deletes only the chosen saved fact and leaves chat history intact", () => {
  const first = rememberMemory("I like green.").memory;
  const second = rememberMemory("I like tea.").memory;
  addMessage(1, { role: "user", content: "I like green." });
  assert.equal(forgetMemory(first.id).forgotten.id, first.id);
  assert.deepEqual(getMemories(), [second]);
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) AS count FROM messages").get() as {
        count: number;
      }
    ).count,
    1
  );
  assert.throws(() => forgetMemory(first.id), /no longer exists/);
  assert.throws(() => forgetMemory("1"), /valid memory ID/);
  assert.throws(() => forgetMemory(-1), /valid memory ID/);
});

test("invalid and over-capacity writes fail without changing saved facts", () => {
  for (const invalid of [null, 1, "  ", "x".repeat(301)])
    assert.throws(() => rememberMemory(invalid));
  for (let i = 0; i < MAX_MEMORIES; i++) rememberMemory(`Fact ${i}`);
  assert.throws(() => rememberMemory("One too many"), /Memory is full/);
  assert.equal(rememberMemory("Fact 0").created, false);
  assert.equal(getMemories().length, MAX_MEMORIES);
});

test("tool failures remain failures and scheduled contexts cannot mutate memory", async () => {
  assert.equal(
    (await tools.rememberMemory.execute({ content: "Hello" }, {})).success,
    false
  );
  assert.equal(
    (
      await tools.rememberMemory.execute(
        { content: "" },
        { memoryWritesAllowed: true }
      )
    ).success,
    false
  );
  const memory = rememberMemory("Keep me").memory;
  assert.equal(
    (
      await tools.forgetMemory.execute(
        { memoryId: memory.id },
        { memoryWritesAllowed: false }
      )
    ).success,
    false
  );
  await runAgent(
    [{ role: "system", content: "A scheduled event has occurred." }],
    1,
    async () => ({
      content: "",
      tool_calls: [
        {
          id: "save",
          function: {
            index: 0,
            name: "rememberMemory",
            arguments: { content: "Do not save" }
          }
        }
      ]
    })
  );
  assert.deepEqual(getMemories(), [memory]);
});

test("agent records save/list/forget results and injects fresh facts across chats", async () => {
  let step = 0;
  const saved = await runAgent(
    [{ role: "user", content: "Remember I prefer short answers." }],
    1,
    async () =>
      step++ === 0
        ? {
            content: "",
            tool_calls: [
              {
                id: "save",
                function: {
                  index: 0,
                  name: "rememberMemory",
                  arguments: { content: "I prefer short answers." }
                }
              }
            ]
          }
        : { content: "Saved." }
  );
  assert.equal(saved.response, "Saved.");
  assert.ok(
    saved.messages.some(
      (m) => m.tool_name === "rememberMemory" && JSON.parse(m.content).success
    )
  );
  const id = getMemories()[0].id;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.ok(
      body.messages.some(
        (m: { content: string }) =>
          m.content.startsWith("Current saved facts shared across chats") &&
          m.content.includes("short answers")
      )
    );
    return Response.json({ message: { content: "Brief reply." } });
  };
  await generateResponse([
    { role: "user", content: "Hello from a different chat" }
  ]);
  step = 0;
  const deleted = await runAgent(
    [{ role: "user", content: "Forget my answer preference." }],
    2,
    async () => {
      step++;
      if (step === 1)
        return {
          content: "",
          tool_calls: [
            {
              id: `forget-${step}`,
              function: {
                index: 0,
                name: "forgetMemory",
                arguments: { memoryId: id }
              }
            }
          ]
        };
      return { content: "Forgotten." };
    }
  );
  assert.equal(
    step,
    2,
    "A direct forget call must execute before the next model reply"
  );
  assert.ok(
    deleted.messages.some(
      (m) => m.tool_name === "forgetMemory" && JSON.parse(m.content).success
    )
  );
  assert.equal(memoryContext(), undefined);
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.ok(
      !body.messages.some((m: { content: string }) =>
        m.content.startsWith("Current saved facts shared across chats")
      )
    );
    return Response.json({ message: { content: "Hello." } });
  };
  await generateResponse([{ role: "user", content: "New chat" }]);
});
