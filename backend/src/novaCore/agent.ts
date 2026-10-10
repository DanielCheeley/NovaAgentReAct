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
import { ToolResult, toolFailure } from "../types/toolTypes";

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
export async function runAgent(
  messages: Message[],
  conversationId?: number,
  respond = generateResponse
) {
  const MAX_LOOPS = 5;
  const generatedMessages: Message[] = [];
  const executedTools = new Set<string>();

  function finish(content: string) {
    const message: Message = { role: "assistant", content };
    messages.push(message);
    generatedMessages.push(message);
    return { response: content, messages: generatedMessages };
  }

  // Supply fresh clock data even if the model forgets to request it.
  let clock: ToolResult;
  try {
    clock = await tools.getDateAndTime.execute({}, { conversationId });
  } catch (error) {
    clock = toolFailure(error);
  }
  if (clock.success) executedTools.add("getDateAndTime");
  // Background context is not a model-requested action or saved chat message.
  messages.push({
    role: "system",
    content: clock.success
      ? `Background clock context for this request: ${JSON.stringify(clock.data)}. Use it only when the user's request needs the current time or scheduling. Do not announce the time or this check in ordinary conversation. Ignore older timestamps in history.`
      : "Background clock context is unavailable. Continue ordinary conversation normally; if the request needs current time, call getDateAndTime and do not guess."
  });

  for (let i = 0; i < MAX_LOOPS; i++) {
    const response = await respond(messages);

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
        return finish(`I couldn't complete that request because the tool "${toolName}" isn't available. Please rephrase the request.`);
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
      for (const prerequisite of missingPrerequisites) {
        const tool = tools[prerequisite];

        if (!tool) {
          return finish(`I couldn't complete that request because the required tool "${prerequisite}" isn't available.`);
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

        let result: ToolResult;

        try {
          result = await tool.execute({}, { conversationId });
        } catch (error) {
          result = toolFailure(error);
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
        if (!result.success) {
          return finish(`I couldn't complete that request because ${prerequisite} failed: ${result.error}. Please check the details and try again.`);
        }

        executedTools.add(prerequisite);
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

    const failures: string[] = [];
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      logger("Nova is using tool:", toolName);

      let result: ToolResult;

      try {
        result = await tool.execute(toolCall.function.arguments, {
          conversationId
        });
      } catch (error) {
        result = toolFailure(error);
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

      if (result.success) {
        executedTools.add(toolName);
      } else {
        failures.push(`The ${toolName} tool failed: ${result.error}.`);
      }
    }

    // All requested calls now have results. Stop before the model can
    // retry failures or describe failed actions as successful.
    if (failures.length > 0) {
      return finish(failures.join(" ") + " Any successful actions already completed still apply. Please check the request details before trying again.");
    }
  }

  return finish("I reached my tool-step limit before finishing this request. Any successful actions already completed still apply. Please check their results before trying again.");
}
