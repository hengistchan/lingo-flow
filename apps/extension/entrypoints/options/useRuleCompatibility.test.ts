import type { PageDiagnostics, UserSiteRule } from '@lingoflow/types'
import { useRuleCompatibility } from './useRuleCompatibility'

describe('saved rule compatibility checks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a baseline without the saved rule and keeps compatible rules enabled', async () => {
    const baseline = diagnostics(8)
    const candidate = diagnostics(9)
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: baseline })
      .mockResolvedValueOnce({ ok: true, data: candidate })
    stubChrome(sendMessage)

    const { revalidate, isChecking } = useRuleCompatibility()
    const pending = revalidate(rule())
    expect(isChecking('user:docs')).toBe(true)
    const updated = await pending

    expect(updated.enabled).toBe(true)
    expect(updated.compatibility).toMatchObject({
      status: 'compatible',
      pageUrl: 'https://docs.example.com/guide',
    })
    expect(isChecking('user:docs')).toBe(false)
    expect(sendMessage.mock.calls[0][1].payload).toEqual({
      excludedUserRuleIds: ['user:docs'],
    })
    expect(sendMessage.mock.calls[1][1].payload).toMatchObject({
      excludedUserRuleIds: ['user:docs'],
      ruleOverride: { id: 'user:docs' },
      requireRuleMatch: true,
    })
  })

  it('automatically disables a rule that no longer collects readable content', async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: diagnostics(8) })
      .mockResolvedValueOnce({ ok: true, data: diagnostics(0, 0) })
    stubChrome(sendMessage)

    const updated = await useRuleCompatibility().revalidate(rule())

    expect(updated.enabled).toBe(false)
    expect(updated.compatibility?.status).toBe('incompatible')
  })
})

function rule(): UserSiteRule {
  return {
    id: 'user:docs',
    version: 1,
    source: 'user',
    enabled: true,
    priority: 50,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    match: { matches: ['https://docs.example.com/*'] },
    selectors: { contentRoots: ['main'] },
  }
}

function diagnostics(collected: number, rootsSelected = 1): PageDiagnostics {
  return {
    pageUrl: 'https://docs.example.com/guide',
    domain: 'docs.example.com',
    runId: 'dry-run',
    rootGeneration: 1,
    rule: { id: 'default', matchedRuleIds: ['default'] },
    dynamicTranslationEnabled: false,
    dynamicTranslationMode: 'disabled',
    displayMode: 'dual',
    counts: {
      rootsConsidered: rootsSelected,
      rootsSelected,
      candidates: collected,
      collected,
      skipped: 0,
      queued: 0,
      cacheHit: 0,
      translated: 0,
      failed: 0,
      rendered: 0,
      renderSkipped: 0,
      stale: 0,
      discarded: 0,
    },
    topSkipReasons: [],
  }
}

function stubChrome(sendMessage: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('chrome', {
    tabs: {
      getCurrent: vi.fn().mockResolvedValue({ id: 99 }),
      query: vi.fn().mockResolvedValue([{
        id: 7,
        url: 'https://docs.example.com/guide',
        lastAccessed: 10,
      }]),
      sendMessage,
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([]),
    },
  })
}
