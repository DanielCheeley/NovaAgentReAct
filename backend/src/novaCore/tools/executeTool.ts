import { toolFailure } from "../../types/toolTypes";
import type { ToolContext, ToolDefinition } from "../../types/toolTypes";

// The loop must also handle custom/test tools that do not use the registry wrapper.
export async function executeTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  context: ToolContext
) {
  try {
    return await tool.execute(args, context);
  } catch (error) {
    return toolFailure(error);
  }
}
