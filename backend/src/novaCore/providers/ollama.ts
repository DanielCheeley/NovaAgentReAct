import { randomUUID } from "node:crypto";
import type { ModelResponse, ToolCall } from "../../types/modelResponseType";
import type {
  GenerationOptions,
  ModelTiming
} from "../../types/generationType";
import { readJsonLines } from "./jsonLines";

type Envelope = {
  message?: {
    content?: string;
    tool_calls?: Array<{
      id?: string;
      function: {
        index?: number;
        name?: string;
        arguments?: Record<string, unknown> | string;
      };
    }>;
  };
  done?: boolean;
  error?: string;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

export async function requestOllama(
  url: string,
  body: Record<string, unknown>,
  errorLabel: string,
  options: GenerationOptions = {}
): Promise<ModelResponse> {
  const started = performance.now();
  let firstContentMs: number | null = null;
  let status: ModelTiming["status"] = "error";
  let metadata: Envelope = {};
  let content = "";
  const calls = new Map<
    string,
    {
      id: string;
      index: number;
      name: string;
      args: Record<string, unknown> | string;
    }
  >();

  function consume(data: Envelope) {
    options.signal?.throwIfAborted();
    if (data.error) throw new Error(`${errorLabel}: ${data.error}`);
    metadata = data;
    if (data.message?.content) {
      if (body.stream) firstContentMs ??= performance.now() - started;
      content += data.message.content;
      options.onContent?.(content);
    }
    for (const call of data.message?.tool_calls ?? []) {
      if (!call.function) throw new Error("Malformed model tool call");
      const index = call.function.index ?? calls.size;
      const key = call.id ?? String(index);
      const existing = calls.get(key);
      const args = call.function.arguments ?? {};
      const name = call.function.name ?? "";
      calls.set(key, {
        id: call.id ?? existing?.id ?? randomUUID(),
        index,
        name:
          existing && name !== existing.name
            ? existing.name + name
            : name || existing?.name || "",
        args:
          typeof args === "string"
            ? (typeof existing?.args === "string" ? existing.args : "") + args
            : {
                ...(typeof existing?.args === "object" ? existing.args : {}),
                ...args
              }
      });
    }
  }

  try {
    options.signal?.throwIfAborted();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      const explanation =
        typeof detail?.error === "string"
          ? `: ${detail.error.slice(0, 500)}`
          : "";
      throw new Error(`${errorLabel}: ${response.status}${explanation}`);
    }
    if (body.stream) {
      if (!response.body) throw new Error("Model stream has no body");
      let complete = false;
      for await (const raw of readJsonLines(response.body, options.signal)) {
        consume(raw as Envelope);
        if ((raw as Envelope).done) {
          complete = true;
          break;
        }
      }
      if (!complete) throw new Error("Model stream ended before completion");
    } else {
      const data = (await response.json()) as Envelope;
      if (!data.message) throw new Error("Model response has no message");
      consume(data);
    }
    options.signal?.throwIfAborted();
    const toolCalls: ToolCall[] = [...calls.values()].map((call) => {
      const args: unknown =
        typeof call.args === "string" ? JSON.parse(call.args) : call.args;
      if (
        !call.name ||
        !args ||
        typeof args !== "object" ||
        Array.isArray(args)
      ) {
        throw new Error("Malformed model tool arguments");
      }
      return {
        id: call.id,
        function: {
          index: call.index,
          name: call.name,
          arguments: args as Record<string, unknown>
        }
      };
    });
    status = "completed";
    return { content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  } finally {
    if (options.signal?.aborted) status = "cancelled";
    const ms = (value?: number) =>
      typeof value === "number" ? value / 1_000_000 : null;
    options.onModelTiming?.({
      elapsedMs: performance.now() - started,
      firstContentMs,
      status,
      loadMs: ms(metadata.load_duration),
      promptMs: ms(metadata.prompt_eval_duration),
      generationMs: ms(metadata.eval_duration),
      promptTokens: metadata.prompt_eval_count ?? null,
      generatedTokens: metadata.eval_count ?? null
    });
  }
}
