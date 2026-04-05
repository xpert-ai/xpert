import {
  BadRequestException,
  ForbiddenException
} from '@nestjs/common'

jest.mock('@metad/contracts', () => ({
  AssistantCode: {
    CHAT_COMMON: 'chat_common',
    XPERT_SHARED: 'xpert_shared',
    CHATBI: 'chatbi',
    CLAWXPERT: 'clawxpert'
  },
  AssistantBindingScope: {
    TENANT: 'tenant',
    ORGANIZATION: 'organization',
    USER: 'user'
  },
  AssistantBindingSourceScope: {
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
  },
  isSystemManagedAssistant: (code: string) => code !== 'clawxpert',
  isUserManagedAssistant: (code: string) => code === 'clawxpert'
}))

jest.mock('@metad/server-core', () => ({
  RequestContext: {
    currentTenantId: jest.fn(),
    getOrganizationId: jest.fn(),
    currentUserId: jest.fn(),
    hasRole: jest.fn(),
    hasRoles: jest.fn(),
    requireOrganizationScope: jest.fn()
  },
  TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
  TenantOrganizationAwareCrudService: class {
    protected repository

    constructor(repository: unknown) {
      this.repository = repository
    }
  },
  User: class User {}
}))

jest.mock('../xpert', () => ({
  PublishedXpertAccessService: class PublishedXpertAccessService {}
}))

jest.mock('../xpert/xpert.entity', () => ({
  Xpert: class Xpert {}
}))

