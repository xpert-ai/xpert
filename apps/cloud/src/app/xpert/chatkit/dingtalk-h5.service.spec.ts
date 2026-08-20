import { TestBed } from '@angular/core/testing'
import {
  DINGTALK_H5_SDK_LOADER,
  DingTalkH5Sdk,
  DingTalkH5Service,
  requestDingTalkAuthorizationCode
} from './dingtalk-h5.service'

describe('requestDingTalkAuthorizationCode', () => {
  it('uses the current Promise API with the server-provided clientId and corpId', async () => {
    const sdk: DingTalkH5Sdk = {
      ready: (callback) => callback(),
      requestAuthCode: async (input) => {
        expect(input.clientId).toBe('client-id-1')
        expect(input.corpId).toBe('corp-1')
        return { code: 'auth-code-1' }
      }
    }

    await expect(requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1')).resolves.toBe('auth-code-1')
  })

  it('falls back to the previous Promise API', async () => {
    const sdk: DingTalkH5Sdk = {
      ready: (callback) => callback(),
      getAuthCode: async (input) => {
        expect(input.corpId).toBe('corp-1')
        return { authCode: 'auth-code-1' }
      }
    }

    await expect(requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1')).resolves.toBe('auth-code-1')
  })

  it('falls back when the current Promise API never settles', async () => {
    const sdk: DingTalkH5Sdk = {
      ready: (callback) => callback(),
      requestAuthCode: () => new Promise(() => undefined),
      getAuthCode: async () => ({ authCode: 'auth-code-from-fallback' })
    }

    await expect(requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1', 5)).resolves.toBe(
      'auth-code-from-fallback'
    )
  })

  it('falls back to the legacy callback API', async () => {
    let onSuccess: ((result: { code?: string; authCode?: string }) => void) | null = null
    const sdk: DingTalkH5Sdk = {
      ready: (callback) => callback(),
      runtime: {
        permission: {
          requestAuthCode: (input) => {
            expect(input.corpId).toBe('corp-1')
            onSuccess = input.onSuccess
          }
        }
      }
    }

    const codePromise = requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1')
    await Promise.resolve()
    onSuccess?.({ code: 'auth-code-1' })

    await expect(codePromise).resolves.toBe('auth-code-1')
  })

  it('rejects an empty authorization code instead of creating an anonymous session', async () => {
    const sdk: DingTalkH5Sdk = {
      ready: (callback) => callback(),
      getAuthCode: async () => ({})
    }

    await expect(requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1')).rejects.toThrow(
      'DingTalk returned an empty authorization code.'
    )
  })

  it('rejects when the DingTalk SDK never becomes ready', async () => {
    const sdk: DingTalkH5Sdk = {
      ready: () => undefined,
      requestAuthCode: async () => ({ code: 'unreachable' })
    }

    await expect(requestDingTalkAuthorizationCode(sdk, 'client-id-1', 'corp-1', 5)).rejects.toThrow(
      'Timed out waiting for DingTalk JSAPI to become ready.'
    )
  })
})

describe('DingTalkH5Service', () => {
  let originalSdk: unknown

  beforeEach(() => {
    originalSdk = Reflect.get(globalThis, 'dd')
    Reflect.deleteProperty(globalThis, 'dd')
  })

  afterEach(() => {
    if (originalSdk === undefined) {
      Reflect.deleteProperty(globalThis, 'dd')
    } else {
      Reflect.set(globalThis, 'dd', originalSdk)
    }
    TestBed.resetTestingModule()
  })

  it('loads the SDK from the module default export when no global SDK is registered', async () => {
    const requestAuthCode = jest.fn(async () => ({ code: 'auth-code-from-module' }))
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DINGTALK_H5_SDK_LOADER,
          useValue: async () => ({
            default: {
              ready: (callback: () => void) => callback(),
              requestAuthCode
            }
          })
        }
      ]
    })

    const service = TestBed.inject(DingTalkH5Service)

    await expect(service.requestAuthorizationCode('client-id-1', 'corp-1')).resolves.toBe('auth-code-from-module')
    expect(requestAuthCode).toHaveBeenCalledWith({ clientId: 'client-id-1', corpId: 'corp-1' })
  })

  it('retries the module import after a transient failure', async () => {
    const sdkLoader = jest
      .fn<Promise<unknown>, []>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue({
        default: {
          ready: (callback: () => void) => callback(),
          requestAuthCode: async () => ({ code: 'auth-code-after-retry' })
        }
      })
    TestBed.configureTestingModule({
      providers: [{ provide: DINGTALK_H5_SDK_LOADER, useValue: sdkLoader }]
    })
    const service = TestBed.inject(DingTalkH5Service)

    await expect(service.requestAuthorizationCode('client-id-1', 'corp-1')).rejects.toThrow(
      'Failed to load DingTalk JSAPI module.'
    )
    await expect(service.requestAuthorizationCode('client-id-1', 'corp-1')).resolves.toBe('auth-code-after-retry')
    expect(sdkLoader).toHaveBeenCalledTimes(2)
  })
})
