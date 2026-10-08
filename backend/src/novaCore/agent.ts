import debug from "debug";
import { generateResponse, generateConversationTitle  } from "./model";
import { getConversation, addMessage, updateConversationTitle } from "./memory/conversationStore";
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

  const isNewConversation =
    conversation.title === "New Conversation";

  addMessage(conversationId, {
    role: "user",
    content: message
  });

  logger("Nova received:", { conversationId, message });

  if (isNewConversation) {
    const title = await generateConversationTitle(message);

    updateConversationTitle(conversationId, title)

    logger("Nova generated conversation title:", title);
  }

  const updatedConversation = getConversation(conversationId);

  const messages = [...updatedConversation.messages];

  const result = await runAgent(messages, conversationId);

  // save everything generated during this agent request
  for (const generatedMessage of result.messages) {
    addMessage(conversationId, generatedMessage);
  }

  logger("Nova Responded:", result);

  return {
    response: result.response,
    title: getConversation(conversationId).title
  }
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
async function runAgent(
  messages: Message[],
  conversationId?: number
) {
  const MAX_LOOPS = 5;
  const generatedMessages: Message[] = [];
  const executedTools = new Set<string>();

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await generateResponse(messages);

    if (!response.tool_calls) {
      const assistantMessage: Message = {
        role: "assistant",
        content: response.content
      };

      messages.push(assistantMessage);
      generatedMessages.push(assistantMessage);

      return {
        response: response.content,
        messages: generatedMessages
      };
    }

    // Make sure every requested tool exists.
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;

      if (!tools[toolName]) {
        throw new Error(`Unknown tool: ${toolName}`);
      }
    }

    // Check whether any requested tools have prerequisites
    // that have not been run yet.
    const missingPrerequisites = new Set<string>();

    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      for (const requirement of tool.requires ?? []) {
        if (!executedTools.has(requirement)) {
          missingPrerequisites.add(requirement);
        }
      }
    }

    // Run missing prerequisites before allowing the requested
    // tools to execute.
    if (missingPrerequisites.size > 0) {
      for (const prerequisite of missingPrerequisites) {
        const tool = tools[prerequisite];

        if (!tool) {
          throw new Error(
            `Unknown prerequisite tool: ${prerequisite}`
          );
        }

        logger(
          "Nova must use prerequisite tool:",
          prerequisite
        );

        const prerequisiteCallId =
          `prerequisite-${prerequisite}-${Date.now()}`;

        const prerequisiteCallMessage: Message = {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: prerequisiteCallId,
              function: {
                index: 0,
                name: prerequisite,
                arguments: {}
              }
            }
          ]
        };

        messages.push(prerequisiteCallMessage);
        generatedMessages.push(prerequisiteCallMessage);

        let result;

        try {
          result = await tool.execute(
            {},
            { conversationId }
          );
        } catch (error) {
          result = {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "unknown tool error"
          };
        }

        logger(
          "Prerequisite result:",
          result
        );

        const prerequisiteResult: Message = {
          role: "tool",
          tool_call_id: prerequisiteCallId,
          tool_name: prerequisite,
          content: JSON.stringify(result)
        };

        messages.push(prerequisiteResult);
        generatedMessages.push(prerequisiteResult);

        executedTools.add(prerequisite);
      }

      // Do NOT execute the original tool call yet.
      // Give the model another chance to see the prerequisite
      // results and generate correct arguments.
      continue;
    }

    // All prerequisites have been satisfied.
    // Now it is safe to execute the model's requested tools.
    const toolCallMessage: Message = {
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.tool_calls
    };

    messages.push(toolCallMessage);
    generatedMessages.push(toolCallMessage);

    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      logger("Nova is using tool:", toolName);

      let result;

      try {
        result = await tool.execute(
          toolCall.function.arguments,
          { conversationId }
        );
      } catch (error) {
        result = {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "unknown tool error"
        };
      }

      logger("Tool result:", result);

      const toolMessage: Message = {
        role: "tool",
        tool_call_id: toolCall.id,
        tool_name: toolName,
        content: JSON.stringify(result)
      };

      messages.push(toolMessage);
      generatedMessages.push(toolMessage);

      executedTools.add(toolName);
    }
  }

  throw new Error(
    "Nova exceeded the maximum number of loops."
  );
}