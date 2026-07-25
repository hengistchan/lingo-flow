import type { PageDiagnoseMessage, PageDiagnostics } from '@lingoflow/types'

export async function findAdaptableTab(excludeTabId?: number): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs
    .filter(tab =>
      tab.id !== excludeTabId &&
      !!tab.url &&
      /^https?:\/\//.test(tab.url),
    )
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0]
}

export async function ensureContentRuntime(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lingoflow-content.js'],
    })
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    })
  }
}

export async function diagnosePage(
  tabId: number,
  payload?: PageDiagnoseMessage['payload'],
): Promise<PageDiagnostics> {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'page/diagnose',
    payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
  })
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Compatibility test failed.')
  return response.data as PageDiagnostics
}
