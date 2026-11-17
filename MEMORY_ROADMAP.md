# Nova long-term memory and automation roadmap

Build a small conversation-to-memory loop first, then expand it into semantic, episodic, and procedural memory with automated review. This roadmap covers memory storage, learning, recall, revision, and forgetting only. UI, independent activities, proactive conversation, research, and action permissions are deferred to a separate future plan. Existing code can change when that makes the design simpler. Preserve stored data through explicit migrations rather than preserving every current abstraction. Each numbered step is a separate reviewable change; stop and inspect behavior before starting the next one.

## Current starting point (inspected October 21, 2026)

- SQLite stores saved facts with an ID, content, normalized content, and creation time.
- `longTermMemoryStore.ts` implements save, list, forget, duplicate protection, and context injection. Current limits are 50 facts and 300 characters per fact.
- Normal chat can use explicit memory tools. Scheduled contexts cannot write through those tools.
- Conversations and messages are persisted with timestamps and message IDs, although the current conversation reader does not expose all of that metadata.
- Existing tests cover persistence, deletion, duplicates, limits, and tool behavior.
- This checkout does not currently contain the idle reviewer described in older project notes. Recheck the implementation baseline before coding; do not assume another branch's work is present.
- There is a pre-existing local edit adding a memory type to `SavedMemory`; it is not backed by the SQL schema or readers yet. Integrate or replace it deliberately with the user’s work preserved.

## 1. Establish the smallest useful semantic record

Keep explicit save/list/forget working. Decide whether to extend the current table or migrate it into a dedicated semantic table; prefer the simpler implementation after checking callers.

Add only what the first loop requires: subject (`user` or `nova` initially), tentative/established status, and update time. Keep existing facts on migration; mark their origin as legacy rather than inventing evidence for them. Add an atomic correction operation so replacing a fact cannot leave a half-finished delete/save pair.

Functions: `saveBelief`, `listBeliefs`, `updateBelief`, `deleteBelief`. Existing tool names can remain as adapters if useful.

Done when: old records survive migration and restart; explicit corrections and deletions affect the intended record; duplicate/conflicting writes fail cleanly. No autonomous inference yet.

### Step 1 implementation checkpoint (October 22, 2026)

Implemented in the current working tree using the existing `memories` table and tool adapters. Semantic records now carry subject, tentative/established status, origin, and update time. Existing rows retain IDs, content, and creation times and are labeled `legacy`; the compatibility defaults are user/established, not newly inferred evidence. New explicit saves are labeled `explicit`. The existing local memory-type sketch is integrated as `Semantic`; episodes and habits will have separate storage in later steps.

`updateMemory` corrects a verified record atomically, retaining its identity, subject, status, and creation time. Duplicate replacements fail without deleting anything. Internal saves accept subject/status metadata; ordinary explicit tools retain their existing defaults. No inference or idle automation is enabled.

Validation: seven focused memory tests pass, including legacy migration across two process startups, uncertainty, correction at capacity, duplicate rollback, and blocked background writes. Backend/frontend builds pass. The full suite currently reports 50/52 passing; two HTTP streaming tests fail with `fetch failed` and remain unresolved. Live model behavior is still to be tested before step 2.

Manual checkpoint: explicitly save a disposable fact, list memories, correct it, start a fresh chat and ask for it, then forget it and list again. Inspect tool results, especially the stable ID on correction. Use disposable data for this check.

## 2. Store one meaningful episode

Add a separate episode record: event time, recorded time, source conversation/message references, structured account of what happened, participants, observed reactions, Nova's reported reaction, outcome, significance, and a first-person account. Unknown reactions stay unknown. Distinguish observed events from Nova's interpretations.

Initially save an episode through a backend development command or focused test using a real conversation segment. No frontend or automatic event detection yet. Do not force episodes through the existing 300-character fact limit.

Functions: `saveEpisode`, `getEpisode`, `listEpisodes`, `deleteEpisode`.

Done when: a meaningful interaction persists with its source and both representations; it can be retrieved after restart; saving it creates no preference automatically.

### Step 2 implementation checkpoint (October 22, 2026)

Added separate `episodes` storage and backend `saveEpisode`, `getEpisode`, `listEpisodes`, and `deleteEpisode` functions in `episodeStore.ts`. Each episode holds source conversation/message IDs, event time from the earliest source message, recorded time, structured event description, participants, quoted observations, nullable Nova-reported reaction, nullable outcome, significance, and a separate first-person interpretation. Episode text supports up to 20,000 characters per field, independently of the fact limit.

