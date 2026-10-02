export type ScheduledTask = {
  id: string;
  conversationId: number;
  task: string;
  runAt: Date;
  status: "pending" | "completed" | "cancelled";
}