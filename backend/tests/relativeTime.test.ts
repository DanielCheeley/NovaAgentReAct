import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeTaskArguments } from "../src/novaCore/tasks/relativeTime";
test("relative delays roll over calendar boundaries in the requested timezone", () => {
  const args = relativeTaskArguments(
    { timezone: "America/Chicago" },
    10,
    Date.parse("2026-10-11T14:59:55Z")
  );
  assert.equal(args.date, "2026-10-11");
  assert.equal(args.time, "10:00:05");
});
