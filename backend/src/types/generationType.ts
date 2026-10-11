export type ModelTiming = {
  elapsedMs: number;
  firstContentMs: number | null;
  loadMs: number | null;
  promptMs: number | null;
  generationMs: number | null;
  promptTokens: number | null;
  generatedTokens: number | null;
  status: "completed" | "cancelled" | "error";
};

export type ToolTiming = { name: string; elapsedMs: number; success: boolean };

export type RequestTiming = {
  requestId: string;
  conversationId: number;
  elapsedMs: number;
  firstContentMs: number | null;
  status: "completed" | "cancelled" | "error";
  models: ModelTiming[];
  tools: ToolTiming[];
};

export type GenerationOptions = {
  signal?: AbortSignal;
  onContent?: (content: string) => void;
  onModelTiming?: (timing: ModelTiming) => void;
};
