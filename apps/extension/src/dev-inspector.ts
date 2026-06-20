import type { TranslationInspectionOptions, TranslationInspectionReport } from '@lingoflow/testkit'

export const LINGOFLOW_INSPECT_REQUEST = 'lingoflow/dev-inspect/request'
export const LINGOFLOW_INSPECT_RESPONSE = 'lingoflow/dev-inspect/response'

type InspectDomTranslation = (
  input: string | Document,
  options?: TranslationInspectionOptions,
) => Promise<TranslationInspectionReport>

type PrintTranslationInspection = (report: TranslationInspectionReport) => string

type Inspector = {
  inspect: InspectDomTranslation
  print: PrintTranslationInspection
}

type InspectPayload = {
  html?: string
  selector?: string
  options?: TranslationInspectionOptions
}

type DevInspectRequest = {
  type: typeof LINGOFLOW_INSPECT_REQUEST
  id: string
  payload?: InspectPayload
}

type InstallResponderOptions = {
  document?: Document
  window?: Window
  inspector?: Inspector
}

declare global {
  interface Window {
    __lingoFlowDevInspectorBridgeStarted?: boolean
    __lingoFlowDevInspectorResponderStarted?: boolean
  }
}

export function createDevInspectorBridgeScript(): string {
  return `
;(() => {
  const REQUEST = ${JSON.stringify(LINGOFLOW_INSPECT_REQUEST)}
  const RESPONSE = ${JSON.stringify(LINGOFLOW_INSPECT_RESPONSE)}
  if (window.__lingoflowInspectDom && window.__lingoflowInspectHtml) return

  let nextId = 0
  const requestInspection = payload => {
    const id = "lingoflow-inspect-" + Date.now() + "-" + (++nextId)
    return new Promise((resolve, reject) => {
      const onMessage = event => {
        if (event.source !== window) return
        const message = event.data
        if (!message || message.type !== RESPONSE || message.id !== id) return
        window.removeEventListener("message", onMessage)
        if (message.ok) {
          resolve(message.result)
        } else {
          reject(new Error(message.error || "LingoFlow DOM inspection failed"))
        }
      }
      window.addEventListener("message", onMessage)
      window.postMessage({ type: REQUEST, id, payload }, "*")
    })
  }

  window.__lingoflowInspectDom = (input, options) => {
    const payload = { options }
    if (typeof input === "string") {
      if (input.trim().startsWith("<")) payload.html = input
      else payload.selector = input
    } else if (input && typeof input.outerHTML === "string") {
      payload.html = input.outerHTML
    } else {
      payload.selector = "body"
    }
    return requestInspection(payload)
  }

  window.__lingoflowInspectHtml = (html, options) => {
    return requestInspection({ html: String(html || ""), options })
  }
})()
`.trim()
}

export function installDevInspectorBridge(win: Window = window): void {
  if (win.__lingoFlowDevInspectorBridgeStarted) return

  const doc = win.document
  const script = doc.createElement('script')
  script.textContent = createDevInspectorBridgeScript()
  ;(doc.documentElement ?? doc.head ?? doc.body).append(script)
  script.remove()
  win.__lingoFlowDevInspectorBridgeStarted = true
}

export function installDevInspectorResponder(options: InstallResponderOptions = {}): () => void {
  const win = options.window ?? window
  if (win.__lingoFlowDevInspectorResponderStarted) return () => {}

  win.__lingoFlowDevInspectorResponderStarted = true
  const doc = options.document ?? win.document
  const handler = (event: MessageEvent) => {
    void handleInspectionMessage(event, win, doc, options.inspector)
  }

  win.addEventListener('message', handler)
  return () => {
    win.removeEventListener('message', handler)
    win.__lingoFlowDevInspectorResponderStarted = false
  }
}

async function handleInspectionMessage(
  event: MessageEvent,
  win: Window,
  doc: Document,
  inspector?: Inspector,
): Promise<void> {
  if (event.source && event.source !== win) return
  if (!isInspectRequest(event.data)) return

  try {
    const activeInspector = inspector ?? await loadDefaultInspector()
    const html = resolveInspectionHtml(event.data.payload, doc)
    const report = await activeInspector.inspect(html, {
      pageUrl: doc.location?.href ?? 'https://example.test/inspection',
      domain: doc.location?.hostname ?? 'example.test',
      ...event.data.payload?.options,
    })

    win.postMessage({
      type: LINGOFLOW_INSPECT_RESPONSE,
      id: event.data.id,
      ok: true,
      result: {
        report,
        printed: activeInspector.print(report),
      },
    }, '*')
  } catch (error) {
    win.postMessage({
      type: LINGOFLOW_INSPECT_RESPONSE,
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, '*')
  }
}

async function loadDefaultInspector(): Promise<Inspector> {
  const module = await import('@lingoflow/testkit')
  return {
    inspect: module.inspectDomTranslation,
    print: module.printTranslationInspection,
  }
}

function resolveInspectionHtml(payload: InspectPayload | undefined, doc: Document): string {
  if (typeof payload?.html === 'string') return payload.html

  const selector = payload?.selector || 'body'
  const element = doc.querySelector(selector)
  if (!element) throw new Error(`No element matched selector: ${selector}`)

  if (element === doc.body) return doc.body.innerHTML
  if (element instanceof HTMLElement) return element.outerHTML
  return element.textContent ?? ''
}

function isInspectRequest(value: unknown): value is DevInspectRequest {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<DevInspectRequest>
  return (
    message.type === LINGOFLOW_INSPECT_REQUEST &&
    typeof message.id === 'string'
  )
}
