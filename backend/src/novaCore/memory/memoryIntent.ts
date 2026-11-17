import type { Message } from "../../types/conversationType";

export function requestedMemoryWrite(message?: Message) {
  if (message?.role !== "user") return;
  const text = message.content
    .trim()
    .replace(
      /^(?:nova[,!:]?\s+)?(?:please\s+)?(?:can|could|would) you\s+(?:please\s+)?/i,
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
    /^(?:correct|update|change)\s+(?:(?:the|my|your)\s+)?(?:saved\s+)?(?:memory|fact|preference)\b/i.test(
      text
    )
  )
    return "updateMemory";
}

export function isMemoryRecall(text: string): boolean {
  return /\b(?:what|which|how much)\b[^.!?\n]{0,100}\b(?:remember|recall|saved (?:facts|memories|interests))\b|\b(?:do|can|could) you (?:still )?(?:remember|recall)\b|^\s*(?:recall|remind me what)\b|\bwhat (?:are|were) (?:some of )?your (?:saved )?interests\b|\bdid you come away with any tentative interest\b/i.test(
    text
  );
}
