import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Exercise the configured live model without touching the user's database.
const directory = mkdtempSync(path.join(tmpdir(), "nova-memory-smoke-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "nova.db");
const { handleMessage } = await import("../src/novaCore/agent");
const { getMemories } =
  await import("../src/novaCore/memory/longTermMemoryStore");
const { db } = await import("../src/database/database");

async function turn(id: number, text: string) {
  const result = await handleMessage(id, text, {
    signal: AbortSignal.timeout(90_000),
    onToolTiming: ({ name, success }) =>
      console.log(JSON.stringify({ tool: name, success }))
  });
  assert.equal(result.cancelled, false, "Live model timed out");
  console.log(
    JSON.stringify({ chat: id, user: text, response: result.response })
  );
  return result.response;
}

try {
  await turn(
    1,
    "Remember this fact for future chats: my favorite tree is a ginkgo."
  );
  assert.equal(getMemories().length, 1, "Explicit save must create one fact");
  assert.match(getMemories()[0].content, /ginkgo/i);
  const listing = await turn(
    1,
    "What facts have you saved in long-term memory?"
  );
  // The model may answer from the fresh authoritative snapshot instead of
  // redundantly listing the same facts through a tool.
  assert.match(listing, /ginkgo/i);
  const recall = await turn(2, "What is my favorite tree?");
  assert.match(recall, /ginkgo/i, "New chat must recall the saved fact");
  const original = getMemories()[0];
  await turn(1, "Update my saved favorite tree from ginkgo to maple.");
  assert.equal(
    getMemories().length,
    1,
    "Update must replace rather than add a fact"
  );
  assert.equal(
    getMemories()[0].id,
    original.id,
    "Update must preserve the memory ID"
  );
  assert.match(getMemories()[0].content, /maple/i);
  assert.doesNotMatch(getMemories()[0].content, /ginkgo/i);
  const correctedRecall = await turn(3, "What is my favorite tree?");
  assert.match(correctedRecall, /maple/i);
  assert.doesNotMatch(correctedRecall, /ginkgo/i);
  await turn(2, "I also enjoy tea.");
  assert.equal(
    getMemories().length,
    1,
    "Casual facts must not be saved automatically"
  );
  await turn(1, "forget that");
  assert.equal(getMemories().length, 0, "Explicit forget must delete the fact");
  const afterForget = await turn(4, "What is my favorite tree?");
  assert.doesNotMatch(
    afterForget,
    /ginkgo|maple/i,
    "Forgotten fact must not reach a new chat"
  );
  console.log("Memory smoke test passed.");
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