import {
  AssistantBindingScope,
  AssistantBindingSourceScope,
  AssistantCode,
  RolesEnum
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { AssistantBindingService } from './assistant-binding.service'

describe('AssistantBindingService', () => {
  let repository: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    delete: jest.Mock
  }
  let preferenceRepository: {
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
  }
  let xpertRepository: {
    find: jest.Mock
    findOne: jest.Mock
  }
  let dataSource: {
    query: jest.Mock
  }
  let publishedXpertAccessService: {
    findAccessiblePublishedXperts: jest.Mock
    getAccessiblePublishedXpert: jest.Mock
  }
  let service: AssistantBindingService

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
      delete: jest.fn()
    }
    preferenceRepository = {
      findOne: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input)
    }
    xpertRepository = {
      find: jest.fn(),
      findOne: jest.fn()
    }
    dataSource = {
      query: jest.fn(async () => [{ name: null }])
    }
    publishedXpertAccessService = {
      findAccessiblePublishedXperts: jest.fn(),
      getAccessiblePublishedXpert: jest.fn()
    }

    service = new AssistantBindingService(
      repository as any,
      preferenceRepository as any,
      xpertRepository as any,
      dataSource as any,
      publishedXpertAccessService as any
    )

    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
    ;(RequestContext.hasRole as jest.Mock).mockImplementation((role) => role === RolesEnum.SUPER_ADMIN)
    ;(RequestContext.hasRoles as jest.Mock).mockReturnValue(true)
    ;(RequestContext.requireOrganizationScope as jest.Mock).mockReturnValue('org-1')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('prefers organization bindings over tenant bindings for effective system assistants', async () => {
    repository.findOne
      .mockResolvedValueOnce({
        code: AssistantCode.CHATBI,
        scope: AssistantBindingScope.ORGANIZATION,
        assistantId: 'org-assistant',
        enabled: true,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: null
      })

    const result = await service.getEffectiveBinding(AssistantCode.CHATBI)

    expect(result.sourceScope).toBe(AssistantBindingSourceScope.ORGANIZATION)
    expect(result.assistantId).toBe('org-assistant')
  })

  it('falls back to tenant bindings when no organization binding exists', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        code: AssistantCode.XPERT_SHARED,
        scope: AssistantBindingScope.TENANT,
        assistantId: 'tenant-assistant',
        enabled: true,
        tenantId: 'tenant-1',
        organizationId: null,
        userId: null
      })

    const result = await service.getEffectiveBinding(AssistantCode.XPERT_SHARED)

    expect(result.sourceScope).toBe(AssistantBindingSourceScope.TENANT)
    expect(result.assistantId).toBe('tenant-assistant')
  })

  it('returns a none-source binding when no system binding is saved', async () => {
    repository.findOne.mockResolvedValue(null)

    const result = await service.getEffectiveBinding(AssistantCode.CHAT_COMMON)

    expect(result).toEqual(
      expect.objectContaining({
        code: AssistantCode.CHAT_COMMON,
        assistantId: null,
        enabled: false,
        sourceScope: AssistantBindingSourceScope.NONE
      })
    )
  })

  it('recognizes an organization effective system assistant id', async () => {
    repository.findOne.mockResolvedValueOnce({
      code: AssistantCode.CHAT_COMMON,
      scope: AssistantBindingScope.ORGANIZATION,
      assistantId: 'org-assistant',
      enabled: true,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: null
    })

    await expect(service.isEffectiveSystemAssistantId('org-assistant')).resolves.toBe(true)
  })

  it('recognizes a tenant fallback system assistant id when no organization binding exists', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        code: AssistantCode.CHAT_COMMON,
        scope: AssistantBindingScope.TENANT,
        assistantId: 'tenant-assistant',
        enabled: true,
        tenantId: 'tenant-1',
        organizationId: null,
        userId: null
      })

    await expect(service.isEffectiveSystemAssistantId('tenant-assistant')).resolves.toBe(true)
  })

  it('returns false when the assistant id is not an effective system assistant', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(service.isEffectiveSystemAssistantId('missing-assistant')).resolves.toBe(false)
  })

  it('lists system bindings for an explicit organization scope', async () => {
    repository.find.mockResolvedValue([{ code: AssistantCode.CHATBI }])

    const result = await service.getScopedBindings(AssistantBindingScope.ORGANIZATION)

    expect(result).toEqual([{ code: AssistantCode.CHATBI }])
    expect(repository.find).toHaveBeenCalled()
  })

  it('rejects tenant writes for non-super-admin users', async () => {
    ;(RequestContext.hasRole as jest.Mock).mockReturnValue(false)

    await expect(
      service.upsertBinding({
        code: AssistantCode.CHATBI,
        scope: AssistantBindingScope.TENANT,
        enabled: true,
        assistantId: 'tenant-assistant'
      })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('returns accessible published xperts for user bindings', async () => {
    publishedXpertAccessService.findAccessiblePublishedXperts.mockResolvedValue([{ id: 'xpert-1' }])

    const result = await service.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)

    expect(result).toEqual([{ id: 'xpert-1' }])
  })

  it('saves a user binding for clawxpert', async () => {
    repository.findOne.mockResolvedValue(null)
    publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValue({
      id: 'xpert-1',
      type: 'Agent',
      latest: true
    })

    const result = await service.upsertBinding({
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER,
      assistantId: 'xpert-1'
    })

    expect(result).toEqual(
      expect.objectContaining({
        code: AssistantCode.CLAWXPERT,
        scope: AssistantBindingScope.USER,
        assistantId: 'xpert-1',
        userId: 'user-1'
      })
    )
  })

  it('rejects inaccessible xperts for user bindings', async () => {
    publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValue({
      id: 'xpert-1',
      type: 'Workflow',
      latest: true
    })

    await expect(
      service.upsertBinding({
        code: AssistantCode.CLAWXPERT,
        scope: AssistantBindingScope.USER,
        assistantId: 'xpert-1'
      })
    ).rejects.toThrow('Selected assistant Xpert is not available.')
  })

  it('rejects user scope for system assistants', async () => {
    await expect(service.getBinding(AssistantCode.CHATBI, AssistantBindingScope.USER)).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('reads user markdown preferences for a bound clawxpert assistant', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'binding-1',
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER
    })
    preferenceRepository.findOne.mockResolvedValueOnce({
      assistantBindingId: 'binding-1',
      soul: '# Rules',
      profile: '# Profile',
      toolPreferences: {
        version: 1,
        toolsets: {
          'toolset-node': {
            toolsetId: 'toolset-1',
            toolsetName: 'Search',
            disabledTools: ['tavily_search']
          }
        }
      }
    })

    const result = await service.getBindingPreference(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)

    expect(result).toEqual(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1,
          toolsets: {
            'toolset-node': {
              toolsetId: 'toolset-1',
              toolsetName: 'Search',
              disabledTools: ['tavily_search']
            }
          }
        }
      })
    )
    expect(preferenceRepository.findOne).toHaveBeenCalled()
  })

  it('reads user markdown preferences by assistant id for the current clawxpert binding', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'binding-1',
      assistantId: 'xpert-1',
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER
    })
    preferenceRepository.findOne.mockResolvedValueOnce({
      assistantBindingId: 'binding-1',
      soul: '# Rules',
      profile: '# Profile',
      toolPreferences: {
        version: 1,
        middlewares: {
          'middleware-node': {
            provider: 'scheduler',
            disabledTools: ['delete_scheduler']
          }
        }
      }
    })

    const result = await service.getUserPreferenceByAssistantId('xpert-1')

    expect(repository.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        assistantId: 'xpert-1',
        code: AssistantCode.CLAWXPERT,
        scope: AssistantBindingScope.USER,
        userId: 'user-1'
      })
    })
    expect(result).toEqual(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1,
          middlewares: {
            'middleware-node': {
              provider: 'scheduler',
              disabledTools: ['delete_scheduler']
            }
          }
        }
      })
    )
  })

  it('upserts user markdown preferences for a bound clawxpert assistant', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'binding-1',
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER
    })
    preferenceRepository.findOne.mockResolvedValueOnce(null)

    const result = await service.upsertBindingPreference(AssistantCode.CLAWXPERT, {
      scope: AssistantBindingScope.USER,
      soul: '# Rules',
      profile: '# Profile',
      toolPreferences: {
        version: 1,
        toolsets: {
          'toolset-node': {
            toolsetId: 'toolset-1',
            toolsetName: 'Search',
            disabledTools: ['tavily_search']
          }
        }
      }
    })

    expect(result).toEqual(
      expect.objectContaining({
        assistantBindingId: 'binding-1',
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1,
          toolsets: {
            'toolset-node': {
              toolsetId: 'toolset-1',
              toolsetName: 'Search',
              disabledTools: ['tavily_search']
            }
          }
        },
        userId: 'user-1'
      })
    )
    expect(preferenceRepository.save).toHaveBeenCalled()
  })

  it('merges partial user preferences without clearing omitted fields', async () => {
    const existingPreference = {
      assistantBindingId: 'binding-1',
      soul: '# Rules',
      profile: '# Profile',
      toolPreferences: {
        version: 1,
        toolsets: {
          'toolset-node': {
            toolsetId: 'toolset-1',
            toolsetName: 'Search',
            disabledTools: ['tavily_search']
          }
        }
      },
      updatedBy: null
    }

    repository.findOne.mockResolvedValueOnce({
      id: 'binding-1',
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER
    })
    preferenceRepository.findOne.mockResolvedValueOnce(existingPreference)

    const result = await service.upsertBindingPreference(AssistantCode.CLAWXPERT, {
      scope: AssistantBindingScope.USER,
      toolPreferences: {
        version: 1,
        middlewares: {
          'middleware-node': {
            provider: 'scheduler',
            disabledTools: ['delete_scheduler']
          }
        }
      }
    })

    expect(result).toEqual(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1,
          middlewares: {
            'middleware-node': {
              provider: 'scheduler',
              disabledTools: ['delete_scheduler']
            }
          }
        }
      })
    )
    expect(preferenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1,
          middlewares: {
            'middleware-node': {
              provider: 'scheduler',
              disabledTools: ['delete_scheduler']
            }
          }
        }
      })
    )
  })
})
