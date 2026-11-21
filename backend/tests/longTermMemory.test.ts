import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";

const directory = mkdtempSync(path.join(tmpdir(), "nova-memory-test-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../src/database/database");
const {
  updateMemory,
  rememberMemory,
  getMemories,
  forgetMemory,
  memoryContext,
  MAX_MEMORIES
} = await import("../src/novaCore/memory/longTermMemoryStore");
const { tools } = await import("../src/novaCore/tools/toolRegistry");
const { runAgent } = await import("../src/novaCore/agentLoop");
const { handleMessage } = await import("../src/novaCore/agent");
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

test("chat-only turns omit saved facts and ignore model tool calls", async () => {
  const saved = rememberMemory("A private fact for web chat.");
  const prompt = "Remember that I like astronomy.";
  addMessage(1, { role: "user", content: "We were talking about stars." });

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.equal(body.tools, undefined);
    assert.ok(!JSON.stringify(body.messages).includes(saved.memory.content));
    assert.deepEqual(body.messages.slice(-2), [
      { role: "user", content: "We were talking about stars." },
      { role: "user", content: prompt }
    ]);
    return Response.json({
      message: {
        content: "Astronomy is a good topic for this chat.",
        tool_calls: [{ function: { name: "rememberMemory", arguments: { content: prompt } } }]
      }
    });
  };

  const result = await handleMessage(1, prompt, { chatOnly: true });
  assert.equal(result.response, "Astronomy is a good topic for this chat.");
  assert.deepEqual(getMemories(), [saved.memory]);
});

test("recent Discord messages give the model context without being stored", async () => {
  const recentChannelContext = [{ speaker: "Alex", text: "Let's play co-op tonight." }];
  const prompt = "Sam: Nova, what do you think?";
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.equal(body.messages.at(-2).role, "system");
    assert.ok(body.messages.at(-2).content.includes(JSON.stringify(recentChannelContext)));
    assert.deepEqual(body.messages.at(-1), { role: "user", content: prompt });
    return Response.json({ message: { content: "Sounds good to me." } });
  };

  await handleMessage(1, prompt, { chatOnly: true, recentChannelContext });
  assert.deepEqual(db.prepare("SELECT content FROM messages ORDER BY id").all(), [
    { content: prompt },
    { content: "Sounds good to me." }
  ]);
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
          m.content.includes("Current saved facts") &&
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
      if (step <= 2)
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
  assert.ok(deleted.messages.some((m) => m.tool_name === "getMemories"));
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
        m.content.includes("Current saved facts")
      )
    );
    return Response.json({ message: { content: "Hello." } });
  };
  await generateResponse([{ role: "user", content: "New chat" }]);
});

test("semantic records preserve uncertainty and correction is atomic", async () => {
  const first = rememberMemory("Nova may enjoy dinosaurs", {
    subject: "nova",
    status: "tentative"
  }).memory;
  assert.equal(first.type, "Semantic");
  assert.equal(first.origin, "explicit");
  assert.equal(first.subject, "nova");
  assert.equal(first.status, "tentative");
  const second = rememberMemory("Another fact").memory;
  assert.throws(
    () => updateMemory(first.id, second.content),
    /already contains/
  );
  assert.deepEqual(getMemories(), [first, second]);
  for (const invalid of ["", null, "x".repeat(301)])
    assert.throws(() => updateMemory(first.id, invalid));
  assert.throws(() => updateMemory(999999, "Missing"), /no longer exists/);
  const corrected = updateMemory(first.id, "Nova may enjoy fossils").memory;
  assert.equal(corrected.id, first.id);
  assert.equal(corrected.createdAt, first.createdAt);
  assert.equal(corrected.status, "tentative");
  assert.equal(corrected.subject, "nova");
  assert.ok(corrected.updatedAt >= first.updatedAt);
  assert.ok(memoryContext()!.includes('"status":"tentative"'));
  assert.equal(
    (
      await tools.updateMemory.execute(
        { memoryId: first.id, content: "Blocked" },
        { memoryWritesAllowed: false }
      )
    ).success,
    false
  );
  assert.deepEqual(getMemories(), [corrected, second]);
  for (let i = 2; i < MAX_MEMORIES; i++) rememberMemory(`Capacity fact ${i}`);
  assert.equal(
    updateMemory(first.id, "Correction at capacity").memory.id,
    first.id
  );
});

test("legacy schema migrates without losing facts and survives a second startup", () => {
  const legacyPath = path.join(directory, "legacy.db");
  const legacy = new Database(legacyPath);
  legacy.exec(`CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL,
    normalized_content TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  ); INSERT INTO memories VALUES (42, 'Old fact', 'old fact', '2026-01-01T00:00:00.000Z');`);
  legacy.close();
  for (let startup = 0; startup < 2; startup++) {
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "await import('./src/database/database.ts').then(({db}) => db.close())"
      ],
      { env: { ...process.env, NOVA_DATABASE_PATH: legacyPath } }
    );
  }
  const reopened = new Database(legacyPath);
  try {
    assert.deepEqual(reopened.prepare("SELECT * FROM memories").all(), [
      {
        id: 42,
        content: "Old fact",
        normalized_content: "old fact",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        subject: "user",
        status: "established",
        origin: "legacy"
      }
    ]);
  } finally {
    reopened.close();
  }
});

test("ordinary chat cannot execute an unsolicited fact save", async () => {
  let step = 0;
  const result = await runAgent(
    [
      {
        role: "user",
        content:
          "I learned how minerals preserve shells. What do you find interesting?"
      }
    ],
    1,
    async () =>
      step++ === 0
        ? {
            content: "",
            tool_calls: [
              {
                id: "unsolicited",
                type: "function",
                function: {
                  name: "rememberMemory",
                  arguments: { content: "User learned about shells." }
                }
              }
            ]
          }
        : { content: "Interesting." }
  );
  assert.equal(getMemories().length, 0);
  assert.ok(
    result.messages.some(
      (message) =>
        message.role === "tool" &&
        message.tool_name === "rememberMemory" &&
        !JSON.parse(message.content).success
    )
  );
});
