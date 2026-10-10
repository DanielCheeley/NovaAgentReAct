import assert from "node:assert/strict";
import { test } from "node:test";
import { schedulingAllowed, schedulingKey } from "../src/novaCore/tools/schedulingPolicy";
import type { Message } from "../src/types/conversationType";

test("ordinary work and discussions of scheduling do not authorize tasks", () => {
  for (const content of [
    "mmm how about you make me a function that can write instructions to make a cheeseburger",
    "cool now write it in typescript", "write a scheduling function",
    "write a function that reminds me tomorrow",
    "how does scheduleTask work?", "remind me how TypeScript interfaces work",
    "don't remind me tomorrow", "what reminders do I have tomorrow?",
    "I have a meeting tomorrow", "remember that I like burgers"
  ]) assert.equal(schedulingAllowed([{ role: "user", content }]), false, content);
});

test("explicit reminder and future execution requests authorize scheduling", () => {
  for (const content of [
    "remind me in ten minutes to check the build",
    "Could you remind me to call Sam tomorrow?",
    "Please set a reminder for 3pm", "schedule a review tomorrow",
    "do that tomorrow", "check the build in 10 minutes"
  ]) assert.equal(schedulingAllowed([{ role: "user", content }]), true, content);
});

test("only a direct time clarification carries scheduling intent forward", () => {
  const exchange: Message[] = [
    { role: "user", content: "Remind me to check the build" },
    { role: "assistant", content: "What time should I remind you?" },
    { role: "user", content: "3pm tomorrow" }
  ];
  assert.equal(schedulingAllowed(exchange), true);
  assert.equal(schedulingAllowed([...exchange, { role: "user", content: "write it in TypeScript" }]), false);
  assert.equal(schedulingAllowed([...exchange.slice(0, 2), { role: "user", content: "cancel that, don't remind me tomorrow" }]), false);
  assert.equal(schedulingAllowed([...exchange, { role: "system", content: "A scheduled event has occurred" }]), false);
});

test("duplicate keys ignore argument property order", () => {
  assert.equal(schedulingKey({ task: "Build", time: "15:00:00" }), schedulingKey({ time: "15:00:00", task: "Build" }));
});
