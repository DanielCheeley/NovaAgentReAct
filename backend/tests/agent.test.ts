import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runAgent } from "../src/novaCore/agent";
import { tools } from "../src/novaCore/tools/toolRegistry";
import { toolFailure, toolSuccess } from "../src/types/toolTypes";
import type { ModelResponse } from "../src/types/modelResponseType";

const originals = { ...tools };
afterEach(() => {
  for (const name of Object.keys(tools)) delete tools[name];
  Object.assign(tools, originals);
});

const call = (name: string): ModelResponse => ({
  content: "",
  tool_calls: [{ id: "test-call", function: { index: 0, name, arguments: {} } }]
});

test("every request gets a fresh clock result even when the model requests no tool", async () => {
  let reads = 0;
  tools.getDateAndTime = {
    execute: async () => toolSuccess({ time: ++reads })
  };
  for (let i = 1; i <= 2; i++) {
    await runAgent(
      [{ role: "user", content: "What time is it?" }],
      undefined,
      async (messages) => {
        const clock = messages.find((message) => message.role === "system");
        assert.ok(clock!.content.includes(`"time":${i}`));
        assert.ok(
          !messages.some(
            (message) => message.role === "tool" || message.tool_calls
          )
        );
        return { content: "Checked." };
      }
    );
  }
  assert.equal(reads, 2);
});

test("failed action stops before a repeated call or false success response", async () => {
  let executions = 0;
  let modelCalls = 0;
  tools.testAction = {
    execute: async () => {
      executions++;
      return toolFailure("Task not found");
    }
  };
  const result = await runAgent([], undefined, async () => {
    modelCalls++;
    return call("testAction");
  });
  assert.equal(executions, 1);
  assert.equal(modelCalls, 1);
  assert.match(result.response, /failed: Task not found/);
  assert.equal(
    result.messages.filter((message) => message.role === "tool").length,
    1
  );
});

test("failed prerequisite prevents the dependent action", async () => {
  let executions = 0;
  tools.testPrerequisite = {
    execute: async () => {
      throw new Error("Unavailable");
    }
  };
  tools.testAction = {
    requires: ["testPrerequisite"],
    execute: async () => {
      executions++;
      return toolSuccess({});
    }
  };
  const result = await runAgent([], undefined, async () => call("testAction"));
  assert.equal(executions, 0);
  assert.match(result.response, /testPrerequisite failed: Unavailable/);
});

