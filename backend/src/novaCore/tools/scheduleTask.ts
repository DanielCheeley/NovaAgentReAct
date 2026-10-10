import { randomUUID } from "node:crypto";
import { resolveTaskTime } from "../tasks/taskTime";

import { addTask } from "../tasks/taskStore";
import { ScheduledTask } from "../../types/taskTypes";

export async function scheduleTask({
  conversationId,
  task,
  date,
  time,
  timezone
}: {
  conversationId: number;
  task: string;
  date: string;
  time: string;
  timezone: string;
}) {
  const { zonedDateTime, runAt } = resolveTaskTime({ date, time, timezone });

  const scheduledTask: ScheduledTask = {
    id: randomUUID(),
    conversationId,
    task,
    runAt,
    status: "pending"
  };

  addTask(scheduledTask);

  return {
    success: true,
    taskId: scheduledTask.id,
    task: scheduledTask.task,
    runAt: scheduledTask.runAt.toISOString(),
    localRunAt: zonedDateTime.toString(),
    timezone
  };
}
