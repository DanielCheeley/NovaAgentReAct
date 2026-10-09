import { emit } from "../events/eventBus";
import { getPendingTasks, completeTask } from "./taskStore";

export function startScheduler() {
  setInterval(() => {
    const now = new Date();

    const tasks = getPendingTasks();

    for (const task of tasks) {
      if (task.runAt <= now) {
        emit({
          type: "task.due",
          data: task
        });

        completeTask(task.id);
      }
    }
  }, 1000);
}
