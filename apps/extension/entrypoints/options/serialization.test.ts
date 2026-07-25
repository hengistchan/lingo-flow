import { reactive } from 'vue'
import { cloneSerializable } from './serialization'

describe('options serialization boundaries', () => {
  it('converts Vue proxies into detached values accepted by structured cloning', () => {
    const rules = reactive([{
      id: 'user:article',
      enabled: true,
      selectors: { contentRoots: ['article'] },
    }])

    expect(() => structuredClone(rules)).toThrow()

    const snapshot = cloneSerializable(rules)
    expect(snapshot).toEqual([{
      id: 'user:article',
      enabled: true,
      selectors: { contentRoots: ['article'] },
    }])
    expect(() => structuredClone(snapshot)).not.toThrow()

    snapshot[0].selectors.contentRoots.push('main')
    expect(rules[0].selectors.contentRoots).toEqual(['article'])
  })
})
