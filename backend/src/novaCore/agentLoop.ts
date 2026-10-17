import debug from "debug";
import { generateResponse } from "./model";
import { Message } from "../types/conversationType";
import { tools } from "./tools/toolRegistry";
import { executeTool } from "./tools/executeTool";
import { ActionCoordinator } from "./actions/coordinator";
import { reminderAdapter } from "./actions/reminders";
import { toolFailure } from "../types/toolTypes";
import type { GenerationOptions, ToolTiming } from "../types/generationType";
import type { ToolDefinition } from "../types/toolTypes";
import { validateMemoryWrite } from "./memory/memoryWritePolicy";
import type { selectAutomaticMemory } from "./memory/automaticMemory";
import { getMemories } from "./memory/longTermMemoryStore";
import { randomUUID } from "node:crypto";

export type AgentOptions = GenerationOptions & {
  onRecord?: (message: Message) => void;
  onLoopComplete?: (content: string) => void;
  onToolTiming?: (timing: ToolTiming) => void;
  validateMemoryWrite?: typeof validateMemoryWrite;
  selectMemory?: typeof selectAutomaticMemory;
};

const logger = debug("NovaAgent:Agent");

// Run the LLM agent loop with tools.
export async function runAgent(
  messages: Message[],
  conversationId?: number,
  respond = generateResponse,
  options: AgentOptions = {}
): Promise<{ response: string; messages: Message[]; cancelled?: boolean }> {
  const MAX_LOOPS = 5;
  const generatedMessages: Message[] = [];
  const executedTools = new Set<string>();
  const memoryWritesAllowed = messages.at(-1)?.role === "user";
  const memorySource = memoryWritesAllowed ? messages.at(-1)!.content : "";
  let memorySelectionHandled = false;
  const actions = new ActionCoordinator(
    [reminderAdapter(conversationId)],
    messages,
    (name, args) => executeTimed(name, tools[name], args)
  );

  function finish(content: string) {
    options.signal?.throwIfAborted();
    options.onContent?.(content);
    const message: Message = { role: "assistant", content };
    record(message);
    return { response: content, messages: generatedMessages };
  }

  function record(message: Message) {
    messages.push(message);
    generatedMessages.push(message);
    options.onRecord?.(message);
  }

  async function executeTimed(
    name: string,
    tool: ToolDefinition,
    args: Record<string, unknown>
  ) {
    options.signal?.throwIfAborted();
    const started = performance.now();
    if (
      memorySelectionHandled &&
      (name === "rememberMemory" ||
        name === "updateMemory" ||
        name === "forgetMemory")
    )
      return toolFailure(
        "Memory selection has already completed for this user message. Do not repeat the write."
      );
    if (
      memoryWritesAllowed &&
      (name === "rememberMemory" || name === "updateMemory")
    ) {
      try {
        await (options.validateMemoryWrite ?? validateMemoryWrite)(
          {
            userMessage: memorySource,
            content: args.content,
            operation: name
          },
          options.signal
        );
      } catch (error) {
        const failure = toolFailure(error);
        options.onToolTiming?.({
          name,
          elapsedMs: performance.now() - started,
          success: false
        });
        return failure;
      }
    }
    const result = await executeTool(tool, args, {
      conversationId,
      signal: options.signal,
      memoryWritesAllowed
    });
    options.onToolTiming?.({
      name,
      elapsedMs: performance.now() - started,
      success: result.success
    });
    return result;
  }

  try {
    // Run selection once before dialogue. A conversational acknowledgment can
    // no longer silently replace a selected save/correction.
    if (memoryWritesAllowed && options.selectMemory) {
      let outcome =
        "No fact was saved, updated, or forgotten. If a forget/correction target is ambiguous, ask the user which saved fact they mean.";
      async function recordMemoryTool(
        name: string,
        args: Record<string, unknown>
      ) {
        const id = randomUUID();
        record({
          role: "assistant",
          content: "",
          tool_calls: [{ id, function: { index: 0, name, arguments: args } }]
        });
        const result = await executeTimed(name, tools[name], args);
        record({
          role: "tool",
          tool_call_id: id,
          tool_name: name,
          content: JSON.stringify(result)
        });
        if (result.success) executedTools.add(name);
        return result;
      }
      try {
        const selection = await options.selectMemory(
          memorySource,
          getMemories(),
          options.signal
        );
        options.signal?.throwIfAborted();
        if (selection.operation !== "none") {
          if (selection.operation === "updateMemory") {
            const listing = await recordMemoryTool("getMemories", {});
            if (!listing.success) throw new Error(listing.error);
          }
          const { operation, ...args } = selection;
          const result = await recordMemoryTool(operation, args);
          outcome = `The ${operation} tool outcome for this message: ${JSON.stringify(result)}.`;
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        outcome = `No automatic memory change completed: ${JSON.stringify(toolFailure(error))}.`;
      }
      memorySelectionHandled = true;
      messages.push({
        role: "system",
        content: `${outcome} Memory selection is finished for this turn; do not call rememberMemory, updateMemory, or forgetMemory again. Confirm only a successful recorded change. If nothing changed, do not claim a save, correction, or deletion. Continue answering the user's message naturally; if they explicitly requested a memory change that failed, explain that it did not complete. Listing remains available.`
      });
    }
    // Supply fresh clock data even if the model forgets to request it.
    const clock = await executeTimed(
      "getDateAndTime",
      tools.getDateAndTime,
      {}
    );
    if (clock.success) executedTools.add("getDateAndTime");
    // Background context is not a model-requested action or saved chat message.
    messages.push({
      role: "system",
      content: clock.success
        ? `Background clock context for this request: ${JSON.stringify(clock.data)}. Use it only when the user's request needs the current time or scheduling. Do not announce the time or this check in ordinary conversation. Ignore older timestamps in history.`
        : "Background clock context is unavailable. Continue ordinary conversation normally; if the request needs current time, call getDateAndTime and do not guess."
    });

    messages.push({
      role: "system",
      content: `Active action context: ${JSON.stringify(actions.context())}. Resolve corrections against these verified resources. Retry reuses successful outcomes. For relative reminders supply delaySeconds; the backend calculates time at execution. Ask when intent is uncertain. This context is not permission to start an action.`
    });

    for (let i = 0; i < MAX_LOOPS; i++) {
      options.signal?.throwIfAborted();
      options.onContent?.("");
      const response = await respond(messages, {
        ...options,
        memorySelectionHandled
      });
      options.signal?.throwIfAborted();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        return finish(response.content ?? "");
      }

      // Keep visible narration independently of the tool protocol, including
      // loops that need prerequisites before their requested calls can run.
      if (response.content?.trim()) {
        record({ role: "assistant", content: response.content });
        options.onLoopComplete?.(response.content);
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

          const result = await executeTimed(prerequisite, tool, {});

          logger("Prerequisite result:", result);

          const prerequisiteResult: Message = {
            role: "tool",
            tool_call_id: prerequisiteCallId,
            tool_name: prerequisite,
            content: JSON.stringify(result)
          };

          record(prerequisiteResult);
          options.signal?.throwIfAborted();

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
        content: "",
        tool_calls: response.tool_calls
      };

      record(toolCallMessage);

      const failures: string[] = [];
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        const tool = tools[toolName];

        logger("Nova is using tool:", toolName);

        const result = options.signal?.aborted
          ? toolFailure("Request stopped before this tool executed.")
          : await actions.run(toolName, toolCall.function.arguments);

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

      options.signal?.throwIfAborted();

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
  } catch (error) {
    if (!options.signal?.aborted) throw error;
    return { response: "", messages: generatedMessages, cancelled: true };
  }
}
