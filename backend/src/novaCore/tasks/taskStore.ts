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