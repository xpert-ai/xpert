jest.mock('../environment', () => ({
  EnvironmentService: class EnvironmentService {}
}))

jest.mock('@metad/server-core', () => ({
  OrganizationCreatedEvent: class OrganizationCreatedEvent {},
  OrganizationService: class OrganizationService {},
  TenantCreatedEvent: class TenantCreatedEvent {},
  UserOrganizationCreatedEvent: class UserOrganizationCreatedEvent {},
  UserOrganizationService: class UserOrganizationService {},
  UserService: class UserService {},
  runWithRequestContext: (_context: unknown, callback: () => unknown) => callback()
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
import { XpertImportCommand } from '../xpert'

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
    const queryBus = {
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
      removeMemberFromOrganizationWorkspaces: jest.fn().mockResolvedValue(0),
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
      },
      validateName: jest.fn().mockResolvedValue(true)
    }
    const xpertTemplateService = {
      getTemplateDetail: jest.fn()
    }

    const service = new ServerAIBootstrapService(
      configService as any,
      commandBus as any,
      queryBus as any,
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
      queryBus,
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

  it('applies the available primary copilot default model to the default authoring assistant during org bootstrap', async () => {
    const { commandBus, configService, queryBus, service, xpertService, xpertTemplateService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'AI_DEFAULT_SKILL_REPOSITORIES'
        ? defaultRepositories
        : key === 'ORG_DEFAULT_XPERT_TEMPLATE_KEYS'
          ? 'xpert-authoring-assistant'
          : ''
    )
    xpertTemplateService.getTemplateDetail.mockResolvedValue({
      id: 'xpert-authoring-assistant',
      name: 'Authoring Assistant',
      export_data: `team:
  name: Authoring Assistant
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: glm-5
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Authoring Assistant
      copilotModel:
        modelType: llm
        model: glm-5
  - type: workflow
    key: Middleware_Summarization
    position:
      x: 240
      y: 0
    entity:
      type: middleware
      key: Middleware_Summarization
      provider: SummarizationMiddleware
      options:
        model:
          modelType: llm
          model: deepseek-chat
connections: []`
    })
    xpertService.repository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null)
    })
    queryBus.execute
      .mockResolvedValueOnce({
        id: 'copilot-primary',
        copilotModel: {
          modelType: 'llm',
          model: 'gpt-4o',
          options: {
            context_size: 128000
          }
        }
      })
      .mockResolvedValueOnce([
        {
          id: 'copilot-primary',
          providerWithModels: {
            models: [
              {
                model: 'gpt-4o',
                model_type: 'llm'
              }
            ]
          }
        }
      ])

    await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

    const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]
    expect(importCommand).toBeDefined()
    expect(importCommand.draft.team.copilotModel).toEqual(
      expect.objectContaining({
        copilotId: 'copilot-primary',
        modelType: 'llm',
        model: 'gpt-4o'
      })
    )
    expect(importCommand.draft.nodes[0].entity.copilotModel).toEqual(
      expect.objectContaining({
        copilotId: 'copilot-primary',
        modelType: 'llm',
        model: 'gpt-4o'
      })
    )
    expect(importCommand.draft.nodes[1].entity.options.model).toEqual(
      expect.objectContaining({
        copilotId: 'copilot-primary',
        modelType: 'llm',
        model: 'gpt-4o'
      })
    )
  })

  it('skips primary model injection when the primary default model is not available', async () => {
    const { commandBus, configService, queryBus, service, xpertService, xpertTemplateService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'AI_DEFAULT_SKILL_REPOSITORIES'
        ? defaultRepositories
        : key === 'ORG_DEFAULT_XPERT_TEMPLATE_KEYS'
          ? 'xpert-authoring-assistant'
          : ''
    )
    xpertTemplateService.getTemplateDetail.mockResolvedValue({
      id: 'xpert-authoring-assistant',
      name: 'Authoring Assistant',
      export_data: `team:
  name: Authoring Assistant
  type: agent
  agent:
    key: Agent_1
  copilotModel:
    modelType: llm
    model: glm-5
nodes:
  - type: agent
    key: Agent_1
    position:
      x: 0
      y: 0
    entity:
      key: Agent_1
      name: Authoring Assistant
connections: []`
    })
    xpertService.repository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null)
    })
    queryBus.execute
      .mockResolvedValueOnce({
        id: 'copilot-primary',
        copilotModel: {
          modelType: 'llm',
          model: 'gpt-4o'
        }
      })
      .mockResolvedValueOnce([
        {
          id: 'copilot-primary',
          providerWithModels: {
            models: [
              {
                model: 'gpt-4.1',
                model_type: 'llm'
              }
            ]
          }
        }
      ])

    await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

    const importCommand = commandBus.execute.mock.calls.find(([command]) => command instanceof XpertImportCommand)?.[0]
    expect(importCommand.draft.team.copilotModel).toEqual(
      expect.objectContaining({
        modelType: 'llm',
        model: 'glm-5'
      })
    )
    expect(importCommand.draft.team.copilotModel.copilotId).toBeUndefined()
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

  it('bootstraps a personal workspace for non-super-admin members', async () => {
    const { environmentService, service, userService, workspaceService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'member-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'ADMIN'
      }
    })
    workspaceService.findUserDefaultWorkspace.mockResolvedValue(null)
    workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
      id: 'org-workspace-1'
    })
    workspaceService.create.mockResolvedValue({
      id: 'workspace-2',
      ownerId: 'member-1'
    })

    await service.bootstrapUserInOrganization({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'member-1'
    } as any)

    expect(workspaceService.findUserDefaultWorkspace).toHaveBeenCalledWith('org-1', 'member-1')
    expect(workspaceService.create).toHaveBeenCalledWith({
      name: 'User Workspace',
      status: 'active',
      ownerId: 'member-1',
      settings: {
        system: {
          kind: 'user-default',
          userId: 'member-1'
        }
      }
    })
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-2')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-2', 'member-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'member-1')
  })

  it('skips personal workspace bootstrap for super admins while still joining the org workspace', async () => {
    const { environmentService, service, userService, workspaceService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'owner-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'SUPER_ADMIN'
      }
    })
    workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
      id: 'org-workspace-1'
    })

    await service.bootstrapUserInOrganization({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'owner-1'
    } as any)

    expect(workspaceService.findUserDefaultWorkspace).not.toHaveBeenCalled()
    expect(workspaceService.create).not.toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).not.toHaveBeenCalled()
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'owner-1')
  })

  it('removes the user from non-personal org workspaces on membership deletion', async () => {
    const { service, workspaceService } = createService()

    await service.cleanupUserInOrganization({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    } as any)

    expect(workspaceService.removeMemberFromOrganizationWorkspaces).toHaveBeenCalledWith(
      'tenant-1',
      'org-1',
      'user-1'
    )
  })
})
