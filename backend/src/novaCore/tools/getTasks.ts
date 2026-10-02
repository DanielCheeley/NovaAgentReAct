import { getPendingTasksForConversation } from "../tasks/taskStore";

export async function getTasks({
  conversationId
}: {
  conversationId: number;
}) {
  const tasks = getPendingTasksForConversation(conversationId);

  return {
    success: true,
    tasks: tasks.map((task) => ({
      id: task.id,
      conversationId: task.conversationId,
      task: task.task,
      runAt: task.runAt.toISOString(),
      localRunAt: formatTaskTime(task.runAt),
      status: task.status
    }))
  }
}

function formatTaskTime(date: Date) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short"
  }).format(date);
}