import { ForbiddenException } from '@nestjs/common'

jest.mock('@metad/contracts', () => ({
  AssistantCode: {
    CHAT_COMMON: 'chat_common',
    XPERT_SHARED: 'xpert_shared',
    CHATBI: 'chatbi'
  },
  AssistantConfigScope: {
    TENANT: 'tenant',
    ORGANIZATION: 'organization'
  },
  AssistantConfigSourceScope: {
    NONE: 'none',
    TENANT: 'tenant',
    ORGANIZATION: 'organization'
  },
  RolesEnum: {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN'
  },
  XpertTypeEnum: {
    Agent: 'Agent'
  }
}))

jest.mock('@metad/server-core', () => ({
  RequestContext: {
    currentTenantId: jest.fn(),
    getOrganizationId: jest.fn(),
    getScope: jest.fn(),
    currentUserId: jest.fn(),
    hasRole: jest.fn(),
    hasRoles: jest.fn(),
    isTenantScope: jest.fn(),
    requireOrganizationScope: jest.fn()
  },
  TenantOrganizationBaseEntity: class {},
  TenantOrganizationAwareCrudService: class {
    protected repository

    constructor(repository: unknown) {
      this.repository = repository
    }
  }
}))

jest.mock('../xpert/xpert.entity', () => ({
  Xpert: class {}
}))

import { RequestContext } from '@metad/server-core'
import {
  AssistantCode,
  AssistantConfigScope,
  AssistantConfigSourceScope,
  RolesEnum
} from '@metad/contracts'
import { AssistantConfigService } from './assistant-config.service'

describe('AssistantConfigService', () => {
  let repository: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    delete: jest.Mock
  }
  let xpertRepository: {
    find: jest.Mock
    findOne: jest.Mock
  }
  let service: AssistantConfigService

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
      delete: jest.fn()
    }
    xpertRepository = {
      find: jest.fn(),
      findOne: jest.fn()
    }

    service = new AssistantConfigService(repository as any, xpertRepository as any)

    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
    ;(RequestContext.getScope as jest.Mock).mockReturnValue({
      tenantId: 'tenant-1',
      level: 'organization',
      organizationId: 'org-1'
    })
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
    ;(RequestContext.hasRole as jest.Mock).mockImplementation((role) => role === RolesEnum.SUPER_ADMIN)
    ;(RequestContext.hasRoles as jest.Mock).mockReturnValue(true)
    ;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(false)
    ;(RequestContext.requireOrganizationScope as jest.Mock).mockReturnValue('org-1')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('prefers organization overrides over tenant defaults', async () => {
    repository.findOne.mockResolvedValueOnce({
      code: AssistantCode.CHATBI,
      enabled: true,
      options: {
        assistantId: 'org-assistant',
        frameUrl: 'https://frame.example.com'
      },
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })

    const result = await service.getEffectiveConfig(AssistantCode.CHATBI)

    expect(result.sourceScope).toBe(AssistantConfigSourceScope.ORGANIZATION)
    expect(result.options?.assistantId).toBe('org-assistant')
    expect(repository.findOne).toHaveBeenCalledTimes(1)
  })

  it('falls back to the tenant default when no organization override exists', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        code: AssistantCode.XPERT_SHARED,
        enabled: true,
        options: {
          assistantId: 'tenant-assistant',
          frameUrl: 'https://frame.example.com'
        },
        tenantId: 'tenant-1',
        organizationId: null
      })

    const result = await service.getEffectiveConfig(AssistantCode.XPERT_SHARED)

    expect(result.sourceScope).toBe(AssistantConfigSourceScope.TENANT)
    expect(result.options?.assistantId).toBe('tenant-assistant')
    expect(repository.findOne).toHaveBeenCalledTimes(2)
  })

  it('returns a disabled none-source config when nothing is saved', async () => {
    repository.findOne.mockResolvedValue(null)

    const result = await service.getEffectiveConfig(AssistantCode.CHAT_COMMON)

    expect(result).toEqual({
      code: AssistantCode.CHAT_COMMON,
      enabled: false,
      options: null,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      sourceScope: AssistantConfigSourceScope.NONE
    })
  })

  it('returns an empty list for organization scope when no organization is selected', async () => {
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

    const result = await service.getScopedConfigs(AssistantConfigScope.ORGANIZATION)

    expect(result).toEqual([])
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('rejects tenant-level writes for non-super-admin users', async () => {
    ;(RequestContext.hasRole as jest.Mock).mockReturnValue(false)

    await expect(
      service.upsertConfig({
        code: AssistantCode.CHATBI,
        scope: AssistantConfigScope.TENANT,
        enabled: true,
        options: {
          assistantId: 'tenant-assistant',
          frameUrl: 'https://frame.example.com'
        }
      })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('returns tenant-only xperts for tenant assistant selection', async () => {
    xpertRepository.find.mockResolvedValue([{ id: 'tenant-xpert' }])

    const result = await service.getAvailableXperts(AssistantConfigScope.TENANT)

    expect(result).toEqual([{ id: 'tenant-xpert' }])
    expect(xpertRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          latest: true
        })
      })
    )
  })

  it('allows tenant and current-organization xperts for organization overrides', async () => {
    xpertRepository.findOne.mockResolvedValue({ id: 'tenant-xpert' })

    await expect(
      service.upsertConfig({
        code: AssistantCode.CHATBI,
        scope: AssistantConfigScope.ORGANIZATION,
        enabled: true,
        options: {
          assistantId: 'tenant-xpert',
          frameUrl: 'https://frame.example.com'
        }
      })
    ).resolves.toBeDefined()

    expect(xpertRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          expect.objectContaining({ id: 'tenant-xpert' }),
          expect.objectContaining({ id: 'tenant-xpert', organizationId: 'org-1' })
        ]
      })
    )
  })

  it('rejects xperts outside the allowed scope when saving assistant config', async () => {
    xpertRepository.findOne.mockResolvedValue(null)

    await expect(
      service.upsertConfig({
        code: AssistantCode.CHATBI,
        scope: AssistantConfigScope.ORGANIZATION,
        enabled: true,
        options: {
          assistantId: 'foreign-org-xpert',
          frameUrl: 'https://frame.example.com'
        }
      })
    ).rejects.toThrow('Selected assistant Xpert is not available in this configuration scope.')
  })
})
