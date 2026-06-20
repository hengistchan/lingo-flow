import { inspectDomTranslation, printTranslationInspection } from '@lingoflow/testkit'
import {
  installDevInspectorPageBridge,
  installDevInspectorResponder,
  LINGOFLOW_INSPECT_REQUEST,
  LINGOFLOW_INSPECT_RESPONSE,
} from './dev-inspector'

describe('dev inspector console bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    delete window.__lingoflowInspectDom
    delete window.__lingoflowInspectHtml
    delete window.__lingoFlowDevInspectorBridgeStarted
    delete window.__lingoFlowDevInspectorResponderStarted
  })

  it('publishes page-console inspection helpers on the page window', async () => {
    const messages: Array<Record<string, unknown>> = []
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      messages.push(message as Record<string, unknown>)
    })

    installDevInspectorPageBridge(LINGOFLOW_INSPECT_REQUEST, LINGOFLOW_INSPECT_RESPONSE)

    expect(window.__lingoflowInspectDom).toEqual(expect.any(Function))
    expect(window.__lingoflowInspectHtml).toEqual(expect.any(Function))

    const result = window.__lingoflowInspectDom?.('main')
    expect(messages[0]).toMatchObject({
      type: LINGOFLOW_INSPECT_REQUEST,
      payload: { selector: 'main' },
    })

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: LINGOFLOW_INSPECT_RESPONSE,
        id: messages[0].id,
        ok: true,
        result: { printed: 'ok' },
      },
    }))

    await expect(result).resolves.toEqual({ printed: 'ok' })
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
