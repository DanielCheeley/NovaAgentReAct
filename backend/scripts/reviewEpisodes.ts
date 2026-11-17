import { reviewConversationSegment } from "../src/novaCore/memory/reviewConversationSegment";
import { getEpisode } from "../src/novaCore/memory/episodeStore";
import { db } from "../src/database/database";

try {
  const args = process.argv.slice(2).map(Number);
  if (args.length !== 3)
    throw new Error(
      "Usage: npm run review:episodes -- <conversationId> <firstMessageId> <lastMessageId>"
    );
  const [conversationId, firstMessageId, lastMessageId] = args;
  const result = await reviewConversationSegment({
    conversationId,
    firstMessageId,
    lastMessageId
  });
  console.log(
    JSON.stringify(
      { ...result, episodes: result.episodeIds.map(getEpisode) },
      null,
      2
    )
  );
} finally {
  db.close();
}
