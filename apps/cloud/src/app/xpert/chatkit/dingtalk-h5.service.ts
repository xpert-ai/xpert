import { inject, Injectable, InjectionToken } from '@angular/core'

export type DingTalkH5Sdk = {
  ready(callback: () => void): void
  error?(callback: (error: unknown) => void): void
  requestAuthCode?(input: { clientId: string; corpId: string }): Promise<DingTalkAuthorizationResult>
  getAuthCode?(input: { corpId: string }): Promise<DingTalkAuthorizationResult>
  runtime?: {
    permission: {
      requestAuthCode?(input: {
        corpId: string
        onSuccess(result: DingTalkAuthorizationResult): void
        onFail(error: unknown): void
      }): void
    }
  }
}

type DingTalkAuthorizationResult = {
  code?: string
  authCode?: string
}

const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 10_000

export type DingTalkH5SdkLoader = () => Promise<unknown>

export const DINGTALK_H5_SDK_LOADER = new InjectionToken<DingTalkH5SdkLoader>('DingTalk H5 SDK loader', {
  providedIn: 'root',
  factory: () => () => import('dingtalk-jsapi')
})

@Injectable({ providedIn: 'root' })
export class DingTalkH5Service {
  readonly #sdkLoader = inject(DINGTALK_H5_SDK_LOADER)
  #sdkPromise: Promise<DingTalkH5Sdk> | null = null

  async requestAuthorizationCode(clientId: string, corpId: string) {
    const normalizedClientId = clientId.trim()
    if (!normalizedClientId) {
      throw new Error('DingTalk clientId is required.')
    }
    const normalizedCorpId = corpId.trim()
    if (!normalizedCorpId) {
      throw new Error('DingTalk corpId is required.')
    }
    const sdk = await this.loadSdk()
    return requestDingTalkAuthorizationCode(sdk, normalizedClientId, normalizedCorpId)
  }

  private loadSdk() {
    const existing = readDingTalkSdk(Reflect.get(globalThis, 'dd'))
    if (existing) {
      return Promise.resolve(existing)
    }
    if (this.#sdkPromise) {
      return this.#sdkPromise
    }

    this.#sdkPromise = Promise.resolve()
      .then(() => this.#sdkLoader())
      .catch(() => {
        throw new Error('Failed to load DingTalk JSAPI module.')
      })
      .then((module) => {
        const sdk = readDingTalkSdkModule(module)
        if (!sdk) {
          throw new Error('DingTalk JSAPI module did not expose a compatible SDK.')
        }
        return sdk
      })
      .catch((error) => {
        this.#sdkPromise = null
        throw error
      })

    return this.#sdkPromise
  }
}

export async function requestDingTalkAuthorizationCode(
  sdk: DingTalkH5Sdk,
  clientId: string,
  corpId: string,
  timeoutMs = DEFAULT_AUTHORIZATION_TIMEOUT_MS
) {
  await waitForDingTalkReady(sdk, timeoutMs)

  const attempts: Array<() => Promise<string>> = []
  const requestAuthCode = sdk.requestAuthCode
  if (requestAuthCode) {
    attempts.push(() =>
      withTimeout(
        Promise.resolve().then(() => requestAuthCode.call(sdk, { clientId, corpId })),
        timeoutMs,
        'Timed out waiting for DingTalk requestAuthCode.'
      ).then((result) => readAuthorizationCode(result))
    )
  }
  const getAuthCode = sdk.getAuthCode
  if (getAuthCode) {
    attempts.push(() =>
      withTimeout(
        Promise.resolve().then(() => getAuthCode.call(sdk, { corpId })),
        timeoutMs,
        'Timed out waiting for DingTalk getAuthCode.'
      ).then((result) => readAuthorizationCode(result))
    )
  }

  const legacyPermission = sdk.runtime?.permission
  const legacyRequestAuthCode = legacyPermission?.requestAuthCode
  if (legacyRequestAuthCode) {
    attempts.push(() =>
      withTimeout(
        new Promise<DingTalkAuthorizationResult>((resolve, reject) => {
          try {
            legacyRequestAuthCode.call(legacyPermission, {
              corpId,
              onSuccess: resolve,
              onFail: reject
            })
          } catch (error) {
            reject(error)
          }
        }),
        timeoutMs,
        'Timed out waiting for DingTalk legacy requestAuthCode.'
      ).then((result) => readAuthorizationCode(result))
    )
  }

  if (!attempts.length) {
    throw new Error('DingTalk requestAuthCode is unavailable in this client.')
  }

  let lastError: Error | null = null
  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (error) {
      lastError = new Error(formatDingTalkError(error))
    }
  }
  throw lastError ?? new Error('DingTalk authorization failed.')
}

function waitForDingTalkReady(sdk: DingTalkH5Sdk, timeoutMs: number) {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      try {
        sdk.error?.((error) => reject(new Error(formatDingTalkError(error))))
        sdk.ready(resolve)
      } catch (error) {
        reject(error)
      }
    }),
    timeoutMs,
    'Timed out waiting for DingTalk JSAPI to become ready.'
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function readDingTalkSdkModule(candidate: unknown) {
  const directSdk = readDingTalkSdk(candidate)
  if (directSdk || !candidate || typeof candidate !== 'object') {
    return directSdk
  }
  return readDingTalkSdk(Reflect.get(candidate, 'default'))
}

function readDingTalkSdk(candidate: unknown): DingTalkH5Sdk | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const ready = Reflect.get(candidate, 'ready')
  if (typeof ready !== 'function') {
    return null
  }
  if (
    typeof Reflect.get(candidate, 'requestAuthCode') === 'function' ||
    typeof Reflect.get(candidate, 'getAuthCode') === 'function'
  ) {
    return candidate as DingTalkH5Sdk
  }

  const runtime = Reflect.get(candidate, 'runtime')
  if (!runtime || typeof runtime !== 'object') {
    return null
  }
  const permission = Reflect.get(runtime, 'permission')
  if (!permission || typeof permission !== 'object') {
    return null
  }
  const requestAuthCode = Reflect.get(permission, 'requestAuthCode')
  return typeof requestAuthCode === 'function' ? (candidate as DingTalkH5Sdk) : null
}

function readAuthorizationCode(result: DingTalkAuthorizationResult) {
  const code = result.code?.trim() || result.authCode?.trim()
  if (code) {
    return code
  }
  throw new Error('DingTalk returned an empty authorization code.')
}

function formatDingTalkError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'DingTalk authorization failed.'
}
