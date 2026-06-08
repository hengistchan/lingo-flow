import { normalizeText, sha256 } from './index'

describe('shared text helpers', () => {
  it('normalizes whitespace and non-breaking spaces consistently', () => {
    expect(normalizeText('  Hello\u00a0\n\n world\tagain  ')).toBe('Hello world again')
  })

  it('hashes normalized source text with SHA-256', async () => {
    await expect(sha256('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })
})
