import { randomUUID } from "node:crypto";
import { addTask } from "../tasks/taskStore";
import { ScheduledTask } from "../../types/taskTypes";

export async function scheduleTask({
  conversationId,
  task,
  runAt
}: {
  conversationId: number;
  task: string;
  runAt: string;
}) {
  const scheduledTask: ScheduledTask = {
    id: randomUUID(),
    conversationId,
    task,
    runAt: new Date(runAt),
    status: "pending"
  };

  addTask(scheduledTask);

  return {
    success: true,
    taskId: scheduledTask.id,
    task: scheduledTask.task,
    runAt: scheduledTask.runAt.toISOString(),
    localRunAt: scheduledTask.runAt.toLocaleString("en-US"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}