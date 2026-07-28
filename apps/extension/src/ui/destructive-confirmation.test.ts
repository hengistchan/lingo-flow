import { advanceDestructiveConfirmation } from './destructive-confirmation'

describe('destructive confirmation', () => {
  it('arms the requested item on the first action', () => {
    expect(advanceDestructiveConfirmation(null, 'rule-a')).toEqual({
      confirmed: false,
      pendingId: 'rule-a',
    })
  })

  it('confirms only a repeated action for the same item', () => {
    expect(advanceDestructiveConfirmation('rule-a', 'rule-a')).toEqual({
      confirmed: true,
      pendingId: null,
    })
    expect(advanceDestructiveConfirmation('rule-a', 'rule-b')).toEqual({
      confirmed: false,
      pendingId: 'rule-b',
    })
  })
})
