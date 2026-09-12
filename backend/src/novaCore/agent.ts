import debug from "debug";
import { generateResponse } from "./model";

const logger = debug("NovaAgent:Agent");

export async function novaAgent(
  conversationId: number,
  message: string
) {
  logger("Nova received:", {
    conversationId,
    message
  });

  const response = await generateResponse(message)

  logger("Nova responded:", response)

  return response
}