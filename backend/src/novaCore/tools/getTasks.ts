import { getPendingTasksForConversation } from "../tasks/taskStore";

export async function getTasks({
  conversationId
}: {
  conversationId: number;
}) {
  const tasks = getPendingTasksForConversation(conversationId);

  return {
    success: true,
    tasks
  };
}