import debug from "debug";
import { generateResponse } from "./model";
import { getConversation, addMessage } from "./memory/conversationStore";
import { Message } from "../types/conversationType";
import { NovaEvent } from "../types/eventType";
import { tools } from "./tools/toolRegistry";

const logger = debug("NovaAgent:Agent");

//handle for a recived message
export async function handleMessage(
  conversationId: number,
  message: string
) {
  const conversation = getConversation(conversationId);

  addMessage(conversationId, {
    role: "user",
    content: message
  });

  logger("Nova received:", {conversationId, message});

  const messages = [...conversation.messages];

  const response = await runAgent(messages);

  addMessage(conversationId, {
    role: "assistant",
    content: response
  });

  logger("Nova Responded:", response);

  return response;
}

//handle for a recived event
export async function handleEvent(event: NovaEvent) {
  logger("Nova handling event:", event);

  const messages: Message[] = [
    {
      role: "system",
      content: `An event has occurred: ${JSON.stringify(event)} Determine what Nova should do in response.`
    }
  ];

  const response = await runAgent(messages);

  logger("Nova Decided:", response);

  return response;
}

//runs the LLM Agent loop with tools
async function runAgent(messages: Message[]) {
  const MAX_LOOPS = 5;

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await generateResponse(messages);

    if (!response.tool_calls) {
      return response.content;
    }

    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      logger("nova is using tool:", toolName)
      
      let result;

      try {
      result = await tool(toolCall.function.arguments);
      } catch(error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : "unknown tool error"
        };
      }

      logger("Tool result:", result);

      messages.push({
        role: "system",
        content: `Tool "${toolName}" returned: ${JSON.stringify(result)}`
      });
    }
  }

  throw new Error("Nova exceeded the maximum number of loops.");
}