import type { ClawXpertSandboxPreviewTarget } from '../../clawxpert-sandbox-preview.utils'

export type ClawXpertBrowserTab = {
  id: string
  kind: 'browser'
  serviceId: string | null
  url: string | null
  displayUrl: string | null
  zoom: number
  deviceToolbarVisible: boolean
  reloadKey: number
}

export type ClawXpertBrowserTabChange = Partial<Omit<ClawXpertBrowserTab, 'id' | 'kind'>>

export const DEFAULT_BROWSER_ZOOM = 100

export const WORKBENCH_BROWSER_OPEN_COMMAND = 'workbench.browser.open'

export function isMatchingBrowserTab(tab: ClawXpertBrowserTab, target: ClawXpertSandboxPreviewTarget) {
  if (typeof target.serviceId === 'string' && target.serviceId.trim() && tab.serviceId === target.serviceId) {
    return true
  }

  const targetUrl = target.url ?? target.displayUrl
  return typeof targetUrl === 'string' && targetUrl.trim()
    ? tab.url === targetUrl || tab.displayUrl === targetUrl
    : false
}

export function toWorkbenchBrowserPreviewTarget(payload: unknown): ClawXpertSandboxPreviewTarget | null {
  if (typeof payload === 'string' && payload.trim()) {
    const url = payload.trim()
    return {
      displayUrl: url,
      url
    }
  }

  if (!isPreviewPayloadRecord(payload)) {
    return null
  }

  const url =
    readPreviewPayloadString(payload, 'url') ??
    readPreviewPayloadString(payload, 'displayUrl') ??
    readPreviewPayloadString(payload, 'deploymentUrl') ??
    readPreviewPayloadString(payload, 'previewUrl')
  if (!url) {
    return null
  }

  return {
    displayUrl: readPreviewPayloadString(payload, 'displayUrl') ?? url,
    url
  }
}

function readPreviewPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isPreviewPayloadRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readHttpUrl(value: unknown) {
  const text = readNonEmptyString(value)
  if (!text) {
    return null
  }
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
