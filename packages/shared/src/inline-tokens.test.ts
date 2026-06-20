import { restoreInlineTokens } from './inline-tokens'

describe('inline token format', () => {
  it('Uses unique bracket format unlikely to collide with page content', () => {
    // The token format should use ⟦ and ⟧ characters (U+27E6 and U+27E7)
    // These are mathematical white square brackets, not ASCII brackets.
    const tokenPattern = /⟦LF:\d+⟧/u

    // Verify the token format matches the expected Unicode bracket pattern
    expect('⟦LF:0⟧').toMatch(tokenPattern)
    expect('⟦LF:42⟧').toMatch(tokenPattern)

    // Standard ASCII brackets should NOT match the token pattern
    expect('[[LF:0]]').not.toMatch(tokenPattern)
    expect('[LF:0]').not.toMatch(tokenPattern)

    // Ensure the bracket characters are the correct Unicode code points
    const LEFT = '⟦' // ⟦ MATHEMATICAL LEFT WHITE SQUARE BRACKET
    const RIGHT = '⟧' // ⟧ MATHEMATICAL RIGHT WHITE SQUARE BRACKET
    expect(`${LEFT}LF:0${RIGHT}`).toBe('⟦LF:0⟧')

    // These characters are extremely rare in normal content,
    // making collision with page text highly unlikely
    expect(LEFT).not.toBe('[')
    expect(RIGHT).not.toBe(']')
  })
})

describe('restoreInlineTokens', () => {
  it('replaces preserved placeholders with original inline token text', () => {
    const restored = restoreInlineTokens('请阅读 ⟦LF:0⟧，参考 ⟦LF:1⟧。', [
      { id: '⟦LF:0⟧', type: 'code', text: 'README.md' },
      { id: '⟦LF:1⟧', type: 'link', text: 'a285a52' },
    ])

    expect(restored).toBe('请阅读 README.md，参考 a285a52。')
  })

  it('normalizes fullwidth colon ⟦LF：N⟧ back to ASCII ⟦LF:N⟧ before restoration', () => {
    // LLMs sometimes replace ASCII colon `:` (U+003A) with fullwidth colon `：` (U+FF1A)
    const restored = restoreInlineTokens('请阅读 ⟦LF：0⟧，参考 ⟦LF：1⟧。', [
      { id: '⟦LF:0⟧', type: 'code', text: 'README.md' },
      { id: '⟦LF:1⟧', type: 'link', text: 'a285a52' },
    ])

    expect(restored).toBe('请阅读 README.md，参考 a285a52。')
  })
})
