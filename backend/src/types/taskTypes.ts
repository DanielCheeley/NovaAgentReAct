export type ScheduledTask = {
  id: string;
  task: string;
  runAt: Date;
  status: "pending" | "completed" | "cancelled";
}