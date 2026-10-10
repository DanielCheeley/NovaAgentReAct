import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTaskTime } from "../src/novaCore/tasks/taskTime";

test("task times preserve timezone offsets across winter and summer", () => {
  for (const [date, expected] of [
    ["2030-01-01", "2030-01-01T18:00:00.000Z"],
    ["2030-07-01", "2030-07-01T17:00:00.000Z"]
  ]) {
    const result = resolveTaskTime({
      date,
      time: "12:00:00",
      timezone: "America/Chicago"
    });
    assert.equal(result.runAt.toISOString(), expected);
    assert.match(result.zonedDateTime.toString(), /America\/Chicago/);
  }
});

test("invalid task time/timezone still throws before persistence", () => {
  assert.throws(() =>
    resolveTaskTime({
      date: "invalid",
      time: "12:00:00",
      timezone: "America/Chicago"
    })
  );
  assert.throws(() =>
    resolveTaskTime({
      date: "2030-01-01",
      time: "12:00:00",
      timezone: "invalid"
    })
  );
});
