import { normalizeApiBaseUrl, resolveAbsoluteApiBaseUrl, resolveAbsoluteApiUrl } from './url'

describe('normalizeApiBaseUrl', () => {
  it('treats same-origin sentinels as an empty API base URL', () => {
    expect(normalizeApiBaseUrl('same-origin')).toBe('')
    expect(normalizeApiBaseUrl('self')).toBe('')
    expect(normalizeApiBaseUrl('/')).toBe('')
  })

  it('keeps explicit API origins without a trailing slash', () => {
    expect(normalizeApiBaseUrl('https://api.xpertai.cn/')).toBe('https://api.xpertai.cn')
  })
})

describe('resolveAbsoluteApiBaseUrl', () => {
  it('resolves same-origin sentinels to the current browser origin', () => {
    expect(resolveAbsoluteApiBaseUrl('same-origin')).toBe(window.location.origin)
    expect(resolveAbsoluteApiBaseUrl('self')).toBe(window.location.origin)
    expect(resolveAbsoluteApiBaseUrl('/')).toBe(window.location.origin)
  })

  it('keeps explicit API origins without a trailing slash', () => {
    expect(resolveAbsoluteApiBaseUrl('https://api.xpertai.cn/')).toBe('https://api.xpertai.cn')
  })

  it('resolves protocol-relative API origins with the current browser protocol', () => {
    expect(resolveAbsoluteApiBaseUrl('//api.xpertai.cn/')).toBe(`${window.location.protocol}//api.xpertai.cn`)
  })
})

describe('resolveAbsoluteApiUrl', () => {
  it('resolves same-origin API paths to the current browser origin', () => {
    expect(resolveAbsoluteApiUrl('/api/ai/', 'same-origin')).toBe(`${window.location.origin}/api/ai/`)
  })

  it('appends API paths to explicit API origins', () => {
    expect(resolveAbsoluteApiUrl('/api/ai/', 'https://api.xpertai.cn/')).toBe('https://api.xpertai.cn/api/ai/')
  })
})
