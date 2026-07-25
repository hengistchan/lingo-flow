# Adaptive Reading System

## Status

Approved implementation architecture for the next LingoFlow iteration.

This document treats page compatibility, terminology consistency, translation
placement, and first-run guidance as one product system. They are not separate
feature queues: each contributes to a resolved reading policy for the current
page.

## Product Outcome

A reader should be able to:

1. choose a translation provider and reading language without understanding
   provider internals;
2. translate a page with consistent terminology;
3. keep each translation close to the source content in a structurally safe
   position;
4. teach LingoFlow which parts of an unfamiliar site are readable content;
5. verify the effect of that teaching before saving it.

The system remains local-first. User rules, terminology, onboarding progress,
and compatibility evidence stay in browser storage unless the user explicitly
exports them.

## Shared Vocabulary

### Reading policy

`ResolvedReadingPolicy` is an immutable runtime contract created for one page
and translation run. It combines:

- source and target language;
- provider and model identity;
- the resolved page rule;
- enabled terminology entries that match the current page;
- preferred translation position;
- display mode and theme;
- a translation-semantics fingerprint.

The runtime orchestrates the policy but does not own rule matching, terminology
matching, selector generation, provider configuration, or DOM insertion.

### Translation position and insertion strategy

These concepts must remain separate.

- `TranslationPosition` expresses reader intent: before or after the source.
- `TranslationInsertion` expresses a safe DOM operation:
  `linebreak-inside`, `inline-inside`, `inside-container`,
  `before-nested-structure`, or `after-block`.

The DOM layer produces structural facts and a safe default insertion. A
placement resolver combines those facts with the rule preference. The renderer
only applies the resulting insertion plan and supports exact reversal.

This removes the current ambiguity where `translationPosition` exists in page
rules but does not participate in rendering.

### Terminology

A terminology entry is a deterministic translation constraint:

```ts
type GlossaryEntry = {
  id: string
  source: string
  target: string
  sourceLang?: string
  targetLang?: string
  caseSensitive: boolean
  match: 'term' | 'exact'
  enabled: boolean
}
```

A glossary owns entries and scope:

```ts
type Glossary = {
  id: string
  name: string
  enabled: boolean
  scope: {
    domains?: string[]
    ruleIds?: string[]
  }
  entries: GlossaryEntry[]
  createdAt: string
  updatedAt: string
}
```

The glossary domain validates, normalizes, scopes, matches, and fingerprints
entries. Providers receive only the entries needed by a batch.

Terminology affects translation semantics. The cache key must therefore include
a stable semantics fingerprint derived from the relevant entries and prompt
contract. Rules that only change DOM collection or placement must not invalidate
translation cache entries.

## Layer Boundaries

### UI layer

Owns Vue rendering, focus, keyboard behavior, human-readable copy, and local
draft state.

It does not validate selectors, migrate settings, construct provider requests,
or decide whether a rule is compatible.

The existing `Options/App.vue` must become a shell. Each substantial area owns
one focused component and composable:

- General reading preferences
- Provider setup
- Terminology
- Site adaptation
- Local data

The first-run experience is a separate entrypoint, not a conditional copy of
the full Options page.

### Application layer

Background application services coordinate messages and durable state:

- settings service;
- provider setup service;
- user-rule service;
- glossary service;
- onboarding service.

The background entrypoint routes messages to these services. It must not grow a
new switch branch with embedded domain logic for every feature.

### Domain layer

Pure, independently tested packages own:

- `rules`: rule validation, matching, selector candidates, simulation
  comparison, import/export;
- `glossary`: validation, scope resolution, term matching, protection and
  fingerprinting;
- `reading-policy`: combination of settings, resolved rule, glossary and
  placement preferences.

Domain packages do not import Chrome APIs, Vue, cache infrastructure, or live
provider credentials.

### Runtime layer

Owns page lifecycle, scanning, task scheduling, staleness, diagnostics, and the
current-page policy.

The controller delegates policy construction and task construction to focused
services. It must not absorb glossary algorithms or interactive selector
editing.

### DOM and renderer layers

The DOM package owns collection and structural classification. It can expose
stable selector candidates for a selected element because that operation
depends on the live DOM.

The renderer owns safe insertion and reversal. It receives a complete insertion
plan and never reads settings, rules, glossary state, cache, or providers.

### Provider and cache layers

Providers translate normalized request batches. Provider-specific glossary
support may improve quality, but the runtime contract remains provider
agnostic.

The cache stores translation results keyed by text, language, provider, model,
normalization, prompt version, and translation-semantics fingerprint.

## Interactive Site Adaptation

The user-rule learning flow is:

1. **Observe** — run current-page diagnostics and establish a baseline.
2. **Select** — the reader identifies main content, content to ignore, or a
   desired translation anchor directly on the page.
3. **Draft** — the DOM layer generates several selector candidates with
   stability evidence. It avoids positional selectors when a stable ID, role,
   semantic element, or durable class combination exists.
4. **Validate** — the rules domain validates URL patterns, selectors, priority,
   and behavior.
5. **Simulate** — run the candidate rule without calling a provider.
6. **Compare** — show before/after roots, accepted blocks, skipped blocks,
   interactive-element exposure, and warnings.
