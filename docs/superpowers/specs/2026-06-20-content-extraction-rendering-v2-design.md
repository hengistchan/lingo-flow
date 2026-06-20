# Content Extraction and Rendering V2 Design

## Goal

Replace the MVP selector-based collector with a full reading-content pipeline that
can translate complex pages without duplicate blocks, broken DOM placement, or
loss of important inline semantics.

## Current Failure

The MVP collector queries fixed selectors and accepts each matching element
independently. On GitHub Markdown, a structure such as:

```html
<blockquote>
  <p>Public beta ...</p>
</blockquote>
```

can produce both a `blockquote` block and a nested `p` block with the same text.
The renderer then inserts one translation inside the quote and another after the
quote. Headings outside `article/main/section` can also be missed, and every
translation is rendered as an `afterend` block even when the source is a list
item, table cell, or inline element.

## Architecture

V2 is a pipeline with five stages:

1. **Container discovery** finds likely reading roots. It prefers known content
   containers such as `article`, `main`, `[role="main"]`, `.markdown-body`,
   `.prose`, MDN content roots, and Wikipedia article roots. It then falls back
   to scored visible containers using text density, link density, and block
   count.
2. **Block extraction** walks selected containers and emits semantic reading
   blocks: headings, paragraphs, list items, quotes, table cells, captions, and
   description list items. It skips code, controls, navigation, metadata, and
   previously inserted translations.
3. **Overlap dedupe** removes duplicate or highly overlapping parent/child
   candidates. The preferred block is usually the deepest readable leaf, except
   table cells and list items remain as placement boundaries.
4. **Inline tokenization** protects inline code, keyboard shortcuts, links,
   package names, URLs, issue references, and commit hashes before provider
   translation. V2 keeps provider output text-only for safety, but the protected
   tokens make source text stable and prevent providers from translating code
   identifiers.
5. **Placement-aware rendering** inserts translations according to source
   semantics. Paragraphs and headings render after the block; list items render
   inside the `li`; table cells render inside the cell; inline-only anchors are
   promoted to a safe block ancestor; quotes render inside quoted paragraphs
   instead of after the whole `blockquote`.

## Data Model

Extend `TextBlock` with placement metadata:

```ts
type TranslationPlacement = 'after-block' | 'inside-block' | 'inside-cell' | 'inline-ancestor'

type TextBlock = {
  id: string
  elementRefId: string
  text: string
  normalizedText: string
  textHash: string
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
  inlineTokens: InlineToken[]
  meta: {
    tagName: string
    depth: number
    visible: boolean
    textLength: number
    blockType: TextBlockType
    placement: TranslationPlacement
    rootSelector?: string
  }
}
```

The first implementation keeps translations rendered as safe text nodes. Inline
tokens are used to protect request text and preserve cache stability; rich
re-hydration can follow later if needed.

## Platform Adapters

Adapters are small rule sets, not hard-coded content:

- **GitHub Markdown**: `.markdown-body`, headings `h1-h6`, paragraphs, list
  items, blockquote descendants, tables. Skip reaction bars, task controls,
  metadata, and generated attribution where possible.
- **MDN**: main article content and prose sections. Skip sidebars, feedback
  widgets, code examples, and interactive controls.
- **Wikipedia**: content body paragraphs, headings, list items, tables. Skip
  navigation, references UI, edit links, and infobox controls.
- **Generic article/blog**: scored containers plus semantic block extraction.

## Rendering Rules

- `heading`, `paragraph`, and `quote` paragraph blocks: insert a block-level
  translation immediately after the source block.
- `list`: append a nested translation element inside the `li`, after the main
  readable content, without creating a sibling outside the list.
- `table`: append inside `td`/`th`.
- `inline-ancestor`: find the nearest safe block ancestor and render there.
- Existing translation nodes are updated in place by `data-lingoflow-translation`.
- Provider output always uses `textContent`; no provider HTML is inserted.

## Tests

The first regression fixture is the GitHub PR Markdown DOM that exposed the bug.
It must prove:

- `blockquote > p` is translated once.
- `What`, `Why`, and `Notes` headings are collected.
- `code` and `pre` are not collected as blocks.
- Link and inline code text are protected in the provider request text.
- Rendered translations stay inside the correct structural boundary for quote,
  list, table, and inline-origin blocks.

Public-page E2E remains the outer acceptance test, but unit tests drive each
pipeline stage first.
