import type { MessageResponse, PublicRuntimeSettings, TranslationResult } from "@lingoflow/types"
import { createContentRuntime } from "./index"

function runtimeSettings() {
  return {
    targetLang: "ja",
    sourceLang: "auto",
    renderMode: "below-original",
    cacheEnabled: false,
    maxCacheItems: 50000,
    providerId: "azure-translator",
    normalizeVersion: "v1",
  }
}

function fakeRuntime() {
  return {
    sendMessage: vi.fn(async (message: any) => {
      const msg = message
      if (msg.type === "settings/getRuntime") {
        return { ok: true, data: runtimeSettings() }
      }
      if (msg.type === "translation-cache/resolve") {
        const tasks = msg.payload?.tasks ?? []
        return { ok: true, data: { hits: [], misses: tasks } }
      }
      if (msg.type === "translation/translateBatch") {
        const tasks = msg.payload?.tasks ?? []
        return {
          ok: true,
          data: {
            results: tasks.map((t: any) => ({
              taskId: t.id,
              blockId: t.blockId,
              sourceText: t.sourceText,
              translatedText: "翻訳",
              sourceLang: "auto",
              targetLang: "ja",
              providerId: "azure-translator",
              cacheKey: t.cacheKey,
              fromCache: false,
              status: "success",
            })),
          },
        }
      }
      return { ok: true, data: {} }
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  }
}

describe("content runtime", () => {
  it("Exposes getProgress that returns idle before translation starts", () => {
    const runtime = fakeRuntime()
    const rt = createContentRuntime({ chromeRuntime: runtime } as any)
    expect(rt.getProgress().status).toBe("idle")
  })

  it("Returns failed status when no readable text blocks are found", async () => {
    const runtime = fakeRuntime()
    const doc = {
      location: { href: "https://example.com" },
      querySelectorAll: () => [],
    }
    const rt = createContentRuntime({ chromeRuntime: runtime, document: doc } as any)
    const progress = await rt.translatePage()
    expect(progress.status).toBe("failed")
    expect(progress.messageCode).toBe("no_readable_text")
  })
})
