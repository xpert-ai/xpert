jest.mock('@xpert-ai/contracts', () => ({
  DEFAULT_TENANT: 'default'
}))

jest.mock('../../tenant/tenant.entity', () => ({
  Tenant: class Tenant {}
}))

jest.mock('../../tenant/tenant.service', () => ({
  TenantService: class TenantService {}
}))

import {
  ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY,
  AnonymousTenantResolution
} from '../../tenant/anonymous-tenant-resolver.service'
import { AnonymousTenantContextMiddleware } from './anonymous-tenant-context.middleware'

describe('AnonymousTenantContextMiddleware', () => {
  const resolution: AnonymousTenantResolution = {
    tenant: null,
    tenantId: 'tenant-1',
    tenantName: 'tenant',
    organizationId: 'org-1',
    fallbackApplied: false
  }
  const resolver = {
    resolve: jest.fn().mockResolvedValue(resolution)
  }

  let middleware: AnonymousTenantContextMiddleware

  beforeEach(() => {
    jest.clearAllMocks()
    middleware = new AnonymousTenantContextMiddleware(resolver as any)
  })

  it('injects tenant headers for supported anonymous login routes', async () => {
    const request = {
      method: 'GET',
      originalUrl: '/api/lark-identity/login/start',
      headers: {}
    } as any
    const next = jest.fn()

    await middleware.use(request, {} as any, next)

    expect(resolver.resolve).toHaveBeenCalledWith(request)
    expect(request.headers['tenant-id']).toBe('tenant-1')
    expect(request.headers['organization-id']).toBe('org-1')
    expect(request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY]).toEqual(resolution)
    expect(next).toHaveBeenCalledWith()
  })

  it('does not resolve tenant context for unrelated routes', async () => {
    const request = {
      method: 'GET',
      originalUrl: '/api/auth/login',
      headers: {}
    } as any
    const next = jest.fn()

    await middleware.use(request, {} as any, next)

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(request.headers['tenant-id']).toBeUndefined()
    expect(next).toHaveBeenCalledWith()
  })
})
