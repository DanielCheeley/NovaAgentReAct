import type { Conversation } from "../types/chat";
import { consumeChatStream, type ChatStreamEvent } from "./chatStream";

export const BACKEND_URL = "http://localhost:3000";

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${BACKEND_URL}${path}`, options);
  if (!response.ok) throw new Error(`Nova backend returned ${response.status}`);
  return response;
}

export async function loadConversations(
  signal?: AbortSignal
): Promise<Conversation[]> {
  const response = await request("/conversations", { signal });
  const conversations: Conversation[] = await response.json();
  return conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.filter(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && message.content.trim() !== "")
    )
  }));
}

export async function deleteConversation(id: number) {
  await request(`/conversations/${id}`, { method: "DELETE" });
}

export async function sendChatMessage(
  conversationId: number,
  message: string
): Promise<{
  conversationId: number;
  message: string;
  title: string;
}> {
  const response = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message })
  });
  return response.json();
}

export async function streamChatMessage(
  conversationId: number,
  message: string,
  requestId: string,
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void
) {
  const response = await request("/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message, requestId }),
    signal
  });
  if (!response.body) throw new Error("Chat stream has no body");
  await consumeChatStream(response.body, requestId, onEvent, signal);
}
