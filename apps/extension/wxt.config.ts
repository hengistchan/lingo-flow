import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

// Workaround for WXT + Vite 8 (rolldown) emitting raw Unicode noncharacters.
//
// WXT sets `esbuild.charset = "ascii"` for Vite 5-7, which makes esbuild emit
// non-ASCII as \uXXXX escapes. But for Vite 8+ (rolldown/oxc-minify) it skips
// this, and oxc-minify's constant folding converts `String.fromCharCode(65535)`
// (used by Dexie) into the raw U+FFFF byte sequence. Chrome's extension script
// loader rejects files containing Unicode noncharacters.
//
// This plugin strips U+FFFF from output .js files after the build completes.
// See: https://github.com/nicedoc/wxt/issues (charset gap for rolldown)
const STRIP_NONCHAR = /￿/g

function stripUnicodeNoncharacters() {
  return {
    name: 'strip-unicode-noncharacters',
    closeBundle() {
      // Vite's outDir is not directly available here; walk the known output path.
      const outDir = join(fileURLToPath(new URL('.', import.meta.url)), 'output', 'chrome-mv3')
      for (const entry of readdirSync(outDir)) {
        if (!entry.endsWith('.js')) continue
        const filePath = join(outDir, entry)
        const content = readFileSync(filePath, 'utf-8')
        if (STRIP_NONCHAR.test(content)) {
          writeFileSync(filePath, content.replace(STRIP_NONCHAR, ''))
        }
      }
    },
  }
}

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'LingoFlow',
    description: 'AI-powered Translation for the Open Web',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://api.cognitive.microsofttranslator.com/*', 'https://api.openai.com/*'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {
      default_title: 'LingoFlow',
    },
  },
  outDir: 'output',
  vite: () => ({
    resolve: {
      alias,
    },
    plugins: [stripUnicodeNoncharacters()],
  }),
})
