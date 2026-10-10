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
  tools.getDateAndTime = { execute: async () => toolSuccess({ time: ++reads }) };
  for (let i = 1; i <= 2; i++) {
    await runAgent([{ role: "user", content: "What time is it?" }], undefined, async (messages) => {
      const clock = messages.find((message) => message.role === "system");
      assert.ok(clock!.content.includes(`"time":${i}`));
      assert.ok(!messages.some((message) => message.role === "tool" || message.tool_calls));
      return { content: "Checked." };
    });
  }
  assert.equal(reads, 2);
});

test("failed action stops before a repeated call or false success response", async () => {
  let executions = 0;
  let modelCalls = 0;
  tools.testAction = { execute: async () => { executions++; return toolFailure("Task not found"); } };
  const result = await runAgent([], undefined, async () => { modelCalls++; return call("testAction"); });
  assert.equal(executions, 1);
  assert.equal(modelCalls, 1);
  assert.match(result.response, /failed: Task not found/);
  assert.equal(result.messages.filter((message) => message.role === "tool").length, 1);
});

test("failed prerequisite prevents the dependent action", async () => {
  let executions = 0;
  tools.testPrerequisite = { execute: async () => { throw new Error("Unavailable"); } };
  tools.testAction = {
    requires: ["testPrerequisite"],
    execute: async () => { executions++; return toolSuccess({}); }
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
  tools.getDateAndTime = { execute: async () => toolFailure("Clock unavailable") };
  const result = await runAgent([], undefined, async (messages) => {
    assert.match(messages[0].content, /call getDateAndTime and do not guess/);
    return { content: "Hey!" };
  });
  assert.equal(result.response, "Hey!");
  assert.equal(result.messages.length, 1);
});

test("step limit returns partial results and a final message", async () => {
  let executions = 0;
  tools.testAction = { execute: async () => { executions++; return toolSuccess({}); } };
  const result = await runAgent([], undefined, async () => call("testAction"));
  assert.equal(executions, 5);
  assert.match(result.response, /tool-step limit/);
  assert.equal(result.messages.at(-1)?.role, "assistant");
});