7. **Save** — persist only after a compatible simulation.

Compatibility status is explicit:

- `compatible`: candidate improves or preserves collection without new safety
  warnings;
- `warning`: candidate is usable but broad, fragile, or materially changes
  collection;
- `incompatible`: invalid selector, no readable roots, or unsafe interactive
  content exposure.

Saved user rules retain local provenance and the latest compatibility snapshot.
Compatibility evidence is renewable rather than permanent: a saved rule can be
checked again against a baseline that explicitly excludes that rule. The new
snapshot records the checked page and drift from the prior candidate metrics.
If a previously working rule loses its readable root or most collected content,
the check marks it incompatible and disables it before it can keep affecting
normal translation.
Export can include that evidence without provider configuration or API keys.

## Terminology Processing

Terminology is applied per task:

1. resolve enabled glossaries for page domain, matched rule IDs, and languages;
2. select entries that actually occur in the source block;
3. order matches deterministically by longest source term, then entry ID;
4. protect matched source spans with reserved tokens;
5. send relevant glossary constraints to providers that support them;
6. restore protected tokens using the configured target terms;
7. verify that no reserved token leaked;
8. record glossary IDs and the semantics fingerprint in diagnostics.

Exact target restoration is the compatibility baseline for every provider.
LLM prompt guidance may improve grammar around protected terms but may not be
the only enforcement mechanism.

Overlapping matches are resolved longest-first. Matches inside existing
protected inline tokens are ignored. Invalid or duplicate entries are rejected
before persistence.

## Placement Resolution

Placement resolution uses:

- source element category;
- block type;
- carrier and nesting structure;
- the resolved page-rule preference;
- an optional selector-specific placement override.

Safety wins over preference. For example:

- table-cell translations remain inside the cell;
- list-item translations stay before nested lists;
- inline carriers use a line break or inline spacer;
- block elements can render before or after the safe block ancestor.

Every fallback is diagnosed. An unsupported preference must never corrupt or
reparent source DOM.

## Onboarding State Machine

Onboarding is versioned:

```text
welcome
  -> reading-language
  -> provider-choice
  -> provider-configuration (when needed)
  -> connection-test
  -> first-page-guide
  -> complete
```

Rules:

- Google Translate Free remains an explicit experimental quick-start choice.
- BYOK providers explain what leaves the browser before a connection test.
- Provider credentials are saved only after structural validation.
- A failed connection test keeps entered values and gives an actionable next
  step.
- Users may leave and resume onboarding.
- Completion is stored independently from provider configuration so migrations
  do not reopen onboarding without a versioned reason.
- Existing users receive a non-blocking setup review rather than a forced
  first-run wizard.

## Architectural Debt Guardrails

The iteration must reduce, not extend, these current concentrations:

- `apps/extension/entrypoints/options/App.vue`
- `packages/runtime/src/controller.ts`
- `packages/types/src/index.ts`
- `apps/extension/entrypoints/background.ts`

Guardrails:

- new domain behavior receives a pure module and focused tests;
- entrypoints coordinate dependencies but do not implement domain algorithms;
- Vue components do not call Chrome APIs directly when an application
  composable can own the protocol;
- message handlers are grouped by application service;
- compatibility snapshots and terminology fingerprints are serializable;
- runtime settings expose no secrets;
- migrations preserve `userRules` for user-authored rules and `siteRules` for
  bundled built-ins.

File length is not an automatic failure, but mixed reasons to change are.
Extraction is required when a new feature would add another reason to modify
one of the concentrated files above.

## Vertical Delivery Slices

### Slice A: shared contracts

- glossary types, validation and resolution;
- reading-policy and semantics fingerprint;
- cache-key integration;
- settings migration and tests;
- position/insertion type separation.

### Slice B: site adaptation

- selector candidate generation;
- page selection overlay;
- draft and compatibility comparison;
- focused Options site-adaptation UI;
- deterministic fixture tests.

### Slice C: terminology and placement

- glossary CRUD and import/export;
- per-task terminology protection and restoration;
- provider prompt integration;
- position resolver and renderer strategies;
- whole-page and pointer-sentence integration.

### Slice D: onboarding

- versioned onboarding state;
- separate onboarding entrypoint;
- provider choice, validation, test and resume;
- installation/update behavior;
- clean-profile browser tests.

### Slice E: integrated hardening

- current-page language override shared by page and pointer translation;
- compatibility and glossary diagnostics;
- accessibility and localized failure states;
- unit, type, build, deterministic E2E, clean-profile Chrome/Edge verification.

## Completion Evidence

Completion requires:

- focused unit tests for every domain contract;
- settings migration tests from every supported prior version;
- installed-extension E2E for rule learning, terminology, placement, and
  onboarding;
- fixture coverage for article, docs, GitHub, Wikipedia-like, lists, tables,
  Shadow DOM, SPA, and interactive content;
- verification that API keys do not reach content scripts, diagnostics, or
  exports;
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`, and
  `git diff --check`;
- manual clean-profile verification of optional host permission accept/reject
  and at least one configured provider flow.
