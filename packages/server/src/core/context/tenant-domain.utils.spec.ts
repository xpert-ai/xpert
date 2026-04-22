import { resolveRequestHost, resolveRequestHostname, resolveTenantDomainFromRequest } from './tenant-domain.utils'

describe('tenant-domain utils', () => {
  it('prefers x-forwarded-host over host and origin', () => {
    const request = {
      headers: {
        'x-forwarded-host': 'tenant-forwarded.example.com:443',
        host: 'tenant-host.example.com:3000',
        origin: 'https://tenant-origin.example.com'
      }
    } as any

    expect(resolveRequestHost(request)).toBe('tenant-forwarded.example.com:443')
    expect(resolveRequestHostname(request)).toBe('tenant-forwarded.example.com')
    expect(resolveTenantDomainFromRequest(request)).toBe('tenant-forwarded')
  })

  it('falls back to host then origin and ignores localhost-style values', () => {
    const hostOnlyRequest = {
      headers: {
        host: 'tenant-host.example.com:3000'
      }
    } as any
    const originOnlyRequest = {
      headers: {
        origin: 'https://tenant-origin.example.com'
      }
    } as any
    const localhostRequest = {
      headers: {
        host: 'localhost:4200'
      }
    } as any

    expect(resolveTenantDomainFromRequest(hostOnlyRequest)).toBe('tenant-host')
    expect(resolveTenantDomainFromRequest(originOnlyRequest)).toBe('tenant-origin')
    expect(resolveTenantDomainFromRequest(localhostRequest)).toBeNull()
  })
})
