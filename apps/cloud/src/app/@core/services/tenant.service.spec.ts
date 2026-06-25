import { HttpClientTestingModule } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { resolveTenantFromHostname } from './tenant-hostname'
import { TenantService } from './tenant.service'

describe('TenantService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    })
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('falls back to localStorage tenant for IPv4 hosts', () => {
    expect(resolveTenantFromHostname('10.151.251.15')).toBeNull()
  })

  it('falls back to localStorage tenant for localhost', () => {
    expect(resolveTenantFromHostname('localhost')).toBeNull()
  })

  it('keeps tenant subdomain routing for hosted domains', () => {
    expect(resolveTenantFromHostname('shenzhen.app.xpertai.cn')).toBe('shenzhen')
  })

  it('ignores non-app hosted domains', () => {
    expect(resolveTenantFromHostname('shenzhen.api.xpertai.cn')).toBeNull()
  })

  it('uses localStorage when the current host does not resolve to a tenant subdomain', () => {
    localStorage.setItem('tenant', 'local')

    expect(TestBed.inject(TenantService).getTenant()).toBe('local')
  })
})
