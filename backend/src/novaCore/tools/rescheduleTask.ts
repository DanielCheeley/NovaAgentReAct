import { Temporal } from "@js-temporal/polyfill";
import { rescheduleTask as rescheduleStoredTask } from "../tasks/taskStore";

export async function rescheduleTask({
  taskId,
  conversationId,
  date,
  time,
  timezone
}: {
  taskId: string;
  conversationId: number;
  date: string;
  time: string;
  timezone: string;
}) {
  const zonedDateTime = Temporal.ZonedDateTime.from(
    `${date}T${time}[${timezone}]`
  );

  const runAt = new Date(
    zonedDateTime.epochMilliseconds
  );

  const rescheduled = rescheduleStoredTask(
    taskId,
    conversationId,
    runAt
  );

  if (!rescheduled) {
    return {
      success: false,
      error:
        "Task was not found, is already completed/cancelled, or does not belong to this conversation."
    };
  }

  return {
    success: true,
    taskId,
    runAt: runAt.toISOString(),
    localRunAt: zonedDateTime.toString(),
    timezone
  };
}