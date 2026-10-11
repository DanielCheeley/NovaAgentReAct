import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatReducer,
  initialChatState
} from "../../frontend/src/state/chatState";
import type { ChatState } from "../../frontend/src/state/chatState";

function state(): ChatState {
  return {
    ...initialChatState,
    conversations: [
      { id: 1, title: "One", messages: [] },
      { id: 2, title: "Two", messages: [] }
    ],
    activeConversationId: 1,
    generatingConversationIds: new Set()
  };
}

test("Stop freezes streamed text and ignores late completion even after a new request", () => {
  let current = chatReducer(state(), {
    type: "stream.start",
    id: 1,
    requestId: "old"
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "old",
    content: "Partial"
  });
  current = chatReducer(current, {
    type: "stream.stop",
    id: 1,
    requestId: "old"
  });
  assert.equal(current.generatingConversationIds.has(1), false);
  assert.equal(current.conversations[0].messages[0].status, "stopped");
  const stopped = current;
  assert.equal(
    chatReducer(current, {
      type: "stream.content",
      id: 1,
      requestId: "old",
      content: "Late"
    }),
    stopped
  );
  current = chatReducer(current, {
    type: "stream.start",
    id: 1,
    requestId: "new"
  });
  assert.equal(
    chatReducer(current, {
      type: "stream.content",
      id: 1,
      requestId: "old",
      content: "Late"
    }),
    current
  );
  assert.equal(current.conversations[0].messages[0].content, "Partial");
});

test("stream updates replace one placeholder without interfering with another chat", () => {
  let current = chatReducer(state(), {
    type: "stream.start",
    id: 1,
    requestId: "one"
  });
  current = chatReducer(current, {
    type: "stream.start",
    id: 2,
    requestId: "two"
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "one",
    content: "Hello"
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "one",
    content: "Hello again"
  });
  assert.equal(current.conversations[0].messages.length, 1);
  assert.equal(current.conversations[0].messages[0].content, "Hello again");
  assert.equal(current.conversations[1].messages[0].content, "");
  assert.equal(current.generatingConversationIds.has(2), true);
});

test("background titles preserve messages and survive an older HTTP response", () => {
  const original = state();
  const titled = chatReducer(original, {
    type: "title",
    id: 1,
    title: "Greeting"
  });
  const replied = chatReducer(titled, {
    type: "message",
    id: 1,
    title: "New Conversation",
    message: { role: "assistant", content: "Hello" }
  });
  assert.equal(replied.conversations[0].title, "Greeting");
  assert.deepEqual(replied.conversations[0].messages, [
    { role: "assistant", content: "Hello" }
  ]);
  assert.equal(original.conversations[0].title, "One");
  assert.deepEqual(
    chatReducer(replied, { type: "title", id: 999, title: "Gone" }),
    replied
  );
});

test("chat loading, creation and selection preserve conversation order", () => {
  const loaded = chatReducer(initialChatState, {
    type: "loaded",
    conversations: state().conversations
  });
  assert.equal(loaded.activeConversationId, 1);
  const created = chatReducer(loaded, {
    type: "created",
    conversation: { id: 3, title: "New Conversation", messages: [] }
  });
  assert.deepEqual(
    created.conversations.map((conversation) => conversation.id),
    [3, 1, 2]
  );
  assert.equal(created.activeConversationId, 3);
  assert.equal(
    chatReducer(created, { type: "selected", id: 2 }).activeConversationId,
    2
  );
});

test("deleting the active chat selects the next chat, without mutating input", () => {
  const original = state();
  const deleted = chatReducer(original, { type: "deleted", id: 1 });
  assert.equal(deleted.activeConversationId, 2);
  assert.equal(original.conversations.length, 2);
  assert.equal(
    chatReducer(deleted, { type: "deleted", id: 2 }).activeConversationId,
    null
  );
  assert.equal(
    chatReducer(original, { type: "deleted", id: 2 }).activeConversationId,
    1
  );
});

test("HTTP replies promote their chat while scheduled messages preserve sidebar order", () => {
  const original = state();
  const action = {
    type: "message" as const,
    id: 2,
    message: { role: "assistant" as const, content: "Hello" }
  };
  const scheduled = chatReducer(original, action);
  assert.deepEqual(
    scheduled.conversations.map((conversation) => conversation.id),
    [1, 2]
  );
  const replied = chatReducer(original, {
    ...action,
    title: "Updated title",
    moveToTop: true
  });
  assert.equal(replied.conversations[0].title, "Updated title");
  assert.equal(replied.activeConversationId, 1);
  assert.equal(original.conversations[1].messages.length, 0);
  assert.equal(chatReducer(original, { ...action, id: 99 }), original);
});

test("generating indicators remain independent across chats", () => {
  const original = state();
  const first = chatReducer(original, {
    type: "generating",
    id: 1,
    value: true
  });
  const second = chatReducer(first, { type: "generating", id: 2, value: true });
  const finished = chatReducer(second, {
    type: "generating",
    id: 1,
    value: false
  });
  assert.deepEqual([...finished.generatingConversationIds], [2]);
  assert.equal(original.generatingConversationIds.size, 0);
});

test("completed loops survive subsequent snapshots and stopping the next loop", () => {
  let current = chatReducer(state(), {
    type: "stream.start",
    id: 1,
    requestId: "loops"
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "loops",
    content: "Checking"
  });
  current = chatReducer(current, {
    type: "stream.loop.complete",
    id: 1,
    requestId: "loops",
    content: "Checking now."
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "loops",
    content: ""
  });
  current = chatReducer(current, {
    type: "stream.content",
    id: 1,
    requestId: "loops",
    content: "Next reply"
  });
  current = chatReducer(current, {
    type: "stream.stop",
    id: 1,
    requestId: "loops"
  });
  assert.deepEqual(
    current.conversations[0].messages.map((m) => m.content),
    ["Checking now.", "Next reply"]
  );
  assert.equal(current.conversations[0].messages[0].status, undefined);
  assert.equal(current.conversations[0].messages[1].status, "stopped");
});
