import { cancelTask as cancelStoredTask } from "../tasks/taskStore";

export async function cancelTask({
  taskId,
  conversationId
}: {
  taskId: string;
  conversationId: number;
}) {
  const cancelled = cancelStoredTask(
    taskId,
    conversationId
  );

  if (!cancelled) {
    return {
      success: false,
      error: "Task was not found, is already completed/cancelled, or does not belong to this conversation."
    };
  }

  return {
    success: true,
    taskId
  };
}