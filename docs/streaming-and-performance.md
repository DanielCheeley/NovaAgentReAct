# Streaming, Stop, and performance measurements

The frontend uses `POST /chat/stream`, a request-scoped NDJSON response. The existing `POST /chat` completed JSON response remains available. Both accept a positive integer `conversationId`, a nonempty `message`, and an optional `requestId` (1–80 letters, digits, underscores, or dashes).

Stream records share the request ID:

- `start`: the server accepted the stream; includes the conversation ID.
- `content`: replaces the current provisional assistant text. A new agent-loop step resets it; tool preambles are not appended to the final answer.
- `done`: canonical final message, title, and timing information.
- `error`: generation failed. The client retains partial text and labels it incomplete.

The client treats EOF without `done` as a failure. It does not automatically retry requests that might already have executed tools.

## Stop semantics

The Stop button aborts the browser fetch, freezes its partial answer, and removes its request ID from active UI state. The HTTP disconnect aborts the model fetch and stops subsequent agent-loop steps. Late output is ignored by both layers.

A tool already started may still finish. Its actual result is persisted immediately; remaining requested tools receive cancellation results without being executed. Stop does not undo completed side effects. Identical scheduling calls still reuse the scheduling guard's original result.

Conversation operations are serialized so a new turn waits for an in-flight tool to finish and persist its outcome. Waiting requests can be stopped before they start. Deletion waits for current conversation work to complete. This is a small history-consistency boundary, not the full future voice coordinator.

Cancelled assistant output is saved with a stop marker. Request IDs, the timing inspector, and transient UI statuses are not database-schema additions. On reload, conversation text and the stop marker remain; per-response timing details are available in current-session logs rather than persisted history.

## Measurements

Each completed response exposes an expandable timing inspector. The backend logs structured `Nova timing` records without prompts, tool arguments, or reply content.

- Request elapsed time includes waiting for earlier work on the same conversation.
- Request first-content time measures the server's first nonempty streamed text, not browser paint time.
- Model first-content time measures the first textual model chunk. Non-streaming requests report it as unavailable, rather than pretending total completion time is first-token latency.
- Ollama load, prompt evaluation, and generation durations are converted from nanoseconds to milliseconds. Missing values remain `null`.
- Actual tool executions are timed separately; cached duplicate scheduling results do not count as another execution.
- `GET /chat/metrics` summarizes completed-request p50/p95 values over at most 100 recent requests and counts errors/cancellations separately. The window resets when the server restarts.

Run a short direct-model baseline:

```powershell
npm run benchmark:model --workspace=backend -- 3
```

This invokes the configured model without executing tools or saving conversations. It does not forcibly unload an active model; inspect `loadMs` to understand loading cost. A three-run small-prompt baseline is not a representative p95 performance study. Collect longer sessions and realistic history before choosing another model.

## Verification and local fixture

The regression suite tests byte-split Unicode/NDJSON records, fragmented tool arguments, truncated streams, cancellation, retained tool outcomes, request ownership, stale UI events, serialization, and real loopback HTTP streaming against mocked model responses. HTTP tests use a disposable database via `NOVA_DATABASE_PATH`; sandboxed environments may require loopback permission.

For deterministic browser testing, stop the normal backend, set `NOVA_DATABASE_PATH` to a disposable database file whose parent directory exists, and run from `backend`:

```powershell
$env:NOVA_DATABASE_PATH = Join-Path (Get-Location) 'data/streaming-smoke.db'
npm exec -- tsx tests/fixtures/uiServer.ts
```

Run the frontend separately with `npm run dev:frontend` from the repository root. The fixture mocks all model requests and cannot establish real-model latency. Stop it before returning to ordinary development. No speech services, model replacements, or GPU configuration changes are included in this feature.
