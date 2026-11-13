import { t } from './i18n'
import type { HostMethods, HostResult } from './types'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'

export class HostError extends Error {
  constructor(
    message: string,
    public status: number,
    public key?: string,
    public errorCode?: string,
    public retryAfterMs?: number
  ) {
    super(message)
  }
}

export async function invoke<K extends keyof HostMethods>(
  method: K,
  argument?: HostMethods[K]['input']
): Promise<HostMethods[K]['output']> {
  let result: HostResult<HostMethods[K]['output']>
  if (window.xpertDesktop) result = await window.xpertDesktop.invoke(method, argument)
  else {
    const response = await fetch('/__desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, argument })
    })
    if (!response.ok) throw new HostError(t('Cannot connect to the desktop service. Please retry.'), response.status)
    result = await response.json()
  }
  return unwrap(result)
}

function unwrap<T>(result: HostResult<T>): T {
  if (!result.ok)
    throw new HostError(
      t(result.key || result.message, result.params),
      result.status,
      result.key,
      result.errorCode,
      result.retryAfterMs
    )
  return result.value
}

export async function uploadOrganizationPluginZip(organizationId: string, file: File) {
  if (window.xpertDesktop) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return invoke('installOrganizationPluginZip', { organizationId, bytes })
  }
  const response = await fetch('/__desktop/plugin-zip?' + new URLSearchParams({ organizationId }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file
  })
  if (!response.ok) throw new HostError(t('Cannot connect to the desktop service. Please retry.'), response.status)
  return unwrap<HostMethods['installOrganizationPluginZip']['output']>(await response.json())
}

export function openWorkspace(webUrl: string) {
  if (window.xpertDesktop) void window.xpertDesktop.openWorkspace()
  else window.open(webUrl, '_blank', 'noopener,noreferrer')
}

export async function openRegistration(webUrl: string) {
  const target = { target: 'auth.register' }
  if (window.xpertDesktop) return window.xpertDesktop.openPlatform(target)
  const url = platformCommandUrl(webUrl, target)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
