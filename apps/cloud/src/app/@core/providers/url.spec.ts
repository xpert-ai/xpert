import { normalizeApiBaseUrl } from './url'

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
