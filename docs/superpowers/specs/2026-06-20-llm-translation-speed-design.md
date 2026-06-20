# LLM Translation Speed Controls Design

## Goal

Make LLM-backed page translation feel faster by allowing bounded concurrent translation batches and provider-level reasoning/thinking controls.

## Current Behavior

The content runtime creates batches and sends them to the background script one at a time. This is safe but slow for LLM providers because each request waits for the previous request to finish. The OpenAI-compatible provider always sends the same Chat Completions request body and has no UI for reasoning/thinking controls.

## Design

Add a `translationConcurrency` setting to `AppSettings` and `PublicRuntimeSettings`. The content runtime will process provider misses with a bounded worker pool, defaulting to `3`, and clamp stored values to `1..6`. Cache hits still render first. Provider failures still degrade per batch, and each completed batch updates progress.

Add optional OpenAI-compatible fields for LLM speed controls:

- `reasoningEffort`: optional provider value. When present and not `auto`, send `reasoning_effort` on Chat Completions requests.
- `disableThinking`: optional provider value. When true, send common compatibility switches `enable_thinking: false` and `thinking: { type: "disabled" }`.

The fields are opt-in at request time to avoid breaking providers that reject unknown JSON properties. New OpenAI-compatible defaults can surface `reasoningEffort: "minimal"` in the UI, but migrated/saved custom configs should be merged through normal settings migration.

## UI

Expose `translationConcurrency` in Advanced settings as a number input. Expose provider speed controls only for OpenAI-compatible providers in the provider section:

- Reasoning effort: Auto, None, Minimal, Low, Medium, High.
- Disable thinking: checkbox.

Keep the interface compact and task-focused.

## Testing

Use TDD for each behavior:

- Runtime test proving multiple batches are in flight before the first provider response resolves.
- Settings test proving defaults/migration/clamping.
- Provider test proving request bodies include optional speed controls only when configured.
- Preview/E2E test proving the options UI exposes the controls.

