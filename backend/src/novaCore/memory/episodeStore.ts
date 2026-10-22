import { db } from "../../database/database";

export type EpisodeInput = {
  sourceConversationId: number;
  sourceMessageIds: number[];
  happened: string;
  participants: string[];
  observedReactions: {
    participant: string;
    messageId: number;
    quote: string;
  }[];
  novaReportedReaction: { messageId: number; quote: string } | null;
  outcome: string | null;
  significance: "low" | "medium" | "high";
  firstPersonAccount: string;
};
export type Episode = EpisodeInput & {
  id: number;
  eventAt: string;
  recordedAt: string;
};
type EpisodeRow = {
  id: number;
  event_at: string;
  recorded_at: string;
  account: string;
};

function validId(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("Supply a positive integer ID.");
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 20000)
    throw new Error("Episode text must contain 1 to 20000 characters.");
}
function fromRow(row: EpisodeRow): Episode {
  return {
    ...JSON.parse(row.account),
    id: row.id,
    eventAt: row.event_at,
    recordedAt: row.recorded_at
  };
}

// Development-only storage entry point. Accounts are interpretations; quotes are
// checked observations. No belief writes or model inference happen here.
export function saveEpisode(input: EpisodeInput): Episode {
  validId(input.sourceConversationId);
  if (
    !Array.isArray(input.sourceMessageIds) ||
    !input.sourceMessageIds.length ||
    input.sourceMessageIds.length > 100 ||
    new Set(input.sourceMessageIds).size !== input.sourceMessageIds.length
  )
    throw new Error("Supply 1 to 100 distinct source message IDs.");
  input.sourceMessageIds.forEach(validId);
  text(input.happened);
  text(input.firstPersonAccount);
  if (
    !Array.isArray(input.participants) ||
    !input.participants.length ||
    input.participants.length > 20
  )
    throw new Error("Supply episode participants.");
  input.participants.forEach(text);
  if (input.outcome !== null) text(input.outcome);
  if (!["low", "medium", "high"].includes(input.significance))
    throw new Error("Supply low, medium, or high significance.");
  if (
    !Array.isArray(input.observedReactions) ||
    input.observedReactions.length > 100
  )
    throw new Error("Supply an array of observed reactions.");

  return db.transaction(() => {
    const sources = input.sourceMessageIds.map((id) => {
      const source = db
        .prepare(
          `SELECT m.id, m.role, m.content, m.created_at FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = ? AND m.conversation_id = ?`
        )
        .get(id, input.sourceConversationId) as
        | { id: number; role: string; content: string; created_at: string }
        | undefined;
      if (!source)
        throw new Error(
          "Episode source message is missing or belongs to another conversation."
        );
      return source;
    });
    const checkQuote = (
      reaction: { messageId: number; quote: string },
      nova = false
    ) => {
      validId(reaction.messageId);
      text(reaction.quote);
      const source = sources.find(({ id }) => id === reaction.messageId);
      if (
        !source ||
        !source.content.includes(reaction.quote) ||
        (nova
          ? source.role !== "assistant"
          : !["user", "assistant"].includes(source.role))
      )
        throw new Error(
          "Reaction must quote a referenced conversation message; Nova's reaction must be her own message."
        );
    };
    for (const reaction of input.observedReactions) {
      if (!input.participants.includes(reaction.participant))
        throw new Error("Reaction participant must belong to the episode.");
      checkQuote(reaction);
    }
    if (input.novaReportedReaction !== null)
      checkQuote(input.novaReportedReaction, true);
    const eventAt = [...sources].sort((a, b) => a.id - b.id)[0].created_at;
    const recordedAt = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO episodes (event_at, recorded_at, conversation_id, account)
      VALUES (?, ?, ?, ?)`
      )
      .run(
        eventAt,
        recordedAt,
        input.sourceConversationId,
        JSON.stringify(input)
      );
    return getEpisode(Number(result.lastInsertRowid))!;
  })();
}

export function getEpisode(id: number): Episode | undefined {
  validId(id);
  const row = db.prepare("SELECT * FROM episodes WHERE id = ?").get(id) as
    EpisodeRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function listEpisodes(): Episode[] {
  return (
    db.prepare("SELECT * FROM episodes ORDER BY id ASC").all() as EpisodeRow[]
  ).map(fromRow);
}

export function deleteEpisode(id: number): boolean {
  validId(id);
  return db.prepare("DELETE FROM episodes WHERE id = ?").run(id).changes === 1;
}
