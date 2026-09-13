import { Conversation, Message } from "../../types/conversationType";

const conversations = new Map<number, Conversation>();

export function createConversation(conversationId: number): Conversation {
  const conversation: Conversation = {
    id: conversationId,
    messages: []
  };

  conversations.set(conversationId, conversation);

  return conversation;
}

export function getConversation(conversationId: number): Conversation {
  let conversation = conversations.get(conversationId);

  if (!conversation) {
    conversation = createConversation(conversationId);
  }

  return conversation;
}

export function addMessage(
  conversationId: number,
  message: Message
): void {
  const conversation = getConversation(conversationId);

  conversation.messages.push(message);
}