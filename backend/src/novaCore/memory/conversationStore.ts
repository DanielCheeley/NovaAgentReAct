import { db } from "../../database/database";
import { Conversation, Message } from "../../types/conversationType";

type ConversationRow = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: number;
  conversation_id: number;
  role: Message["role"];
  content: string;
  created_at: string;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_calls: string | null;
};

function rowToConversation(
  row: ConversationRow
): Conversation {
  const messageRows = db.prepare(`
    SELECT
      id,
      conversation_id,
      role,
      content,
      created_at,
      tool_call_id,
      tool_name,
      tool_calls
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `).all(row.id) as MessageRow[];

  return {
    id: row.id,
    title: row.title,
    messages: messageRows.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.tool_call_id && {
        tool_call_id: message.tool_call_id
      }),
      ...(message.tool_name && {
        tool_name: message.tool_name
      }),
      ...(message.tool_calls && {
        tool_calls: JSON.parse(message.tool_calls)
      })
    }))
  };
}

export function createConversation(
  conversationId: number
): Conversation {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO conversations (
      id,
      title,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `).run(
    conversationId,
    "New Conversation",
    now,
    now
  );

  return {
    id: conversationId,
    title: "New Conversation",
    messages: []
  };
}

export function getConversation(
  conversationId: number
): Conversation {
  let row = db.prepare(`
    SELECT
      id,
      title,
      created_at,
      updated_at
    FROM conversations
    WHERE id = ?
  `).get(conversationId) as ConversationRow | undefined;

  if (!row) {
    createConversation(conversationId);

    row = db.prepare(`
      SELECT
        id,
        title,
        created_at,
        updated_at
      FROM conversations
      WHERE id = ?
    `).get(conversationId) as ConversationRow;
  }

  return rowToConversation(row);
}

export function addMessage(
  conversationId: number,
  message: Message
): void {
  getConversation(conversationId);

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (
      conversation_id,
      role,
      content,
      created_at,
      tool_call_id,
      tool_name,
      tool_calls
    )
    VALUES (
      @conversationId,
      @role,
      @content,
      @createdAt,
      @toolCallId,
      @toolName,
      @toolCalls
    )
  `).run({
    conversationId,
    role: message.role,
    content: message.content,
    createdAt: now,
    toolCallId: message.tool_call_id ?? null,
    toolName: message.tool_name ?? null,
    toolCalls: message.tool_calls
      ? JSON.stringify(message.tool_calls)
      : null
  });

  db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(now, conversationId);
}

export function updateConversationTitle(
  conversationId: number,
  title: string
): void {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title,
    now,
    conversationId
  );
}

export function getConversations(): Conversation[] {
  const rows = db.prepare(`
    SELECT
      id,
      title,
      created_at,
      updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `).all() as ConversationRow[];

  return rows.map(rowToConversation);
}

export function deleteConversation(
  conversationId: number
): void {
  const deleteTransaction = db.transaction(() => {
    db.prepare(`
      DELETE FROM messages
      WHERE conversation_id = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM tasks
      WHERE conversation_id = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM conversations
      WHERE id = ?
    `).run(conversationId);
  });

  deleteTransaction();
}