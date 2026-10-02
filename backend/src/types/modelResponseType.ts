export type ToolCall = {
  id: string;
  function: {
    index: number;
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type ModelResponse = {
  content: string;
  tool_calls?: ToolCall[];
};