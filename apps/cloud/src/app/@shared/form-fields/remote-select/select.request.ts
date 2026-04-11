import { isEqual } from 'lodash-es'

export type TRemoteSelectRequest = {
  url: string
  params?: Record<string, unknown>
}

export function buildRemoteSelectRequest(
  url: string | undefined,
  params?: Record<string, unknown>
): TRemoteSelectRequest | undefined {
  if (!url) {
    return undefined
  }

  const normalizedParams = params && Object.keys(params).length ? params : undefined

  return normalizedParams ? { url, params: normalizedParams } : { url }
}

export function isSameRemoteSelectRequest(
  previous: TRemoteSelectRequest | undefined,
  current: TRemoteSelectRequest | undefined
) {
  return isEqual(previous, current)
}
