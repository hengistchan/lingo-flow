# LingoFlow UI Redesign — 书页批注 (Warm Literary Minimal)

**Date:** 2026-06-20
**Status:** Approved
**Scope:** Popup, Options, in-page translation rendering, interactions

## 1. Design Thesis

LingoFlow helps people read in another language. The design draws from the world of bilingual reading: books, margin annotations, parallel text editions. Translations are presented as quiet annotations beside the original — always present, never demanding attention.

**Signature element:** The language pair displayed as serif display text with an em-dash bridge: `English — 中文`. This appears in the popup as the hero element and evokes the chapter headings of bilingual editions.

**Anti-pattern avoided:** The standard AI-generated UI look (Inter font, blue accent, blue-tinted sidebar, rounded cards with box-shadow). Every choice in this spec is made for this specific product.

## 2. Design Tokens

### 2.1 Color

**Light mode:**

| Token | Hex | Role |
|-------|-----|------|
| `--ink` | `#1a1a1a` | Primary text |
| `--paper` | `#faf8f5` | Page background |
| `--margin` | `#f2efeb` | Panel/card background |
| `--accent` | `#c05a2e` | Primary button, active state, translation border |
| `--accent-hover` | `#a84d27` | Button hover |
| `--whisper` | `#b8b2a6` | Secondary text, placeholders |
| `--rule` | `#e0dbd3` | Borders, dividers |
| `--ghost-text` | `#6b6560` | Labels, muted content, in-page translation text |

**Dark mode:**

| Token | Hex | Role |
|-------|-----|------|
| `--ink` | `#e8e4de` | Primary text |
| `--paper` | `#1c1b19` | Page background |
| `--margin` | `#252420` | Panel/card background |
| `--accent` | `#d4764e` | Primary button, active state |
| `--accent-hover` | `#c06840` | Button hover |
| `--whisper` | `#7a756b` | Secondary text |
| `--rule` | `#3a3830` | Borders, dividers |
| `--ghost-text` | `#9e978c` | Labels, muted content |

### 2.2 Typography

| Role | Stack | Sizes |
|------|-------|-------|
| Brand / Headings | `Georgia, "Noto Serif", "Source Han Serif SC", "Songti SC", serif` | 28px (h1), 22px (h1 options), 20px (lang pair), 16px (section title) |
| Body / UI | `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif` | 14px (body), 13px (controls), 12px (labels, status) |

**Weights:** 400 for serif headings, 400/600 for sans body/labels. No bold serif.

### 2.3 Spacing & Shape

- Border radius: 0 (sharp corners — book-like, not rounded-card)
- Button height: 40px (primary), 36px (secondary), 34px (test)
- Input height: 38px
- Grid gap: 16px (forms), 20px (sections)

## 3. Popup (320px)

### 3.1 Structure

```
┌──────────────────────────────┐
│  LingoFlow               ⚙  │  Georgia 16px title + inline SVG gear
│  Ready                       │  whisper 12px status
│                              │
│  English  —  中文 (简体)     │  Georgia 20px lang pair (signature)
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │  1px rule divider
│                              │
│  ────────────────────────    │  2px progress line (accent fill)
│                              │
│  [ 翻译为中文 (简体)      ]  │  accent button, full width
│                              │
│  [清除翻译]  [清除缓存]      │  ghost buttons, only when translations exist
└──────────────────────────────┘
```

### 3.2 Interaction Changes

- **Header:** Remove "LF" brand badge. Brand identity comes from the serif typeface. Gear icon uses inline SVG instead of Unicode ⚙.
- **Language pair:** Source and target languages displayed as large serif text separated by em-dash. Target language is clickable — opens a native `<select>` overlay. Hover shows accent underline.
- **Progress:** Replace the blue rounded progress bar with a 2px line under the language pair, filled with accent color.
- **Secondary actions:** "Clear translation" and "Clear cache" buttons only appear when translations exist. They are ghost-styled (transparent bg, rule border).
- **Loading:** Keep existing text-based loading state. No spinner animation — consistent with the restrained aesthetic.

### 3.3 States

| State | Language pair | Progress line | Primary button | Secondary buttons |
|-------|--------------|---------------|----------------|-------------------|
| Idle | Shown | Hidden | "翻译为中文 (简体)" | Hidden |
| Translating | Shown | Animated fill | "翻译中..." (disabled) | Hidden |
| Done | Shown | Hidden | "重新翻译为中文 (简体)" | Shown |
| Partial | Shown | Hidden | "重新翻译为中文 (简体)" | Shown |
| Failed | Shown | Hidden | "重新翻译为中文 (简体)" | Shown |
| Not configured | Shown | Hidden | "配置翻译服务" → opens settings | Hidden |

