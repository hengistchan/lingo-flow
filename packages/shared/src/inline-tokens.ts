import type { InlineToken } from '@lingoflow/types'

export function restoreInlineTokens(text: string, inlineTokens: InlineToken[] = []): string {
  return inlineTokens.reduce(
    (value, token) => value.split(token.id).join(token.text),
    text,
  )
}
