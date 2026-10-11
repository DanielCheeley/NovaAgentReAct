import { generateResponse } from "../src/novaCore/model";
import type { ModelTiming } from "../src/types/generationType";

// Direct model calls only: no agent/tool execution or conversation persistence.
const runs = Number(process.argv[2] ?? 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10)
  throw new Error("Choose 1–10 runs");
const timings: ModelTiming[] = [];
for (let i = 0; i < runs; i++) {
  await generateResponse(
    [
      {
        role: "user",
        content: "Say hello in one short sentence. Do not use tools."
      }
    ],
    {
      signal: AbortSignal.timeout(120_000),
      onContent: () => {},
      onModelTiming: (timing) => {
        timings.push(timing);
        console.log(JSON.stringify({ run: i + 1, ...timing }));
      }
    }
  );
}
const ordered = timings
  .map((timing) => timing.firstContentMs!)
  .sort((a, b) => a - b);
console.log(
  JSON.stringify({
    runs,
    firstContentP50Ms: ordered[Math.ceil(runs * 0.5) - 1],
    firstContentP95Ms: ordered[Math.ceil(runs * 0.95) - 1],
    note: "Small prompt baseline; inspect loadMs for loading cost. This does not forcibly unload the live model."
  })
);