## 4. Options Page (720px max)

### 4.1 Structure

```
┌──────────────────────────────────────────┐
│  LingoFlow 设置                    [保存] │  Georgia 22px + accent button
│  配置翻译服务与语言偏好                     │  whisper 13px subtitle
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │  1px rule
├──────────────────────────────────────────┤
│                                          │
│  语言          │  目标语言                │
│  ◉ 翻译服务     │  ┌──────────────────┐  │  nav: accent left-border on active
│  ○ 存储         │  │ 中文 (简体)      │  │  inputs: 1px rule border, no radius
│  ○ 高级         │  └──────────────────┘  │
│                │                         │
│                │  源语言                  │
│                │  ┌──────────────────┐  │
│                │  │ 自动检测         │  │
│                │  └──────────────────┘  │
│                │                         │
│                │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │  1px rule divider between field groups
│                │                         │
│                │  测试连接         [测试] │  inline test button
│                │  ✓ 连接成功             │  text prefix, not colored dot
│                                          │
└──────────────────────────────────────────┘
```

### 4.2 Layout Changes

- **Max width:** 720px (reduced from 980px — settings don't need wide layout)
- **Shell:** Remove border-radius, box-shadow. Use 1px rule border only.
- **Sidebar:** No colored background. Plain text navigation. Active item indicated by 2px accent left-border + ink color.
- **Save button:** Moves into masthead row (next to title), not below.
- **Form layout:** Labels above inputs (current pattern). 2-column grid for paired fields.
- **Dividers:** 1px rule (`--rule`) between field groups. No colored section borders.
- **Connection test:** Inline with the form (not in a separate bordered box). Result uses text prefix `✓` / `✗` instead of colored dots.
- **Responsive:** At 640px breakpoint, collapse to single-column. Sidebar becomes horizontal tab bar.

### 4.3 Section-specific Notes

**Languages:** 3 fields in a 2-column grid (target + source in row 1, interface in row 2).

**Providers:** Default/fallback selects in 2-column grid. Provider fields below a rule divider. Speed controls (reasoning effort, disable thinking) below another divider. Add/remove provider buttons use ghost style. Custom provider form slides down as an overlay panel (not inline push).

**Storage:** Cache checkbox + clear button. Confirm-clear uses text change (same button, text changes to "确认清除"), not color-only feedback.

**Advanced:** 3 fields in 2-column grid (render mode + max cache in row 1, concurrency in row 2).

## 5. In-page Translation Rendering

### 5.1 Block Translation

```css
.lingoflow-translation {
  margin-top: 0.35em;
  margin-bottom: 0.85em;
  padding-left: 0.75em;
  border-left: 2px solid var(--accent);  /* #c05a2e light / #d4764e dark */
  color: var(--ghost-text);              /* #6b6560 light / #9e978c dark */
  font-size: 0.95em;
  line-height: 1.65;
  word-break: break-word;
}
```

**Changes from current:**
- Border: 3px teal → 2px rust accent (more subtle)
- Text: #0F9F91 teal → #6b6560 warm gray (doesn't compete with original text)
- Overall effect: margin annotation, not highlight marker

### 5.2 Inline Translation

No border, inline display. Unchanged from current behavior.

### 5.3 Dark Mode

The renderer injects CSS into the host page. For dark mode support, use `prefers-color-scheme` media query with the dark token values. The accent shifts to `#d4764e` and ghost-text to `#9e978c`.

## 6. i18n

No changes to the i18n system. All existing copy keys remain. Visual changes are CSS-only.

## 7. Migration Strategy

- All changes are to Vue SFC `<style scoped>` blocks and the renderer's injected CSS
- No structural changes to component logic or data flow
- No new dependencies
- CSS custom properties (`--ink`, `--paper`, etc.) defined at `:root` in each SFC, not globally — scoped isolation preserved
- Dark mode via existing `@media (prefers-color-scheme: dark)` pattern

## 8. Files to Modify

| File | Changes |
|------|---------|
| `apps/extension/entrypoints/popup/App.vue` | Full restyle of `<style scoped>` |
| `apps/extension/entrypoints/options/App.vue` | Full restyle of `<style scoped>` |
| `packages/renderer/src/index.ts` | Update injected CSS colors and border-width |
