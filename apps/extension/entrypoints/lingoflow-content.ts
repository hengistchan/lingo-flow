import { createContentRuntime } from '@lingoflow/runtime'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'

declare global {
  interface Window {
    __lingoFlowContentRuntimeStarted?: boolean
  }
}

export default defineUnlistedScript(() => {
  if (import.meta.env.DEV) {
    void import('../src/dev-inspector').then(({ installDevInspectorBridge, installDevInspectorResponder }) => {
      installDevInspectorResponder()
      installDevInspectorBridge()
    })
  }

  if (window.__lingoFlowContentRuntimeStarted) return

  window.__lingoFlowContentRuntimeStarted = true
  createContentRuntime().start()
})
