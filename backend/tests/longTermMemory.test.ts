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
  updateMemory,
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

test("updates persist with the same identity and work at capacity", () => {
  const original = rememberMemory("I prefer short answers.").memory;
  for (let i = 1; i < MAX_MEMORIES; i++) rememberMemory(`Fact ${i}`);
  const updated = updateMemory(
    original.id,
    "  I prefer  detailed answers. "
  ).memory;
  assert.deepEqual(updated, {
    ...original,
    content: "I prefer detailed answers."
  });
  assert.equal(getMemories().length, MAX_MEMORIES);
  assert.equal(
    rememberMemory("i prefer detailed answers.").memory.id,
    original.id
  );
  const reopened = new Database(process.env.NOVA_DATABASE_PATH!);
  try {
    assert.deepEqual(
      reopened
        .prepare("SELECT content FROM memories WHERE id = ?")
        .get(original.id),
      {
        content: "I prefer detailed answers."
      }
    );
  } finally {
    reopened.close();
  }
});

test("invalid updates and duplicate conflicts preserve all facts", () => {
  const first = rememberMemory("First fact").memory;
  rememberMemory("Second fact");
  const before = getMemories();
  for (const id of [null, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => updateMemory(id, "Replacement"), /valid memory ID/);
  assert.throws(
    () => updateMemory(first.id + 1000, "Replacement"),
    /no longer exists/
  );
  for (const content of [null, 1, " ", "x".repeat(301)])
    assert.throws(() => updateMemory(first.id, content));
  assert.throws(
    () => updateMemory(first.id, " SECOND  fact "),
    /already contains/
  );
  assert.deepEqual(getMemories(), before);
  assert.deepEqual(updateMemory(first.id, "First fact").memory, first);
});

test("agent requires a fresh listing before corrections and new chat context contains only the replacement", async () => {
  const original = rememberMemory("I prefer short answers.").memory;
  let step = 0;
  const result = await runAgent(
    [
      {
        role: "user",
        content: "Update my saved preference to detailed answers."
      }
    ],
    1,
    async () =>
      step++ < 2
        ? {
            content: "",
            tool_calls: [
              {
                id: "update",
                function: {
                  index: 0,
                  name: "updateMemory",
                  arguments: {
                    memoryId: original.id,
                    content: "I prefer detailed answers."
                  }
                }
              }
            ]
          }
        : { content: "Updated." }
  );
  assert.equal(step, 3);
  assert.deepEqual(
    result.messages.filter((m) => m.role === "tool").map((m) => m.tool_name),
    ["getMemories", "updateMemory"]
  );
  assert.ok(
    result.messages.some(
      (m) => m.tool_name === "updateMemory" && JSON.parse(m.content).success
    )
  );
  assert.deepEqual(getMemories(), [
    { ...original, content: "I prefer detailed answers." }
  ]);
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const snapshot = body.messages.find((m: { content: string }) =>
      m.content.startsWith("Current saved facts shared across chats")
    );
    assert.match(snapshot.content, /detailed answers/);
    assert.doesNotMatch(snapshot.content, /short answers/);
    return Response.json({ message: { content: "Detailed reply." } });
  };
  await generateResponse([{ role: "user", content: "Hello from a new chat" }]);
  for (const context of [{}, { memoryWritesAllowed: false }]) {
    assert.equal(
      (
        await tools.updateMemory.execute(
          { memoryId: original.id, content: "Blocked" },
          context
        )
      ).success,
      false
    );
  }
  assert.equal(
    (
      await tools.updateMemory.execute(
        { memoryId: original.id, content: "" },
        { memoryWritesAllowed: true }
      )
    ).success,
    false
  );
  await runAgent(
    [{ role: "system", content: "Scheduled event" }],
    2,
    async () => ({
      content: "",
      tool_calls: [
        {
          id: "blocked",
          function: {
            index: 0,
            name: "updateMemory",
            arguments: { memoryId: original.id, content: "Blocked" }
          }
        }
      ]
    })
  );
  assert.equal(getMemories()[0].content, "I prefer detailed answers.");
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
