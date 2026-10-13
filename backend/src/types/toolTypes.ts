export type ToolSuccess<T = unknown> = {
  success: true;
  data: T;
};

export type ToolFailure = {
  success: false;
  error: string;
};

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export function toolSuccess<T>(data: T): ToolSuccess<T> {
  return {
    success: true,
    data
  };
}

export function toolFailure(error: unknown): ToolFailure {
  return {
    success: false,
    error:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "An unknown tool error occurred."
  };
}

export type ToolContext = {
  conversationId?: number;
  signal?: AbortSignal;
  memoryWritesAllowed?: boolean;
};

export type ToolDefinition = {
  execute: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<ToolResult>;
  requires?: string[];
};
