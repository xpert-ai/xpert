import { normalizeApiBaseUrl, resolveAbsoluteApiBaseUrl, resolveAbsoluteApiUrl, resolveTenantApiBaseUrl } from './url'

describe('normalizeApiBaseUrl', () => {
  it('treats same-origin sentinels as an empty API base URL', () => {
    expect(normalizeApiBaseUrl('same-origin')).toBe('')
    expect(normalizeApiBaseUrl('self')).toBe('')
    expect(normalizeApiBaseUrl('/')).toBe('')
  })

  it('keeps explicit API origins without a trailing slash', () => {
    expect(normalizeApiBaseUrl('https://api.xpertai.cn/')).toBe('https://api.xpertai.cn')
  })

  it('resolves tenant API templates from tenant app hostnames', () => {
    expect(normalizeApiBaseUrl('https://{tenant}.api.xpertai.cn/', 'shenzhen.app.xpertai.cn')).toBe(
      'https://shenzhen.api.xpertai.cn'
    )
  })

  it('falls back to the base API domain for reserved app hostnames', () => {
    expect(normalizeApiBaseUrl('https://{tenant}.api.xpertai.cn/', 'app.xpertai.cn')).toBe('https://api.xpertai.cn')
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

describe('resolveTenantApiBaseUrl', () => {
  it('resolves tenant API templates from tenant app hostnames', () => {
    expect(resolveTenantApiBaseUrl('https://{tenant}.api.xpertai.cn', 'shenzhen.app.xpertai.cn')).toBe(
      'https://shenzhen.api.xpertai.cn'
    )
  })

  it('falls back to the base API domain when the hostname has no tenant label', () => {
    expect(resolveTenantApiBaseUrl('https://{tenant}.api.xpertai.cn', 'app.xpertai.cn')).toBe('https://api.xpertai.cn')
    expect(resolveTenantApiBaseUrl('https://{tenant}.api.xpertai.cn', 'localhost')).toBe('https://api.xpertai.cn')
  })

  it('falls back to the base API domain for non-tenant app hostnames', () => {
    expect(resolveTenantApiBaseUrl('https://{tenant}.api.xpertai.cn', 'staging.xpertai.cn')).toBe(
      'https://api.xpertai.cn'
    )
  })
})
