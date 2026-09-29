import { t } from './i18n'
import type { HostMethods, HostResult } from './types'

export class HostError extends Error {
  constructor(
    message: string,
    public status: number
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
  if (!result.ok) throw new HostError(t(result.key || result.message, result.params), result.status)
  return result.value
}

export function openWorkspace(webUrl: string) {
  if (window.xpertDesktop) void window.xpertDesktop.openWorkspace()
  else window.open(webUrl, '_blank', 'noopener,noreferrer')
}
