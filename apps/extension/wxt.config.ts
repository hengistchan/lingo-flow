import { defineConfig } from 'wxt'
import { fileURLToPath } from 'node:url'

const alias = {
  '@lingoflow/cache': fileURLToPath(new URL('../../packages/cache/src/index.ts', import.meta.url)),
  '@lingoflow/dom': fileURLToPath(new URL('../../packages/dom/src/index.ts', import.meta.url)),
  '@lingoflow/providers': fileURLToPath(new URL('../../packages/providers/src/index.ts', import.meta.url)),
  '@lingoflow/renderer': fileURLToPath(new URL('../../packages/renderer/src/index.ts', import.meta.url)),
  '@lingoflow/runtime': fileURLToPath(new URL('../../packages/runtime/src/index.ts', import.meta.url)),
  '@lingoflow/scheduler': fileURLToPath(new URL('../../packages/scheduler/src/index.ts', import.meta.url)),
  '@lingoflow/settings': fileURLToPath(new URL('../../packages/settings/src/index.ts', import.meta.url)),
  '@lingoflow/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
  '@lingoflow/types': fileURLToPath(new URL('../../packages/types/src/index.ts', import.meta.url)),
}

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'LingoFlow',
    description: 'AI-powered Translation for the Open Web',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://api.cognitive.microsofttranslator.com/*', 'https://api.openai.com/*'],
    action: {
      default_title: 'LingoFlow',
    },
  },
  vite: () => ({
    resolve: {
      alias,
    },
  }),
})
