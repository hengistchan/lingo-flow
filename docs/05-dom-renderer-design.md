# 05. DOM Collector and Renderer Design

## DOM Collector Goal

Collect meaningful webpage reading content while avoiding UI, code, navigation, forms, and already translated nodes.

## Candidate Selectors

```ts
export const CANDIDATE_SELECTORS = [
  'article h1',
  'article h2',
  'article h3',
  'article p',
  'article li',
  'main h1',
  'main h2',
  'main h3',
  'main p',
  'main li',
  'section p',
  'section li',
  'blockquote',
  'td',
  'th',
]
```

## Ignore Selectors

```ts
export const IGNORE_SELECTORS = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
  'button',
  'select',
  'nav',
  'footer',
  'header',
  'svg',
  'canvas',
  '[contenteditable="true"]',
  '[data-lingoflow-ignore]',
  '[data-lingoflow-translation]',
]
```

## TextBlock

```ts
export type TextBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'table'
  | 'unknown'

export type TextBlock = {
  id: string
  elementRefId: string
  text: string
  normalizedText: string
  textHash: string
  sourceLang: 'auto' | string
  targetLang: string
  pageUrl: string
  domain: string
  meta: {
    tagName: string
    depth: number
    visible: boolean
    textLength: number
    blockType: TextBlockType
  }
}
```

## Element Filtering

```ts
export function isTranslatableElement(element: HTMLElement): boolean {
  if (!isVisible(element)) return false

  if (element.closest(IGNORE_SELECTORS.join(','))) return false

  if (element.dataset.lingoflowBlockId) return false

  const text = normalizeText(element.innerText ?? '')
  if (text.length < 20) return false

  const childTextLength = Array.from(element.children)
    .map(child => normalizeText((child as HTMLElement).innerText ?? '').length)
    .reduce((sum, len) => sum + len, 0)

  if (element.children.length > 1 && childTextLength > text.length * 0.8) {
    return false
  }

  return true
}
```

## Renderer Goal

MVP render mode:

```txt
below-original
```

Do not replace original text.

Do not use `innerHTML` for provider output.

## Rendered DOM

```html
<p data-lingoflow-block-id="block_xxx">
  Original paragraph.
</p>

<div
  class="lingoflow-translation"
  data-lingoflow-translation="block_xxx"
>
  中文译文。
</div>
```

## Style Injection

```ts
export function injectLingoFlowStyles() {
  if (document.getElementById('lingoflow-style')) return

  const style = document.createElement('style')
  style.id = 'lingoflow-style'
  style.textContent = `
    .lingoflow-translation {
      margin-top: 0.35em;
      margin-bottom: 0.85em;
      padding-left: 0.75em;
      border-left: 3px solid #20D4BF;
      color: #0F9F91;
      font-size: 0.95em;
      line-height: 1.65;
      word-break: break-word;
    }
  `

  document.documentElement.appendChild(style)
}
```

## Clear Translation

```ts
export function clearTranslations() {
  document
    .querySelectorAll('[data-lingoflow-translation]')
    .forEach(node => node.remove())

  document
    .querySelectorAll('[data-lingoflow-block-id]')
    .forEach(node => {
      if (node instanceof HTMLElement) {
        delete node.dataset.lingoflowBlockId
      }
    })
}
```
