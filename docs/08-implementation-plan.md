# 08. Implementation Plan

## Milestone 1: Project Skeleton

Tasks:

- Initialize WXT + Vue + TypeScript.
- Set up pnpm workspace.
- Add popup entrypoint.
- Add options entrypoint.
- Add background entrypoint.
- Add content entrypoint.
- Add shared message types.

Acceptance:

- Popup button can send a message to the current tab.
- Content script can log `LingoFlow started`.

## Milestone 2: DOM Collector and Renderer

Tasks:

- Implement `normalizeText`.
- Implement `sha256`.
- Implement `collectTextBlocks`.
- Implement element reference mapping.
- Implement `renderBelowOriginal`.
- Implement `injectLingoFlowStyles`.
- Implement `clearTranslations`.

Acceptance:

- Clicking translate inserts mock translations below paragraphs.
- Clear removes all inserted nodes.
- `code` and `pre` blocks are ignored.

## Milestone 3: Settings and Options

Tasks:

- Define `AppSettings`.
- Implement `getSettings` and `saveSettings`.
- Build Options page.
- Add Azure config form.
- Add OpenAI-compatible config form.
- Add cache settings form.

Acceptance:

- User can save provider configs.
- Background can read saved settings.

## Milestone 4: Providers

Tasks:

- Implement `TranslationProvider` interface.
- Implement `ProviderRegistry`.
- Implement Azure Translator provider.
- Implement OpenAI-compatible provider.
- Implement LLM JSON parsing.

Acceptance:

- A batch can be translated with Azure.
- A batch can be translated with OpenAI-compatible endpoint.

## Milestone 5: Cache

Tasks:

- Add Dexie.
- Implement IndexedDB schema.
- Implement cache key.
- Implement cache resolve.
- Implement cache save.
- Implement clear all cache.
- Implement clear by domain.
- Implement prune cache.

Acceptance:

- Same page refresh hits IndexedDB cache.
- Switching provider misses old cache.

## Milestone 6: Scheduler and Degradation

Tasks:

- Implement `createBatches`.
- Implement retry.
- Implement batch split degrade.
- Implement safe cache resolve.
- Implement safe cache save.
- Implement safe render.
- Implement optional fallback provider.

Acceptance:

- A failed batch can split and continue.
- A single failed block does not stop the page.
- Cache failure does not stop translation.

## Milestone 7: Popup Progress

Tasks:

- Track total blocks.
- Track cache hits.
- Track translated blocks.
- Track failed blocks.
- Display status in popup.

Acceptance:

- Long pages show translation progress.

## Milestone 8: v0.1 Release

Tasks:

- README
- Privacy policy
- Provider configuration docs
- Build Chrome package
- Build Edge package
- GitHub release

Acceptance:

- Developer can clone, configure provider, and translate pages.