Saving validates that source messages still exist in the selected conversation. Reaction quotes must occur in referenced messages; Nova-reported reactions must quote an assistant message. These checks establish source existence and quoted text, not the truth of a developer-authored interpretation. No model review, preference writes, normal-chat retrieval, or automatic triggers are added in this step.

Focused tests copy an actual exchange from this development conversation into a disposable database. They verify restart persistence, unknown reactions, longer accounts, rejected sources/quotes, deletion, and zero semantic writes. All 10 combined episode/semantic tests pass; the backend build and diff checks pass. Full suite: 53/55, with the same two HTTP streaming `fetch failed` failures recorded in step 1. No live model judgment is involved at this stage.

Current deletion policy matches shared facts: deleting a conversation does not delete its saved episodes. Source IDs can therefore become unavailable; no hidden copy of the conversation is retained. Deleting an episode removes its stored accounts and quotes. Source exclusion, replay protection, and dependent belief cleanup remain later roadmap work. Automatic review must not assume missing sources remain inspectable.

## 3. Review one conversation segment into episodes

Implement `reviewConversationSegment`: read an identified source range, produce zero or more episode candidates, validate their sources and structure, and save accepted episodes. Routine small talk can produce nothing. Use a development command to trigger the full operation first, without adding a separate approval/preview workflow.

Record the reviewed source range so rerunning it does not create duplicate experiences. Make writes atomic and reject stale results if relevant source data changed. Allow source inspection when a summary is insufficient.

Done when: meaningful material produces an episode, trivial material can produce none, repeated review is idempotent, invented observations are rejected, and model failures leave persistence unchanged. Validate model judgment with actual examples as well as deterministic tests.

### Step 3 implementation checkpoint (October 22, 2026)

Added manual `reviewConversationSegment` and `npm run review:episodes --workspace=backend -- <conversationId> <firstMessageId> <lastMessageId>`. The configured Ollama model reviews a bounded source range and proposes zero to three episodes. The command writes accepted records directly; there is no preview workflow or idle trigger. No beliefs are created and ordinary chat still does not retrieve episodes.

Code verifies source IDs, quote text, speaker attribution, participant names, and record structure. The whole batch and a content-free source-hash checkpoint commit atomically. New messages, source edits/deletion, cancellation, malformed output, or model failures leave no partial episode/checkpoint writes. Completed ranges survive process restart; identical or concurrent review cannot duplicate them. Overlapping completed ranges are rejected; select only new messages. Deleting an episode created by this reviewer leaves its completed-source checkpoint, preventing replay through this route. Manual episode saves predating the reviewer do not acquire checkpoints retroactively; broader deletion/source exclusion remains step 6.

Validation: all 61 tests pass when local HTTP access is allowed, including durable checkpoints, concurrent review, no-save decisions, rollback, attribution, cancellation, and stale source handling. The earlier HTTP failures were caused by restricted loopback access; they pass with access enabled. Backend build and diff checks pass. `npm run smoke:episodes --workspace=backend` also passed with the actual configured model and disposable examples: a painting accomplishment produced one episode; a routine greeting produced none; replay produced no duplicates; semantic storage remained empty. These two examples establish basic behavior, not general model judgment accuracy. Quotes and IDs are mechanically checked; summary fidelity and significance still require example-based evaluation.

