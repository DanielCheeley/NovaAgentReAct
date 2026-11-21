import type { Message } from "../../types/conversationType";

export type MemoryWriteTool = "rememberMemory" | "forgetMemory" | "updateMemory";
export const memoryWriteTools: ReadonlySet<string> = new Set<MemoryWriteTool>([
  "rememberMemory",
  "forgetMemory",
  "updateMemory"
]);
export const memoryCorrectionAuthorizationError =
  "Ask me to update the saved memory and say what should replace it.";

export function requestedMemoryWrite(message?: Message): MemoryWriteTool | undefined {
  if (message?.role !== "user") return;
  const text = message.content
    .trim()
    .replace(
      /^(?:nova[,!:]?\s+)?(?:please\s+)?(?:(?:can|could|would) you|i (?:want|need|would like) you to)\s+(?:please\s+)?/i,
      ""
    )
    .replace(/^(?:nova[,!:]?\s+)?(?:please\s+)?/i, "");
  if (
    /^(?:remember|save)\s+(?!what\b|when\b|where\b|how\b|why\b|who\b|if\b|whether\b)/i.test(
      text
    )
  )
    return "rememberMemory";
  if (/^(?:forget|delete (?:the |my )?(?:saved |memory )?fact)\s+/i.test(text))
    return "forgetMemory";
  if (
    /^(?:correct|update|change|fix|replace|revise)\s+(?:(?:(?:the|my|your|that|this|a)\s+)?(?:(?:saved|stored)\s+)?(?:memory|fact|preference|record|notes)\b|what (?:you (?:remember|saved|stored)|(?:you've|you have) (?:saved|stored))\b)/i.test(
      text
    )
  )
    return "updateMemory";
}

export function requestedTurnMemoryWrite(messages: Message[]): MemoryWriteTool | undefined {
  const latest = messages.at(-1);
  const explicit = requestedMemoryWrite(latest);
  if (explicit || latest?.role !== "user") return explicit;

  const retry = /^(?:i(?: am|'m) requesting (?:an update|a correction)|(?:yes,?\s+)?(?:please\s+)?(?:update|correct|fix) (?:it|that))[.!]?$/i;
  if (!retry.test(latest.content.trim())) return undefined;

  const history = messages.slice(0, -1);
  const previousUser = history.findLastIndex(({ role }) => role === "user");
  const previousUpdate = history.slice(previousUser + 1).findLast(
    ({ role, tool_name }) => role === "tool" && tool_name === "updateMemory"
  );
  if (!previousUpdate) return undefined;

  try {
    const { success, error } = JSON.parse(previousUpdate.content);
    if (success === false && (
      error === memoryCorrectionAuthorizationError ||
      error === "Only a user request can correct a memory."
    )) return "updateMemory";
  } catch {
    // A malformed stored result cannot authorize a retry.
  }
}

export function isMemoryRecall(text: string): boolean {
  return /\b(?:what|which|how much)\b[^.!?\n]{0,100}\b(?:remember|recall|saved (?:facts|memories|interests))\b|\b(?:do|can|could) you (?:still )?(?:remember|recall)\b|^\s*(?:recall|remind me what)\b|\bwhat (?:are|were) (?:some of )?your (?:saved )?interests\b|\bdid you come away with any tentative interest\b/i.test(
    text
  );
}
