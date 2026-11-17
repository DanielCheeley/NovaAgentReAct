import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { EpisodeInput } from "../src/novaCore/memory/episodeStore";

const directory = mkdtempSync(path.join(tmpdir(), "nova-episode-test-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../src/database/database");
const { addMessage, deleteConversation } =
  await import("../src/novaCore/memory/conversationStore");
const { saveEpisode, getEpisode, listEpisodes, deleteEpisode } =
  await import("../src/novaCore/memory/episodeStore");
const { getMemories } =
  await import("../src/novaCore/memory/longTermMemoryStore");

beforeEach(() => {
  db.exec(
    "DELETE FROM episodes; DELETE FROM messages; DELETE FROM conversations; DELETE FROM memories;"
  );
});
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function segment(): EpisodeInput {
  // Actual exchange from the development conversation, copied into disposable
  // storage. No personal database is read or modified by these tests.
  addMessage(1, {
    role: "user",
    content: "ok go ahead and go on to the next step"
  });
  addMessage(1, {
    role: "assistant",
    content:
      "I’ll add the next small piece: storing and retrieving one episode with its conversation sources."
  });
  const ids = (
    db
      .prepare("SELECT id FROM messages WHERE conversation_id = 1 ORDER BY id")
      .all() as { id: number }[]
  ).map(({ id }) => id);
  return {
    sourceConversationId: 1,
    sourceMessageIds: ids,
    happened:
      "The user authorized the next small memory step and Nova described episode storage.",
    participants: ["user", "nova"],
    observedReactions: [
      {
        participant: "user",
        messageId: ids[0],
        quote: "go ahead and go on to the next step"
      }
    ],
    novaReportedReaction: null,
    outcome: "Episode storage was selected as the next implementation step.",
    significance: "medium",
    firstPersonAccount:
      "The user asked me to continue. I described adding episode storage with conversation sources. No personal feeling was expressed."
  };
}

test("an episode survives process restart with sources and no automatic belief", () => {
  const input = segment();
  input.firstPersonAccount += " More event detail.".repeat(30);
  const episode = saveEpisode(input);
  assert.deepEqual(getEpisode(episode.id), episode);
  assert.deepEqual(listEpisodes(), [episode]);
  assert.equal(episode.novaReportedReaction, null);
  assert.ok(episode.firstPersonAccount.length > 300);
  const source = db
    .prepare("SELECT created_at FROM messages WHERE id = ?")
    .get(input.sourceMessageIds[0]) as { created_at: string };
  assert.equal(episode.eventAt, source.created_at);
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "const {listEpisodes}=await import('./src/novaCore/memory/episodeStore.ts'); console.log(JSON.stringify(listEpisodes())); const {db}=await import('./src/database/database.ts'); db.close();"
    ],
    { env: process.env, encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(output), [episode]);
  assert.deepEqual(getMemories(), []);
});

test("missing sources and invented or misattributed reaction quotes cannot write", () => {
  const input = segment();
  for (const invalid of [
    { ...input, sourceConversationId: 2 },
    { ...input, sourceMessageIds: [999999] },
    { ...input, sourceMessageIds: [] },
    {
      ...input,
      sourceMessageIds: [input.sourceMessageIds[0], input.sourceMessageIds[0]]
    },
    {
      ...input,
      observedReactions: [
        {
          participant: "user",
          messageId: input.sourceMessageIds[0],
          quote: "I am delighted"
        }
      ]
    },
    {
      ...input,
      novaReportedReaction: {
        messageId: input.sourceMessageIds[0],
        quote: "go ahead"
      }
    },
    { ...input, firstPersonAccount: "" }
  ])
    assert.throws(() => saveEpisode(invalid));
  assert.deepEqual(listEpisodes(), []);
  assert.deepEqual(getMemories(), []);
});

test("deleting one episode removes both accounts and leaves sources and facts alone", () => {
  const input = segment();
  const first = saveEpisode(input);
  const second = saveEpisode({ ...input, outcome: null });
  assert.equal(deleteEpisode(first.id), true);
  assert.equal(deleteEpisode(first.id), false);
  assert.equal(getEpisode(first.id), undefined);
  assert.deepEqual(listEpisodes(), [second]);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
    2
  );
  deleteConversation(1);
  assert.deepEqual(listEpisodes(), [second]);
  assert.throws(() => saveEpisode(input), /missing/);
  assert.deepEqual(getMemories(), []);
});
