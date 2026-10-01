import { ScheduledTask } from "../../types/taskTypes";

const tasks: ScheduledTask[] = [];

export function addTask(task: ScheduledTask): void {
  tasks.push(task);
}

export function getPendingTasks(): ScheduledTask[] {
  return tasks.filter((task) => task.status === "pending");
}

export function completeTask(taskId: string): void {
  const task = tasks.find((task) => task.id === taskId);

  if (!task) {
    return;
  }

  task.status = "completed";
}

export function getTask(taskId: string): ScheduledTask | undefined {
  return tasks.find((task) => task.id === taskId);
}

export function cancelTask(
  taskId: string,
  conversationId: number
): boolean {
  const task = tasks.find(
    (task) =>
      task.id === taskId &&
      task.conversationId === conversationId &&
      task.status === "pending"
  );

  if (!task) {
    return false;
  }

  task.status = "cancelled";

  return true;
}

export function rescheduleTask(
  taskId: string,
  conversationId: number,
  runAt: Date
): boolean {
  const task = tasks.find(
    (task) =>
      task.id === taskId &&
      task.conversationId === conversationId &&
      task.status === "pending"
  );

  if (!task) {
    return false;
  }

  task.runAt = runAt;

  return true;
}

export function getPendingTasksForConversation(
  conversationId: number
): ScheduledTask[] {
  return tasks.filter(
    (task) =>
      task.conversationId === conversationId &&
      task.status === "pending"
  );
}