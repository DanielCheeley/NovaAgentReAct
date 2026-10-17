# NovaAgentReAct

Nova is an npm workspace with a React/Vite frontend and an Express/SQLite backend. The backend talks to the Ollama model configured in `backend/src/novaCore/novaConfig.ts`.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start both development servers |
| `npm run dev:frontend` | Start Vite on its default port, 5173 |
| `npm run dev:backend` | Start the backend development watcher on port 3000 |
| `npm run build` | Build both workspaces |
| `npm test` | Run agent, model, chat-state and task-time regression tests |
| `npm run lint:frontend` | Run the frontend ESLint checks |

The existing workspace-specific build and backend start commands remain available. Backend development uses `backend/.env`; model settings are in `novaConfig.ts`. The frontend HTTP and WebSocket addresses share `BACKEND_URL` in `frontend/src/communication/api.ts`.

## Long-term memory

Nova supports explicit chat controls for saved facts shared across conversations and restarts:

- "Remember that I prefer short answers" saves a fact using `rememberMemory`.
- "What do you remember about me?" lists saved facts using `getMemories`.
- "Update my saved preference to detailed answers" first requires `getMemories`, then corrects the matching fact using `updateMemory`, preserving its ID. Ambiguous targets require clarification; conflicts with another saved fact fail without changing either fact.
- "Forget that I prefer short answers" deletes the fact using `forgetMemory`, with its ID from the current memory snapshot or `getMemories`. Ambiguous targets should prompt clarification.

Facts live in the `memories` table in the existing SQLite database. This first version allows 50 facts, each up to 300 characters, and deduplicates saves after normalizing whitespace and letter casing. At capacity, saves fail explicitly; existing memories are not silently evicted. Current facts are supplied to each chat model request, so a new chat can use them without the original conversation. Memory changes from scheduled events are blocked.

Nova can also selectively save durable, non-sensitive preferences and personal facts stated directly by the user, and update them when the user clearly states a lasting correction. Updates still require `getMemories` first. Temporary details, one-off instructions, quotes, hypotheticals, third-party facts, guesses, sensitive information, and facts marked private or "do not remember" are excluded from automatic memory. Deleted facts must not be re-saved from older chat history. Nova briefly acknowledges successful automatic changes and must not imply unsaved facts are permanent.

Each user turn runs a dedicated structured selection step at temperature zero before dialogue. It considers only the latest user message and current saved facts, selects at most one new fact or correction (or deletion for an explicit forget request), and executes the selected tool before Nova replies. It does not depend on the dialogue model requesting a memory tool. Corrections execute `getMemories` first; unchanged corrections are skipped. Memory mutation tools are withheld from the dialogue stage after selection, preventing duplicate writes. Listing remains available. An ambiguous forget target requires clarification; "forget that" can resolve directly when exactly one fact is saved. There is no automatic deletion policy.

Before a selected save/update executes, a separate non-streamed eligibility check at temperature zero reviews only the latest user message and proposed fact. It requires a positive decision and an exact supporting quote from that message; rejection, malformed output, a timeout, or a network error prevents the write. Nova receives the actual outcome and continues the conversation; she must explain a failed explicit save without claiming success. This adds one selection call per user turn plus one validation call per proposed save/update. Selection remains model-based classification, not a guaranteed privacy filter. Scheduled/background write blocking, validation, duplicate handling, and storage limits remain enforced in code. A message containing several facts currently selects at most one.

Forgetting deletes the saved fact, not past chat messages that mention it. Deleting a conversation leaves shared memory intact. Corrections replace the saved fact in place and work even at the 50-fact limit. These are chat tools; there is no separate memory settings screen yet.

Run `npm run smoke:memory --workspace=backend` for explicit controls and `npm run smoke:memory:auto --workspace=backend` for automatic save/correction, fresh-chat recall, ignored examples, background blocking, and forgetting against the configured Ollama model. Both use and clean up disposable databases; they do not modify your saved facts. These are live behavioral checks, not guarantees that every model response follows the selection policy.

## Frontend organization

| File or directory | Responsibility |
| --- | --- |
| `frontend/src/App.tsx` | Page composition, draft input, textarea reset and message scrolling |
| `frontend/src/components/` | Sidebar, Markdown/code messages, and message input rendering |
| `frontend/src/hooks/useChat.ts` | Conversation loading, sending/deleting requests, WebSocket lifecycle, and dispatching state updates |
| `frontend/src/hooks/useBackendHealth.ts` | Initial health check with a three-second timeout and cleanup |
| `frontend/src/state/chatState.ts` | Pure reducer for conversation selection, ordering, deletion, messages, and generating indicators |
| `frontend/src/communication/api.ts` | HTTP endpoints, response status checks, and filtering persisted history into visible messages |
| `frontend/src/communication/websocket.ts` | Socket ownership, reconnection, message delivery, and disconnect cleanup |
| `frontend/src/types/chat.ts` | UI message and conversation types |

