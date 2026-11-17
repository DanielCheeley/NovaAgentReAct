import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "nova-preference-"));
process.env.NOVA_DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../src/database/database");
const { addMessage } = await import("../src/novaCore/memory/conversationStore");
const { saveEpisode } = await import("../src/novaCore/memory/episodeStore");
const { learnPreference, preferenceContext } =
  await import("../src/novaCore/memory/learnPreference");
const { generateResponse } = await import("../src/novaCore/model");
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function episode(conversationId: number, response: string) {
  addMessage(conversationId, {
    role: "user",
    content: "What do you think of fossils?"
  });
  addMessage(conversationId, { role: "assistant", content: response });
  const ids = (
    db
      .prepare("SELECT id FROM messages WHERE conversation_id = ? ORDER BY id")
      .all(conversationId) as { id: number }[]
  )
    .map(({ id }) => id)
    .slice(-2);
  return saveEpisode({
    sourceConversationId: conversationId,
    sourceMessageIds: ids,
    happened: "Nova and the user talked about fossils.",
    participants: ["nova", "user"],
    observedReactions: [],
    novaReportedReaction: { messageId: ids[1], quote: response },
    outcome: null,
    significance: "medium",
    firstPersonAccount: "I talked about fossils with the user."
  }).id;
}

test("distinct evidence and acceptance yield tentative context in a fresh chat", async () => {
  const first = episode(1, "I think fossils are fascinating.");
  const second = episode(2, "I really enjoy learning how fossils form.");
  await assert.rejects(
    learnPreference("fossils", [first, first], async () => true),
    /distinct/
  );
  assert.equal(
    await learnPreference("fossils", [first, second], async () => false),
    false
  );
  assert.equal(preferenceContext("fossils"), undefined);
  const decide =
    process.env.NOVA_LIVE_PREFERENCE_TEST === "1"
      ? undefined
      : async () => true;
  assert.equal(await learnPreference("fossils", [first, second], decide), true);
  assert.equal(
    await learnPreference("fossils", [first, second], async () => true),
    false
  );
  assert.equal(preferenceContext("What time is it?"), undefined);
  assert.equal(preferenceContext("microfossils"), undefined);
  if (process.env.NOVA_LIVE_PREFERENCE_TEST === "1") {
    const result = await generateResponse([
      {
        role: "user",
        content:
          "What do you tentatively think about fossils, based on our past conversations? Answer without tools."
      }
    ]);
    assert.match(result.content, /fossil/i);
    console.log(result.content);
    return;
  }
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const { messages } = JSON.parse(init!.body as string);
      const context = messages.find((m: { content: string }) =>
        m.content.includes('"status":"tentative"')
      );
      assert.ok(context);
      assert.ok(context.content.includes('"subject":"nova"'));
      for (const id of [first, second])
        assert.ok(context.content.includes('"id":' + id));
      return Response.json({ message: { content: "I might enjoy fossils." } });
    };
    assert.equal(
      (
        await generateResponse([
          { role: "user", content: "What do you think of fossils?" }
        ])
      ).content,
      "I might enjoy fossils."
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("revision needs fresh support and a forgotten topic cannot be restored", async () => {
  const { revisePreference, forgetPreference } =
    await import("../src/novaCore/memory/learnPreference");
  const { deleteEpisode } = await import("../src/novaCore/memory/episodeStore");
  const first = episode(10, "I like fossil exhibits.");
  const second = episode(11, "I enjoy fossil displays.");
  const fresh = episode(12, "I especially enjoy museum exhibits.");
  assert.equal(
    await learnPreference("exhibits", [first, second], async () => true),
    true
  );
  await assert.rejects(
    revisePreference("exhibits", "museum exhibits", [first, second]),
    /fresh evidence/
  );
  assert.equal(
    await revisePreference(
      "exhibits",
      "museum exhibits",
      [second, fresh],
      async () => false
    ),
    false
  );
  assert.equal(
    await revisePreference(
      "exhibits",
      "museum exhibits",
      [second, fresh],
      async () => true
    ),
    true
  );
  assert.equal(preferenceContext("exhibits"), undefined);
  assert.ok(preferenceContext("museum exhibits"));
  assert.equal(forgetPreference("museum exhibits"), true);
  assert.equal(
    await learnPreference("museum exhibits", [second, fresh], async () => true),
    false
  );
  assert.equal(
    await learnPreference("fossil displays", [first, second], async () => true),
    true
  );
  assert.equal(deleteEpisode(first), true);
  assert.equal(preferenceContext("fossil displays"), undefined);
  await assert.rejects(
    learnPreference("fossil displays", [first, fresh], async () => true),
    /no longer exists/
  );
});

test("idle preference proposal requires a second evaluation and checkpoints its decision", async () => {
  const { initializePreferenceReview, reviewNextPreference } =
    await import("../src/novaCore/memory/learnPreference");
  const { episodeContext } =
    await import("../src/novaCore/memory/episodeStore");
  const first = episode(20, "I enjoy looking at fossil shells.");
  initializePreferenceReview();
  const next = episode(
    21,
    "Looking at fossil shells is something I find fascinating."
  );
  const original = globalThis.fetch;
  const output = [
    {
      proposal: {
        topic: "fossil shells",
        earlierEpisodeId: first,
        previousTopic: null
      }
    },
    { accept: true }
  ];
  try {
    globalThis.fetch = async () => {
      assert.ok(output.length, "unexpected model call");
      return Response.json({
        message: { content: JSON.stringify(output.shift()) }
      });
    };
    const signal = new AbortController().signal;
    assert.deepEqual(await reviewNextPreference(signal), {
      episodeId: next,
      changed: true,
      decision: `tentative preference saved: "fossil shells" (episodes #${first}, #${next})`
    });
    assert.equal(await reviewNextPreference(signal), undefined);
    assert.equal(output.length, 0);
    assert.match(preferenceContext("fossil shells")!, /tentative/);
    assert.match(episodeContext("fossils")!, /talked about fossils/);
    assert.equal(episodeContext("weather"), undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("contradicting evidence and elapsed time withhold tentative preferences", async () => {
  const { preferenceIsCurrent, reviewNextPreference } =
    await import("../src/novaCore/memory/learnPreference");
  const first = episode(30, "I enjoy fossil casts.");
  const second = episode(31, "I like examining fossil casts.");
  await learnPreference("fossil casts", [first, second], async () => true);
  assert.equal(preferenceIsCurrent("fossil casts", [first, second]), true);
  assert.equal(
    preferenceIsCurrent(
      "fossil casts",
      [first, second],
      Date.now() + 91 * 86400000
    ),
    false
  );
  db.prepare("UPDATE preference_review_progress SET episode_id = ?").run(
    second
  );
  const quote = "I no longer enjoy examining fossil casts.";
  const latest = episode(32, quote);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            proposal: null,
            conflict: { topic: "fossil casts", quote }
          })
        }
      });
    assert.equal(
      (await reviewNextPreference(new AbortController().signal))?.episodeId,
      latest
    );
    assert.equal(preferenceContext("fossil casts"), undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("one conversation cannot supply both episodes and automatic proposals cannot rename another interest", async () => {
  const { reviewNextPreference } =
    await import("../src/novaCore/memory/learnPreference");
  const first = episode(40, "I love the Moon landing footage.");
  const repeated = episode(40, "The descent is fascinating to me.");
  await assert.rejects(
    learnPreference("moon landings", [first, repeated], async () =>
      assert.fail("duplicate conversation reached evaluator")
    ),
    /separate conversations/
  );
  const other = episode(
    41,
    "I enjoy the Moon landing footage and find Jupiter's moons fascinating."
  );
  assert.equal(
    await learnPreference("moon landings", [first, other], async () => true),
    true
  );
  const newest = episode(42, "I find Jupiter's moons fascinating.");
  db.prepare("UPDATE preference_review_progress SET episode_id = ?").run(other);
  const original = globalThis.fetch;
  const responses = [
    {
      proposal: {
        topic: "jupiter moons",
        earlierEpisodeId: other,
        previousTopic: "moon landings"
      }
    },
    { accept: true }
  ];
  try {
    globalThis.fetch = async () => {
      assert.ok(responses.length);
      return Response.json({
        message: { content: JSON.stringify(responses.shift()) }
      });
    };
    assert.equal(
      (await reviewNextPreference(new AbortController().signal))?.episodeId,
      newest
    );
    assert.equal(responses.length, 0);
    assert.match(preferenceContext("moon landings")!, /moon landings/);
    assert.match(preferenceContext("jupiter moons")!, /jupiter moons/);
  } finally {
    globalThis.fetch = original;
  }
});
