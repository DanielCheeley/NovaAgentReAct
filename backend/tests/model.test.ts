import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  generateResponse,
  generateConversationTitle
} from "../src/novaCore/model";
import { MODEL_CONFIG } from "../src/novaCore/novaConfig";
import { NOVA_SYSTEM_PROMPT } from "../src/novaCore/novaPrompt";
import { toolDefinitions } from "../src/novaCore/tools/toolDefinitions";
import { tools } from "../src/novaCore/tools/toolRegistry";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("chat model request preserves prompt, tools and generation settings", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, MODEL_CONFIG.url);
    const body = JSON.parse(options!.body as string);
    assert.equal(body.model, MODEL_CONFIG.model);
    assert.deepEqual(body.messages, [
      { role: "system", content: NOVA_SYSTEM_PROMPT },
      { role: "user", content: "Hello" }
    ]);
    assert.deepEqual(body.tools, toolDefinitions);
    assert.equal(body.stream, MODEL_CONFIG.stream);
    assert.equal(body.think, MODEL_CONFIG.think);
    assert.equal(body.options.temperature, MODEL_CONFIG.temperature);
    return Response.json({ message: { content: "Hi" } });
  };
  assert.deepEqual(
    await generateResponse([{ role: "user", content: "Hello" }]),
    { content: "Hi" }
  );
});

test("title request preserves its distinct settings and trims the result", async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.options.temperature, 0.3);
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.messages[1], { role: "user", content: "Hello" });
    return Response.json({ message: { content: "  New Title  " } });
  };
  assert.equal(await generateConversationTitle("Hello"), "New Title");
});

test("model failures retain the request-specific error messages", async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(generateResponse([]), /Ollama request failed: 503/);
  await assert.rejects(
    generateConversationTitle("Hello"),
    /Ollama title request failed: 503/
  );
});

test("every model tool schema has exactly one registered handler", () => {
  const names = toolDefinitions.map((definition) => definition.function.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), Object.keys(tools).sort());
});
