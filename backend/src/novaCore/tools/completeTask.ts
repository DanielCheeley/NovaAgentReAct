export async function completeTask({task}: {task: string;}) {
  return {
    success: true,
    message: `Task completed: ${task}`
  };
}