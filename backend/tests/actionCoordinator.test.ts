import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionCoordinator,
  type ActionAdapter
} from "../src/novaCore/actions/coordinator";
import { reminderAdapter } from "../src/novaCore/actions/reminders";
import { toolSuccess, toolFailure } from "../src/types/toolTypes";
import type { Message } from "../src/types/conversationType";
import type { ScheduledTask } from "../src/types/taskTypes";

const task: ScheduledTask = {
  id: "verified",
  conversationId: 1,
  task: "Eat",
  runAt: new Date("2030-01-01T12:00:00Z"),
  status: "pending"
};
const adapter = () =>
  reminderAdapter(1, (id) => (id === task.id ? { ...task } : undefined));
const user = (content: string): Message => ({ role: "user", content });
const saved: Message[] = [
  user("remind me"),
  {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "created",
        function: {
          index: 0,
          name: "scheduleTask",
          arguments: { operation: "create", task: "Eat", delaySeconds: 60 }
        }
      }
    ]
  },
  {
    role: "tool",
    tool_name: "scheduleTask",
    tool_call_id: "created",
    content: JSON.stringify(toolSuccess({ taskId: "verified" }))
  }
];

test("reconstructed reminder context supports corrections without phrase matching", async () => {
  for (const text of [
    "i ment now",
    "try to do it a minute from now",
    "what about 10 am today?"
  ]) {
    let calls = 0;
    const actions = new ActionCoordinator(
      [adapter()],
      [...saved, user(text)],
      async (name, args) => {
        calls++;
        assert.equal(name, "rescheduleTask");
        assert.equal(args.taskId, "verified");
        return toolSuccess({ taskId: "verified" });
      }
    );
    assert.match(JSON.stringify(actions.context()), /pending/);
    assert.equal(
      (
        await actions.run("scheduleTask", {
          operation: "update",
          delaySeconds: 60
        })
      ).success,
      true
    );
    assert.equal(calls, 1);
  }
});

test("retry reuses verified success across requests and restarts", async () => {
  const actions = new ActionCoordinator(
    [adapter()],
    [...saved, user("try again")],
    async () => {
      throw new Error("must not execute");
    }
  );
  const result = await actions.run("scheduleTask", { operation: "retry" });
  assert.deepEqual(result, toolSuccess({ taskId: "verified" }));
});

test("failed requests can retry; duplicate calls within a turn execute once", async () => {
  const failed = [
    ...saved.slice(0, 2),
    { ...saved[2], content: JSON.stringify(toolFailure("temporary failure")) },
    user("try again")
  ];
  let calls = 0;
  const actions = new ActionCoordinator([adapter()], failed, async () => {
    calls++;
    return toolSuccess({ taskId: "verified" });
  });
  const args = { operation: "retry" };
  assert.equal((await actions.run("scheduleTask", args)).success, true);
  await actions.run("scheduleTask", args);
  assert.equal(calls, 1);
});

test("adapter validates ownership, pending status, time and required details before execution", async () => {
  for (const args of [
    { operation: "create" },
    { operation: "create", task: "Eat", delaySeconds: -1 },
    { operation: "create", task: "Eat", delaySeconds: 10, date: "2030-01-01" },
    { operation: "update", taskId: "other", delaySeconds: 10 },
    {
      operation: "create",
      task: "Eat",
      date: "2000-01-01",
      time: "12:00:00",
      timezone: "UTC"
    }
  ]) {
    const actions = new ActionCoordinator(
      [adapter()],
      [user("request")],
      async () => {
        throw new Error("executed invalid action");
      }
    );
    const result = await actions.run("scheduleTask", args);
    assert.equal(result.success, false);
    if (!result.success) assert.doesNotMatch(result.error, /executed invalid/);
  }
  for (const status of ["cancelled", "completed"] as const) {
    const actions = new ActionCoordinator(
      [reminderAdapter(1, () => ({ ...task, status }))],
      [user("update")],
      async () => {
        throw new Error("invalid execution");
      }
    );
    assert.equal(
      (
        await actions.run("rescheduleTask", {
          taskId: "verified",
          delaySeconds: 10
        })
      ).success,
      false
    );
  }
  const cross = new ActionCoordinator(
    [reminderAdapter(2, () => task)],
    [user("update")],
    async () => {
      throw new Error("invalid execution");
    }
  );
  assert.equal(
    (await cross.run("cancelTask", { taskId: "verified" })).success,
    false
  );
});

test("due events cannot start actions and unverified assistant claims are not state", async () => {
  const actions = new ActionCoordinator(
    [adapter()],
    [
      user("remind me"),
      { role: "assistant", content: "Done! taskId verified" },
      { role: "system", content: "due event" }
    ],
    async () => {
      throw new Error("invalid execution");
    }
  );
  assert.deepEqual(actions.context(), []);
  assert.equal(
    (
      await actions.run("scheduleTask", {
        operation: "create",
        task: "Eat",
        delaySeconds: 10
      })
    ).success,
    false
  );
});

test("coordinator supports another adapter and caches failed outcomes without reminder logic", async () => {
  const jobs: ActionAdapter = {
    kind: "job",
    tools: ["startJob"],
    prepare: (tool, args) => ({ tool, args }),
    resourceId: () => undefined,
    describe: () => ({})
  };
  let executions = 0;
  const actions = new ActionCoordinator([jobs], [user("run")], async () => {
    executions++;
    return toolFailure("failed");
  });
  await actions.run("startJob", { x: 1 });
  await actions.run("startJob", { x: 1 });
  assert.equal(executions, 1);
  assert.match(JSON.stringify(actions.context()), /job/);
});
