import { nativeModelTransport } from './native-model'

describe('native model transport', () => {
  it('uses one non-redirecting request with server credentials and preserves protocol headers', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response('{}'))
    const generate = nativeModelTransport({
      protocol: 'anthropic_messages',
      baseUrl: 'https://provider.test',
      authorization: 'supplier-key',
      fetch: fetcher
    })
    const signal = new AbortController().signal
    const body = {
      model: 'claude-test',
      messages: [{ role: 'user', content: 'test' }],
      thinking: { type: 'enabled', budget_tokens: 100 }
    }
    await generate(
      body,
      {
        authorization: 'untrusted-guest-token',
        'x-api-key': 'guest',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'future-beta',
        'anthropic-feature': 'preserve'
      },
      signal
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://provider.test/v1/messages')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBe(signal)
    expect(init.headers.get('x-api-key')).toBe('supplier-key')
    expect(init.headers.has('authorization')).toBe(false)
    expect(init.headers.get('anthropic-beta')).toBe('future-beta')
    expect(init.headers.get('anthropic-feature')).toBe('preserve')
    expect(JSON.parse(init.body)).toEqual(body)
  })
  it('does not silently retry an uncertain upstream failure', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('transport failed'))
    const generate = nativeModelTransport({
      protocol: 'openai_responses',
      baseUrl: 'https://provider.test/v1',
      authorization: 'Bearer server-key',
      fetch: fetcher
    })
    await expect(generate({ model: 'm', input: 'x' }, {}, new AbortController().signal)).rejects.toThrow(
      'transport failed'
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['https://user:pass@provider.test', 'file:///tmp/model', 'https://provider.test?key=secret'])(
    'rejects malformed upstream %s',
    (baseUrl) => {
      expect(() => nativeModelTransport({ protocol: 'openai_responses', baseUrl, authorization: 'secret' })).toThrow()
    }
  )
})
