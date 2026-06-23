# LingoFlow SVG Icon Design

**Date:** 2026-06-23
**Status:** Approved for implementation
**Scope:** Browser toolbar, extension listing, README, and brand usage

## Design Direction

Use the selected **Language Flow** direction.

The icon represents bilingual reading with source text in the upper-left, translated text in the lower-right, and a rust-colored flow arrow connecting the two. It should read clearly at browser toolbar sizes while still feeling like part of the existing warm literary minimal UI.

## Token Mapping

Light mode:

| Role | Token | Value |
| --- | --- | --- |
| Background | `--lf-paper` | `#faf8f5` |
| Primary marks | `--lf-ink` | `#1a1a1a` |
| Secondary marks | `--lf-ghost` | `#6b6560` |
| Flow mark | `--lf-accent` | `#c05a2e` |
| Border | `--lf-rule` | `#e0dbd3` |

Dark mode via `prefers-color-scheme: dark`:

| Role | Token | Value |
| --- | --- | --- |
| Background | `--lf-paper` | `#1c1b19` |
| Primary marks | `--lf-ink` | `#e8e4de` |
| Secondary marks | `--lf-ghost` | `#9e978c` |
| Flow mark | `--lf-accent` | `#d4764e` |
| Border | `--lf-rule` | `#3a3830` |

## Icon Requirements

- Single standalone SVG asset.
- `viewBox="0 0 128 128"` for easy export to PNG sizes.
- No rounded badge shape, matching the sharp-corner book-page design language.
- Thick, simple strokes so the icon survives at 16px.
- No dependency on runtime CSS.
- Adapt to light and dark system color schemes inside the SVG.
- Include accessible `<title>` and `<desc>` metadata.

## Target File

- `apps/extension/assets/lingoflow-icon.svg`

## Review Note

The normal brainstorming spec-review subagent loop was not run because this session's tool policy only permits spawning subagents when the user explicitly asks for delegation or subagent work.