A sent message updates the reducer immediately, moves the conversation to the top, and sets its generating indicator. The HTTP response appends Nova's reply and updates the title. A failed request appends the existing connection-error message. Scheduled WebSocket replies append to their own conversation without changing sidebar order or the selected chat.

Deleting a conversation updates the conversation list and active selection together in the reducer. This replaces a nested React state update and uses the latest selection if the user switches chats while deletion is pending. Initial history requests are aborted on unmount; WebSocket handlers are installed before connecting and cleared on cleanup.

## Backend organization

| File or directory | Responsibility |
| --- | --- |
| `backend/src/server.ts` | HTTP routes, middleware, WebSocket server and scheduler startup |
| `backend/src/routes/` and `controllers/` | HTTP request/response boundaries |
| `backend/src/novaCore/agent.ts` | Conversation loading, title generation, user/event context and saving generated messages |
| `backend/src/novaCore/agentLoop.ts` | Model/tool iteration, prerequisites, fresh clock context, result recording and final responses |
| `backend/src/novaCore/model.ts` | Shared Ollama HTTP transport plus distinct chat and title request settings |
| `backend/src/novaCore/tools/toolDefinitions.ts` | Model-visible tool names, descriptions and parameter schemas |
| `backend/src/novaCore/tools/toolRegistry.ts` | Tool handlers, argument/context mapping, prerequisites and result normalization |
| `backend/src/novaCore/tools/executeTool.ts` | Catch thrown execution errors at the agent-loop boundary, including custom/test handlers |
| `backend/src/novaCore/tools/*.ts` | Individual weather, clock and task implementations |
| `backend/src/novaCore/tasks/taskTime.ts` | Shared local date/time/timezone conversion for scheduling and rescheduling |
| `backend/src/novaCore/tasks/taskStore.ts` | Task persistence and conversation-scoped pending-task operations |
| `backend/src/novaCore/tasks/scheduler.ts` | Poll for due tasks and emit task events |
| `backend/src/novaCore/events/` | Event routing and scheduled-response broadcasting |
| `backend/src/novaCore/memory/conversationStore.ts` | Conversation/message persistence and deletion |
| `backend/src/database/database.ts` | SQLite connection and schema initialization |
| `backend/src/types/` | Shared backend conversation, model, event, task and tool contracts |

The normal request flow is:

`MessageInput -> App -> useChat -> api -> chat route/controller -> agent -> agentLoop -> model/tools -> conversationStore -> HTTP reply -> reducer -> MessageList`

The scheduled-message flow is:

`scheduler -> eventBus -> novaEventHandler -> agent.handleEvent -> agentLoop -> saved messages + WebSocket broadcast -> useChat -> reducer -> MessageList`

The agent loop still has a five-step limit and executes tool batches sequentially. Only successful results satisfy prerequisites. Failed prerequisites stop dependent actions; mixed-result batches retain successful actions and return an explicit failure response. Background clock context is fresh for each request and is excluded from saved generated messages. `runAgent` remains exported from `agent.ts` for existing callers.

The model schemas, Nova prompt, model settings, HTTP response shapes, database schema, weather behavior, timezone/DST rules, UI markup and styling are preserved. The registry retains explicit cancellation/rescheduling failures rather than wrapping them as success. The model transport retains the separate chat/title error messages and title trimming.

## Verification of this refactor

All 19 regression tests passed. The suite covers existing clock/failure/step-limit behavior plus prerequisite sequencing, mixed-result batches, cancellation/rescheduling failure wrapping, reducer transitions, model request settings/errors, schema/handler parity, and winter/summer timezone conversion. The shared TypeScript test runner lives in the backend workspace; it also tests the frontend's pure reducer without adding a frontend test dependency.

Both workspace builds, frontend lint and `git diff --check` passed during the refactor. Browser verification could not be completed because the available browser could not reach the local development server; localhost HTTP verification also failed in this execution environment. Live Ollama replies and scheduled-message delivery therefore remain unverified end to end. Vite still reports the existing large JavaScript bundle warning.

An additional backend ESLint attempt was blocked by the existing root configuration: it imports `@eslint/js` from the root even though the dependency is installed in the backend workspace. Backend TypeScript compilation and regression tests passed.
