import { parseOptionsIntent } from './options-intent'

describe('options route intent', () => {
  it('routes a popup rule request directly into content-root capture', () => {
    expect(parseOptionsIntent('?section=siteRules&adapt=content-root&targetTabId=42')).toEqual({
      section: 'siteRules',
      adaptKind: 'content-root',
      targetTabId: 42,
    })
  })

  it('forces rule-capture intents into the site-rules section', () => {
    expect(parseOptionsIntent('?section=general&adapt=exclude')).toMatchObject({
      section: 'siteRules',
      adaptKind: 'exclude',
    })
  })

  it('ignores unknown sections, capture kinds, and tab ids', () => {
    expect(parseOptionsIntent('?section=unknown&adapt=nope&targetTabId=-1')).toEqual({
      section: 'general',
      adaptKind: undefined,
      targetTabId: undefined,
    })
  })
})
