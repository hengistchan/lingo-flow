import type { InlineToken } from '@lingoflow/types'

/**
 * Normalize LLM-mangled token placeholders.
 * Some LLMs replace ASCII colon `:` (U+003A) with fullwidth colon `：` (U+FF1A)
 * inside ⟦LF:N⟧ placeholders during translation. This function restores the
 * original ASCII format so that token replacement works correctly.
 */
function normalizeTokenPlaceholders(text: string): string {
  // ⟦LF：N⟧ → ⟦LF:N⟧ (fullwidth colon → ASCII colon)
  return text.replace(/⟦LF：/g, '⟦LF:')
}

export function restoreInlineTokens(text: string, inlineTokens: InlineToken[] = []): string {
  const normalized = normalizeTokenPlaceholders(text)
  return inlineTokens.reduce(
    (value, token) => value.split(token.id).join(token.text),
    normalized,
  )
}
