jest.mock('../environment', () => ({
  EnvironmentService: class EnvironmentService {}
}))

jest.mock('../skill-repository', () => ({
  SkillRepositoryIndexService: class SkillRepositoryIndexService {},
  SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../xpert', () => ({
  XpertImportCommand: class XpertImportCommand {
    constructor(public readonly draft: unknown, public readonly options?: unknown) {}
  },
  XpertService: class XpertService {}
}))

jest.mock('../xpert-template/xpert-template.service', () => ({
  XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../xpert-workspace/workspace.service', () => ({
  XpertWorkspaceService: class XpertWorkspaceService {}
}))

import { ServerAIBootstrapService } from './bootstrap.service'

describe('ServerAIBootstrapService', () => {
  const defaultRepositories = JSON.stringify({
    repositories: [
      {
        name: 'anthropics/skills',
        provider: 'github',
        options: {
          url: 'https://github.com/anthropics/skills',
          branch: 'main'
        }
      }
    ]
  })

  function createService() {
    const commandBus = {
      execute: jest.fn()
    }
    const configService = {
      get: jest.fn((key: string) => (key === 'AI_DEFAULT_SKILL_REPOSITORIES' ? defaultRepositories : ''))
    }
    const organizationService = {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'org-1',
            tenantId: 'tenant-1',
            name: 'Acme'
          }
        ]
      }),
      findOne: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Acme'
      })
    }
    const userService = {
      getAdminUsers: jest.fn().mockResolvedValue([
        {
          id: 'owner-1',
          role: {
            name: 'SUPER_ADMIN'
          }
        }
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'owner-1',
        preferredLanguage: 'en_US'
      })
    }
    const userOrganizationService = {
      findUserIdsByOrganization: jest.fn().mockResolvedValue(['owner-1', 'member-2'])
    }
    const workspaceService = {
      create: jest.fn().mockResolvedValue({
        id: 'workspace-1',
        ownerId: 'owner-1'
      }),
      ensureMember: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      findOrganizationDefaultWorkspace: jest.fn().mockResolvedValue(null),
      findUserDefaultWorkspace: jest.fn(),
      update: jest.fn()
    }
    const environmentService = {
      create: jest.fn().mockResolvedValue({
        id: 'environment-1'
      }),
      getDefaultByWorkspace: jest.fn().mockResolvedValue(null)
    }
    const skillRepositoryService = {
      findAll: jest.fn().mockResolvedValue({
        items: []
      }),
      register: jest.fn().mockResolvedValue({
        id: 'repo-1'
      })
    }
    const skillRepositoryIndexService = {
      sync: jest.fn()
    }
    const xpertService = {
      repository: {
        createQueryBuilder: jest.fn()
      }
    }
    const xpertTemplateService = {
      getTemplateDetail: jest.fn()
    }

    const service = new ServerAIBootstrapService(
      configService as any,
      commandBus as any,
      organizationService as any,
      userService as any,
      userOrganizationService as any,
      workspaceService as any,
      environmentService as any,
      skillRepositoryService as any,
      skillRepositoryIndexService as any,
      xpertService as any,
      xpertTemplateService as any
    )

    jest.spyOn(service as any, 'runInOrganizationContext').mockImplementation(
      async (_user: unknown, _organizationId: string, callback: () => Promise<unknown>) => callback()
    )

    return {
      commandBus,
      configService,
      environmentService,
      organizationService,
      service,
      skillRepositoryIndexService,
      skillRepositoryService,
      userOrganizationService,
      userService,
      workspaceService,
      xpertService,
      xpertTemplateService
    }
  }

  it('keeps organization bootstrap focused on workspace and membership setup', async () => {
    const { environmentService, service, skillRepositoryService, workspaceService } = createService()

    const result = await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

    expect(skillRepositoryService.findAll).not.toHaveBeenCalled()
    expect(skillRepositoryService.register).not.toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'owner-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'member-2')
    expect(result).toEqual({
      repositoryIds: []
    })
  })

  it('registers default skill repositories from env JSON during tenant bootstrap', async () => {
    const { organizationService, service, skillRepositoryService, userService } = createService()

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(userService.getAdminUsers).toHaveBeenCalledWith('tenant-1')
    expect(organizationService.findAll).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1'
      }
    })
    expect(skillRepositoryService.findAll).toHaveBeenCalledWith({
      where: {
        name: 'anthropics/skills',
        provider: 'github'
      },
      take: 1
    })
    expect(skillRepositoryService.register).toHaveBeenCalledWith({
      name: 'anthropics/skills',
      provider: 'github',
      options: {
        url: 'https://github.com/anthropics/skills',
        branch: 'main'
      },
      credentials: null
    })
    expect(result).toEqual({
      repositories: [
        {
          organizationId: 'org-1',
          repositoryId: 'repo-1'
        }
      ]
    })
  })

  it('updates an existing default skill repository instead of creating a duplicate during tenant bootstrap', async () => {
    const { service, skillRepositoryService } = createService()
    skillRepositoryService.findAll.mockResolvedValue({
      items: [
        {
          id: 'repo-1',
          name: 'anthropics/skills',
          provider: 'github'
        }
      ]
    })
    skillRepositoryService.register.mockResolvedValue({
      id: 'repo-1'
    })

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(skillRepositoryService.register).toHaveBeenCalledWith({
      id: 'repo-1',
      name: 'anthropics/skills',
      provider: 'github',
      options: {
        url: 'https://github.com/anthropics/skills',
        branch: 'main'
      },
      credentials: null
    })
    expect(result.repositories).toEqual([
      {
        organizationId: 'org-1',
        repositoryId: 'repo-1'
      }
    ])
  })

  it('supports env JSON arrays for default repositories during tenant bootstrap', async () => {
    const { configService, service, skillRepositoryService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'AI_DEFAULT_SKILL_REPOSITORIES'
        ? JSON.stringify([
            {
              name: 'clawhub/official',
              provider: 'clawhub',
              options: {
                registryUrl: 'https://clawhub.ai'
              }
            }
          ])
        : ''
    )

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(skillRepositoryService.register).toHaveBeenCalledWith({
      name: 'clawhub/official',
      provider: 'clawhub',
      options: {
        registryUrl: 'https://clawhub.ai'
      },
      credentials: null
    })
    expect(result.repositories).toEqual([
      {
        organizationId: 'org-1',
        repositoryId: 'repo-1'
      }
    ])
  })

  it('continues initializing later repositories when one default repository fails', async () => {
    const { configService, service, skillRepositoryService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'AI_DEFAULT_SKILL_REPOSITORIES'
        ? JSON.stringify({
            repositories: [
              {
                name: 'broken/source',
                provider: 'github',
                options: {
                  url: 'https://github.com/example/broken',
                  branch: 'main'
                }
              },
              {
                name: 'clawhub/official',
                provider: 'clawhub',
                options: {
                  registryUrl: 'https://clawhub.ai'
                }
              }
            ]
          })
        : ''
    )
    skillRepositoryService.findAll
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })
    skillRepositoryService.register
      .mockRejectedValueOnce(new Error('Repository registration failed'))
      .mockResolvedValueOnce({
        id: 'repo-2'
      })

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(skillRepositoryService.register).toHaveBeenNthCalledWith(1, {
      name: 'broken/source',
      provider: 'github',
      options: {
        url: 'https://github.com/example/broken',
        branch: 'main'
      },
      credentials: null
    })
    expect(skillRepositoryService.register).toHaveBeenNthCalledWith(2, {
      name: 'clawhub/official',
      provider: 'clawhub',
      options: {
        registryUrl: 'https://clawhub.ai'
      },
      credentials: null
    })
    expect(result.repositories).toEqual([
      {
        organizationId: 'org-1',
        repositoryId: 'repo-2'
      }
    ])
  })

  it('ignores invalid env JSON and skips repository registration during tenant bootstrap', async () => {
    const { configService, organizationService, service, skillRepositoryService, userService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'AI_DEFAULT_SKILL_REPOSITORIES' ? '{invalid-json' : ''
    )

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(userService.getAdminUsers).not.toHaveBeenCalled()
    expect(organizationService.findAll).not.toHaveBeenCalled()
    expect(skillRepositoryService.findAll).not.toHaveBeenCalled()
    expect(skillRepositoryService.register).not.toHaveBeenCalled()
    expect(result.repositories).toEqual([])
  })
})
