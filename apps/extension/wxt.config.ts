import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'wxt'
import { fileURLToPath } from 'node:url'

const extensionPackage = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

function manifestVersion(versionName: string): string {
  const match =
    /^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})(?:-rc\.([1-9][0-9]*))?$/.exec(
      versionName,
    )
  if (!match) {
    throw new Error(`Unsupported extension version: ${versionName}`)
  }

  const [, major, minor, patch, releaseCandidate] = match
  if ([major, minor, patch].some(value => Number(value) > 65_535)) {
    throw new Error(`Extension version component exceeds 65535: ${versionName}`)
  }
  if (
    releaseCandidate !== undefined &&
    (Number(releaseCandidate) < 1 || Number(releaseCandidate) > 99)
  ) {
    throw new Error(`Release candidate number must be between 1 and 99: ${versionName}`)
  }
  return releaseCandidate
    ? `${major}.${minor}.${patch}.${releaseCandidate}`
    : `${major}.${minor}.${patch}.100`
}

const alias = {
  '@lingoflow/cache': fileURLToPath(new URL('../../packages/cache/src/index.ts', import.meta.url)),
  '@lingoflow/dom': fileURLToPath(new URL('../../packages/dom/src/index.ts', import.meta.url)),
  '@lingoflow/glossary': fileURLToPath(new URL('../../packages/glossary/src/index.ts', import.meta.url)),
  '@lingoflow/providers': fileURLToPath(new URL('../../packages/providers/src/index.ts', import.meta.url)),
  '@lingoflow/renderer': fileURLToPath(new URL('../../packages/renderer/src/index.ts', import.meta.url)),
  '@lingoflow/runtime': fileURLToPath(new URL('../../packages/runtime/src/index.ts', import.meta.url)),
  '@lingoflow/rules': fileURLToPath(new URL('../../packages/rules/src/index.ts', import.meta.url)),
  '@lingoflow/scheduler': fileURLToPath(new URL('../../packages/scheduler/src/index.ts', import.meta.url)),
  '@lingoflow/settings': fileURLToPath(new URL('../../packages/settings/src/index.ts', import.meta.url)),
  '@lingoflow/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
  '@lingoflow/testkit': fileURLToPath(new URL('../../packages/testkit/src/index.ts', import.meta.url)),
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
// This plugin rewrites raw U+FFFF as the equivalent ASCII source escape after
// the build completes, preserving Dexie's range-sentinel semantics.
// See: https://github.com/nicedoc/wxt/issues (charset gap for rolldown)
const UNICODE_NONCHARACTER = /￿/g

function escapeUnicodeNoncharacters(browser: string) {
  function escapeDirectory(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        escapeDirectory(filePath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue

      const content = readFileSync(filePath, 'utf-8')
      if (content.includes('\uffff')) {
        writeFileSync(filePath, content.replace(UNICODE_NONCHARACTER, '\\uffff'))
      }
    }
  }

  return {
    name: 'escape-unicode-noncharacters',
    closeBundle() {
      // Vite's outDir is not directly available here; walk the known output path.
      const outDir = join(fileURLToPath(new URL('.', import.meta.url)), 'output', `${browser}-mv3`)
      escapeDirectory(outDir)
    },
  }
}

export default defineConfig({
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'edge'],
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'LingoFlow',
    description: 'Translate web pages inline with local-first provider controls.',
    version: manifestVersion(extensionPackage.version),
    version_name: extensionPackage.version,
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [
      'https://api.cognitive.microsofttranslator.com/*',
      'https://api.openai.com/*',
      'https://translate.googleapis.com/*',
    ],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: {
      default_title: 'LingoFlow',
      default_icon: {
        '16': 'icons/lingoflow-icon-16.png',
        '32': 'icons/lingoflow-icon-32.png',
      },
    },
    commands: {
      'translate-hovered-text': {
        suggested_key: {
          default: 'Alt+Shift+L',
          mac: 'Alt+Shift+L',
        },
        description: 'Translate the text under the pointer',
      },
    },
    icons: {
      '16': 'icons/lingoflow-icon-16.png',
      '32': 'icons/lingoflow-icon-32.png',
      '48': 'icons/lingoflow-icon-48.png',
      '128': 'icons/lingoflow-icon-128.png',
    },
  },
  outDir: 'output',
  vite: env => ({
    resolve: {
      alias,
    },
    plugins: [escapeUnicodeNoncharacters(env.browser)],
  }),
})
