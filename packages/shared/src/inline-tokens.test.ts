import { restoreInlineTokens } from './inline-tokens'

describe('restoreInlineTokens', () => {
  it('replaces preserved placeholders with original inline token text', () => {
    const restored = restoreInlineTokens('请阅读 [[LF0]]，参考 [[LF1]]。', [
      { id: '[[LF0]]', type: 'code', text: 'README.md' },
      { id: '[[LF1]]', type: 'link', text: 'a285a52' },
    ])

    expect(restored).toBe('请阅读 README.md，参考 a285a52。')
  })
})
