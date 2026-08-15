import {
  ModelProviderHttpClient,
  ModelProviderHttpError,
  type ModelProviderHttpResponse
} from './model-provider-http-client'

class TestProviderHttpClient extends ModelProviderHttpClient {
  constructor(fetchImpl: typeof fetch, requestTimeoutMs?: number) {
    super({
      provider: 'TestProvider',
      baseUrl: 'https://provider.test/v1/',
      defaultHeaders: { Authorization: 'Bearer test-key' },
      fetchImpl,
      requestTimeoutMs
    })
  }

  getValue(path: string) {
    return this.requestJson(path, { method: 'GET' }, (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid test response')
      }
      const result = Reflect.get(value, 'value')
      if (typeof result !== 'number') throw new Error('Invalid test value')
      return result
    })
  }

  read(response: ModelProviderHttpResponse, maxBytes: number) {
    return this.readBufferResponse(response, {
      maxBytes,
      maxBytesError: 'Too large'
    })
  }
}

describe('ModelProviderHttpClient', () => {
  it('applies the base URL and default headers to JSON requests', async () => {
    let requestUrl = ''
    let requestHeaders: HeadersInit | undefined
    const fetchImpl: typeof fetch = async (input, init) => {
      requestUrl = String(input)
      requestHeaders = init?.headers
      return new Response(JSON.stringify({ value: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    await expect(new TestProviderHttpClient(fetchImpl).getValue('/jobs')).resolves.toBe(7)

    expect(requestUrl).toBe('https://provider.test/v1/jobs')
    expect(new Headers(requestHeaders).get('authorization')).toBe('Bearer test-key')
  })

  it('converts request timeouts to a Provider-specific error', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })

    await expect(new TestProviderHttpClient(fetchImpl, 1).getValue('/jobs')).rejects.toThrow(
      'TestProvider request timed out after 1ms'
    )
  })

  it('preserves the HTTP status for submission outcome classification', async () => {
    const fetchImpl: typeof fetch = async () => new Response('invalid request', { status: 400 })

    await expect(new TestProviderHttpClient(fetchImpl).getValue('/jobs')).rejects.toEqual(
      expect.objectContaining<ModelProviderHttpError>({ status: 400 })
    )
  })

  it('enforces the configured buffer limit before reading the body', async () => {
    const client = new TestProviderHttpClient(fetch)
    const response = new Response('four', {
      headers: { 'content-length': '4', 'content-type': 'video/mp4' }
    })

    await expect(client.read(response, 3)).rejects.toThrow('Too large')
  })
})
