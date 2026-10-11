import { getTask } from "../tasks/taskStore";
import { resolveTaskTime } from "../tasks/taskTime";
import { relativeTaskArguments } from "../tasks/relativeTime";
import type { ToolResult } from "../../types/toolTypes";
import type {
  ActionAdapter,
  ActiveAction,
  PreparedAction
} from "./coordinator";

function data(result: ToolResult): Record<string, unknown> {
  return result.success && result.data && typeof result.data === "object"
    ? (result.data as Record<string, unknown>)
    : {};
}

export function reminderAdapter(
  conversationId?: number,
  lookup = getTask
): ActionAdapter {
  function pending(id: unknown) {
    const task = typeof id === "string" ? lookup(id) : undefined;
    if (
      !task ||
      task.conversationId !== conversationId ||
      task.status !== "pending"
    ) {
      throw new Error(
        "The reminder is missing, completed, cancelled, or belongs to another conversation. Use getTasks or ask which reminder the user means."
      );
    }
    return task;
  }
  function prepare(
    tool: string,
    args: Record<string, unknown>,
    active?: ActiveAction
  ): PreparedAction {
    if (!Number.isSafeInteger(conversationId) || conversationId! < 1)
      throw new Error("A conversation is required for reminders.");
    const operation =
      tool === "scheduleTask"
        ? args.operation
        : tool === "rescheduleTask"
          ? "update"
          : "cancel";
    if (operation === "retry") {
      if (!active)
        throw new Error(
          "There is no reminder action to retry. Ask what to remind the user about and when."
        );
      if (active.status === "succeeded") return { result: active.result };
      if (active.args.operation === "retry")
        throw new Error(
          "The previous retry lacked a valid reminder. Ask for the missing details."
        );
      return prepare(active.tool, active.args, active);
    }
    if (
      operation !== "create" &&
      operation !== "update" &&
      operation !== "cancel"
    ) {
      throw new Error(
        "Specify reminder operation create, update, or retry. Use a reminder tool only for the user's requested action; ask for clarification if intent is uncertain. No reminder was created."
      );
    }
    if (operation === "cancel" || operation === "update") {
      const task = pending(args.taskId ?? active?.resourceId);
      args = { ...args, taskId: task.id };
      if (operation === "cancel") return { tool: "cancelTask", args };
      tool = "rescheduleTask";
    } else {
      if (
        typeof args.task !== "string" ||
        !args.task.trim() ||
        args.task.length > 10000
      )
        throw new Error("Provide the reminder's task before creating it.");
    }
    if (args.delaySeconds !== undefined) {
      if (
        typeof args.delaySeconds !== "number" ||
        !Number.isSafeInteger(args.delaySeconds) ||
        args.delaySeconds < 0 ||
        args.delaySeconds > 31536000
      )
        throw new Error(
          "delaySeconds must be a whole number between 0 and 31536000."
        );
      if (args.date !== undefined || args.time !== undefined)
        throw new Error("Provide either delaySeconds or date/time, not both.");
      args = relativeTaskArguments(args, args.delaySeconds);
    } else {
      if (
        typeof args.date !== "string" ||
        typeof args.time !== "string" ||
        typeof args.timezone !== "string"
      )
        throw new Error(
          "Provide delaySeconds or a complete date, time, and timezone. Ask for missing details."
        );
      if (
        resolveTaskTime(
          args as { date: string; time: string; timezone: string }
        ).runAt.getTime() <= Date.now()
      )
        throw new Error(
          "The requested time is already past. Ask for a new time; do not invent one."
        );
    }
    return { tool, args };
  }
  return {
    kind: "reminder",
    tools: ["scheduleTask", "rescheduleTask", "cancelTask"],
    prepare,
    resourceId: (result) =>
      typeof data(result).taskId === "string"
        ? (data(result).taskId as string)
        : undefined,
    describe: (active) => {
      const task = active.resourceId ? lookup(active.resourceId) : undefined;
      return task && task.conversationId === conversationId
        ? {
            task: task.task,
            taskId: task.id,
            status: task.status,
            runAt: task.runAt.toISOString()
          }
        : { status: "unavailable" };
    }
  };
}
