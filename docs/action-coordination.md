# Action coordination

The agent routes registered action tools through `ActionCoordinator`. Capability adapters validate and prepare calls; the existing tool registry executes them and supplies timing/cancellation. Other tools keep their original execution path.

Current adapter: reminders. `scheduleTask` accepts `operation: create | update | retry`; `rescheduleTask` and `cancelTask` remain supported. Relative times use `delaySeconds` (0 = now), or absolute times use date/time/timezone. Updates validate a pending task in this conversation. Retry reuses a successful result rather than executing again. Identical requests within a turn reuse their result, including failures.

Action state is rebuilt from matched saved tool calls/results, so no new database or process-global state cache is needed. Existing chats remain readable. Legacy successful reminder calls still supply active task IDs. Deleted chats cannot leave coordinator state behind.

The coordinator validates execution, not natural-language permission. The normal model call interprets user intent using tool descriptions and current action context. Ambiguous requests should ask for clarification. Removing the phrase guard means a model that falsely selects `create` can still schedule an unwanted reminder; this should remain part of live model evaluation.

To add another capability, implement `ActionAdapter` with tool names, validation/preparation, resource-ID extraction, and a context description. Register it when constructing the coordinator. Keep domain-specific ownership and lifecycle checks in that adapter.

Manual test in a fresh chat:

1. Ask for a small TypeScript function: no scheduled task.
2. "Remind me in two minutes to eat something."
3. "I meant three minutes from now." Verify the same task ID changed using getTasks.
4. "Try again." Verify no extra task.
5. "Cancel it." Verify no pending task.
6. "Remind me in 10 seconds to drink water." Wait for delivery.

Relative delays start when the tool executes. Scheduler polling and inference add delivery latency. A completed or cancelled task cannot be updated; Nova must clarify rather than silently create a replacement.
