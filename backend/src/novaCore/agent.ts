import debug from "debug";
import {
  getConversation,
  addMessage
} from "./memory/conversationStore";
import { Message } from "../types/conversationType";
import { NovaEvent } from "../types/eventType";
import { runAgent } from "./agentLoop";

// Preserve the existing entry point for callers.
export { runAgent } from "./agentLoop";

const logger = debug("NovaAgent:Agent");

// Handle a received message.
export async function handleMessage(conversationId: number, message: string) {
  addMessage(conversationId, {
    role: "user",
    content: message
  });

  logger("Nova received:", { conversationId, message });

  const updatedConversation = getConversation(conversationId);
  const messages = [...updatedConversation.messages];

  const result = await runAgent(messages, conversationId);

  // Save everything generated during this agent request.
  for (const generatedMessage of result.messages) {
    addMessage(conversationId, generatedMessage);
  }

  logger("Nova responded:", result);

  return {
    response: result.response,
    title: getConversation(conversationId).title
  };
}

// Handle a received event.
export async function handleEvent(event: NovaEvent) {
  logger("Nova handling event:", event);

  const task = event.data as {
    conversationId?: number;
  };

  if (typeof task.conversationId !== "number") {
    throw new Error("Scheduled event is missing conversationId");
  }

  const conversation = getConversation(task.conversationId);

  const messages: Message[] = [
    ...conversation.messages,
    {
      role: "system",
      content: `A scheduled event has occurred: ${JSON.stringify(event)}. Determine what Nova should do in response.`
    }
  ];

  const response = await runAgent(messages, task.conversationId);

  // Save generated messages so Nova knows about them later.
  for (const generatedMessage of response.messages) {
    addMessage(task.conversationId, generatedMessage);
  }

  logger("Nova decided:", response);

  return {
    ...response,
    conversationId: task.conversationId
  };
}
