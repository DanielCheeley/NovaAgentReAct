# Neuro-sama architecture research for Nova

Research date: October 10, 2026. This is a public-evidence review and an engineering reconstruction, not a disclosure of Vedal's private implementation.

The most useful conclusion is that a convincing live character needs coordinated perception, attention, conversation, action, memory, and presentation. Improving the language model alone does not give Nova that coordination.

## How to read the evidence

- **Confirmed public interface:** supported directly by VedalAI's published documentation or code. This establishes external behavior, not the private implementation behind it.
- **Reported in a recorded stream:** Vedal's statements reproduced in a third-party automatic transcript. Useful primary speech evidence, but I did not independently listen to the recording; transcription and speaker attribution can be wrong.
- **Inference:** an implementation that plausibly explains the behavior. Confidence is qualitative, not a measured probability.
- **Proposal for Nova:** my design recommendation. It is not a claim that Neuro uses it.

Search results contain fan projects, speculative diagrams, repeated hardware claims, and contradictory provider claims. In particular, the o9nn/neuro-sama repository and independent Neuro-style recreations are not Vedal's private core. They were not used as evidence for her architecture. No exact base model, parameter count, quantization, memory database, training method, or present TTS provider was established.

Vedal explicitly identifies an LLM as the main technology and declines to provide an exact tutorial. His advice page is dated 2023 and warns that it may be outdated. His recommendation to experiment with OpenAI does not establish that Neuro's production brain uses OpenAI. [Vedal's advice](https://vedal.ai/advice/).

## 1. What skills does she have?

Her official site identifies conversation, gaming, and singing as Neuro's roles, and links music, blogging, and other creative projects. These are public capabilities; the site does not explain their implementation. [Official site](https://vedal.ai/).

The strongest engineering evidence concerns game integrations. The official SDK targets games such as Inscryption, Liar's Bar, and Buckshot Roulette. It describes text state and text actions, and recommends an additional controller for games requiring fast low-level inputs. That establishes a distinction between deciding what to do and executing precise movements. [SDK overview](https://github.com/VedalAI/neuro-sdk).

An official Among Us plugin is also public. Its existence establishes a dedicated integration, rather than proving a generic ability to operate any game from pixels. [Among Us integration](https://github.com/VedalAI/neuro-amongus).

For planning Nova, use this capability map:

| Capability | Evidence status | Plausible subsystem |
|---|---|---|
| Character conversation | Official role; LLM confirmed | Persona-conditioned dialogue generation |
| Live voice participation | Public voice interface | Attributed speech recognition and speech synthesis |
| Integrated game decisions | Public SDK | Structured state, action selection, game adapter |
| Fast game control | SDK says extra controller may be needed | Specialized policy, pathfinding, or deterministic controller |
| Singing/music | Official role and releases | Dedicated music/voice production pipeline; exact method unknown |
| Creative writing/blogging | Official published projects | Text generation with publishing workflow; autonomy level unknown |
| Drawing/design | July stream report | Tool-driven creative workflow; exact backend unknown |
| Vision, browsing, sound effects, 3D movement | Commonly circulated demonstrations | Plausible adapters, but this review did not verify each implementation from primary code |
| Persistent recall | Private implementation not established | External memory plus retrieval is my leading hypothesis |

Do not infer that every capability runs continuously, is available in every stream, or uses the same model. A published song also does not establish that a character synthesizes arbitrary songs live with no human production.

## 2. Short-term memory

**Leading hypothesis: a managed context assembled from recent events and current state. High confidence as an architectural explanation; exact Neuro implementation unconfirmed.**

Think of short-term memory as what the next model invocation can see. It probably includes recent conversation, selected chat messages, current activity, active tools, and a compact representation of ongoing topics.

The public protocol supports adding context without demanding a reply, and temporary decision context that need not remain afterward. Those are interface-level clues that observation and response are separable. They do not establish a particular context-window size or retention duration. [API specification](https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md).

My reconstruction has four components:

1. **Recent event buffer:** speaker, timestamp, event ID, message, and source.
2. **Working state:** current game, current speaker, unresolved question, active objective, and action in progress.
3. **Conversation summary:** compressed earlier discussion, with important original messages retained when wording matters.
4. **Attention selection:** which recent observations are relevant enough to include now.

Forgetting a detail can arise because it was never selected, fell out of context, was summarized badly, or was displaced by more urgent events. It does not necessarily mean a stored record was deleted.

For Nova, use a token budget instead of sending an ever-growing transcript. Preserve complete tool-call/result groups, original user corrections, unresolved commitments, and recent dialogue. Keep verbose tool payloads out of the permanent conversational summary when a concise outcome is sufficient.

## 3. Long-term memory

**Leading hypothesis: persistent records outside the LLM, selectively retrieved into its context. Moderate confidence for Neuro; strong practical starting point for Nova.**

This review did not establish whether Neuro uses vectors, ordinary database queries, keyword matching, a graph, an explicit memory tool, a background writer, or a hybrid. Claims about exact memory lifetimes and special “core” memories were not promoted to confirmed facts.

Separate four things that viewers can experience as memory:

| Memory type | Example | Proposed storage |
|---|---|---|
| Identity and stable preferences | Nova's name and conversational style | Versioned configuration and approved profile |
| Semantic facts | A user's preferred editor | Structured fact with provenance |
| Episodes | An earlier debugging session | Dated summary linked to source events |
| Commitments | Check a build tomorrow | Task store with explicit status |

Personality learned through fine-tuning is different from a database of events. Training can make a character consistently sarcastic without reliably storing who said what last Tuesday. Conversely, retrieval can restore a past event without changing model weights.

A plausible memory cycle is:

```text
events -> candidate facts/episodes -> evidence check -> persistent store
current situation -> retrieval -> small relevant memory set -> dialogue context
```

Selection should preserve novelty, importance, relationships, and completed outcomes. Retrieval should combine relevance, recency, and importance, with structured lookup for exact facts. This is a published design pattern in Generative Agents, which stores observations, produces reflections, and retrieves memories. That paper is supporting research for our proposal; it is not evidence that Vedal adopted it. [Generative Agents](https://arxiv.org/abs/2304.03442).

For Nova, start with SQLite facts and episode summaries, then add semantic retrieval if plain search misses relevant episodes. A vector database is not a prerequisite. Each memory should carry its owner, source event IDs, creation date, last verification, confidence, and correction/supersession status.

Prevent a subtle failure: “a viewer said Vedal owes money” is not equivalent to “Vedal owes money.” Store assertions with speakers and evidence. Let Nova propose memory writes, but validate their provenance and protect approved identity facts from casual replacement. Deleting a memory must also invalidate derived summaries and retrieval caches where appropriate.

To test recall, distinguish retrieval success from fluent guessing. Ask about a unique fact after a restart and in a fresh conversation, inspect which record was retrieved, and include decoy facts. A confident answer alone is insufficient evidence.

## 4. Avatar emotions and movement

**Leading hypothesis: semantic expression commands layered over automatic animation. Moderate confidence; exact Neuro controller unconfirmed.**

Three layers explain a responsive avatar without making the LLM animate every frame:

1. **Automatic motion:** blinking, breathing, idle swaying, and hair physics.
2. **Speech synchronization:** audio amplitude or phoneme/viseme timing drives mouth movement.
3. **Semantic expression:** a response or scene event requests an expression, gaze target, or gesture.

Live2D's official SDK documentation independently shows separate expression, blink, breath, physics, and lip-sync parameter updates. This proves the approach is implementable, not that Neuro uses those exact APIs today. [Live2D parameter operation](https://docs.live2d.com/4.2/en/cubism-sdk-manual/parameters/).

Possible emotion controllers include structured tags emitted with dialogue, a separate classifier reading dialogue/context, explicit expression tools, or a mixture. I favor a hybrid for Nova: the dialogue model supplies intended delivery, while the presentation controller enforces valid expressions, smoothing, timing, and fallbacks.

For example, Nova might produce this application-defined output:

```json
{
  "text": "You broke it again? Impressive consistency.",
  "delivery": "playful",
  "expression": "amused",
  "intensity": 0.35,
  "gesture": "head_tilt"
}
```

Only `text` goes to speech. The renderer consumes the metadata when the corresponding audio begins. Cancelled speech cancels its pending gestures too. The model should choose from a small supported vocabulary; unfamiliar expressions fall back safely.

Maintain a slowly changing mood separately from momentary expression. Otherwise every sentence can flip the face abruptly. This is a proposed interaction model, not evidence of subjective feeling or of Neuro's internal emotion representation.

For a future 3D body, choose high-level commands such as looking at a person or walking to a destination. Let animation, inverse kinematics, navigation, and physics handle continuous motion. It is unnecessary to ask an LLM for joint rotations at rendering frequency.

## 5. Reading live chat

**Leading hypothesis: direct chat ingestion followed by filtering, selection, and conversational attention. High confidence in feasibility; Neuro's exact transport and selector unknown.**

Twitch provides structured chat events through EventSub, including message and chatter identifiers. A new Nova integration can consume these directly; it does not need OCR of the chat window. This does not establish whether Neuro uses EventSub, legacy IRC, or another connector. [Receiving Twitch chat](https://dev.twitch.tv/docs/chat/send-receive-messages), [chat event fields](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-chat-message).

The difficult part is deciding what deserves attention. Feeding every message into every model call would make context grow rapidly, favor spam, and bury ongoing conversations.

A plausible selector combines:

- Direct questions or mentions.
- Replies to a viewer Nova recently addressed.
- Current-topic relevance and novelty.
- Deduplication and per-user frequency limits.
- Some randomness to avoid an excessively rigid personality.
- A summary of repeated crowd reactions, with a few original examples.

Preserve usernames, IDs, and reply relationships. The character can then respond to a specific person instead of confusing the audience with one speaker. Keep a short-lived record of whom she addressed and what answer is pending.

Audience text belongs in an observation channel, not in the application instruction channel. That separation also makes identity and tool permissions more predictable. Do not let a large volume of chat automatically override the person speaking in voice.

For Nova, prefer bounded queues with expiration: a joke from thirty seconds ago may no longer fit. Track why a message was selected so that attention behavior can be inspected and tuned.

## 6. Speaking with Vedal in real time

**Confirmed public interface:** the voice documentation explicitly describes attributed STT followed by decision-making and TTS. It uses separate per-speaker input, streamed audio output, and cancellation signals. Its stated cognitive cycle is seconds rather than milliseconds. This establishes a modular voice path in the published integration, not the precise internals of every Discord call. [Voice chat API](https://github.com/VedalAI/neuro-sdk/blob/main/API/VOICE_CHAT.md).

My likely reconstruction is:

```text
microphone/voice stream
 -> voice activity and speech endpoint detection
 -> attributed transcription
 -> attention and turn decision
 -> context + retrieved memory
 -> short response generation
 -> output checks
 -> TTS and audio playback
 -> synchronized avatar expression
```

For low delay, overlap stages: transcribe while someone speaks, generate progressively, synthesize completed clauses, and play audio while later clauses are being prepared. Fast end-of-turn detection and short replies can matter as much as raw token generation speed.

There is no verified evidence here that Neuro predicts entire replies before Vedal finishes speaking. Speculative generation is possible, but wrong predictions require cancellation and can produce inappropriate interruptions. I would defer it until Nova's ordinary pipeline works reliably.

For Nova, define explicit listening, generating, speaking, and interrupted states. Listening can continue during speech, but it must exclude Nova's own playback or apply echo cancellation. Tag each generation, audio segment, and gesture with a turn ID so stale output cannot leak after an interruption.

Keep separate records for intended text and what was actually played. If the user interrupts halfway through an answer, Nova should not assume the user heard the unfinished half.

Instrument speech endpoint delay, transcription completion, first model token, first synthesized audio, first playback, total utterance duration, and cancellation delay. Optimize p50 and p95 under real load. Any numeric latency target should be our measured acceptance criterion, not an invented Neuro benchmark.

## 7. Running alongside Evil

**Publicly supported:** the API identifies Neuro and Evil separately. Its voice documentation permits either hearing each other through game voice or internally routed vocals; it warns against duplicate routing. This proves character-aware communication is part of the public interface. [API specification](https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md), [voice chat API](https://github.com/VedalAI/neuro-sdk/blob/main/API/VOICE_CHAT.md).

**Leading hypothesis: separate character state over shared infrastructure. High confidence as a viable design; model sharing unknown.**

They do not necessarily require two fully independent model servers or two physical computers. Plausible deployments include one model with separate contexts, a common base with separate adapters, distinct fine-tunes, or different models. Personality differences alone cannot identify which deployment is used.

For Nova and a second character, isolate persona configuration, private memories, dialogue context, voice, avatar, task ownership, and tool permissions. Share selected world events through a conversation coordinator. The coordinator grants speaking turns and prevents endless AI-to-AI loops or duplicate tool execution.

Use source identifiers to publish a character's utterance once. If the second character receives direct text of that utterance, also transcribing its played audio creates an unnecessary duplicate. Either route can work; provenance and consistent routing matter.

Separate inference jobs can overlap while audible turns remain coordinated. Conversely, one inference server can schedule two contexts. The practical limit is compute and latency, not the fact that two personalities exist.

## 8. How the skills work

**Confirmed:** registered actions expose names, descriptions, and schemas. The model sends an action request; the integration validates it and supplies a result. The Unity SDK separates validation from execution. [Unity SDK usage](https://github.com/VedalAI/neuro-sdk/blob/main/Unity/USAGE.md).

This suggests the following engineering pattern for Nova:

```text
intent -> choose an available skill -> validate arguments and current state
       -> execute controller -> observe outcome -> update working state
```

Skill descriptions are part of the model's available context. A character can therefore acquire a new capability by receiving its contract and connecting an implementation, without retraining the entire brain. Whether Neuro additionally receives tool-use training is not established.

The SDK's guidance favors meaningful context events, stable action definitions, clear errors, and one forced decision at a time. These are useful lessons for Nova's adapters. [Integration best practices](https://github.com/VedalAI/neuro-sdk/blob/main/API/BEST_PRACTICES.md).

One important mismatch: Neuro's game protocol encourages an early result after validation, before game execution. That is an acceptance acknowledgement. Nova's user-facing task outcomes need a separate completed/failed state, so acknowledgement must not become a claim that the action finished. [API specification](https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md).

Use action IDs, idempotency where needed, deadlines, cancellability, explicit progress, and final outcomes. Short dialogue can proceed while a long task runs; the controller later publishes the result as an event. Repeated LLM calls should not accidentally schedule the same task twice.

For rapid interaction, distinguish deliberate decisions from continuous control. Nova should say “follow this person”; a controller handles the detailed movement and reports meaningful milestones or failure.

## 9. API, model hosting, and programming languages

An API is an interface, not a hosting location. A local model server still has an API. Neuro demonstrably exposes her own game/voice interfaces; that does not identify her inference provider.

The July 13, 2026 recording's automatic transcript reports a new server for Evil, components split across machines, Linux migration, a reasoning-model experiment, and upgraded STT. Around 17:14–18:20 it describes infrastructure migration; around 24:52–26:26 it discusses the experimental model; around 2:05:45–2:08:09 it discusses speech recognition. These support a modular system under active development, but do not establish all components' hosting, model identity, fine-tuning method, or October deployment status. [Recording](https://www.youtube.com/watch?v=i4VSpJK8gTs), [automatic transcript of Vedal's speech](https://sozai.app/transcript/neurosama-development-evil-2026/).

**My hosting guess:** a custom-operated core model, potentially combined with hosted specialist services, is plausible. Confidence is moderate. Fully local inference, rented GPU inference, and a mixed deployment remain alternatives. Low latency alone cannot distinguish them, and using owned servers for rendering does not prove the LLM runs there.

**My training guess:** adaptation of a pretrained model is more plausible than pretraining a competitive general-language model from scratch. Personality could come from curated examples, fine-tuning, prompts, and memory together. Specific claims such as “Llama,” “LoRA,” “2B,” “Q2,” and continuous reinforcement learning were not verified and should not drive Nova's design.

**Languages:** the creator's channel biography, reproduced in Streams Charts' About section, says the VTuber side was made in C#/Unity and the AI in Python. This is attributed creator text in a mirror; the live Twitch page did not expose its bio to the research reader, so currency was not independently established. Treat Python + C#/Unity as the best supported historical answer, not a complete current language inventory. C# is independently confirmed in the official Unity integration. [Mirrored channel biography](https://streamscharts.com/channels/vedal987), [Unity action source](https://github.com/VedalAI/neuro-sdk/blob/main/Unity/Assets/Actions/BaseNeuroAction.cs).

For Nova, preserve TypeScript orchestration and add Python services only when a chosen speech, vision, or training component benefits from them. Unity/C# is an option for a dedicated 3D renderer; a browser renderer is also viable. There is no architectural need to rewrite Nova into Neuro's reported languages.

## 10. Nova's verified starting point

These observations were checked against the current checkout, rather than assumed from older project notes:

- `backend/src/novaCore/novaConfig.ts` selects `http://127.0.0.1:11434/api/chat`, model `jaahas/qwen3.5-uncensored:9b`, `think: false`, and `stream: false`. This is configured local Ollama access, not proof that the server was running during research.
- `model.ts` uses HTTP requests and reads a complete JSON response. Enabling streaming requires a streaming parser and downstream consumers, not merely flipping the configuration flag.
- `agent.ts` loads stored conversation messages and delegates execution to `agentLoop.ts`.
- `memory/conversationStore.ts` persists conversation messages through SQLite. Persistent transcripts are already memory storage, but the inspected path does not provide selective cross-conversation fact/episode retrieval.
- `agentLoop.ts` performs a bounded sequence of model/tool calls. That is a useful task engine to retain, but it is not yet a complete live conversational attention and speech controller.
- Tool definitions already cover weather, clock, and scheduling operations. Keep their verified execution semantics as capabilities grow.

Source files: [configuration](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/novaConfig.ts), [model requests](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/model.ts), [agent entry](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/agent.ts), [agent loop](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/agentLoop.ts), [conversation storage](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/memory/conversationStore.ts), [tools](C:/Users/danie/OneDrive/Desktop/NovaAgentReAct/backend/src/novaCore/tools/toolDefinitions.ts).

## 11. Proposed architecture and implementation order

This diagram is a proposal for Nova. It is not a verified Neuro diagram.

```text
Voice / chat / game / timer / selected screen observations
                         |
                   normalized events
                         |
              attention + turn coordinator
                         |
       working state + context builder <-> memory retrieval
                         |
                   character model
                    /          \
            speech intent     skill requests
                 |                  |
           output validation   validated controllers
                 |                  |
              TTS/audio        outcome events
                 |
        avatar + subtitles + delivered-speech record

Background: memory consolidation, logs, evaluations, health monitoring
```

1. **Events and observability.** Define event IDs, source, speaker/character, timestamp, priority, and expiry. Serialize state updates for each character. Preserve the existing agent loop as a task component.
2. **Fast voice conversation.** Add attributed STT, end-of-turn detection, streamed dialogue/TTS, playback tracking, and interruption. Keep slow tools and memory consolidation out of the first-audio path.
3. **Working and durable memory.** Add budgeted context, session summaries, facts, episodes, provenance, and selective retrieval. Test restart and fresh-conversation recall.
4. **Presentation.** Bind validated expression metadata, subtitles, and mouth movement to actual playback. Handle cancelled and failed speech coherently.
5. **Attention and initiative.** Add bounded chat selection and purposeful event-triggered speech. Nova can decide to remain silent; avoid making constant model calls merely to produce chatter.
6. **More skills and another character.** Add adapters with outcome events, then isolate a second persona and coordinate shared conversation.
7. **Persona training if warranted.** Curate a dataset from reviewed interactions after the runtime is stable. Evaluate humor, consistency, truthfulness, useful work, and latency separately. A stronger persona must not weaken tool-result accuracy.

Recommended acceptance checks:

- A long tool operation does not prevent listening or acknowledging the user.
- Interrupting Nova prevents stale audio and gestures, and records only delivered speech as heard.
- A chat flood stays bounded and preserves the voice conversation's current topic.
- Restart/fresh-conversation recall retrieves traceable memories and respects corrections.
- Two characters know who said what and execute a shared action once.
- Removing or disabling a skill changes availability without requiring a model rewrite.
- Ordinary conversation stays concise while difficult tasks get adequate reasoning.

The design priority is coordination: choose what to notice, when to answer, what to remember, and how to carry actions through to real outcomes. That is the most transferable lesson from the public evidence.

## Remaining unknowns

Exact model family/size, training datasets and permissions, fine-tuning method, memory implementation and retention, chat selection algorithm, current voice providers, private avatar emotion controller, component deployment locations, and whether the twins share weights all remain unresolved. Neither a fan's confident description nor Neuro's own spoken explanation of her internals settles those questions.

This report reviews public documentation and an accessible automatic transcript. It does not claim exhaustive viewing of all VODs, access to private code, or independent audio verification of the quoted stream time ranges.