The user-requested live snowboarding test episode (#1) was deleted and the live episode table verified empty before these checks. Live model reviewer checks used isolated test storage and did not reprocess that deleted exchange. For the next browser test, use a fresh meaningful exchange, then run the manual command against its explicit IDs. The first-person account in this route is model-generated rather than authored by the developer.

## 4. Learn one preference from episodes

Start with Nova's own interests. `proposeBeliefChange` gathers related episodes and presents evidence and reasoning. `evaluateBeliefProposal` lets Nova accept, reject, narrow, or reconsider that interpretation. These are logical stages, not necessarily separate agents or infrastructure. The resulting write still goes through deterministic validation; her decision does not bypass evidence checks.

Link each belief to supporting episode IDs. Usually require distinct experiences; allow an exceptional impactful experience with an explicit rationale. Reprocessing one episode or repeatedly thinking the same claim is not independent evidence. Weak proposals can be reconsidered and remain tentative or be discarded. Define promotion policy as a small configurable rule, not an arbitrary model confidence number.

Done when: separate dinosaur experiences can produce a tentative interest; Nova can reject the reviewer’s suggestion; one passing mention and repeated review cannot establish a preference; she does not infer the user's preferences from her own thoughts.

## 5. Recall learned memories in ordinary chat

Add `getRelevantBeliefs` and basic episode lookup so a fresh conversation can use a small relevant set of stored memories. Keep tentative beliefs visibly uncertain to the model. Retrieve episodes separately from general beliefs so an interpretation is not mistaken for an observed event. Avoid injecting every memory into every prompt.

Done when: a fresh conversation can recall an episode and a supported preference, distinguish tentative from established knowledge, and acknowledge missing information. Verify retrieval and persisted records as well as the response.

This is the first useful milestone: conversation -> meaningful episode -> evidence-backed belief -> fresh-chat recall. Automated activity selection and small-talk topic selection are outside this roadmap.

### Steps 4�5 first checkpoint

Manually propose one Nova interest with `npm run learn:preference --workspace=backend -- "topic" <episodeId> <episodeId>`. Supply two episodes with non-overlapping messages. The local model evaluates Nova's actual dialogue and may reject the proposal. An accepted interest is tentative and links both episodes. Ordinary chat includes up to three matching interests and their episode summaries when the current user message names the stored topic. This first pass uses exact topic matching; it does not yet recall standalone episodes or recognize related terms.

Correction, forgetting policy, evidence refinement, and idle automation are deferred.

## 6. Let new experience revise understanding

Add `reconsiderBelief` for supporting or conflicting evidence. A new discovery may narrow an interest, weaken it, or change it; one unpleasant detail need not reverse the entire preference. For user facts, distinguish temporary context from lasting change. Keep episodes' original accounts and append later interpretations rather than rewriting the original event.

Deletion removes the selected memory and dependent copies of its contents, then reconsiders affected conclusions from remaining evidence. If original conversation content remains eligible for review, use content-free exclusion metadata or another explicit source policy to prevent recreating a deliberately deleted memory. Do not retain the deleted text as a hidden archive. Document backup limitations separately when implementing deletion.

Done when: evidence can change an established preference; deletion removes its support and triggers reconsideration; replaying the same old source cannot silently resurrect it.

## 7. Automate the proven review loop

Trigger the existing review operation after new conversation activity becomes idle. Use a configurable idle delay. Review only new source ranges plus relevant existing memories. Keep a durable checkpoint, cancel stale work on new activity, and isolate review failures from chat. Route automatic writes through one coordinator; explicit commands must use compatible validation and invalidate stale reviews. Do not add a second independent automatic writer.

The memory reviewer and Nova's evaluation are separate roles that initially use the same model with different prompts and calls. The reviewer presents a conversation summary, related memories, source references, and its reasoning. Nova may accept, reject, narrow, or reconsider the proposal and can inspect original messages when needed. Code validates sources, state, and writes regardless of either role's output. A different review model can be evaluated later; it is not required.

Persist accepted changes and the source checkpoint atomically. Failed or interrupted work must remain eligible for a bounded retry; unchanged sources must not be repeatedly reprocessed. Allow a successful review to save nothing. On restart, resume pending work without duplicating episodes or evidence.

Done when: chat -> idle -> review -> Nova's evaluation -> validated persistence -> fresh-chat recall works end to end, including no-save decisions, correction, cancellation, retry, restart, and no duplicate processing. This automates memory processing only.

### Revision and idle-review checkpoint

Use `npm run learn:preference --workspace=backend -- revise "old topic" "narrower topic" <episodeId> <newEpisodeId>` to ask Nova to evaluate a replacement. The replacement stays tentative. Use `npm run learn:preference --workspace=backend -- forget "topic"` to remove a learned preference and block that normalized topic from being relearned through this command. Renamed topics are also blocked from replay. This is exact-topic exclusion, not synonym detection. Explicit episode deletion excludes its source message IDs from episode review and removes learned preferences relying on it. The original chat is retained.

Restart the backend to enable idle episode review. It defaults to 60 seconds; set `MEMORY_REVIEW_IDLE_MS=0` to disable it. First activation starts at the current end of chat history; later restarts retain that starting point and skip completed ranges. A new turn cancels running review. Failed work stays pending with a retry delay. Idle review initially saved only episodes; the automatic preference checkpoint below extends it. Oversized individual messages are omitted from idle review.

### Automatic learning and recall checkpoint

After episode review, the idle worker checks new episodes for possible Nova interests. The proposal must cite the new episode and one earlier episode from a different conversation. A separate model call checks the original dialogue before saving or refreshing that topic. Automatic review cannot rename another interest; explicit developer revisions still can. SQLite tracks progress independently of episode review, so a restart does not strand an episode between the two steps. Existing episodes are not bulk reprocessed on first activation but can serve as earlier evidence. New chat activity cancels in-flight work. Forgetting stays explicit.

Ordinary chat now retrieves up to three standalone episode summaries using shared keywords from the latest user message. Search covers the most recent 100 episodes. This does not support synonyms, automatic promotion, or automatic weakening of a belief.

### Recall provenance and preference aging

Ordinary chat now records whether a reply had episode or preference context (or a memory listing) available. The marker follows later replies in that conversation because prior replies remain in context. Review sees the marker and requires a concrete new disclosure and a fresh reaction rather than repeated recall; judging novelty still uses the model. This does not backfill older replies.

A tentative preference is withheld from recall after 90 days without supporting evidence, measured from the newest supporting event, or when idle review finds a newer, explicitly opposing Nova reaction with a verified source quote. The evidence remains stored. Recalling an interest does not refresh it; reactivation needs newly evaluated positive evidence. No new recall trigger phrases or general retrieval changes are included.

## 8. Add tentative review and forgetting

Implement `reviewTentativeBeliefs`, `recordMemoryUse`, and `applyMemoryDecay`. Start with explicit simulated timestamps in tests and then a periodic runner. Review tentative beliefs periodically and on new evidence; expire unsupported ones.

Separate retention strength from evidential support. Useful recall boosts retention without making a claim more true. Start by testing the suggested boost `min(maxStrength, currentStrength * 1.3)`; tune decay so repeated automated access cannot keep everything alive forever. Listing or fetching a memory alone does not count as useful use. Require an identifiable contribution to a response, decision, or activity, deduplicated within that operation.

Episodes progress from full detail to summary to deletion. Summarization actually removes superseded detail when that stage is applied; final deletion removes the summary too. Higher significance slows fading. Beliefs whose evidence disappears become tentative and may be re-established through new evidence or user confirmation. Habits can persist while remaining revisable. Do not fabricate forgotten detail.

Done when: simulated time demonstrates every transition, useful recall gives only a partial boost, background review does not manufacture evidence, and lost support causes reconsideration.

## 9. Add procedural memory through one conditional habit

Use an initial example such as keeping debugging answers concise when the user requests it. Apply it only within ordinary user-initiated chat. Store readable guidance plus trigger conditions, exceptions, evidence, trial state, and adjustment count.

Functions: `proposeHabit`, `getApplicableHabits`, `recordHabitOutcome`, `reviseHabit`. Reflection and user feedback can propose trials; evaluate them with both concrete outcomes and feedback. Allow one or two adjustments before dropping a failed trial. Do not keep a permanent failed-habit blacklist. An explicit request to stop disables the behavior immediately; resolve ambiguous references before broad changes.

Done when: the habit applies in the right context, allows requests for detailed explanations as an exception, responds to correction, and stops after unsuccessful adjustments.

## 10. Expand recall only as needed

Use timestamps, subjects, and source/evidence links first. Resolve phrases such as yesterday/last week using the user's timezone. Ask which event the user means when candidates are ambiguous. Add search indexes or embeddings only when actual recall examples show the simpler approach is inadequate. Similarity supplies candidates, not proof.

Done when: known temporal queries find the right episodes, ambiguous references cause clarification, and expired/deleted memories cannot leak through retrieval. Basic time/source lookup already exists in earlier stages; this step broadens it.

## 11. Automate ongoing memory maintenance

Extend the same memory coordinator with bounded jobs for tentative review, retention decay, summarization, deletion, and procedural trial evaluation. New evidence triggers relevant reconsideration; periodic maintenance handles time-based changes. Use durable progress markers and avoid overlapping jobs against the same records. Maintenance operates on existing experience; it does not generate independent experiences or new evidence by repeatedly reflecting.

Expose internal run results for development inspection: sources reviewed, operations applied, skipped candidates, and failures. Avoid logging deleted memory contents. Keep operational bookkeeping separate from Nova's personal memories; it must not become a permanent failed-habit blacklist or a hidden archive.

Done when: the complete memory lifecycle runs without manual review triggers, survives restart and failures, handles explicit corrections/deletions during review, and preserves normal chat responsiveness. Demonstrate the full loop using disposable data and simulated time where appropriate.

The finished scope is automated semantic, episodic, and procedural memory with relevant recall and revisable learning. Build the React memory editor and autonomous activities in later roadmaps.

## How to deliver each step

- Make one narrow change and explain what behavior it adds.
- Verify persistence and outcomes, not model claims. Use disposable databases for tests and migrations; never experiment against personal memories without a backup plan.
- Use deterministic tests for storage/state transitions and a small set of live conversations for judgment and behavior. Report them separately.
- Preserve existing chat/task behavior and unrelated local edits. Leave implementation uncommitted for review.
- Tune policies from observed failures. Do not build an elaborate scoring system, embedding infrastructure, continuous agent, or memory UI ahead of the first learning loop.