test("unknown tools produce a useful response instead of throwing", async () => {
  const result = await runAgent([], undefined, async () => call("missingTool"));
  assert.match(result.response, /isn't available/);
});

test("background clock failure does not block ordinary conversation", async () => {
  tools.getDateAndTime = {
    execute: async () => toolFailure("Clock unavailable")
  };
  const result = await runAgent([], undefined, async (messages) => {
    assert.match(messages[0].content, /call getDateAndTime and do not guess/);
    return { content: "Hey!" };
  });
  assert.equal(result.response, "Hey!");
  assert.equal(result.messages.length, 1);
});

test("step limit returns partial results and a final message", async () => {
  let executions = 0;
  tools.testAction = {
    execute: async () => {
      executions++;
      return toolSuccess({});
    }
  };
  const result = await runAgent([], undefined, async () => call("testAction"));
  assert.equal(executions, 5);
  assert.match(result.response, /tool-step limit/);
  assert.equal(result.messages.at(-1)?.role, "assistant");
});

test("successful prerequisites run once and retain matched calls/results", async () => {
  const order: string[] = [];
  tools.testPrerequisite = {
    execute: async () => {
      order.push("prerequisite");
      return toolSuccess({ id: "verified" });
    }
  };
  tools.testAction = {
    requires: ["testPrerequisite"],
    execute: async (args, context) => {
      assert.equal(context.conversationId, 42);
      assert.deepEqual(args, {});
      order.push("action");
      return toolSuccess({ done: true });
    }
  };
  let modelCalls = 0;
  const result = await runAgent([], 42, async () =>
    ++modelCalls <= 3 ? call("testAction") : { content: "Done" }
  );
  assert.deepEqual(order, ["prerequisite", "action", "action"]);
  assert.equal(result.response, "Done");
  for (const message of result.messages.filter(
    (message) => message.role === "assistant" && message.tool_calls
  )) {
    for (const toolCall of message.tool_calls!) {
      assert.ok(
        result.messages.some(
          (result) =>
            result.role === "tool" && result.tool_call_id === toolCall.id
        )
      );
    }
  }
  assert.ok(!result.messages.some((message) => message.role === "system"));
});

test("mixed results complete the batch and preserve successful actions", async () => {
  const order: string[] = [];
  tools.testFailure = {
    execute: async () => {
      order.push("failure");
      throw new Error("Rejected");
    }
  };
  tools.testSuccess = {
    execute: async () => {
      order.push("success");
      return toolSuccess({ done: true });
    }
  };
  const result = await runAgent([], undefined, async () => ({
    content: "",
    tool_calls: [
      call("testFailure").tool_calls![0],
      { ...call("testSuccess").tool_calls![0], id: "success-call" }
    ]
  }));
  assert.deepEqual(order, ["failure", "success"]);
  assert.equal(
    result.messages.filter((message) => message.role === "tool").length,
    2
  );
  assert.match(result.response, /Rejected/);
  assert.match(
    result.response,
    /successful actions already completed still apply/
  );
});

test("registry preserves explicit cancellation/rescheduling failures", async () => {
  const context = { conversationId: -1 };
  const cancelled = await tools.cancelTask.execute(
    { taskId: "refactor-test-missing-task" },
    context
  );
  const rescheduled = await tools.rescheduleTask.execute(
    {
      taskId: "refactor-test-missing-task",
      date: "2030-01-01",
      time: "12:00:00",
      timezone: "America/Chicago"
    },
    context
  );
  assert.equal(cancelled.success, false);
  assert.equal(rescheduled.success, false);
});

test("identical scheduling calls reuse success in a batch and later loop steps", async () => {
  let executions = 0;
  let turns = 0;
  tools.scheduleTask = {
    execute: async () => {
      executions++;
      return toolSuccess({ taskId: "only-task" });
    }
  };
  const schedulingCall = (id: string) => ({
    id,
    function: {
      index: 0,
      name: "scheduleTask",
      arguments: {
        operation: "create",
        task: "Check build",
        date: "2030-01-01",
        time: "15:00:00",
        timezone: "America/Chicago"
      }
    }
  });
  const result = await runAgent(
    [{ role: "user", content: "Remind me to check the build tomorrow" }],
    1,
    async () =>
      ++turns === 1
        ? {
            content: "",
            tool_calls: [schedulingCall("first"), schedulingCall("second")]
          }
        : turns === 2
          ? { content: "", tool_calls: [schedulingCall("third")] }
          : { content: "Reminder set." }
  );
  assert.equal(executions, 1);
  const results = result.messages.filter((message) => message.role === "tool");
  assert.equal(results.length, 3);
  assert.deepEqual(
    results.map((message) => message.tool_call_id),
    ["first", "second", "third"]
  );
  for (const message of results)
    assert.equal(JSON.parse(message.content).data.taskId, "only-task");
});

test("cancellation during a tool preserves its result and prevents the remaining actions", async () => {
  const abort = new AbortController();
  let later = 0;
  const persisted: unknown[] = [];
  tools.firstAction = {
    execute: async () => {
      abort.abort();
      return toolSuccess({ completed: true });
    }
  };
  tools.laterAction = {
    execute: async () => {
      later++;
      return toolSuccess({});
    }
  };
  const result = await runAgent(
    [],
    undefined,
    async () => ({
      content: "",
      tool_calls: [
        { ...call("firstAction").tool_calls![0], id: "first" },
        { ...call("laterAction").tool_calls![0], id: "later" }
      ]
    }),
    { signal: abort.signal, onRecord: (message) => persisted.push(message) }
  );
  assert.equal(result.cancelled, true);
  assert.equal(later, 0);
  const outcomes = result.messages.filter((message) => message.role === "tool");
  assert.equal(JSON.parse(outcomes[0].content).success, true);
  assert.equal(JSON.parse(outcomes[1].content).success, false);
  assert.equal(persisted.length, result.messages.length);
});

test("tool-loop narration stays recorded through prerequisites and the final reply", async () => {
  tools.lookup = { requires: ["setup"], execute: async () => toolSuccess({}) };
  tools.setup = { execute: async () => toolSuccess({}) };
  let turn = 0;
  const completed: string[] = [];
  const saved: string[] = [];
  const result = await runAgent(
    [],
    undefined,
    async () => {
      turn++;
      return turn < 3
        ? {
            ...call("lookup"),
            content: turn === 1 ? "Let me check." : "Checking now."
          }
        : { content: "Here is the answer." };
    },
    {
      onLoopComplete: (content) => completed.push(content),
      onRecord: (message) => {
        if (message.role === "assistant" && message.content)
          saved.push(message.content);
      }
    }
  );
  assert.deepEqual(completed, ["Let me check.", "Checking now."]);
  assert.deepEqual(saved, [...completed, "Here is the answer."]);
  assert.equal(result.response, "Here is the answer.");
});

test("repeated unauthorized scheduling stops before further retries or false promises", async () => {
  let turns = 0;
  let executions = 0;
  tools.scheduleTask = {
    execute: async () => {
      executions++;
      return toolSuccess({});
    }
  };
  const result = await runAgent(
    [{ role: "user", content: "write some code" }],
    1,
    async () => {
      turns++;
      return call("scheduleTask");
    }
  );
  assert.equal(executions, 0);
  assert.equal(turns, 1);
  assert.match(result.response, /No reminder was created/);
});

test("relative scheduling accepts structured delays and preserves duplicate suppression", async () => {
  let turns = 0;
  let executions = 0;
  tools.scheduleTask = {
    execute: async (args) => {
      executions++;
      const scheduled = new Date(`${args.date}T${args.time}Z`).getTime();
      assert.ok(Math.abs(scheduled - Date.now() - 10000) < 1500);
      return toolSuccess({ taskId: "relative" });
    }
  };
  const result = await runAgent(
    [{ role: "user", content: "remind me in 10 secs to eat something" }],
    1,
    async () => {
      if (++turns > 2) return { content: "Reminder set." };
      const response = call("scheduleTask");
      response.tool_calls![0].function.arguments = {
        operation: "create",
        task: "Eat something",
        delaySeconds: 10,
        timezone: "UTC"
      };
      return response;
    }
  );
  assert.equal(executions, 1);
  assert.equal(result.response, "Reminder set.");
});
