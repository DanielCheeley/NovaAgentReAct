import { Message } from "../../types/message";

const conversations = new Map<number, Message[]>();

export function getConversation(conversationId: number): Message[] {
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, []);
  }

  return conversations.get(conversationId)!;
}

export function addMessage(
  conversationId: number,
  message: Message
): void {
  const conversation = getConversation(conversationId);

  conversation.push(message);
}