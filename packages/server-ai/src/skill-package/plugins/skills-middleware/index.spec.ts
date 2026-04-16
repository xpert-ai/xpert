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
    constructor(public readonly payload: unknown) {}
  }
}))

import { SystemMessage } from '@langchain/core/messages'
import { SkillsMiddleware } from './index'

describe('SkillsMiddleware', () => {
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
          path: `/root/skills/${skillId}/SKILL.md`,
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
            sandbox: {}
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

    expect(loadSkillMetadata).toHaveBeenCalledWith('/root/skills/', ['skill-a'], 'workspace-1')
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
          path: `/root/skills/${skillId}/SKILL.md`,
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
            sandbox: {}
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

    expect(loadSkillMetadata).toHaveBeenCalledWith('/root/skills/', ['skill-a'], 'workspace-1')
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
          skillMdPath: '/root/skills/skill-a/SKILL.md'
        }
      },
      {
        id: 'skill-b',
        workspaceId: 'workspace-1',
        packagePath: 'skill-b',
        metadata: {
          name: 'skill-b',
          skillPath: 'skill-b',
          skillMdPath: '/root/skills/skill-b/SKILL.md'
        }
      }
    ])
    jest.spyOn(middleware as any, 'parseSkillPackage').mockImplementation(async (_workspaceRoot: string, skillPackage: any) => ({
      id: skillPackage.id,
      name: skillPackage.metadata.name,
      description: `${skillPackage.metadata.name} description`,
      path: `/root/skills/${skillPackage.packagePath}/SKILL.md`,
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
            sandbox: {}
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
})
