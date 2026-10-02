import { ScheduledTask } from "../../types/taskTypes";
import { db } from "../../database/database";

type TaskRow = {
  id: string;
  conversation_id: number;
  task: string;
  run_at: string;
  status: ScheduledTask["status"];
};

function rowToTask(row: TaskRow): ScheduledTask {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    task: row.task,
    runAt: new Date(row.run_at),
    status: row.status
  };
}

export function addTask(task: ScheduledTask): void {
  const statement = db.prepare(`
    INSERT INTO tasks (
      id,
      conversation_id,
      task,
      run_at,
      status
    )
    VALUES (
      @id,
      @conversationId,
      @task,
      @runAt,
      @status
    )
  `);

  statement.run({
    id: task.id,
    conversationId: task.conversationId,
    task: task.task,
    runAt: task.runAt.toISOString(),
    status: task.status
  });
}

export function getPendingTasks(): ScheduledTask[] {
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    WHERE status = 'pending'
  `).all() as TaskRow[];

  return rows.map(rowToTask);
}

export function completeTask(taskId: string): void {
  db.prepare(`
    UPDATE tasks
    SET status = 'completed'
    WHERE id = ?
  `).run(taskId);
}

export function getTask(taskId: string): ScheduledTask | undefined {
  const row = db.prepare(`
    SELECT *
    FROM tasks
    WHERE id = ?
  `).get(taskId) as TaskRow | undefined;

  if (!row) {
    return undefined;
  }

  return rowToTask(row);
}

export function cancelTask(
  taskId: string,
  conversationId: number
): boolean {
  const result = db.prepare(`
    UPDATE tasks
    SET status = 'cancelled'
    WHERE id = ?
      AND conversation_id = ?
      AND status = 'pending'
  `).run(taskId, conversationId);

  return result.changes > 0;
}

export function rescheduleTask(
  taskId: string,
  conversationId: number,
  runAt: Date
): boolean {
  const result = db.prepare(`
    UPDATE tasks
    SET run_at = ?
    WHERE id = ?
      AND conversation_id = ?
      AND status = 'pending'
  `).run(
    runAt.toISOString(),
    taskId,
    conversationId
  );

  return result.changes > 0;
}

export function getPendingTasksForConversation(
  conversationId: number
): ScheduledTask[] {
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    WHERE conversation_id = ?
      AND status = 'pending'
  `).all(conversationId) as TaskRow[];

  return rows.map(rowToTask);
}