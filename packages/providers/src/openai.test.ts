import { createOpenAICompatibleRequestBody, parseOpenAIJsonResult } from './index'

describe('parseOpenAIJsonResult', () => {
  it('parses a strict JSON array with the expected length', () => {
    expect(parseOpenAIJsonResult('["你好", "世界"]', 2)).toEqual(['你好', '世界'])
  })

  it('extracts a JSON array from surrounding model text', () => {
    expect(parseOpenAIJsonResult('Result:\n["段落一", "段落二"]\nDone.', 2)).toEqual(['段落一', '段落二'])
  })

  it('rejects invalid or wrong-length LLM output', () => {
    expect(() => parseOpenAIJsonResult('["only one"]', 2)).toThrow('Invalid LLM translation output')
  })

  it("Extracts the first JSON array when multiple brackets appear in chatty output", () => {
    const content = 'Here are the translations: ["Hello", "World"] and here is an unrelated array: [1, 2, 3]'
    expect(parseOpenAIJsonResult(content, 2)).toEqual(["Hello", "World"])
  })
})

describe('createOpenAICompatibleRequestBody', () => {
  it('adds deterministic glossary constraints only when a batch uses them', () => {
    const body = createOpenAICompatibleRequestBody({
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      texts: ['An ⟦LFG:0⟧ coordinates tasks.'],
      glossary: [{ entryId: 'agent', source: 'AI agent', target: '智能体' }],
    }, {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'secret',
      model: 'gpt-4o-mini',
    })
    const messages = body.messages as Array<{ role: string; content: string }>
    const prompt = JSON.parse(messages[1].content)

    expect(messages[0].content).toContain('Preserve every ⟦LFG:N⟧ token exactly')
    expect(prompt.glossary).toEqual([
      { entryId: 'agent', source: 'AI agent', target: '智能体' },
    ])
  })
})
