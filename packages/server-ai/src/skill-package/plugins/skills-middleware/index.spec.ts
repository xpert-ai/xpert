jest.mock('../../skill-package.entity', () => ({
  SkillPackage: class SkillPackage {}
}))

jest.mock('../../skill-package.service', () => ({
  SkillPackageService: class SkillPackageService {}
}))

jest.mock('../../../skill-repository/repository-index/skill-repository-index.service', () => ({
  SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('../../../xpert-workspace', () => ({
  getWorkspaceRoot: jest.fn(() => '/workspace-root')
}))

jest.mock('../../../xpert-workspace/workspace.entity', () => ({
  XpertWorkspace: class XpertWorkspace {}
}))

jest.mock('../../../sandbox', () => ({
  SandboxAcquireBackendCommand: class SandboxAcquireBackendCommand {
    constructor(public readonly payload: unknown) {}
  },
  SandboxCopyFileCommand: class SandboxCopyFileCommand {
    constructor(public readonly sandbox: unknown, public readonly copyFile: unknown) {}
  }
}))

import { SystemMessage } from '@langchain/core/messages'
import { SkillsMiddleware } from './index'

describe('SkillsMiddleware', () => {
  const runtimeWorkingDirectory = '/workspace/runtime'
  const runtimeSkillsRoot = '/workspace/runtime/.xpert/skills'
  type SearchToolResult = {
    items: Array<{
      indexId: string
      installed: boolean
    }>
    total: number
  }
  type InstallToolResult = {
    workspaceId: string
    installed: Array<{
      id: string
      path?: string
    }>
  }
  type MiddlewareInternals = {
    loadSkillMetadata: (workspaceRoot: string, skillIds: string[], workspaceId: string) => Promise<unknown[]>
    syncSkillsToSandbox: (
      tenantId: string,
      sandbox: unknown,
      runtimeSkillsRootInContainer: string,
      skills: unknown[]
    ) => Promise<void>
  }

  function createMiddleware() {
    const skillPackageRepository = {
      find: jest.fn().mockResolvedValue([])
    }
    const workspaceRepository = {
      createQueryBuilder: jest.fn()
    }
    const skillPackageService = {
      ensureInstalledSkillPackage: jest.fn()
    }
    const skillIndexService = {
      findMarketplace: jest.fn().mockResolvedValue({
        items: [],
        total: 0
      })
    }
    const middleware = new SkillsMiddleware(
      skillPackageRepository as never,
      workspaceRepository as never,
      skillPackageService as never,
      skillIndexService as never
    )

    ;(middleware as any).commandBus = {
      execute: jest.fn()
    }

    return middleware
  }

  function createRuntime() {
    return {
      createModelClient: jest.fn(),
      wrapWorkflowNodeExecution: jest.fn()
    }
  }

  function createContext(workspaceId = 'workspace-1') {
    return {
      tenantId: 'tenant-1',
      userId: 'user-1',
      workspaceId,
      projectId: null,
      node: {} as never,
      tools: new Map(),
      runtime: createRuntime()
    }
  }

  function getTool(instance: Awaited<ReturnType<SkillsMiddleware['createMiddleware']>>, name: string) {
    const found = instance.tools?.find((item) => item.name === name)
    if (!found) {
      throw new Error(`Tool ${name} not found`)
    }
    return found
  }

  it('keeps auto discovery disabled by default and exposes only read_skill_file', async () => {
    const middleware = createMiddleware()

    const instance = await middleware.createMiddleware({}, createContext())

    expect(instance.tools?.map((item) => item.name)).toEqual(['read_skill_file'])
  })

  it('adds search and install tools when auto discovery is enabled without duplicating read_skill_file', async () => {
    const middleware = createMiddleware()

    const instance = await middleware.createMiddleware(
      {
        autoDiscovery: {
          enabled: true
        }
      },
      createContext()
    )

    const toolNames = instance.tools?.map((item) => item.name) ?? []
    expect(toolNames.filter((name) => name === 'read_skill_file')).toHaveLength(1)
    expect(toolNames).toEqual(['read_skill_file', 'search_skill_repository', 'install_workspace_skills'])
  })

  it('allows read_skill_file inside the current working directory, including .agents skills', async () => {
    const middleware = createMiddleware()
    const execute = jest.fn().mockResolvedValue({
      exitCode: 0,
      output: 'agent skill instructions'
    })
    const sandbox = {
      workingDirectory: runtimeWorkingDirectory,
      backend: {
        id: 'sandbox-1',
        execute
      }
    }

    const instance = await middleware.createMiddleware({}, createContext())
    const handler = jest.fn(async (request) => request)
    await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox
          }
        },
        state: {},
        systemMessage: new SystemMessage('base')
      } as never,
      handler
    )

    const readTool = getTool(instance, 'read_skill_file')
    await expect(
      readTool.invoke({
        path: `${runtimeWorkingDirectory}/.agents/skills/browser/SKILL.md`
      })
    ).resolves.toBe('agent skill instructions')
    await expect(
      readTool.invoke({
        path: '/workspace/other/.agents/skills/browser/SKILL.md'
      })
    ).rejects.toThrow('Access to path "/workspace/other/.agents/skills/browser/SKILL.md" is denied.')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('searches all visible repositories with the default limit when no repository scope is configured', async () => {
    const middleware = createMiddleware()
    const skillIndexService = Reflect.get(middleware, 'skillIndexService') as {
      findMarketplace: jest.Mock
    }

    const instance = await middleware.createMiddleware(
      {
        autoDiscovery: {
          enabled: true
        }
      },
      createContext()
    )

    const searchTool = getTool(instance, 'search_skill_repository')
    await searchTool.invoke({
      query: 'browser automation'
    })

    expect(skillIndexService.findMarketplace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        take: 5
      }),
      'browser automation'
    )
  })

  it('searches visible skill repositories with configured repository scope, caps limits, and marks installed skills', async () => {
    const middleware = createMiddleware()
    const skillIndexService = Reflect.get(middleware, 'skillIndexService') as {
      findMarketplace: jest.Mock
    }
    const skillPackageRepository = Reflect.get(middleware, 'skillPackageRepository') as {
      find: jest.Mock
    }
    skillIndexService.findMarketplace.mockResolvedValue({
      items: [
        {
          id: 'index-installed',
          repositoryId: 'repo-allowed',
          skillId: 'weather',
          name: 'Weather',
          description: 'Weather skill',
          tags: ['weather'],
          version: '1.0.0',
          repository: {
            id: 'repo-allowed',
            name: 'Allowed repository',
            provider: 'github'
          }
        },
        {
          id: 'index-new',
          repositoryId: 'repo-allowed',
          skillId: 'calendar',
          name: 'Calendar',
          description: 'Calendar skill',
          tags: ['calendar'],
          version: '1.0.0',
          repository: {
            id: 'repo-allowed',
            name: 'Allowed repository',
            provider: 'github'
          }
        }
      ],
      total: 2
    })
    skillPackageRepository.find.mockResolvedValue([
      {
        skillIndexId: 'index-installed'
      }
    ])

    const instance = await middleware.createMiddleware(
      {
        autoDiscovery: {
          enabled: true,
          repositoryIds: ['repo-allowed'],
          searchLimit: 99
        }
      },
      createContext()
    )

    const searchTool = getTool(instance, 'search_skill_repository')
    const result = (await searchTool.invoke({
      query: 'weather',
      repositoryIds: ['repo-allowed', 'repo-blocked'],
      limit: 99
    })) as SearchToolResult

    expect(skillIndexService.findMarketplace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          repositoryId: expect.any(Object)
        }),
        take: 20
      }),
      'weather'
    )
    expect(result.total).toBe(2)
    expect(result.items).toEqual([
      expect.objectContaining({
        indexId: 'index-installed',
        installed: true
      }),
      expect.objectContaining({
        indexId: 'index-new',
        installed: false
      })
    ])
  })

  it('installs discovered skills into the effective workspace and loads them on the next model call', async () => {
    const middleware = createMiddleware()
    const skillPackageService = Reflect.get(middleware, 'skillPackageService') as {
      ensureInstalledSkillPackage: jest.Mock
    }
    skillPackageService.ensureInstalledSkillPackage
      .mockResolvedValueOnce({
        id: 'pkg-weather'
      })
      .mockResolvedValueOnce({
        id: 'pkg-calendar'
      })

    const internals = middleware as unknown as MiddlewareInternals
    const loadSkillMetadata = jest.spyOn(internals, 'loadSkillMetadata').mockResolvedValue([
      {
        id: 'pkg-weather',
        name: 'Weather',
        description: 'Weather skill',
        path: `${runtimeSkillsRoot}/weather/SKILL.md`,
        packagePath: 'weather',
        workspaceId: 'workspace-1',
        version: '1'
      },
      {
        id: 'pkg-calendar',
        name: 'Calendar',
        description: 'Calendar skill',
        path: `${runtimeSkillsRoot}/calendar/SKILL.md`,
        packagePath: 'calendar',
        workspaceId: 'workspace-1',
        version: '1'
      }
    ])
    const syncSkillsToSandbox = jest.spyOn(internals, 'syncSkillsToSandbox').mockResolvedValue(undefined)

    const instance = await middleware.createMiddleware(
      {
        autoDiscovery: {
          enabled: true,
          maxInstallPerRun: 2
        }
      },
      createContext()
    )
    const handler = jest.fn(async (request) => request)
    await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {},
        systemMessage: new SystemMessage('base')
      } as never,
      handler
    )

    const installTool = getTool(instance, 'install_workspace_skills')
    const installResult = (await installTool.invoke({
      indexIds: ['index-weather', 'index-calendar']
    })) as InstallToolResult

    expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenNthCalledWith(
      1,
      'workspace-1',
      'index-weather'
    )
    expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenNthCalledWith(
      2,
      'workspace-1',
      'index-calendar'
    )
    expect(syncSkillsToSandbox).toHaveBeenCalled()
    expect(installResult.workspaceId).toBe('workspace-1')
    expect(installResult.installed).toHaveLength(2)

    loadSkillMetadata.mockClear()
    const nextResult = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {},
        systemMessage: new SystemMessage('base')
      } as never,
      handler
    )) as unknown as { systemMessage: { content: string } }

    expect(loadSkillMetadata).toHaveBeenCalledWith(
      runtimeSkillsRoot,
      ['pkg-weather', 'pkg-calendar'],
      'workspace-1'
    )
    expect(nextResult.systemMessage.content).toContain('Weather')
    expect(nextResult.systemMessage.content).toContain('Skill Discovery')
    expect(nextResult.systemMessage.content).toContain('npx skills add')
    expect(nextResult.systemMessage.content).toContain('.agents/skills')
  })

  it('rejects auto discovery installs over the configured per-call limit', async () => {
    const middleware = createMiddleware()
    const instance = await middleware.createMiddleware(
      {
        autoDiscovery: {
          enabled: true,
          maxInstallPerRun: 1
        }
      },
      createContext()
    )

    const installTool = getTool(instance, 'install_workspace_skills')

    await expect(
      installTool.invoke({
        indexIds: ['index-a', 'index-b']
      })
    ).rejects.toThrow('Install at most 1 skills in one call.')
  })

  it('filters disabled configured skills before building the prompt section', async () => {
    const middleware = createMiddleware()
    const loadSkillMetadata = jest.spyOn(middleware as any, 'loadSkillMetadata').mockImplementation(
      async (_workspaceRoot: string, skillIds: string[], workspaceId: string) =>
        skillIds.map((skillId) => ({
          id: skillId,
          name: skillId,
          description: `${skillId} description`,
          path: `${runtimeSkillsRoot}/${skillId}/SKILL.md`,
          packagePath: null,
          workspaceId,
          version: '1'
        }))
    )

    const instance = await middleware.createMiddleware(
      {
        skills: ['skill-a', 'skill-b']
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          disabledSkillIds: ['skill-b'],
          selectedSkillWorkspaceId: 'workspace-1'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect(loadSkillMetadata).toHaveBeenCalledWith(runtimeSkillsRoot, ['skill-a', 'skill-b'], 'workspace-1')
    expect(result.systemMessage.content).toContain('skill-a')
    expect(result.systemMessage.content).not.toContain('skill-b')
  })

  it('filters disabled runtime-selected skills before loading workspace metadata', async () => {
    const middleware = createMiddleware()
    const loadSkillMetadata = jest.spyOn(middleware as any, 'loadSkillMetadata').mockImplementation(
      async (_workspaceRoot: string, skillIds: string[], workspaceId: string) =>
        skillIds.map((skillId) => ({
          id: skillId,
          name: skillId,
          description: `${skillId} description`,
          path: `${runtimeSkillsRoot}/${skillId}/SKILL.md`,
          packagePath: null,
          workspaceId,
          version: '1'
        }))
    )

    const instance = await middleware.createMiddleware(
      {
        skills: []
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          selectedSkillIds: ['skill-a', 'skill-b'],
          disabledSkillIds: ['skill-b'],
          selectedSkillWorkspaceId: 'workspace-1'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )

    expect(loadSkillMetadata).toHaveBeenCalledWith(runtimeSkillsRoot, ['skill-a', 'skill-b'], 'workspace-1')
  })

  it('uses runtime-selected skills instead of configured default skills when an allow-list is present', async () => {
    const middleware = createMiddleware()
    const loadSkillMetadata = jest.spyOn(middleware as any, 'loadSkillMetadata').mockImplementation(
      async (_workspaceRoot: string, skillIds: string[], workspaceId: string) =>
        skillIds.map((skillId) => ({
          id: skillId,
          name: skillId,
          description: `${skillId} description`,
          path: `${runtimeSkillsRoot}/${skillId}/SKILL.md`,
          packagePath: null,
          workspaceId,
          version: '1'
        }))
    )

    const instance = await middleware.createMiddleware(
      {
        skills: ['default-skill']
      },
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map(),
        runtime: {} as any
      }
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          selectedSkillIds: ['runtime-skill'],
          selectedSkillWorkspaceId: 'workspace-1'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect(loadSkillMetadata).toHaveBeenCalledTimes(1)
    expect(loadSkillMetadata).toHaveBeenCalledWith(runtimeSkillsRoot, ['runtime-skill'], 'workspace-1')
    expect(result.systemMessage.content).toContain('runtime-skill')
    expect(result.systemMessage.content).not.toContain('default-skill')
  })

  it('does not load workspace skills by default when no default skills are configured', async () => {
    const middleware = createMiddleware()
    ;(middleware as any).skillPackageRepository.find = jest.fn().mockResolvedValue([
      {
        id: 'skill-a',
        workspaceId: 'workspace-1',
        packagePath: 'skill-a',
        metadata: {
          name: 'skill-a',
          skillPath: 'skill-a',
          skillMdPath: `${runtimeSkillsRoot}/skill-a/SKILL.md`
        }
      }
    ])

    const instance = await middleware.createMiddleware(
      {
        skills: []
      },
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map(),
        runtime: {} as any
      }
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          selectedSkillWorkspaceId: 'workspace-1'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect((middleware as any).skillPackageRepository.find).not.toHaveBeenCalled()
    expect(result.systemMessage.content).not.toContain('skill-a')
  })

  it('loads all workspace skills in blacklist mode when selectedSkillIds are absent', async () => {
    const middleware = createMiddleware()
    ;(middleware as any).skillPackageRepository.find = jest.fn().mockResolvedValue([
      {
        id: 'skill-a',
        workspaceId: 'workspace-1',
        packagePath: 'skill-a',
        metadata: {
          name: 'skill-a',
          skillPath: 'skill-a',
          skillMdPath: `${runtimeSkillsRoot}/skill-a/SKILL.md`
        }
      },
      {
        id: 'skill-b',
        workspaceId: 'workspace-1',
        packagePath: 'skill-b',
        metadata: {
          name: 'skill-b',
          skillPath: 'skill-b',
          skillMdPath: `${runtimeSkillsRoot}/skill-b/SKILL.md`
        }
      }
    ])
    jest.spyOn(middleware as any, 'parseSkillPackage').mockImplementation(async (_workspaceRoot: string, skillPackage: any) => ({
      id: skillPackage.id,
      name: skillPackage.metadata.name,
      description: `${skillPackage.metadata.name} description`,
      path: `${runtimeSkillsRoot}/${skillPackage.packagePath}/SKILL.md`,
      packagePath: skillPackage.packagePath,
      workspaceId: skillPackage.workspaceId,
      version: '1'
    }))

    const instance = await middleware.createMiddleware(
      {
        skills: []
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          disabledSkillIds: ['skill-b'],
          selectedSkillWorkspaceId: 'workspace-1',
          skillSelectionMode: 'workspace_blacklist'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect((middleware as any).skillPackageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1'
        }
      })
    )
    expect(result.systemMessage.content).toContain('skill-a')
    expect(result.systemMessage.content).not.toContain('skill-b')
  })

  it('forces workspace blacklist mode when requested at runtime', async () => {
    const middleware = createMiddleware()
    const loadWorkspaceSkillMetadata = jest
      .spyOn(middleware as any, 'loadWorkspaceSkillMetadata')
      .mockResolvedValue([
        {
          id: 'skill-a',
          name: 'skill-a',
          description: 'skill-a description',
          path: `${runtimeSkillsRoot}/skill-a/SKILL.md`,
          packagePath: 'skill-a',
          workspaceId: 'workspace-1',
          version: '1'
        },
        {
          id: 'skill-b',
          name: 'skill-b',
          description: 'skill-b description',
          path: `${runtimeSkillsRoot}/skill-b/SKILL.md`,
          packagePath: 'skill-b',
          workspaceId: 'workspace-1',
          version: '1'
        }
      ])
    const loadSkillMetadata = jest.spyOn(middleware as any, 'loadSkillMetadata').mockResolvedValue([
      {
        id: 'configured-skill',
        name: 'configured-skill',
        description: 'configured skill description',
        path: `${runtimeSkillsRoot}/configured-skill/SKILL.md`,
        packagePath: 'configured-skill',
        workspaceId: 'workspace-1',
        version: '1'
      }
    ])
    const loadRepositoryWorkspaceSkillMetadata = jest
      .spyOn(middleware as any, 'loadRepositoryWorkspaceSkillMetadata')
      .mockResolvedValue([
        {
          id: 'repository-skill',
          name: 'repository-skill',
          description: 'repository skill description',
          path: `${runtimeSkillsRoot}/repository-skill/SKILL.md`,
          packagePath: 'repository-skill',
          workspaceId: 'workspace-1',
          version: '1'
        }
      ])

    const instance = await middleware.createMiddleware(
      {
        skills: ['configured-skill'],
        repositoryDefault: {
          repositoryId: 'repository-1',
          disabledSkillIds: ['repository-skill']
        }
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          selectedSkillIds: ['runtime-skill'],
          disabledSkillIds: ['skill-b'],
          selectedSkillWorkspaceId: 'workspace-1',
          skillSelectionMode: 'workspace_blacklist'
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect(loadWorkspaceSkillMetadata).toHaveBeenCalledWith(runtimeSkillsRoot, 'workspace-1')
    expect(loadSkillMetadata).not.toHaveBeenCalled()
    expect(loadRepositoryWorkspaceSkillMetadata).not.toHaveBeenCalled()
    expect(result.systemMessage.content).toContain('skill-a')
    expect(result.systemMessage.content).not.toContain('skill-b')
    expect(result.systemMessage.content).not.toContain('configured-skill')
    expect(result.systemMessage.content).not.toContain('repository-skill')
    expect(result.systemMessage.content).not.toContain('runtime-skill')
  })

  it('loads repository-backed defaults, removes config blacklisted skills, and still applies runtime disabled skills last', async () => {
    const middleware = createMiddleware()
    ;(middleware as any).skillPackageRepository.find = jest.fn().mockResolvedValue([
      {
        id: 'skill-public-a',
        workspaceId: 'workspace-1',
        packagePath: 'skill-public-a',
        metadata: {
          name: 'skill-public-a',
          skillPath: 'skill-public-a',
          skillMdPath: `${runtimeSkillsRoot}/skill-public-a/SKILL.md`
        },
        skillIndex: {
          repositoryId: 'repo-public',
          repository: {
            id: 'repo-public',
            provider: 'workspace-public'
          }
        }
      },
      {
        id: 'skill-public-b',
        workspaceId: 'workspace-1',
        packagePath: 'skill-public-b',
        metadata: {
          name: 'skill-public-b',
          skillPath: 'skill-public-b',
          skillMdPath: `${runtimeSkillsRoot}/skill-public-b/SKILL.md`
        },
        skillIndex: {
          repositoryId: 'repo-public',
          repository: {
            id: 'repo-public',
            provider: 'workspace-public'
          }
        }
      },
      {
        id: 'skill-local-extra',
        workspaceId: 'workspace-1',
        packagePath: 'skill-local-extra',
        metadata: {
          name: 'skill-local-extra',
          skillPath: 'skill-local-extra',
          skillMdPath: `${runtimeSkillsRoot}/skill-local-extra/SKILL.md`
        }
      }
    ])
    jest.spyOn(middleware as any, 'parseSkillPackage').mockImplementation(async (_workspaceRoot: string, skillPackage: any) => ({
      id: skillPackage.id,
      name: skillPackage.metadata.name,
      description: `${skillPackage.metadata.name} description`,
      path: `${runtimeSkillsRoot}/${skillPackage.packagePath}/SKILL.md`,
      packagePath: skillPackage.packagePath,
      repositoryId: skillPackage.skillIndex?.repositoryId,
      workspaceId: skillPackage.workspaceId,
      version: '1'
    }))
    const loadSkillMetadata = jest.spyOn(middleware as any, 'loadSkillMetadata').mockImplementation(
      async (_workspaceRoot: string, skillIds: string[], workspaceId: string) =>
        skillIds.map((skillId) => ({
          id: skillId,
          name: skillId,
          description: `${skillId} description`,
          path: `${runtimeSkillsRoot}/${skillId}/SKILL.md`,
          packagePath: skillId,
          workspaceId,
          version: '1'
        }))
    )

    const instance = await middleware.createMiddleware(
      {
        skills: ['skill-local-extra'],
        repositoryDefault: {
          repositoryId: 'repo-public',
          disabledSkillIds: ['skill-public-b']
        }
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    const result = (await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {
          disabledSkillIds: ['skill-public-a']
        },
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )) as any

    expect(loadSkillMetadata).toHaveBeenCalledWith(
      runtimeSkillsRoot,
      ['skill-local-extra'],
      'workspace-1'
    )
    expect(result.systemMessage.content).toContain('skill-local-extra')
    expect(result.systemMessage.content).not.toContain('skill-public-a')
    expect(result.systemMessage.content).not.toContain('skill-public-b')
  })

  it('copies synced skills into the runtime .xpert skills directory', async () => {
    const middleware = createMiddleware()
    const execute = jest.fn().mockResolvedValue({ ok: true })
    ;(middleware as any).commandBus = { execute }
    jest.spyOn(middleware as any, 'loadSkillMetadata').mockResolvedValue([
      {
        id: 'skill-a',
        name: 'skill-a',
        description: 'skill-a description',
        path: `${runtimeSkillsRoot}/skill-a/SKILL.md`,
        packagePath: 'skill-a',
        workspaceId: 'workspace-1',
        version: '2026-04-17T00:00:00.000Z'
      }
    ])
    jest.spyOn(middleware as any, 'resolveLocalPackagePath').mockResolvedValue('/workspace-root/skills/skill-a')

    const instance = await middleware.createMiddleware(
      {
        skills: ['skill-a']
      },
      createContext()
    )

    const handler = jest.fn(async (request) => request)
    await instance.wrapModelCall(
      {
        runtime: {
          configurable: {
            sandbox: {
              workingDirectory: runtimeWorkingDirectory
            }
          }
        },
        state: {},
        systemMessage: new SystemMessage('base')
      } as any,
      handler
    )

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        copyFile: expect.objectContaining({
          containerPath: `${runtimeSkillsRoot}/skill-a`
        })
      })
    )
  })
})
