import type { Message } from "../../types/conversationType";
import { toolFailure, type ToolResult } from "../../types/toolTypes";

export type ActiveAction = {
  kind: string;
  sourceTurn: number;
  status: "succeeded" | "failed";
  resourceId?: string;
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
};
export type PreparedAction =
  { tool: string; args: Record<string, unknown> } | { result: ToolResult };
export type ActionAdapter = {
  kind: string;
  tools: string[];
  prepare: (
    tool: string,
    args: Record<string, unknown>,
    active?: ActiveAction
  ) => PreparedAction;
  resourceId: (result: ToolResult) => string | undefined;
  describe: (active: ActiveAction) => unknown;
};
type Executor = (
  name: string,
  args: Record<string, unknown>
) => Promise<ToolResult>;

// Conversation records are the durable store. Rebuild state instead of keeping
// another mutable cache that can outlive deleted conversations or restarts.
export class ActionCoordinator {
  private active = new Map<string, ActiveAction>();
  private outcomes = new Map<string, ToolResult>();
  private sourceTurn = 0;
  private userTurn: boolean;

  constructor(
    private adapters: ActionAdapter[],
    messages: Message[],
    private execute: Executor
  ) {
    this.userTurn = messages.at(-1)?.role === "user";
    const calls = new Map<
      string,
      { tool: string; args: Record<string, unknown> }
    >();
    for (const message of messages) {
      if (message.role === "user") this.sourceTurn++;
      for (const call of message.tool_calls ?? [])
        calls.set(call.id, {
          tool: call.function.name,
          args: call.function.arguments
        });
      if (message.role !== "tool" || !message.tool_call_id) continue;
      const call = calls.get(message.tool_call_id);
      const adapter = call && adapters.find((a) => a.tools.includes(call.tool));
      if (!call || !adapter) continue;
      try {
        const result = JSON.parse(message.content) as ToolResult;
        if (typeof result.success !== "boolean") continue;
        this.remember(adapter, call.tool, call.args, result);
      } catch {
        /* Ignore incomplete legacy records. */
      }
    }
  }

  context() {
    return this.adapters.flatMap((adapter) => {
      const state = this.active.get(adapter.kind);
      return state
        ? [{ ...state, result: undefined, details: adapter.describe(state) }]
        : [];
    });
  }

  async run(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const adapter = this.adapters.find((a) => a.tools.includes(tool));
    if (!adapter) return this.execute(tool, args);
    if (!this.userTurn)
      return toolFailure(
        "Only a user request can start or change an action. A due event must not reschedule itself."
      );
    const key = JSON.stringify([
      tool,
      Object.keys(args)
        .sort()
        .map((k) => [k, args[k]])
    ]);
    const previous = this.outcomes.get(key);
    if (previous) return previous;
    let result: ToolResult;
    try {
      const prepared = adapter.prepare(
        tool,
        args,
        this.active.get(adapter.kind)
      );
      result =
        "result" in prepared
          ? prepared.result
          : await this.execute(prepared.tool, prepared.args);
    } catch (error) {
      result = toolFailure(error);
    }
    // Failed outcomes are also cached: changing execution timing cannot retry
    // an identical call within the same turn.
    this.outcomes.set(key, result);
    this.remember(adapter, tool, args, result);
    return result;
  }

  private remember(
    adapter: ActionAdapter,
    tool: string,
    args: Record<string, unknown>,
    result: ToolResult
  ) {
    const previous = this.active.get(adapter.kind);
    this.active.set(adapter.kind, {
      kind: adapter.kind,
      sourceTurn: this.sourceTurn,
      status: result.success ? "succeeded" : "failed",
      tool,
      args,
      result,
      resourceId: adapter.resourceId(result) ?? previous?.resourceId
    });
  }
}
