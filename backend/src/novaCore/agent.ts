import debug from "debug";
import { generateResponse, generateConversationTitle } from "./model";
import {
  getConversation,
  addMessage,
  updateConversationTitle
} from "./memory/conversationStore";
import { Message } from "../types/conversationType";
import { NovaEvent } from "../types/eventType";
import { tools } from "./tools/toolRegistry";

const logger = debug("NovaAgent:Agent");

// Handle a received message.
export async function handleMessage(conversationId: number, message: string) {
  const conversation = getConversation(conversationId);

  const isNewConversation = conversation.title === "New Conversation";

  addMessage(conversationId, {
    role: "user",
    content: message
  });

  logger("Nova received:", { conversationId, message });

  if (isNewConversation) {
    const title = await generateConversationTitle(message);

    updateConversationTitle(conversationId, title);

    logger("Nova generated conversation title:", title);
  }

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

// Run the LLM agent loop with tools.
async function runAgent(messages: Message[], conversationId?: number) {
  const MAX_LOOPS = 5;
  const generatedMessages: Message[] = [];
  const executedTools = new Set<string>();

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await generateResponse(messages);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const assistantMessage: Message = {
        role: "assistant",
        content: response.content ?? ""
      };

      messages.push(assistantMessage);
      generatedMessages.push(assistantMessage);

      return {
        response: assistantMessage.content,
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

    // Find prerequisites that have not run yet.
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

    // Run missing prerequisites before the requested tools.
    if (missingPrerequisites.size > 0) {
      let prerequisiteFailed = false;

      for (const prerequisite of missingPrerequisites) {
        const tool = tools[prerequisite];

        if (!tool) {
          throw new Error(`Unknown prerequisite tool: ${prerequisite}`);
        }

        logger("Nova must use prerequisite tool:", prerequisite);

        const prerequisiteCallId = `prerequisite-${prerequisite}-${Date.now()}`;

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

        let result: unknown;

        try {
          result = await tool.execute({}, { conversationId });
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown tool error"
          };
        }

        logger("Prerequisite result:", result);

        const prerequisiteResult: Message = {
          role: "tool",
          tool_call_id: prerequisiteCallId,
          tool_name: prerequisite,
          content: JSON.stringify(result)
        };

        messages.push(prerequisiteResult);
        generatedMessages.push(prerequisiteResult);

        // Detect an explicit failure result.
        const failed =
          typeof result === "object" &&
          result !== null &&
          "success" in result &&
          result.success === false;

        if (failed) {
          prerequisiteFailed = true;

          messages.push({
            role: "system",
            content:
              `The prerequisite tool "${prerequisite}" failed. ` +
              `Its result was: ${JSON.stringify(result)}. ` +
              `Do not execute any dependent tools. ` +
              `Explain the problem to the user and, if possible, ` +
              `suggest a reasonable next step.`
          });

          logger(
            "Prerequisite failed; skipping dependent tools:",
            prerequisite
          );

          break;
        }

        executedTools.add(prerequisite);
      }

      // Do not execute the original tool calls after a prerequisite
      // fails. Let the model respond to the failure first.
      if (prerequisiteFailed) {
        continue;
      }

      // Let the model retry its original request with the prerequisite
      // results available in context.
      continue;
    }

    // All prerequisites are satisfied. Execute the requested tools.
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

      let result: unknown;

      try {
        result = await tool.execute(toolCall.function.arguments, {
          conversationId
        });
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown tool error"
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

  throw new Error("Nova exceeded the maximum number of loops.");
}
