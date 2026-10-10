import assert from "node:assert/strict";
import { test } from "node:test";
import { createTitleQueue } from "../src/novaCore/background/titleQueue";

test("title work is deferred, deduplicated, and serialized", async () => {
  const starts: string[] = [];
  const updates: number[] = [];
  let release!: (title: string) => void;
  const blocked = new Promise<string>((resolve) => { release = resolve; });
  const queue = createTitleQueue({
    getSeed: (id) => `message ${id}`,
    generate: async (seed) => {
      starts.push(seed);
      return seed === "message 1" ? blocked : "Second";
    },
    save: () => true,
    notify: (id) => { updates.push(id); },
    onError: () => assert.fail("Unexpected title failure")
  });
  const first = queue.enqueue(1);
  void queue.enqueue(1);
  const second = queue.enqueue(2);
  assert.deepEqual(starts, []);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, ["message 1"]);
  release("First");
  await Promise.all([first, second]);
  assert.deepEqual(starts, ["message 1", "message 2"]);
  assert.deepEqual(updates, [1, 2]);
});

test("failed title jobs do not prevent subsequent jobs or retry", async () => {
  let failures = 0;
  let attempts = 0;
  const updates: number[] = [];
  const queue = createTitleQueue({
    getSeed: () => "Hello",
    generate: async () => {
      if (++attempts === 1) throw new Error("Model offline");
      return "Greeting";
    },
    save: () => true,
    notify: (id) => { updates.push(id); },
    onError: () => { failures++; }
  });
  await queue.enqueue(1);
  await queue.enqueue(1);
  assert.equal(failures, 1);
  assert.deepEqual(updates, [1]);
});

test("deleted or renamed conversations and empty titles produce no notification", async () => {
  const queue = createTitleQueue({
    getSeed: (id) => id === 1 ? undefined : String(id),
    generate: async (seed) => seed === "2" ? "   " : "A title",
    save: () => false,
    notify: () => assert.fail("Stale title notification"),
    onError: () => assert.fail("Unexpected error")
  });
  await Promise.all([queue.enqueue(1), queue.enqueue(2), queue.enqueue(3)]);
});
