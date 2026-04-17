jest.mock('../../skill-package.entity', () => ({
  SkillPackage: class SkillPackage {}
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

  function createMiddleware() {
    const middleware = new SkillsMiddleware(
      {
        find: jest.fn().mockResolvedValue([])
      } as any,
      {
        createQueryBuilder: jest.fn()
      } as any
    )

    ;(middleware as any).commandBus = {
      execute: jest.fn()
    }

    return middleware
  }

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
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map()
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
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map()
      }
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
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map()
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
          disabledSkillIds: ['skill-b'],
          selectedSkillWorkspaceId: 'workspace-1'
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
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map()
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
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: null,
        node: {} as any,
        tools: new Map()
      }
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
