import { emit } from "../events/eventBus";

export function startScheduler() {
  setInterval(() => {
    emit({
      type: "timer.tick",
      data: {
        time: new Date()
      }
    });
  }, 10000);
}