import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { validateMemoryWrite } from "../src/novaCore/memory/memoryWritePolicy";
import { selectAutomaticMemory } from "../src/novaCore/memory/automaticMemory";

const nativeFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = nativeFetch;
});
const candidate = {
  userMessage: "I generally prefer concise answers.",
  content: "User prefers concise answers.",
  operation: "rememberMemory" as const
};

test("selection uses the latest statement and current facts, with no chat history or tools", async () => {
  const memories = [
    { id: 7, content: "User prefers short answers.", createdAt: "2026-10-17" }
  ];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(JSON.parse(body.messages[1].content), {
      userMessage: "I now prefer detailed answers.",
      memories: [{ id: 7, content: "User prefers short answers." }]
    });
    assert.equal(body.options.temperature, 0);
    assert.equal(body.tools, undefined);
    return Response.json({
      message: {
        content: JSON.stringify({
          operation: "updateMemory",
          memoryId: 7,
          content: "User prefers detailed answers."
        })
      }
    });
  };
  assert.deepEqual(
    await selectAutomaticMemory("I now prefer detailed answers.", memories),
    {
      operation: "updateMemory",
      memoryId: 7,
      content: "User prefers detailed answers."
    }
  );
});

test("selection rejects missing facts, unknown operations and invented memory IDs", async () => {
  for (const selection of [
    { operation: "updateMemory", content: "A fact", memoryId: 999 },
    { operation: "rememberMemory", content: " " },
    { operation: "forgetMemory", content: "A fact" },
    null
  ]) {
    globalThis.fetch = async () =>
      Response.json({ message: { content: JSON.stringify(selection) } });
    await assert.rejects(selectAutomaticMemory("A user statement", []));
  }
});

test("eligibility requests are isolated, non-streamed, and require current-message evidence", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.options.temperature, 0);
    assert.equal(body.stream, false);
    assert.equal(body.messages.length, 2);
    assert.deepEqual(JSON.parse(body.messages[1].content), candidate);
    assert.equal(body.tools, undefined);
    return Response.json({
      message: {
        content: JSON.stringify({
          allowed: true,
          evidence: candidate.userMessage
        })
      }
    });
  };
  await validateMemoryWrite(candidate);
});

test("denials, malformed decisions and fabricated evidence fail closed", async () => {
  for (const decision of [
    { allowed: false, evidence: "" },
    { allowed: "true", evidence: candidate.userMessage },
    { allowed: true, evidence: "" },
    { allowed: true, evidence: "I prefer tea every Friday" },
    null
  ]) {
    globalThis.fetch = async () =>
      Response.json({ message: { content: JSON.stringify(decision) } });
    await assert.rejects(validateMemoryWrite(candidate));
  }
  globalThis.fetch = async () =>
    Response.json({ message: { content: "not JSON" } });
  await assert.rejects(validateMemoryWrite(candidate));
  globalThis.fetch = async () => {
    throw new Error("Offline");
  };
  await assert.rejects(validateMemoryWrite(candidate), /Offline/);
});
