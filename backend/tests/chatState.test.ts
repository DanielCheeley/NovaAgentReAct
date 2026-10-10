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
