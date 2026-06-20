import type { MessageResponse } from "@lingoflow/types"

export function success<T>(data: T): MessageResponse<T> {
  return { ok: true, data }
}

export function failure(error: unknown): MessageResponse<never> {
  return {
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  }
}

export async function sendChromeMessage<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>
  if (!response?.ok) throw new Error(response?.error?.message ?? "Message failed")
  return response.data
}
