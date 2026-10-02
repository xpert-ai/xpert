import type {
  ICopilotModel,
  ILLMUsage,
  LLMPriceContext,
  ModelExecutionProtocol,
  TTokenUsage
} from '@xpert-ai/contracts'

export type NativeModelProtocol = Extract<ModelExecutionProtocol, 'openai_responses' | 'anthropic_messages'>
export type NativeModelJson = null | boolean | number | string | NativeModelJson[] | { [key: string]: NativeModelJson }
export type NativeModelBody = { [key: string]: NativeModelJson }

/** Server-only capability. Provider credentials and configured upstream URLs never leave this closure. */
export interface NativeModelClient {
  readonly protocol: NativeModelProtocol
  generate(body: NativeModelBody, headers: Readonly<Record<string, string>>, signal: AbortSignal): Promise<Response>
  priceUsage(usage: TTokenUsage, context?: LLMPriceContext): ILLMUsage
}
export type NativeModelClientFactory = (
  protocol: NativeModelProtocol,
  model: ICopilotModel
) => Promise<NativeModelClient>

/** A single fetch is one billable attempt. No SDK retries or redirects to another credential origin. */
export function nativeModelTransport(input: {
  protocol: NativeModelProtocol
  baseUrl: string
  authorization: string
  fetch?: typeof fetch
}): NativeModelClient['generate'] {
  const base = new URL(input.baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
    throw new Error('Invalid native model endpoint')
  const suffix = input.protocol === 'openai_responses' ? '/responses' : '/v1/messages'
  const url = `${base.href.replace(/\/$/, '')}${suffix}`
  return (body, forwarded, signal) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (input.protocol === 'anthropic_messages') {
      headers.set('anthropic-version', '2023-06-01')
      for (const [name, value] of Object.entries(forwarded)) {
        // Native Anthropic feature/version headers must survive protocol evolution.
        if (/^anthropic-[a-z0-9-]+$/.test(name)) headers.set(name, value)
      }
      headers.set('x-api-key', input.authorization)
    } else headers.set('authorization', input.authorization)
    return (input.fetch ?? fetch)(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: 'error'
    })
  }
}
