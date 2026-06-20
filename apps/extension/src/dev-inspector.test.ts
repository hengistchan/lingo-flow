import { inspectDomTranslation, printTranslationInspection } from '@lingoflow/testkit'
import {
  createDevInspectorBridgeScript,
  installDevInspectorResponder,
  LINGOFLOW_INSPECT_REQUEST,
  LINGOFLOW_INSPECT_RESPONSE,
} from './dev-inspector'

describe('dev inspector console bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('publishes page-console inspection helpers from the injected script', () => {
    const script = createDevInspectorBridgeScript()

    expect(script).toContain('__lingoflowInspectDom')
    expect(script).toContain('__lingoflowInspectHtml')
    expect(script).toContain(LINGOFLOW_INSPECT_REQUEST)
    expect(script).toContain(LINGOFLOW_INSPECT_RESPONSE)
  })

  it('responds to selector inspection requests with the printed report', async () => {
    document.body.innerHTML = `
      <main>
        <p>Hello <strong>world</strong>.</p>
      </main>
    `
    const responses: unknown[] = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      responses.push(message)
    })

    const dispose = installDevInspectorResponder({
      document,
      window,
      inspector: {
        inspect: inspectDomTranslation,
        print: printTranslationInspection,
      },
    })

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: LINGOFLOW_INSPECT_REQUEST,
        id: 'request-1',
        payload: { selector: 'main' },
      },
    }))

    await vi.waitFor(() => {
      expect(responses).toHaveLength(1)
    })
    dispose()

    expect(responses[0]).toMatchObject({
      type: LINGOFLOW_INSPECT_RESPONSE,
      id: 'request-1',
      ok: true,
      result: {
        printed: expect.stringContaining('Blocks'),
      },
    })
  })
})
