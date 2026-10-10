import type { Message } from "../../types/conversationType";

// Conservative request-shape checks, not mere mentions of scheduling keywords.
// Ambiguous requests remain unscheduled so Nova can ask for clarification.
const futureTime = /\b(?:tomorrow|tonight|later|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+(?:\d+|a|an|one|two|three|five|ten|fifteen|twenty|thirty)\s+(?:seconds?|minutes?|hours?|days?|weeks?)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|on\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b/i;
const requestPrefix = /^(?:(?:hey\s+)?nova[,!]?\s*)?(?:(?:please|okay|ok|yes|sure)[,]?\s+)*(?:(?:can|could|would|will)\s+you\s+)?/i;

function explicitRequest(text: string): boolean {
  const request = text.trim().replace(requestPrefix, "");
  // Questions about a reminder or code implementing one aren't requests to create one.
  if (/^remind\s+me\s+(?:how|what|why|who|whether)\b/i.test(request)) return false;
  if (/^remind\s+me\s+(?:to|about|in|at|on|tomorrow|tonight|later)\b/i.test(request)) {
    return true;
  }
  if (/^(?:set|create|add)\s+(?:(?:a|an|the)\s+)?(?:reminder|alarm)\b/i.test(request)) {
    return true;
  }
  if (/^schedule\s+(?:a\s+|an\s+|the\s+|this\b|that\b|it\b|me\b)/i.test(request)) {
    return true;
  }
  if (/^(?:write|make)\b/i.test(request) && /\b(?:function|code|script|program)\b/i.test(request)) return false;
  return /^(?:do|check|run|review|write|send|tell|notify|wake|make)\b/i.test(request)
    && futureTime.test(request);
}

export function schedulingAllowed(messages: Message[]): boolean {
  const latest = messages.at(-1);
  // A due task must not silently re-schedule itself from an old user request.
  if (!latest || latest.role !== "user") return false;
  if (explicitRequest(latest.content)) return true;

  // Only carry intent through a direct time-clarification exchange. Tool calls
  // or an unrelated turn terminate it; old reminders don't authorize new work.
  const question = messages.at(-2);
  const original = messages.at(-3);
  return Boolean(
    question?.role === "assistant" && !question.tool_calls?.length &&
    /\b(?:when|what time|which time|what date|which date|timezone|time zone)\b/i.test(question.content) &&
    original?.role === "user" && explicitRequest(original.content) &&
    (futureTime.test(latest.content) || (
      /\b(?:timezone|time zone)\b/i.test(question.content) &&
      /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(latest.content.trim())
    )) &&
    !/\b(?:don't|do not|never|cancel|instead)\b/i.test(latest.content)
  );
}

export const schedulingDenied =
  "Scheduling is not authorized by this request. Complete ordinary work directly. " +
  "Use scheduleTask only for an explicit reminder/future-execution request or its time clarification. " +
  "If the user's intent is ambiguous, ask before creating a task. Do not invent a delay.";

// Canonicalize argument order so repeated model calls share the same outcome.
export function schedulingKey(args: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(args).sort().map((key) => [key, args[key]]));
}
