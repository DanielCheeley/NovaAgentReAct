import debug from "debug";
import { generateResponse } from "./model";
import { Message } from "../types/conversationType";
import { tools } from "./tools/toolRegistry";
import { executeTool } from "./tools/executeTool";

const logger = debug("NovaAgent:Agent");

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
    record(message);
    return { response: content, messages: generatedMessages };
  }

  function record(message: Message) {
    messages.push(message);
    generatedMessages.push(message);
  }

  // Supply fresh clock data even if the model forgets to request it.
  const clock = await executeTool(tools.getDateAndTime, {}, { conversationId });
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
      return finish(response.content ?? "");
    }

    // Make sure every requested tool exists.
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;

      if (!tools[toolName]) {
        return finish(
          `I couldn't complete that request because the tool "${toolName}" isn't available. Please rephrase the request.`
        );
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
          return finish(
            `I couldn't complete that request because the required tool "${prerequisite}" isn't available.`
          );
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

        record(prerequisiteCallMessage);

        const result = await executeTool(tool, {}, { conversationId });

        logger("Prerequisite result:", result);

        const prerequisiteResult: Message = {
          role: "tool",
          tool_call_id: prerequisiteCallId,
          tool_name: prerequisite,
          content: JSON.stringify(result)
        };

        record(prerequisiteResult);

        // Detect an explicit failure result.
        if (!result.success) {
          return finish(
            `I couldn't complete that request because ${prerequisite} failed: ${result.error}. Please check the details and try again.`
          );
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

    record(toolCallMessage);

    const failures: string[] = [];
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = tools[toolName];

      logger("Nova is using tool:", toolName);

      const result = await executeTool(tool, toolCall.function.arguments, {
        conversationId
      });

      logger("Tool result:", result);

      const toolMessage: Message = {
        role: "tool",
        tool_call_id: toolCall.id,
        tool_name: toolName,
        content: JSON.stringify(result)
      };

      record(toolMessage);

      if (result.success) {
        executedTools.add(toolName);
      } else {
        failures.push(`The ${toolName} tool failed: ${result.error}.`);
      }
    }

    // All requested calls now have results. Stop before the model can
    // retry failures or describe failed actions as successful.
    if (failures.length > 0) {
      return finish(
        failures.join(" ") +
          " Any successful actions already completed still apply. Please check the request details before trying again."
      );
    }
  }

  return finish(
    "I reached my tool-step limit before finishing this request. Any successful actions already completed still apply. Please check their results before trying again."
  );
}
