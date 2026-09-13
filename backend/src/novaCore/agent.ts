import debug from "debug";
import { generateResponse } from "./model";
import { getConversation, addMessage } from "./memory/conversationStore";
import { NovaEvent } from "../types/eventType";

const logger = debug("NovaAgent:Agent");

export async function handleMessage(
  conversationId: number,
  message: string
) {
  const conversation = getConversation(conversationId);

  //add the users new message
  addMessage(conversationId, {
    role: "user",
    content: message
  })

  //log received user input to server
  logger("Nova received:", {
    conversationId,
    message
  });
  //give whole conversation to the model
  const response = await generateResponse(conversation.messages)

  //add nova's response to conversation
  addMessage(conversationId, {
    role: "assistant",
    content: response
  });

  logger("Nova responded:", response)

  return response
}

export async function handleEvent(event: NovaEvent) {
  logger("Nova handling event:", event);

  const response = await generateResponse([
    {
    role: "system",
    content: `An event has occurred: ${JSON.stringify(event)} Determine what Nova should do in response.`
    }
  ]);

  logger("Nova Decided:", response)
}