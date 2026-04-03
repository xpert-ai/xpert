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
  function createService() {
    const commandBus = {
      execute: jest.fn()
    }
    const configService = {
      get: jest.fn(() => '')
    }
    const organizationService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Acme'
      })
    }
    const userService = {
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

  it('registers default skill repositories from the fixed YAML file during organization bootstrap', async () => {
    const { environmentService, service, skillRepositoryService, workspaceService } = createService()

    const result = await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    } as any)

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
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'owner-1')
    expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-1', 'member-2')
    expect(result).toEqual({
      repositoryIds: ['repo-1']
    })
  })

  it('updates an existing default skill repository instead of creating a duplicate', async () => {
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

    const result = await service.bootstrapOrganization({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
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
    expect(result.repositoryIds).toEqual(['repo-1'])
  })
})
