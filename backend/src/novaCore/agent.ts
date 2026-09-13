import debug from "debug";
import { generateResponse } from "./model";
import { getConversation, addMessage } from "./memory/conversationStore";

const logger = debug("NovaAgent:Agent");

export async function novaAgent(
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

  logger("Conversation:", conversation)
  logger("Nova responded:", response)

  return response
}