import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const directory = mkdtempSync(path.join(tmpdir(), "nova-review-test-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../src/database/database");
const { addMessage } = await import("../src/novaCore/memory/conversationStore");
const { reviewConversationSegment } =
  await import("../src/novaCore/memory/reviewConversationSegment");
const { listEpisodes, deleteEpisode } =
  await import("../src/novaCore/memory/episodeStore");
beforeEach(() =>
  db.exec(
    "DELETE FROM episode_reviews; DELETE FROM episodes; DELETE FROM messages; DELETE FROM conversations;"
  )
);
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  addMessage(1, {
    role: "user",
    content: "I finally finished my first painting. I feel proud."
  });
  addMessage(1, { role: "assistant", content: "I'm happy for you!" });
  const ids = (
    db.prepare("SELECT id FROM messages ORDER BY id").all() as { id: number }[]
  ).map(({ id }) => id);
  return {
    segment: {
      conversationId: 1,
      firstMessageId: ids[0],
      lastMessageId: ids[1]
    },
    candidate: {
      sourceMessageIds: ids,
      happened: "The user reported finishing their first painting.",
      participants: ["user", "nova"],
      observedReactions: [
        { participant: "user", messageId: ids[0], quote: "I feel proud." }
      ],
      novaReportedReaction: { messageId: ids[1], quote: "I'm happy for you!" },
      outcome: null,
      significance: "medium",
      firstPersonAccount:
        "The user shared an accomplishment and I congratulated them."
    }
  };
}
const reviewCount = () =>
  (
    db.prepare("SELECT COUNT(*) AS n FROM episode_reviews").get() as {
      n: number;
    }
  ).n;
test("accepted review is atomic and repeated or overlapping review cannot duplicate it", async () => {
  const { segment, candidate } = fixture();
  let calls = 0;
  const reviewer = async () => {
    calls++;
    return { episodes: [candidate] };
  };
  const result = await reviewConversationSegment(segment, { reviewer });
  assert.equal(result.episodeIds.length, 1);
  assert.equal(reviewCount(), 1);
  deleteEpisode(result.episodeIds[0]);
  assert.equal(
    (await reviewConversationSegment(segment, { reviewer })).alreadyReviewed,
    true
  );
  assert.equal(calls, 1);
  assert.deepEqual(listEpisodes(), []);
  await assert.rejects(
    reviewConversationSegment(
      { ...segment, firstMessageId: segment.lastMessageId },
      { reviewer }
    ),
    /overlap/
  );
});
test("a no-save decision is checkpointed", async () => {
  const { segment } = fixture();
  assert.deepEqual(
    await reviewConversationSegment(segment, {
      reviewer: async () => ({ episodes: [] })
    }),
    { alreadyReviewed: false, episodeIds: [] }
  );
  assert.equal(reviewCount(), 1);
  assert.deepEqual(listEpisodes(), []);
});

test("a Discord chat-only turn can recall a reviewed episode without tools", async (t) => {
  const { handleMessage } = await import("../src/novaCore/agent");
  const { segment, candidate } = fixture();
  await reviewConversationSegment(segment, {
    reviewer: async () => ({ episodes: [candidate] })
  });

  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.equal(body.tools, undefined);
    assert.ok(
      body.messages.some(
        (message: { role: string; content: string }) =>
          message.role === "system" && message.content.includes(candidate.happened)
      )
    );
    return Response.json({ message: { content: "You finished your first painting." } });
  });
  const reply = await handleMessage(2, "alex: Nova, how did my painting go?", {
    chatOnly: true,
    recallChannelMemory: true
  });
  assert.equal(reply.response, "You finished your first painting.");
  assert.ok(
    db.prepare(`SELECT 1 FROM memory_informed_replies r
      JOIN messages m ON m.id = r.message_id WHERE m.conversation_id = 2`).get()
  );
});

