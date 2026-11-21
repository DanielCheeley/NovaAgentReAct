# NovaAgentReAct

Nova is an npm workspace with a React/Vite frontend and an Express/SQLite backend. The backend talks to the Ollama model configured in `backend/src/novaCore/novaConfig.ts`.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the web frontend, backend, and Discord bot |
| `npm run dev:frontend` | Start Vite on its default port, 5173 |
| `npm run dev:backend` | Start the backend development watcher on port 3000 |
| `npm run discord` | Run the private Discord prototype |
| `npm run build` | Build both workspaces |
| `npm test` | Run agent, model, chat-state and task-time regression tests |
| `npm run lint:frontend` | Run the frontend ESLint checks |

The existing workspace-specific build and backend start commands remain available. Backend development uses `backend/.env`; model settings are in `novaConfig.ts`. The frontend HTTP and WebSocket addresses share `BACKEND_URL` in `frontend/src/communication/api.ts`.

## Discord prototype

1. Install the Discord bot in your test server with the `bot` scope. In the test channel, give it **View Channel**, **Send Messages**, and **Read Message History** so it can reply to the original message. Use a regular text channel for this prototype.
2. In the Discord Developer Portal, open **Bot** and enable **Message Content Intent** under **Privileged Gateway Intents** so Nova can see her name in ordinary messages.
3. Set `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` in your existing `backend/.env`. For a separate config, copy `backend/.env.discord.example` to `backend/.env.discord` and fill it in there. Values in `.env.discord` override those in `.env`. Copy the test channel ID using Discord's Developer Mode.
4. Run `npm install` from the repository root, start Ollama with Nova's configured model available, then run `npm run discord`. Once the bot logs that it connected, send `hey Nova` in the test channel.

The bot replies when anyone in the configured channel says Nova as a whole word, mentions her, or uses Discord's **Reply** on one of her messages with or without a ping. It ignores bots and webhooks. `npm run dev` starts the web app and Discord together. Use `npm run discord` to run just the bot.

You can also open a direct message with Nova and send her a normal text message. She uses recent messages from that DM as context. DM transcripts stay in Discord and do not go into Nova's shared SQLite memory. DM replies use only the DM's conversation context.

When triggered, Nova reads up to 12 preceding messages from the configured channel as context for that reply. Those messages are supplied to the model for the current turn and are kept out of the stored transcript. The triggering message and Nova's reply are saved as usual.

Discord history and automatically saved episodes persist in `backend/data/nova-discord-channel-<channel-id>.db`. Nova reviews new exchanges after one idle minute by default. `MEMORY_REVIEW_IDLE_MS` controls the delay and `0` stops new background reviews.

Both interfaces can recall existing saved facts and relevant episodes and interests from either database, labeled **Web app** or **Discord**. Each interface still saves its own conversations and reviews them separately. A Discord reply can bring up a web-app memory, so use a channel you trust to see those memories. Reminders and manual memory tools are disabled in Discord.

Ask `What do you remember from Discord?` in the web app or `Nova, what do you remember from the web app?` in the configured channel for a summary of recent saved memories from that source.

In the configured channel or a DM, ask Nova for the current time, local date, weather, or a forecast. The clock uses the computer's timezone, and weather requests can include a city and state or country.

## Long-term memory

Nova supports explicit chat controls for saved facts shared across conversations and restarts:

- "Remember that I prefer short answers" saves a fact using `rememberMemory`.
- "What do you remember about me?" lists saved facts using `getMemories`.
- "Forget that I prefer short answers" identifies the fact with `getMemories` and deletes it using `forgetMemory`. Ambiguous targets should prompt clarification.

Facts live in the `memories` table in the existing SQLite database. This first version allows 50 facts, each up to 300 characters, and deduplicates saves after normalizing whitespace and letter casing. At capacity, saves fail explicitly; existing memories are not silently evicted. Current facts are supplied to each chat model request, so a new chat can use them without the original conversation. Memory changes from scheduled events are blocked. Explicit-request interpretation is handled by the model instructions; automatic fact extraction is not enabled.

Forgetting deletes the saved fact, not past chat messages that mention it. Deleting a conversation leaves shared memory intact. To correct a fact, ask Nova to forget the old fact and remember its replacement. These are chat tools; there is no separate memory settings screen yet.

Run `npm run smoke:memory --workspace=backend` to check explicit saving, listing, recall in a new chat, no automatic saving of casual facts, and forgetting against the configured Ollama model. It uses and cleans up a disposable database. The initial implementation passed this live check, all 50 regression tests, and both workspace builds.

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
