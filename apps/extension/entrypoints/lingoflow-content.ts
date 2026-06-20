import { createContentRuntime } from '@lingoflow/runtime'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'

declare global {
  interface Window {
    __lingoFlowContentRuntimeStarted?: boolean
  }
}

export default defineUnlistedScript({
  async main() {
    if (import.meta.env.DEV) {
      const { installDevInspectorResponder } = await import('../src/dev-inspector')
      installDevInspectorResponder()
    }

    if (window.__lingoFlowContentRuntimeStarted) return

    window.__lingoFlowContentRuntimeStarted = true
    createContentRuntime().start()
  },
})