test("web and Discord prompts can recall the other database with its source label", async (t) => {
  const { generateResponse } = await import("../src/novaCore/model");
  const { configureMemorySources } = await import("../src/novaCore/memory/memorySources");
  const { rememberMemory, forgetMemory } = await import("../src/novaCore/memory/longTermMemoryStore");
  const { segment, candidate } = fixture();
  const discordDatabase = path.join(directory, "discord.db");
  const webDatabase = path.join(directory, "web.db");
  const webFact = "The user takes coffee without sugar.";
  const systemMessages: string[] = [];
  t.after(() => configureMemorySources("Web app"));
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    systemMessages.push(body.messages
      .filter((message: { role: string }) => message.role === "system")
      .map((message: { content: string }) => message.content)
      .join("\n"));
    return Response.json({ message: { content: "Recalled." } });
  });

  const { episodeIds } = await reviewConversationSegment(segment, {
    reviewer: async () => ({ episodes: [candidate] })
  });
  await db.backup(discordDatabase);
  db.prepare("DELETE FROM episodes WHERE id = ?").run(episodeIds[0]);
  const { memory } = rememberMemory(webFact);
  t.after(() => db.prepare("DELETE FROM memories WHERE id = ?").run(memory.id));
  await db.backup(webDatabase);

  configureMemorySources("Web app", discordDatabase);
  await generateResponse([{ role: "user", content: "How did the painting go?" }]);
  assert.ok(systemMessages[0].split("Memory source: Discord\n")[1]?.includes(candidate.happened));
  await generateResponse([{ role: "user", content: "What do you remember from Discord?" }]);
  assert.ok(systemMessages[1].split("Memory source: Discord\n")[1]?.includes(candidate.happened));
  assert.ok(!systemMessages[1].includes(webFact));

  forgetMemory(memory.id);
  configureMemorySources("Discord", webDatabase);
  await generateResponse([{ role: "user", content: "alex: Nova, what do you remember from the web app?" }], {
    chatOnly: true,
    recallChannelMemory: true
  });
  assert.ok(systemMessages[2].split("Memory source: Web app\n")[1]?.includes(webFact));
});
test("bad candidates roll back the entire batch and leave the range retryable", async () => {
  const { segment, candidate } = fixture();
  const bad = {
    ...candidate,
    sourceMessageIds: [segment.lastMessageId],
    observedReactions: [],
    novaReportedReaction: {
      messageId: segment.lastMessageId,
      quote: "Invented reaction"
    }
  };
  const first = {
    ...candidate,
    sourceMessageIds: [segment.firstMessageId],
    novaReportedReaction: null
  };
  await assert.rejects(
    reviewConversationSegment(segment, {
      reviewer: async () => ({ episodes: [first, bad] })
    }),
    /quote/
  );
  assert.deepEqual(listEpisodes(), []);
  assert.equal(reviewCount(), 0);
  await reviewConversationSegment(segment, {
    reviewer: async () => ({ episodes: [candidate] })
  });
  assert.equal(listEpisodes().length, 1);
});
test("new activity, edited sources, and cancellation prevent stale writes", async () => {
  for (const mutate of [
    () => addMessage(1, { role: "user", content: "More context" }),
    () =>
      db
        .prepare(
          "UPDATE messages SET content='Changed' WHERE conversation_id=1"
        )
        .run()
  ]) {
    db.exec("DELETE FROM messages; DELETE FROM conversations;");
    const { segment, candidate } = fixture();
    await assert.rejects(
      reviewConversationSegment(segment, {
        reviewer: async () => {
          mutate();
          return { episodes: [candidate] };
        }
      }),
      /changed/
    );
    assert.deepEqual(listEpisodes(), []);
    assert.equal(reviewCount(), 0);
  }
  const { segment } = fixture();
  const controller = new AbortController();
  await assert.rejects(
    reviewConversationSegment(segment, {
      signal: controller.signal,
      reviewer: async () => {
        controller.abort();
        return { episodes: [] };
      }
    })
  );
  assert.equal(reviewCount(), 0);
});
test("malformed output, wrong attribution, and model failures leave persistence unchanged", async () => {
  const { segment, candidate } = fixture();
  for (const output of [
    null,
    {},
    {
      episodes: [
        {
          ...candidate,
          observedReactions: [
            {
              participant: "user",
              messageId: segment.lastMessageId,
              quote: "I'm happy for you!"
            }
          ]
        }
      ]
    },
    { episodes: [{ ...candidate, sourceMessageIds: [999999] }] }
  ]) {
    await assert.rejects(
      reviewConversationSegment(segment, { reviewer: async () => output })
    );
    assert.deepEqual(listEpisodes(), []);
    assert.equal(reviewCount(), 0);
  }
  await assert.rejects(
    reviewConversationSegment(segment, {
      reviewer: async () => {
        throw new Error("Model offline");
      }
    }),
    /offline/
  );
  assert.equal(reviewCount(), 0);
});

