import { inspectDomTranslation, printTranslationInspection } from '@lingoflow/testkit'

describe('translation inspection testkit', () => {
  it('reports collection order, rendered translations, and a simplified DOM tree', async () => {
    const report = await inspectDomTranslation(`
      <main>
        <h3>
          <a href="/repo/pull/208">
            docs(readme): align the homepage status banner
            <span>#208</span>
          </a>
        </h3>
        <p>Update <code>README.md</code> after <a href="/commit/a285a52">a285a52</a> before release.</p>
      </main>
    `, {
      translate: (block, index) => `T${index + 1}: ${block.requestText}`,
    })

    expect(report.blocks).toEqual([
      expect.objectContaining({
        order: 1,
        tagName: 'a',
        insertion: 'linebreak-inside',
        sourceText: expect.stringContaining('homepage status banner'),
        requestText: expect.stringContaining('homepage status banner'),
        translatedText: expect.stringContaining('homepage status banner'),
      }),
      expect.objectContaining({
        order: 2,
        tagName: 'p',
        insertion: 'linebreak-inside',
        sourceText: expect.stringContaining('README.md'),
        requestText: expect.stringContaining('⟦LF:0⟧'),
        translatedText: expect.stringContaining('README.md'),
      }),
    ])
    expect(report.tree.children?.[0]?.tagName).toBe('main')
    expect(JSON.stringify(report.tree)).toContain('data-lingoflow-translation')

    const printed = printTranslationInspection(report)
    expect(printed).toContain('1. a linebreak-inside')
    expect(printed).toContain('source:')
    expect(printed).toContain('request:')
    expect(printed).toContain('translated:')
    expect(printed).toContain('DOM')
  })
})
