# Immersive Insertion Semantics Design

## Goal

Align LingoFlow's translation insertion behavior with the practical semantics
used by mature page translators: translations should stay attached to the
source text carrier, preserve structural boundaries, and avoid page-specific
special cases.

## Problem

Content Extraction and Rendering V2 fixed the first wave of duplicate and
broken-placement bugs for blockquotes, list items, table cells, and GitHub
Markdown. It still treats most rendered translations as a separate `div` placed
after the detected block.

That model breaks down for page regions where the text carrier is not a simple
paragraph:

- A heading can be a short inline label where an external block translation
  looks detached.
- A pull request or article title can be a link where the link itself is the
  primary text carrier. Moving the translation outside the link breaks the
  visual grouping and often the click target.
- A paragraph should generally keep the translation directly inside the
  paragraph after a line break, not as a sibling that may be separated by page
  CSS.
- A reference-like inline link, code token, commit hash, or issue number should
  remain protected, but a text-bearing title link must be translated.

The missing abstraction is not a GitHub-specific rule. It is a shared
collection/rendering contract that says where the translation belongs.

## Architecture

Add explicit insertion semantics to each collected text block.

1. **Collection classifies the source carrier.** A block can be a block element
   (`p`, `h2`, `li`, `td`) or a promoted primary inline carrier (`a`) inside a
   heading/card title.
2. **Inline tokenization distinguishes reference links from text-bearing
   links.** Links that are the main readable text should stay in the request
   text. Links that behave like references remain protected as inline tokens.
3. **Rendering executes a strategy, not a guess.** The renderer receives
   insertion metadata and creates a safe wrapper that matches the source
   element's display semantics.
4. **All inserted nodes are self-marking.** Wrappers use `notranslate` plus
   `data-lingoflow-translation` so the collector ignores LingoFlow output and
   `clearTranslations` can remove all generated nodes.

## Data Model

Extend the shared block and render contracts with an insertion strategy:

```ts
type TranslationInsertion =
  | 'linebreak-inside'
  | 'inline-inside'
  | 'inside-container'
  | 'before-nested-structure'
  | 'after-block'

type TextBlockMeta = {
  insertion: TranslationInsertion
  carrierTagName: string
}

type RenderInput = {
  blockId: string
  translatedText?: string
  insertion?: TranslationInsertion
}
```

The first implementation keeps provider output text-only. We do not rehydrate
provider HTML. Reference tokens are restored as plain text before rendering,
which matches the current safety model.

## Insertion Rules

- `linebreak-inside`: append a non-translatable wrapper inside the source
  element, preceded by a `br`. Use this for normal paragraphs, long headings,
  and primary title links.
- `inline-inside`: append an inline non-translatable wrapper inside the source
  element with a small spacer. Use this for short headings and label-like
  blocks.
- `inside-container`: append a block wrapper inside structural containers such
  as `td` and simple `li`.
- `before-nested-structure`: insert inside a list item before its first nested
  `ul` or `ol`.
- `after-block`: fallback for blocks that cannot safely contain the translation.

## Link Classification

Links are protected only when they are reference-like:

- The link text is a URL, issue/PR number, commit hash, package identifier, or
  short user/repository reference.
- The link is nested inside a larger paragraph and contributes a small
  reference token rather than the main sentence.

Links become text-bearing carriers when:

- The nearest semantic block contains mostly one anchor's readable text.
- The anchor text is long enough to be meaningful prose or a title.
- The anchor is inside a heading/title-like container.

This keeps PR titles translatable while preserving commit hashes and code links.

## Acceptance Criteria

- GitHub feed-style `h3 > a` PR titles are collected as text-bearing links and
  rendered inside the anchor.
- Paragraph translations render inside the paragraph after a line break.
- Short headings can render inline inside the heading.
- Blockquote paragraph translations remain inside the paragraph, with no
  duplicate blockquote translation.
- Parent list item translations stay before nested lists.
- Table cell translations stay inside the cell.
- Inline code, URLs, commit hashes, issue numbers, and reference-like links are
  still protected in provider request text.
- Clearing translations removes all generated wrappers and line breaks without
  removing original content.

## Non-Goals

- Do not clone the Immersive Translate DOM exactly or depend on `font` tags.
- Do not add per-site selectors for every GitHub class name.
- Do not render provider HTML.
- Do not change provider, cache, or language-selection behavior.
