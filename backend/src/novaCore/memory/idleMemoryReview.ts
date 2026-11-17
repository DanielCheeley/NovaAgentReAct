import {
  initializePreferenceReview,
  reviewNextPreference
} from "./learnPreference";
import debug from "debug";
import { db } from "../../database/database";
import { reviewConversationSegment } from "./reviewConversationSegment";

const log = debug("NovaAgent:idleMemory");
let active = 0;
let lastActivity = Date.now();
let running: AbortController | undefined;

export function beginChatActivity() {
  active++;
  lastActivity = Date.now();
  running?.abort();
  return () => {
    active--;
    lastActivity = Date.now();
  };
}

let preferenceRetryAt = 0;
const retryAfter = new Map<string, number>();

export function initializeIdleReview() {
  initializePreferenceReview();
  db.exec(`INSERT OR IGNORE INTO idle_review_start (id, message_id)
    SELECT 1, COALESCE(MAX(id), 0) FROM messages`);
}

export function pendingSegment(now = Date.now()) {
  const conversations = db
    .prepare(
      `SELECT DISTINCT conversation_id AS id FROM messages
    WHERE id > (SELECT message_id FROM idle_review_start WHERE id = 1)
    ORDER BY conversation_id`
    )
    .all() as { id: number }[];
  for (const { id } of conversations) {
    const rows = db
      .prepare(
        `SELECT m.id, m.role, length(CAST(m.content AS BLOB)) AS size,
      EXISTS(SELECT 1 FROM forgotten_episode_sources WHERE message_id = m.id)
      OR EXISTS(SELECT 1 FROM episode_reviews r WHERE r.conversation_id = m.conversation_id
        AND m.id BETWEEN r.first_message_id AND r.last_message_id) AS covered
      FROM messages m WHERE m.conversation_id = ?
      AND m.id > (SELECT message_id FROM idle_review_start WHERE id = 1)
      ORDER BY m.id`
      )
      .all(id) as { id: number; role: string; size: number; covered: number }[];
    let batch: typeof rows = [];
    let bytes = 0;
    const ready = () => {
      if (!batch.some((row) => row.role === "user")) return undefined;
      const segment = {
        conversationId: id,
        firstMessageId: batch[0].id,
        lastMessageId: batch.at(-1)!.id
      };
      if ((retryAfter.get(retryKey(segment)) ?? 0) <= now) return segment;
    };
    for (const row of rows) {
      if (
        row.covered ||
        row.size > 25000 ||
        (batch.length &&
          row.role === "user" &&
          (batch.length >= 20 || bytes >= 10000)) ||
        batch.length >= 50 ||
        bytes + row.size > 25000
      ) {
        const segment = ready();
        if (segment) return segment;
        batch = [];
        bytes = 0;
      }
      if (!row.covered && row.size <= 25000) {
        batch.push(row);
        bytes += row.size;
      }
    }
    const segment = ready();
    if (segment) return segment;
  }
}

type Segment = NonNullable<ReturnType<typeof pendingSegment>>;
const retryKey = (s: Segment) =>
  `${s.conversationId}:${s.firstMessageId}:${s.lastMessageId}`;

export async function runIdleReview(
  delayMs: number,
  review = reviewConversationSegment
) {
  if (active || running || Date.now() - lastActivity < delayMs) return;
  const segment = pendingSegment();

  const controller = new AbortController();
  running = controller;
  try {
    if (!segment) {
      if (Date.now() < preferenceRetryAt) return;
      const result = await reviewNextPreference(
        AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)])
      );
      if (result)
        console.info(
          "[idle memory] Preference review for episode %d: %s",
          result.episodeId,
          result.decision
        );
      return;
    }
    console.info(
      "[idle memory] Reviewing conversation %d, messages %d-%d",
      segment.conversationId,
      segment.firstMessageId,
      segment.lastMessageId
    );
    const result = await review(segment, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)])
    });
    retryAfter.delete(retryKey(segment));
    console.info(
      "[idle memory] Conversation %d, messages %d�%d: %s",
      segment.conversationId,
      segment.firstMessageId,
      segment.lastMessageId,
      result.alreadyReviewed
        ? "already reviewed"
        : result.episodeIds.length
          ? `review complete; saved ${result.episodeIds.length} episode(s): #${result.episodeIds.join(", #")}`
          : "review complete; no episode saved (no eligible or meaningful new material)"
    );
  } catch (error) {
    if (controller.signal.aborted) {
      console.info(
        "[idle memory] Review interrupted by chat activity; unfinished work will retry."
      );
    } else {
      if (!segment) {
        preferenceRetryAt = Date.now() + 60_000;
        console.warn(
          "[idle memory] Preference review failed; retry in 60s: %s",
          (error as Error).message
        );
        return;
      }
      retryAfter.set(retryKey(segment), Date.now() + 60_000);
      console.warn(
        "[idle memory] Review failed for conversation %d; retry in 60s: %s",
        segment.conversationId,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    running = undefined;
  }
}

export function startIdleMemoryReview() {
  const delay = Number(process.env.MEMORY_REVIEW_IDLE_MS ?? 60_000);
  if (!Number.isSafeInteger(delay) || delay < 0)
    throw new Error("Invalid MEMORY_REVIEW_IDLE_MS");
  if (!delay) return;
  initializeIdleReview();
  const timer = setInterval(
    () => {
      void runIdleReview(delay).catch((error) =>
        log("Idle review tick failed: %s", error.name)
      );
    },
    Math.min(1000, delay)
  );
  timer.unref();
}