test("durable checkpoints survive restart and concurrent reviews commit once", async () => {
  const { segment, candidate } = fixture();
  const reviewer = async () => ({ episodes: [candidate] });
  const results = await Promise.all([
    reviewConversationSegment(segment, { reviewer }),
    reviewConversationSegment(segment, { reviewer })
  ]);
  assert.equal(
    results.filter(({ alreadyReviewed }) => !alreadyReviewed).length,
    1
  );
  assert.equal(listEpisodes().length, 1);
  const program = `const {reviewConversationSegment}=await import('./src/novaCore/memory/reviewConversationSegment.ts');
    const result=await reviewConversationSegment(${JSON.stringify(segment)}, {reviewer:async()=>{throw new Error('Must not call model')}});
    console.log(JSON.stringify(result)); const {db}=await import('./src/database/database.ts'); db.close();`;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    { env: process.env, encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(output), {
    alreadyReviewed: true,
    episodeIds: []
  });
});

test("idle review skips history, aborts on chat, and resumes pending work from disk state", async () => {
  const {
    initializeIdleReview,
    beginChatActivity,
    runIdleReview,
    pendingSegment
  } = await import("../src/novaCore/memory/idleMemoryReview");
  fixture();
  initializeIdleReview();
  assert.equal(pendingSegment(), undefined);
  addMessage(1, { role: "user", content: "A new turn" });
  addMessage(1, { role: "assistant", content: "New response" });
  const pending = pendingSegment();
  assert.ok(pending);
  const finish = beginChatActivity();
  await runIdleReview(0, async () => {
    assert.fail("reviewed active chat");
  });
  finish();
  const interrupted = await runIdleReview(0, (segment, options) =>
    reviewConversationSegment(segment, {
      ...options,
      reviewer: async (_sources, signal) => {
        const end = beginChatActivity();
        assert.equal(signal.aborted, true);
        end();
        return { episodes: [] };
      }
    })
  );
  assert.equal(interrupted, undefined);
  assert.equal(reviewCount(), 0);
  initializeIdleReview();
  assert.deepEqual(pendingSegment(), pending);
  await runIdleReview(0, (segment, options) =>
    reviewConversationSegment(segment, {
      ...options,
      reviewer: async () => ({ episodes: [] })
    })
  );
  assert.equal(reviewCount(), 1);
  assert.equal(pendingSegment(), undefined);
});

test("forgotten episode sources cannot be saved or reviewed again", async () => {
  const { saveEpisode } = await import("../src/novaCore/memory/episodeStore");
  const { segment, candidate } = fixture();
  const input = {
    ...candidate,
    significance: "medium" as const,
    sourceConversationId: segment.conversationId
  };
  assert.equal(deleteEpisode(saveEpisode(input).id), true);
  assert.throws(() => saveEpisode(input), /forgotten/);
  await assert.rejects(
    reviewConversationSegment(segment, {
      reviewer: async () => {
        assert.fail("forgotten messages reached the reviewer");
      }
    }),
    /forgotten/
  );
});

test("Ollama paraphrases are omitted while exact reactions are saved", async () => {
  const { segment, candidate } = fixture();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            episodes: [
              {
                ...candidate,
                novaReportedReaction: {
                  messageId: segment.lastMessageId,
                  quote: "I was pleased."
                }
              }
            ]
          })
        }
      });
    assert.equal(
      (await reviewConversationSegment(segment)).episodeIds.length,
      1
    );
    assert.equal(listEpisodes()[0].novaReportedReaction, null);
    assert.deepEqual(
      listEpisodes()[0].observedReactions,
      candidate.observedReactions
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("recall-only turns are checkpointed without asking the reviewer", async () => {
  const { segment } = fixture();
  db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
    "What do you remember about our conversations about fossils?",
    segment.firstMessageId
  );
  const result = await reviewConversationSegment(segment, {
    reviewer: async () => assert.fail("Recall reached the reviewer")
  });
  assert.deepEqual(result.episodeIds, []);
  assert.equal(reviewCount(), 1);
});

test("persisted memory provenance is provided to the reviewer for non-trigger phrasing", async () => {
  const { segment } = fixture();
  db.prepare("INSERT INTO memory_informed_replies VALUES (?)").run(
    segment.lastMessageId
  );
  await reviewConversationSegment(segment, {
    reviewer: async (sources) => {
      assert.equal(sources[0].memoryInformed, false);
      assert.equal(sources.at(-1)?.memoryInformed, true);
      return { episodes: [] };
    }
  });
  assert.equal(reviewCount(), 1);
});
