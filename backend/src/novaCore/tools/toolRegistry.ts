import { ToolResult, toolSuccess, toolFailure } from "../../types/toolTypes";
import { getWeather } from "./getWeather";
import { getDateAndTime } from "./getDateAndTime";
import { getForecast } from "./getForecast";
import { scheduleTask } from "./scheduleTask";
import { getTasks } from "./getTasks";
import { cancelTask } from "./cancelTask";
import { rescheduleTask } from "./rescheduleTask";
import {
  rememberMemory,
  updateMemory,
  getMemories,
  forgetMemory
} from "../memory/longTermMemoryStore";
import type { ToolContext, ToolDefinition } from "../../types/toolTypes";
export type { ToolDefinition } from "../../types/toolTypes";
export { toolDefinitions } from "./toolDefinitions";
// Normalize thrown errors once, while preserving each tool's result contract.
function defineTool(
  handler: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<ToolResult>,
  requires?: string[]
): ToolDefinition {
  return {
    ...(requires && { requires }),
    execute: async (args, context) => {
      try {
        return await handler(args, context);
      } catch (error) {
        return toolFailure(error);
      }
    }
  };
}

export const tools: Record<string, ToolDefinition> = {
  rememberMemory: defineTool(async (args, context) => {
    if (!context.memoryWritesAllowed)
      return toolFailure("Only a user request can save a memory.");
    return toolSuccess(rememberMemory(args.content));
  }),
  getMemories: defineTool(async () => toolSuccess({ memories: getMemories() })),
  updateMemory: defineTool(
    async (args, context) => {
      if (!context.memoryWritesAllowed)
        return toolFailure("Only a user request can update a memory.");
      return toolSuccess(updateMemory(args.memoryId, args.content));
    },
    ["getMemories"]
  ),
  forgetMemory: defineTool(async (args, context) => {
    if (!context.memoryWritesAllowed)
      return toolFailure("Only a user request can forget a memory.");
    return toolSuccess(forgetMemory(args.memoryId));
  }),
  getWeather: defineTool(async (args) => {
    const result = await getWeather({
      location: args.location as string,
      state: args.state as string | undefined,
      country: args.country as string | undefined
    });
    return toolSuccess(result);
  }),
  getForecast: defineTool(async (args) => {
    const result = await getForecast({
      location: args.location as string,
      state: args.state as string | undefined,
      country: args.country as string | undefined
    });
    return toolSuccess(result);
  }),
  getDateAndTime: defineTool(async () => {
    const result = await getDateAndTime();
    return toolSuccess(result);
  }),
  scheduleTask: defineTool(
    async (args, context) => {
      const result = await scheduleTask({
        conversationId: context.conversationId!,
        task: args.task as string,
        date: args.date as string,
        time: args.time as string,
        timezone: args.timezone as string
      });
      return toolSuccess(result);
    },
    ["getDateAndTime"]
  ),
  getTasks: defineTool(async (_args, context) => {
    const result = await getTasks({
      conversationId: context.conversationId!
    });
    return toolSuccess(result);
  }),
  cancelTask: defineTool(
    async (args, context) => {
      const result = await cancelTask({
        taskId: args.taskId as string,
        conversationId: context.conversationId!
      });
      if (!result.success) {
        return toolFailure(result.error ?? "Unable to cancel task.");
      }
      return toolSuccess(result);
    },
    ["getTasks"]
  ),
  rescheduleTask: defineTool(
    async (args, context) => {
      const result = await rescheduleTask({
        taskId: args.taskId as string,
        conversationId: context.conversationId!,
        date: args.date as string,
        time: args.time as string,
        timezone: args.timezone as string
      });
      if (!result.success) {
        return toolFailure(result.error ?? "Unable to reschedule task.");
      }
      return toolSuccess(result);
    },
    ["getTasks", "getDateAndTime"]
  )
};
