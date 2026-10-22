import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Live configured model, isolated storage. These are labeled test scenarios,
// not personal experiences or a replay of deliberately deleted live episodes.
const directory = mkdtempSync(path.join(tmpdir(), "nova-episode-smoke-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "nova.db");
const { db } = await import("../src/database/database");
const { addMessage } = await import("../src/novaCore/memory/conversationStore");
const { reviewConversationSegment } =
  await import("../src/novaCore/memory/reviewConversationSegment");
const { getEpisode, listEpisodes } =
  await import("../src/novaCore/memory/episodeStore");

async function scenario(
  id: number,
  messages: { role: "user" | "assistant"; content: string }[],
  meaningful: boolean
) {
  messages.forEach((message) => addMessage(id, message));
  const rows = db
    .prepare("SELECT id FROM messages WHERE conversation_id = ? ORDER BY id")
    .all(id) as { id: number }[];
  const segment = {
    conversationId: id,
    firstMessageId: rows[0].id,
    lastMessageId: rows.at(-1)!.id
  };
  const result = await reviewConversationSegment(segment);
  console.log(
    JSON.stringify({
      scenario: id,
      result,
      episodes: result.episodeIds.map(getEpisode)
    })
  );
  if (meaningful)
    assert.ok(
      result.episodeIds.length > 0,
      "Meaningful disclosure should yield an episode"
    );
  else
    assert.equal(
      result.episodeIds.length,
      0,
      "Routine greeting should yield no episode"
    );
  const count = listEpisodes().length;
  assert.equal(
    (await reviewConversationSegment(segment)).alreadyReviewed,
    true
  );
  assert.equal(listEpisodes().length, count);
}
try {
  await scenario(
    1,
    [
      {
        role: "user",
        content:
          "I finally finished my first painting after three weeks of practice. I feel really proud."
      },
      { role: "assistant", content: "I'm happy for you! What did you paint?" },
      {
        role: "user",
        content:
          "A lake at sunset. Getting the reflection right was the hardest part, but I figured it out."
      }
    ],
    true
  );
  await scenario(
    2,
    [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi! How can I help?" }
    ],
    false
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n,
    0
  );
  console.log(
    "Live episode review passed: meaningful save, no-save, replay protection, zero belief writes."
  );
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
