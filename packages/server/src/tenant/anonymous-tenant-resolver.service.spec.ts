jest.mock('@xpert-ai/contracts', () => ({
  DEFAULT_TENANT: 'default'
}))

jest.mock('./tenant.entity', () => ({
  Tenant: class Tenant {}
}))

jest.mock('./tenant.service', () => ({
  TenantService: class TenantService {}
}))

import { AnonymousTenantResolverService } from './anonymous-tenant-resolver.service'

describe('AnonymousTenantResolverService', () => {
  const tenantService = {
    findOneOrFailByOptions: jest.fn()
  }

  let service: AnonymousTenantResolverService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new AnonymousTenantResolverService(tenantService as any)
  })

  it('falls back to the default tenant when the candidate tenant is missing', async () => {
    tenantService.findOneOrFailByOptions.mockImplementation(async ({ where }: any) => {
      if (where.subdomain === 'missing') {
        return { success: false }
      }

      return {
        success: true,
        record: {
          id: 'tenant-default',
          name: 'default',
          settings: [],
          organizations: [
            { id: 'org-default', isDefault: true, isActive: true, createdAt: '2024-01-01T00:00:00.000Z' }
          ]
        }
      }
    })

    await expect(service.resolve({ 'tenant-domain': 'missing' } as any)).resolves.toMatchObject({
      tenantId: 'tenant-default',
      tenantName: 'default',
      organizationId: 'org-default',
      fallbackApplied: true
    })
  })

  it('matches tenants strictly by subdomain before choosing an organization', async () => {
    tenantService.findOneOrFailByOptions.mockImplementation(async ({ where }: any) => {
      if (where.subdomain === 'dtt-saa') {
        return {
          success: true,
          record: {
            id: 'tenant-2',
            name: 'dtt saa',
            subdomain: 'dtt-saa',
            settings: [],
            organizations: [
              { id: 'org-subdomain', isDefault: true, isActive: true, createdAt: '2024-04-01T00:00:00.000Z' }
            ]
          }
        }
      }

      return { success: false }
    })

    await expect(service.resolve({ 'tenant-domain': 'dtt-saa' } as any)).resolves.toMatchObject({
      tenantId: 'tenant-2',
      tenantName: 'dtt saa',
      organizationId: 'org-subdomain',
      fallbackApplied: false
    })
  })

  it('prefers the active default organization and otherwise falls back to the earliest active organization', async () => {
    tenantService.findOneOrFailByOptions.mockResolvedValue({
      success: true,
      record: {
        id: 'tenant-1',
        name: 'tenant-1',
        subdomain: 'tenant-1',
        settings: [],
        organizations: [
          { id: 'org-2', isDefault: false, isActive: true, createdAt: '2024-02-01T00:00:00.000Z' },
          { id: 'org-1', isDefault: true, isActive: true, createdAt: '2024-03-01T00:00:00.000Z' }
        ]
      }
    })

    await expect(service.resolve({ 'tenant-domain': 'tenant-1' } as any)).resolves.toMatchObject({
      organizationId: 'org-1',
      fallbackApplied: false
    })
  })
})
