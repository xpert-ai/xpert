jest.mock('../environment', () => ({
  EnvironmentService: class EnvironmentService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
  OrganizationCreatedEvent: class OrganizationCreatedEvent {},
  OrganizationService: class OrganizationService {},
  TenantCreatedEvent: class TenantCreatedEvent {},
  UserOrganizationCreatedEvent: class UserOrganizationCreatedEvent {},
  UserOrganizationService: class UserOrganizationService {},
  UserService: class UserService {},
  runWithRequestContext: (_context: unknown, callback: () => unknown) => callback()
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
  let currentRequest: unknown

  return {
    RequestContext: {
      currentRequest: jest.fn(() => currentRequest),
      getLanguageCode: jest.fn(() => (currentRequest as { headers?: { language?: string } } | null)?.headers?.language ?? 'en')
    },
    runWithRequestContext: (req: unknown, _res: unknown, callback: () => unknown) => {
      currentRequest = req
      return callback()
    }
  }
})

jest.mock('../skill-repository', () => ({
  SkillRepositoryIndexService: class SkillRepositoryIndexService {},
  SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../skill-package', () => ({
  SkillPackageService: class SkillPackageService {}
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

jest.mock('../xpert-template/template-skill-sync.service', () => ({
  TemplateSkillSyncService: class TemplateSkillSyncService {}
}))

jest.mock('../xpert-workspace/workspace.service', () => ({
  XpertWorkspaceService: class XpertWorkspaceService {}
}))

import { ServerAIBootstrapService } from './bootstrap.service'
import { XpertImportCommand } from '../xpert'

describe('ServerAIBootstrapService', () => {
  const defaultRepositories = {
    repositories: [
      {
        name: 'anthropics/skills',
        provider: 'github',
        options: {
          url: 'https://github.com/anthropics/skills',
          branch: 'main',
          path: 'skills'
        }
      }
    ]
  }

  function createService() {
    const commandBus = {
      execute: jest.fn()
    }
    const queryBus = {
      execute: jest.fn()
    }
    const configService = {
      get: jest.fn((_key?: string) => '')
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
      }),
      ensureWorkspacePublicRepository: jest.fn().mockResolvedValue({
        id: 'repo-public',
        provider: 'workspace-public'
      })
    }
    const skillRepositoryIndexService = {
      sync: jest.fn()
    }
    const skillPackageService = {
      initializeWorkspacePublicRepository: jest.fn().mockResolvedValue({
        id: 'repo-public',
        provider: 'workspace-public'
      }),
      ensureInstalledSkillPackage: jest.fn(),
      ensureSharedSkillPackageFromTemplateBundle: jest.fn()
    }
    const xpertService = {
      repository: {
        createQueryBuilder: jest.fn()
      },
      validateName: jest.fn().mockResolvedValue(true)
    }
    const xpertTemplateService = {
      getTemplateDetail: jest.fn(),
      readSkillRepositories: jest.fn().mockResolvedValue(defaultRepositories),
      getTemplateSkillBundles: jest.fn().mockResolvedValue([]),
      getBootstrapDefaultSkillRefs: jest.fn().mockResolvedValue([]),
      getUserDefaultSkillRefs: jest.fn().mockResolvedValue([]),
      resolveSkillRefs: jest.fn().mockResolvedValue([])
    }
    const templateSkillSyncService = {
      syncCurrentTenantSkillAssets: jest.fn().mockResolvedValue({
        mode: 'full',
        validateOnly: false,
        fingerprint: 'template-fingerprint',
        repositories: [],
        indexes: [],
        bundles: [],
        featuredRefs: [],
        workspaceDefaults: [],
        summary: {
          repositories: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
          indexes: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
          bundles: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
          featuredRefs: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
          workspaceDefaults: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 }
        }
      })
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
      skillRepositoryIndexService as any,
      skillPackageService as any,
      xpertService as any,
      xpertTemplateService as any,
      templateSkillSyncService as any
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
      skillPackageService,
      skillRepositoryService,
      templateSkillSyncService,
      userOrganizationService,
      userService,
      workspaceService,
      xpertService,
      xpertTemplateService
    }
  }

  it('keeps organization bootstrap focused on workspace and membership setup', async () => {
    const { environmentService, service, skillPackageService, skillRepositoryService, workspaceService } = createService()

    const result = await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

    expect(skillPackageService.initializeWorkspacePublicRepository).not.toHaveBeenCalled()
    expect(skillRepositoryService.ensureWorkspacePublicRepository).not.toHaveBeenCalled()
    expect(skillPackageService.ensureSharedSkillPackageFromTemplateBundle).not.toHaveBeenCalled()
    expect(skillRepositoryService.findAll).not.toHaveBeenCalled()
    expect(skillRepositoryService.register).not.toHaveBeenCalled()
    expect(workspaceService.create).toHaveBeenCalledWith({
      name: 'Organization Workspace',
      status: 'active',
      ownerId: 'owner-1',
      settings: {
        system: {
          kind: 'org-default'
        }
      }
    })
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'owner-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'member-2')
    expect(result).toEqual({
      repositoryIds: []
    })
  })

  it('does not publish template skill bundles into the workspace public repository during org bootstrap', async () => {
    const { service, skillPackageService, xpertTemplateService } = createService()
    xpertTemplateService.getTemplateSkillBundles.mockResolvedValue([
      {
        directoryName: 'claude-api-bundle',
        directoryPath: '/tmp/template-skill-bundles/claude-api-bundle',
        sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
        ref: {
          provider: 'github',
          repositoryName: 'anthropics/skills',
          skillId: 'skills/claude-api'
        }
      }
    ])

    await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

    expect(skillPackageService.initializeWorkspacePublicRepository).not.toHaveBeenCalled()
    expect(skillPackageService.ensureSharedSkillPackageFromTemplateBundle).not.toHaveBeenCalled()
  })

  it('applies the available primary copilot default model to the default authoring assistant during org bootstrap', async () => {
    const { commandBus, configService, queryBus, service, xpertService, xpertTemplateService } = createService()
    configService.get.mockImplementation((key: string) =>
      key === 'ORG_DEFAULT_XPERT_TEMPLATE_KEYS' ? 'xpert-authoring-assistant' : ''
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
      key === 'ORG_DEFAULT_XPERT_TEMPLATE_KEYS' ? 'xpert-authoring-assistant' : ''
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

  it('runs the unified template skill sync during tenant bootstrap', async () => {
    const { organizationService, service, templateSkillSyncService, userService } = createService()

    const result = await service.bootstrapTenantSkillRepositories({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(userService.getAdminUsers).toHaveBeenCalledWith('tenant-1')
    expect(organizationService.findAll).not.toHaveBeenCalled()
    expect(templateSkillSyncService.syncCurrentTenantSkillAssets).toHaveBeenCalledWith({
      mode: 'full',
      validateOnly: false,
      skipLock: true,
      updateFingerprint: true
    })
    expect(result).toEqual({
      repositoryIds: []
    })
  })

  it('bubbles template skill sync failures during tenant bootstrap', async () => {
    const { service, templateSkillSyncService } = createService()
    templateSkillSyncService.syncCurrentTenantSkillAssets.mockRejectedValueOnce(new Error('sync failed'))

    await expect(
      service.bootstrapTenantSkillRepositories({
        tenantId: 'tenant-1',
        tenantName: 'Acme Tenant'
      } as any)
    ).rejects.toThrow('sync failed')
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

    const result = await service.bootstrapUserInOrganization({
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
    expect(result).toEqual({
      workspaceId: 'workspace-2',
      createdNewUserDefaultWorkspace: true
    })
  })

  it('reuses an existing personal workspace without marking it as newly created', async () => {
    const { environmentService, service, userService, workspaceService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'member-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'ADMIN'
      }
    })
    workspaceService.findUserDefaultWorkspace.mockResolvedValue({
      id: 'workspace-existing',
      ownerId: 'member-1'
    })
    workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
      id: 'org-workspace-1'
    })

    const result = await service.bootstrapUserInOrganization({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'member-1'
    } as any)

    expect(workspaceService.create).not.toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-existing')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-existing', 'member-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'member-1')
    expect(result).toEqual({
      workspaceId: 'workspace-existing',
      createdNewUserDefaultWorkspace: false
    })
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

    const result = await service.bootstrapUserInOrganization({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'owner-1'
    } as any)

    expect(workspaceService.findUserDefaultWorkspace).not.toHaveBeenCalled()
    expect(workspaceService.create).not.toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).not.toHaveBeenCalled()
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'owner-1')
    expect(result).toEqual({
      workspaceId: null,
      createdNewUserDefaultWorkspace: false
    })
  })

  it('installs resolved default workspace skills and retries when some refs are not ready yet', async () => {
    const { service, skillPackageService, userService, xpertTemplateService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'member-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'ADMIN'
      }
    })
    xpertTemplateService.getUserDefaultSkillRefs.mockResolvedValue([
      {
        provider: 'github',
        repositoryName: 'anthropics/skills',
        skillId: 'skills/claude-api'
      },
      {
        provider: 'clawhub',
        repositoryName: 'clawhub/official',
        skillId: 'mcporter'
      }
    ])
    xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
      {
        provider: 'github',
        repositoryName: 'anthropics/skills',
        skillId: 'skills/claude-api'
      },
      {
        provider: 'clawhub',
        repositoryName: 'clawhub/official',
        skillId: 'mcporter'
      }
    ])
    xpertTemplateService.resolveSkillRefs.mockResolvedValue([
      {
        ref: {
          provider: 'github',
          repositoryName: 'anthropics/skills',
          skillId: 'skills/claude-api'
        },
        skill: {
          id: 'skill-1'
        }
      }
    ])

    await expect(
      service.bootstrapUserDefaultWorkspaceSkills({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'member-1',
        workspaceId: 'workspace-1'
      })
    ).rejects.toThrow('Default workspace skill bootstrap incomplete')

    expect(xpertTemplateService.getBootstrapDefaultSkillRefs).toHaveBeenCalledTimes(1)
    expect(xpertTemplateService.getUserDefaultSkillRefs).not.toHaveBeenCalled()
    expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenCalledWith('workspace-1', 'skill-1')
  })

  it('installs all resolved default workspace skills when references are ready', async () => {
    const { service, skillPackageService, userService, xpertTemplateService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'member-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'ADMIN'
      }
    })
    xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
      {
        provider: 'github',
        repositoryName: 'anthropics/skills',
        skillId: 'skills/claude-api'
      }
    ])
    xpertTemplateService.resolveSkillRefs.mockResolvedValue([
      {
        ref: {
          provider: 'github',
          repositoryName: 'anthropics/skills',
          skillId: 'skills/claude-api'
        },
        skill: {
          id: 'skill-1'
        }
      }
    ])

    await expect(
      service.bootstrapUserDefaultWorkspaceSkills({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'member-1',
        workspaceId: 'workspace-1'
      })
    ).resolves.toBeUndefined()

    expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenCalledWith('workspace-1', 'skill-1')
  })

  it('includes install failure reasons in the aggregated bootstrap error', async () => {
    const { service, skillPackageService, userService, xpertTemplateService } = createService()
    userService.findOne.mockResolvedValue({
      id: 'member-1',
      preferredLanguage: 'en_US',
      role: {
        name: 'ADMIN'
      }
    })
    xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
      {
        provider: 'github',
        repositoryName: 'anthropics/skills',
        skillId: 'skills/claude-api'
      }
    ])
    xpertTemplateService.resolveSkillRefs.mockResolvedValue([
      {
        ref: {
          provider: 'github',
          repositoryName: 'anthropics/skills',
          skillId: 'skills/claude-api'
        },
        skill: {
          id: 'skill-1'
        }
      }
    ])
    skillPackageService.ensureInstalledSkillPackage.mockRejectedValue(new Error('GitHub API error: 403 rate limit exceeded'))

    await expect(
      service.bootstrapUserDefaultWorkspaceSkills({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'member-1',
        workspaceId: 'workspace-1'
      })
    ).rejects.toThrow(
      "Default workspace skill bootstrap incomplete for 'workspace-1' (failed: github:anthropics/skills:skills/claude-api (GitHub API error: 403 rate limit exceeded))"
    )
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
