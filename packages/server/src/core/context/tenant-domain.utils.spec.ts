import { IncomingHttpHeaders } from 'http'
import { resolveRequestHost, resolveRequestHostname, resolveTenantDomainFromRequest } from './tenant-domain.utils'

function requestWithHeaders(headers: IncomingHttpHeaders) {
  return { headers }
}

describe('tenant-domain utils', () => {
  it('prefers x-forwarded-host over host and origin', () => {
    const request = requestWithHeaders({
      'x-forwarded-host': 'tenant-forwarded.app.example.com:443',
      host: 'tenant-host.app.example.com:3000',
      origin: 'https://tenant-origin.app.example.com'
    })

    expect(resolveRequestHost(request)).toBe('tenant-forwarded.app.example.com:443')
    expect(resolveRequestHostname(request)).toBe('tenant-forwarded.app.example.com')
    expect(resolveTenantDomainFromRequest(request)).toBe('tenant-forwarded')
  })

  it('falls back to host then origin and ignores localhost-style values', () => {
    const hostOnlyRequest = requestWithHeaders({
      host: 'tenant-host.app.example.com:3000'
    })
    const originOnlyRequest = requestWithHeaders({
      origin: 'https://tenant-origin.app.example.com'
    })
    const localhostRequest = requestWithHeaders({
      host: 'localhost:4200'
    })

    expect(resolveTenantDomainFromRequest(hostOnlyRequest)).toBe('tenant-host')
    expect(resolveTenantDomainFromRequest(originOnlyRequest)).toBe('tenant-origin')
    expect(resolveTenantDomainFromRequest(localhostRequest)).toBeNull()
  })

  it('only resolves tenant domains from hostnames above the base service domain level', () => {
    expect(resolveTenantDomainFromRequest(requestWithHeaders({ host: 'foo.xpertai.cn' }))).toBeNull()
    expect(resolveTenantDomainFromRequest(requestWithHeaders({ host: 'app.xpertai.cn' }))).toBeNull()
    expect(resolveTenantDomainFromRequest(requestWithHeaders({ host: 'api.xpertai.cn' }))).toBeNull()
    expect(resolveTenantDomainFromRequest(requestWithHeaders({ host: 'shenzhen.app.xpertai.cn' }))).toBe('shenzhen')
    expect(resolveTenantDomainFromRequest(requestWithHeaders({ host: 'shenzhen.api.xpertai.cn' }))).toBe('shenzhen')
  })
})
