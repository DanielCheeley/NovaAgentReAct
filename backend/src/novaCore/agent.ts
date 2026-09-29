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
  addMessage(conversationId, {
    role: "user",
    content: message
  });

  const conversation = getConversation(conversationId);

  logger("Nova received:", {conversationId, message});

  const messages = [...conversation.messages];

  const result = await runAgent(messages, conversationId);

  //save everything generated during this agent request
  for(const generatedMessage of result.messages) {
    addMessage(conversationId, generatedMessage)
  }

  logger("Nova Responded:", result);

  return result.response;
}

//handle for a recived event
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

  const response = await runAgent(
    messages,
    task.conversationId
  );

  //add generated message to the conversation messages so nova knnows it exists later
  for (const generatedMessage of response.messages) {
  addMessage(task.conversationId, generatedMessage);
  }

  logger("Nova Decided:", response);

  return {
    ...response,
    conversationId: task.conversationId
  };
}

//runs the LLM Agent loop with tools
async function runAgent(messages: Message[], conversationId?: number) {
  const MAX_LOOPS = 5;
  const generatedMessages: Message[] = [];

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await generateResponse(messages);

    if (!response.tool_calls) {
      const assistantMessage: Message = {
        role: "assistant",
        content: response.content
      }

      messages.push(assistantMessage)
      generatedMessages.push(assistantMessage)

      return {
        response: response.content,
        messages: generatedMessages
      }
    }

    const toolCallMessage: Message = {
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.tool_calls
    }

    messages.push(toolCallMessage)
    generatedMessages.push(toolCallMessage)

    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      logger("nova is using tool:", toolName)
      
      let result;

      try {
      result = await tool(toolCall.function.arguments, {conversationId});
      } catch(error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : "unknown tool error"
        };
      }

      logger("Tool result:", result);

      const toolMessage: Message = {
        role: "tool",
        tool_call_id: toolCall.id,
        tool_name: toolName,
        content: JSON.stringify(result)
      }

      messages.push(toolMessage);
      generatedMessages.push(toolMessage)
    }
  }

  throw new Error("Nova exceeded the maximum number of loops.");
}