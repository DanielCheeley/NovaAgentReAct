import type { RequestTiming } from "../types/generationType";

const recent: RequestTiming[] = [];

export function recordTiming(timing: RequestTiming) {
  recent.push(timing);
  if (recent.length > 100) recent.shift();
  // No prompts, arguments, or generated text in performance logs.
  console.info("Nova timing", JSON.stringify(timing));
}

export function timingSummary() {
  const completed = recent.filter((sample) => sample.status === "completed");
  const summarize = (values: number[]) => {
    const ordered = [...values].sort((a, b) => a - b);
    const percentile = (p: number) =>
      ordered.length ? ordered[Math.ceil(p * ordered.length) - 1] : null;
    return {
      samples: ordered.length,
      p50: percentile(0.5),
      p95: percentile(0.95)
    };
  };
  return {
    window: recent.length,
    cancelled: recent.filter((sample) => sample.status === "cancelled").length,
    errors: recent.filter((sample) => sample.status === "error").length,
    responseMs: summarize(completed.map((sample) => sample.elapsedMs)),
    firstContentMs: summarize(
      completed.flatMap((sample) =>
        sample.firstContentMs === null ? [] : [sample.firstContentMs]
      )
    )
  };
}
