export type ModelProviderHttpClientOptions = {
  provider: string
  baseUrl: string
  defaultHeaders?: Readonly<Record<string, string>>
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
}

export type ModelProviderBufferOptions = {
  maxBytes?: number
  maxBytesError?: string
  defaultMimeType?: string
}

export type ModelProviderHttpResponse = {
  ok: boolean
  status: number
  statusText: string
  headers: {
    get(name: string): string | null
  }
  text(): Promise<string>
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}

export class ModelProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ModelProviderHttpError'
  }
}

/**
 * Shared HTTP transport for model Provider adapters.
 *
 * Provider-specific authentication headers are supplied at construction time;
 * response parsing, task semantics, and download URL policy stay in each adapter.
 */
export abstract class ModelProviderHttpClient {
  protected readonly baseUrl: string
  private readonly provider: string
  private readonly defaultHeaders: Readonly<Record<string, string>>
  private readonly fetchImpl: typeof fetch
  private readonly requestTimeoutMs?: number

  protected constructor(options: ModelProviderHttpClientOptions) {
    this.provider = options.provider
    this.baseUrl = options.baseUrl.replace(/\/$/u, '')
    this.defaultHeaders = options.defaultHeaders ?? {}
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestTimeoutMs = options.requestTimeoutMs
  }

  protected async requestJson<T>(pathOrUrl: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
    const response = await this.fetchResponse(
      this.resolveRequestUrl(pathOrUrl),
      {
        ...init,
        headers: this.mergeHeaders(init.headers)
      },
      this.requestTimeoutMs
    )
    if (!response.ok) {
      throw await this.createHttpError(response)
    }
    return parse(await response.json())
  }

  protected async fetchResponse(
    input: string | URL,
    init: RequestInit = {},
    timeoutMs?: number
  ): Promise<ModelProviderHttpResponse> {
    if (!timeoutMs) {
      return this.fetchImpl(input, init)
    }

    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort(init.signal?.reason)
    if (init.signal?.aborted) {
      abortFromCaller()
    } else {
      init.signal?.addEventListener('abort', abortFromCaller, { once: true })
    }
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal })
    } catch (error) {
      if (timedOut) {
        throw this.createTimeoutError(timeoutMs)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      init.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  protected async readBufferResponse(
    response: ModelProviderHttpResponse,
    options: ModelProviderBufferOptions = {}
  ): Promise<{ buffer: Buffer; mimeType?: string }> {
    const contentLength = response.headers.get('content-length')
    const declaredBytes = contentLength && /^\d+$/u.test(contentLength) ? Number(contentLength) : undefined
    if (options.maxBytes && declaredBytes && declaredBytes > options.maxBytes) {
      throw new Error(options.maxBytesError ?? `${this.provider} result exceeds the download limit`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (options.maxBytes && buffer.length > options.maxBytes) {
      throw new Error(options.maxBytesError ?? `${this.provider} result exceeds the download limit`)
    }

    return {
      buffer,
      mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || options.defaultMimeType || undefined
    }
  }

  protected async createHttpError(response: ModelProviderHttpResponse): Promise<Error> {
    const text = await response.text().catch(() => '')
    return new ModelProviderHttpError(
      `${this.provider} API error ${response.status}: ${text || response.statusText}`,
      response.status
    )
  }

  protected createTimeoutError(timeoutMs: number): Error {
    return new Error(`${this.provider} request timed out after ${timeoutMs}ms`)
  }

  private resolveRequestUrl(pathOrUrl: string) {
    return /^https?:\/\//iu.test(pathOrUrl)
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
  }

  private mergeHeaders(headers?: HeadersInit) {
    const merged: Record<string, string> = { ...this.defaultHeaders }
    const headerNames = new Map(Object.keys(merged).map((key) => [key.toLowerCase(), key]))
    new Headers(headers).forEach((value, key) => {
      const targetKey = headerNames.get(key) ?? key
      merged[targetKey] = value
    })
    return merged
  }
}
