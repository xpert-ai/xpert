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
  type MiddlewareRequest = Parameters<AnonymousTenantContextMiddleware['use']>[0]
  type MiddlewareResponse = Parameters<AnonymousTenantContextMiddleware['use']>[1]

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
    middleware = new AnonymousTenantContextMiddleware(
      resolver as unknown as ConstructorParameters<typeof AnonymousTenantContextMiddleware>[0]
    )
  })

  it('injects tenant headers for supported anonymous login routes', async () => {
    const request = {
      method: 'GET',
      originalUrl: '/api/lark-identity/login/start',
      headers: {}
    } as MiddlewareRequest
    const next = jest.fn()

    await middleware.use(request, {} as MiddlewareResponse, next)

    expect(resolver.resolve).toHaveBeenCalledWith(request)
    expect(request.headers['tenant-id']).toBe('tenant-1')
    expect(request.headers['organization-id']).toBe('org-1')
    expect(request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY]).toEqual(resolution)
    expect(next).toHaveBeenCalledWith()
  })

  it('injects only tenant headers for password login requests', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      headers: {}
    } as MiddlewareRequest
    const next = jest.fn()

    await middleware.use(request, {} as MiddlewareResponse, next)

    expect(resolver.resolve).toHaveBeenCalledWith(request)
    expect(request.headers['tenant-id']).toBe('tenant-1')
    expect(request.headers['organization-id']).toBeUndefined()
    expect(request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY]).toEqual(resolution)
    expect(next).toHaveBeenCalledWith()
  })

  it('injects fallback tenant headers for password login requests', async () => {
    const fallbackResolution = {
      ...resolution,
      fallbackApplied: true
    }
    resolver.resolve.mockResolvedValueOnce(fallbackResolution)
    const request = {
      method: 'POST',
      originalUrl: '/api/auth/login',
      headers: {}
    } as MiddlewareRequest
    const next = jest.fn()

    await middleware.use(request, {} as MiddlewareResponse, next)

    expect(resolver.resolve).toHaveBeenCalledWith(request)
    expect(request.headers['tenant-id']).toBe('tenant-1')
    expect(request.headers['organization-id']).toBeUndefined()
    expect(request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY]).toEqual(fallbackResolution)
    expect(next).toHaveBeenCalledWith()
  })

  it('does not resolve tenant context for unrelated routes', async () => {
    const request = {
      method: 'GET',
      originalUrl: '/api/auth/login',
      headers: {}
    } as MiddlewareRequest
    const next = jest.fn()

    await middleware.use(request, {} as MiddlewareResponse, next)

    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(request.headers['tenant-id']).toBeUndefined()
    expect(next).toHaveBeenCalledWith()
  })
})
