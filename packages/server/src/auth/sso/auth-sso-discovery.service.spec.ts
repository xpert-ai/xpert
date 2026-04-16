jest.mock('@xpert-ai/contracts', () => ({
  DEFAULT_TENANT: 'default'
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  SSOProviderRegistry: class SSOProviderRegistry {}
}))

jest.mock('../../tenant/tenant.entity', () => ({
  Tenant: class Tenant {}
}))

jest.mock('../../tenant/tenant.service', () => ({
  TenantService: class TenantService {}
}))

import { ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY } from '../../tenant/anonymous-tenant-resolver.service'
import { AuthSsoDiscoveryService } from './auth-sso-discovery.service'

describe('AuthSsoDiscoveryService', () => {
  const anonymousTenantResolver = {
    resolve: jest.fn()
  }
  const ssoProviderRegistry = {
    list: jest.fn()
  }

  let service: AuthSsoDiscoveryService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new AuthSsoDiscoveryService(anonymousTenantResolver as any, ssoProviderRegistry as any)
  })

  it('returns sorted provider descriptors for the resolved tenant scope', async () => {
    const larkStrategy = {
      describe: jest.fn().mockResolvedValue({
        provider: 'lark',
        displayName: 'Feishu',
        icon: '/assets/images/destinations/feishu.png',
        order: 100,
        startUrl: 'https://xpert.example.com/api/lark-identity/login/start'
      })
    }
    const githubStrategy = {
      describe: jest.fn().mockResolvedValue({
        provider: 'github',
        displayName: 'GitHub',
        icon: '/assets/images/destinations/github.png',
        order: 200,
        startUrl: 'https://xpert.example.com/api/github-identity/login/start'
      })
    }
    ssoProviderRegistry.list.mockReturnValue([githubStrategy, larkStrategy])

    const request = {
      protocol: 'https',
      headers: {
        host: 'xpert.example.com'
      },
      [ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY]: {
        tenant: null,
        tenantId: 'tenant-1',
        tenantName: 'tenant',
        organizationId: 'org-1',
        fallbackApplied: true
      }
    } as any

    await expect(service.discover(request)).resolves.toEqual({
      fallbackApplied: true,
      providers: [
        {
          provider: 'lark',
          displayName: 'Feishu',
          icon: '/assets/images/destinations/feishu.png',
          order: 100,
          startUrl: 'https://xpert.example.com/api/lark-identity/login/start'
        },
        {
          provider: 'github',
          displayName: 'GitHub',
          icon: '/assets/images/destinations/github.png',
          order: 200,
          startUrl: 'https://xpert.example.com/api/github-identity/login/start'
        }
      ]
    })

    expect(ssoProviderRegistry.list).toHaveBeenCalledWith('org-1')
    expect(larkStrategy.describe).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      requestBaseUrl: 'https://xpert.example.com'
    })
  })

  it('returns an empty provider list when no resolved tenant is available', async () => {
    anonymousTenantResolver.resolve.mockResolvedValue({
      tenant: null,
      tenantId: null,
      tenantName: null,
      organizationId: null,
      fallbackApplied: true
    })

    await expect(
      service.discover({
        protocol: 'https',
        headers: {
          host: 'xpert.example.com'
        }
      } as any)
    ).resolves.toEqual({
      fallbackApplied: true,
      providers: []
    })

    expect(ssoProviderRegistry.list).not.toHaveBeenCalled()
  })
})
