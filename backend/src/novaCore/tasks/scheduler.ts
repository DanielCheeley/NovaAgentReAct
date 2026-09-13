import { emit } from "../events/eventBus";

export function startScheduler() {
  setInterval(() => {
    emit({
      type: "task.due",
      data: {
        task: "this is a test task. tell the user that the scheduled task worked."
      }
    });
  }, 20000);
}